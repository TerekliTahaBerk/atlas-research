import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '../../packages/database/src/index';
import type { NormalizedPaper } from '../../packages/core/src/index';
import type { PlatformCommand } from '../../packages/core/src/platform';
import type { ResearchCommandInput } from '../../packages/core/src/research';
import { executeCommand } from '../../apps/web/src/features/platform/server/services';
import {
  runtimeDatabase,
  withActor,
} from '../../apps/web/src/features/platform/server/database';
import {
  executeResearchCommand,
  exportProject,
  getProjectPaper,
  libraryPage,
  renderExport,
  savedCandidates,
  sourceAnnotations,
  type PaperResolver,
} from '../../apps/web/src/features/library/server/library';
import {
  claimScanJobs,
  cleanupScanObjects,
  completeScan,
  createUpload,
  finalizeUpload,
  sourceAccess,
  uploadStatus,
  verifyScannerRequest,
} from '../../apps/web/src/features/library/server/sources';
import { publicError } from '../../apps/web/src/features/platform/server/errors';
import type { SourceStorage } from '../../apps/web/src/features/library/server/storage';
import { normalizeOpenAlexWork } from '../../apps/web/src/features/discovery/server/openalex';
import { normalizeSemanticScholarPaper } from '../../apps/web/src/features/discovery/server/semantic-scholar';

const runtime = process.env.ATLAS_TEST_DATABASE_URL;
const adminUrl = process.env.ATLAS_TEST_ADMIN_URL;
if (!runtime || !adminUrl)
  throw new Error(
    'Explicit disposable ATLAS_TEST_DATABASE_URL and ATLAS_TEST_ADMIN_URL are required.',
  );
for (const value of [runtime, adminUrl]) {
  const url = new URL(value);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.startsWith('/atlas_p01_test')
  )
    throw new Error(
      'Tests require the isolated local atlas_p01_test database.',
    );
}
const admin = createDatabase(adminUrl);
type Actor = { id: string; email: string };
const actor = (): Actor => ({
  id: randomUUID(),
  email: `${randomUUID()}@atlas.example`,
});
const owner = actor(); // project owner
const other = actor(); // unrelated tenant
const editor = actor();
const viewer = actor();
const wsAdmin = actor(); // workspace administrator without a project grant
/** Applies the same public error mapping as the HTTP boundary. */
const failure = (work: Promise<unknown>) =>
  work.then(
    () => 'RESOLVED',
    (error: unknown) => publicError(error).code,
  );
const platform = (who: Actor, command: PlatformCommand) =>
  executeCommand(who, command, randomUUID());

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), `tests/fixtures/providers/${name}.json`),
      'utf8',
    ),
  ) as unknown;
const at = '2026-10-22T12:00:00.000Z';
const shared = normalizeOpenAlexWork(fixture('openalex-work'), at)!;
const noDoi = normalizeSemanticScholarPaper(
  fixture('semantic-scholar-paper'),
  at,
)!;
const s2Shared = normalizeSemanticScholarPaper(
  (fixture('semantic-scholar-search') as { data: unknown[] }).data[0],
  at,
)!;
const records = new Map<string, NormalizedPaper>([
  [`openalex:${shared.openAlexId}`, shared],
  [`semantic-scholar:${noDoi.semanticScholarId}`, noDoi],
  [`semantic-scholar:${s2Shared.semanticScholarId}`, s2Shared],
]);
let resolverCalls = 0;
const resolver: PaperResolver = {
  async resolve(provider, externalId) {
    resolverCalls++;
    const paper = records.get(`${provider}:${externalId}`);
    if (!paper) throw new Error('unknown fixture');
    return paper;
  },
};
const research = (who: Actor, command: ResearchCommandInput) =>
  executeResearchCommand(who, command, randomUUID(), resolver);
const save = (
  who: Actor,
  projectId: string,
  externalId = shared.openAlexId!,
  provider: 'openalex' | 'semantic-scholar' = 'openalex',
  idempotencyKey = randomUUID(),
) =>
  research(who, {
    command: 'paper.save',
    projectId,
    provider,
    externalId,
    idempotencyKey,
  });

/** Storage double for the database lifecycle; real Storage runs in E2E. */
function memoryStorage(): SourceStorage & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async createUploadGrant(key) {
      return {
        url: `https://storage.invalid/upload/${encodeURIComponent(key)}`,
        token: 'grant',
      };
    },
    async readQuarantined(key) {
      return objects.get(key) ?? null;
    },
    async removeQuarantined(key) {
      objects.delete(key);
    },
    async removeAccepted(key) {
      objects.delete(key);
    },
    async accept(from, to) {
      const value = objects.get(from);
      if (!value) throw new Error('missing');
      objects.set(to, value);
    },
    async signDownload(key, seconds) {
      return `https://storage.invalid/download/${encodeURIComponent(key)}?ttl=${seconds}`;
    },
    async signQuarantineRead(key) {
      return `https://storage.invalid/scan/${encodeURIComponent(key)}`;
    },
  };
}
const pdf = (text: string) =>
  new TextEncoder().encode(
    `%PDF-1.7\n1 0 obj << >> endobj\n% ${text}\ntrailer << >>\n%%EOF\n`,
  );
const sha = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
const anchor = {
  pageNumber: 1,
  quote: 'Sparse attention',
  prefix: null,
  suffix: ' reduces memory',
  startOffset: 0,
  endOffset: 16,
  rects: [{ x: 0.1, y: 0.1, width: 0.3, height: 0.02 }],
};

let project: string; // owner's private project
let otherProject: string;
let workspaceId: string;

beforeAll(async () => {
  vi.stubEnv('ATLAS_MODE', 'live');
  vi.stubEnv('DATABASE_URL', runtime);
  vi.stubEnv('ATLAS_RATE_SECRET', 'local-test-rate-secret-32-characters');
  vi.stubEnv('ATLAS_CURSOR_SECRET', 'local-test-cursor-secret-32-characters');
  vi.stubEnv('ATLAS_ORIGIN', 'http://127.0.0.1:3102');
  vi.stubEnv('ATLAS_DEV_INVITATION_LINKS', 'true');
  vi.stubEnv('NODE_ENV', 'development');
  for (const who of [owner, other, editor, viewer, wsAdmin])
    await platform(who, {
      command: 'bootstrap',
      displayName: 'Library tester',
      workspaceName: 'Personal',
      researchInterests: [],
    });
  const org = (
    await platform(owner, {
      command: 'organization.create',
      name: 'Library lab',
    })
  ).id!;
  workspaceId = (
    await platform(owner, {
      command: 'workspace.create',
      organizationId: org,
      name: 'Library team',
    })
  ).id!;
  project = (
    await platform(owner, {
      command: 'project.create',
      workspaceId,
      name: 'Private literature review',
      visibility: 'PRIVATE',
      idempotencyKey: randomUUID(),
    })
  ).id!;
  const otherWs = (
    await platform(other, { command: 'organization.create', name: 'Other lab' })
  ).id!;
  const otherWorkspace = (
    await platform(other, {
      command: 'workspace.create',
      organizationId: otherWs,
      name: 'Other',
    })
  ).id!;
  otherProject = (
    await platform(other, {
      command: 'project.create',
      workspaceId: otherWorkspace,
      name: 'Other private project',
      visibility: 'PRIVATE',
      idempotencyKey: randomUUID(),
    })
  ).id!;
  const grant = async (
    who: Actor,
    scope: 'project' | 'workspace',
    scopeId: string,
    role: 'EDITOR' | 'VIEWER' | 'ADMIN',
  ) => {
    const result = await platform(owner, {
      command: 'invitation.create',
      scope,
      scopeId,
      role,
      email: who.email,
    });
    const token = new URLSearchParams(
      new URL(result.invitationLink!).hash.slice(1),
    ).get('token')!;
    await platform(who, { command: 'invitation.accept', token });
  };
  await grant(editor, 'project', project, 'EDITOR');
  await grant(viewer, 'project', project, 'VIEWER');
  await grant(wsAdmin, 'workspace', workspaceId, 'ADMIN');
});
afterAll(async () => {
  await admin.$disconnect();
  await runtimeDatabase().$disconnect();
  vi.unstubAllEnvs();
});

describe.sequential('project library on real non-owner PostgreSQL', () => {
  let paperId: string;
  it('saves concurrently once per project and deduplicates global metadata by DOI', async () => {
    const results = await Promise.all([
      save(owner, project),
      save(owner, project),
      save(editor, project, s2Shared.semanticScholarId!, 'semantic-scholar'),
    ]);
    paperId = results[0]!.id;
    expect(new Set(results.map((r) => r.id))).toEqual(new Set([paperId]));
    expect(results.filter((r) => r.existing === false)).toHaveLength(1);
    expect(
      await admin.researchPaper.count({
        where: { normalizedDoi: shared.doi! },
      }),
    ).toBe(1);
    expect(
      await admin.projectPaper.count({ where: { projectId: project } }),
    ).toBe(1);
    // Both provider identities attach to the one public record.
    const ids = await admin.paperExternalIdentifier.findMany({
      select: { provider: true },
    });
    expect(ids.map((i) => i.provider).sort()).toEqual([
      'openalex',
      'semantic-scholar',
    ]);
  });
  it('replays an idempotency key and rejects a changed payload', async () => {
    const key = randomUUID();
    const first = await save(
      owner,
      project,
      noDoi.semanticScholarId!,
      'semantic-scholar',
      key,
    );
    const replay = await save(
      owner,
      project,
      noDoi.semanticScholarId!,
      'semantic-scholar',
      key,
    );
    expect(replay).toMatchObject({ id: first.id, replayed: true });
    expect(
      await failure(save(owner, project, shared.openAlexId!, 'openalex', key)),
    ).toBe('CONFLICT');
  });
  it('associates the same paper with another tenant without revealing either association', async () => {
    const theirs = await save(other, otherProject);
    expect(theirs.id).not.toBe(paperId);
    expect(
      await admin.researchPaper.count({
        where: { normalizedDoi: shared.doi! },
      }),
    ).toBe(1);
    expect(await failure(libraryPage(other, project, { sort: 'recent' }))).toBe(
      'NOT_FOUND',
    );
    expect(await failure(getProjectPaper(other, paperId))).toBe('NOT_FOUND');
    expect(await failure(savedCandidates(other, project, [shared]))).toBe(
      'NOT_FOUND',
    );
    expect(await savedCandidates(other, otherProject, [shared])).toEqual({
      [shared.candidateId]: theirs.id,
    });
    const mine = await libraryPage(owner, project, { sort: 'recent' });
    expect(mine.items.map((i) => i.id)).not.toContain(theirs.id);
  });
  it('denies raw cross-tenant SQL and raw writes through the runtime role', async () => {
    const visible = await withActor(
      other,
      (tx) =>
        tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM project_papers WHERE project_id=${project}::uuid`,
    );
    expect(visible).toEqual([]);
    // Global metadata rows are visible only through one's own association.
    const papers = await withActor(
      viewer,
      (tx) => tx.$queryRaw<{ id: string }[]>`SELECT id FROM research_papers`,
    );
    expect(papers.length).toBe(2);
    expect(
      await runtimeDatabase().$queryRaw`SELECT id FROM research_papers`,
    ).toEqual([]);
    await expect(
      withActor(
        owner,
        (tx) =>
          tx.$executeRaw`UPDATE project_papers SET reading_status='READ' WHERE id=${paperId}::uuid`,
      ),
    ).rejects.toThrow();
    await expect(
      withActor(
        owner,
        (tx) => tx.$queryRaw`SELECT * FROM research_command_keys`,
      ),
    ).rejects.toThrow();
  });
  it('enforces the role matrix: viewers read, workspace admins see nothing private', async () => {
    expect(
      (await libraryPage(viewer, project, { sort: 'recent' })).items,
    ).toHaveLength(2);
    expect(await failure(save(viewer, project))).toBe('NOT_FOUND');
    const calls = resolverCalls;
    expect(await failure(save(wsAdmin, project))).toBe('NOT_FOUND');
    // Unauthorized saves never consume provider calls.
    expect(resolverCalls).toBe(calls);
    expect(
      await failure(libraryPage(wsAdmin, project, { sort: 'recent' })),
    ).toBe('NOT_FOUND');
  });
  it('keeps private user sources out of global metadata', async () => {
    const created = await research(owner, {
      command: 'paper.create',
      projectId: project,
      title: 'Unpublished lab notebook',
      idempotencyKey: randomUUID(),
    });
    expect(
      await admin.researchPaper.count({
        where: { title: 'Unpublished lab notebook' },
      }),
    ).toBe(0);
    expect(await getProjectPaper(owner, created.id)).toMatchObject({
      origin: 'PRIVATE',
      title: 'Unpublished lab notebook',
      paper: null,
    });
  });
  it('organizes collections, tags and reading status with version checks', async () => {
    const collection = (
      await research(editor, {
        command: 'collection.create',
        projectId: project,
        name: 'Attention',
        idempotencyKey: randomUUID(),
      })
    ).id;
    expect(
      await failure(
        research(owner, {
          command: 'collection.create',
          projectId: project,
          name: 'attention',
          idempotencyKey: randomUUID(),
        }),
      ),
    ).toBe('CONFLICT');
    for (let i = 0; i < 2; i++)
      await research(owner, {
        command: 'collection.paper.add',
        collectionId: collection,
        projectPaperId: paperId,
      });
    expect(
      await admin.collectionMembership.count({
        where: { collectionId: collection },
      }),
    ).toBe(1);
    const foreign = (await libraryPage(other, otherProject, { sort: 'recent' }))
      .items[0]!;
    expect(
      await failure(
        research(owner, {
          command: 'collection.paper.add',
          collectionId: collection,
          projectPaperId: foreign.id,
        }),
      ),
    ).toBe('NOT_FOUND');
    const tag = await research(owner, {
      command: 'tag.create',
      projectId: project,
      name: 'Protein  Folding',
      idempotencyKey: randomUUID(),
    });
    const reused = await research(editor, {
      command: 'tag.create',
      projectId: project,
      name: 'protein folding',
      idempotencyKey: randomUUID(),
    });
    expect(reused).toMatchObject({ id: tag.id, existing: true });
    await research(owner, {
      command: 'paper.tag.add',
      projectPaperId: paperId,
      tagId: tag.id,
    });
    const filtered = await libraryPage(viewer, project, {
      sort: 'recent',
      tagId: tag.id,
      collectionId: collection,
    });
    expect(filtered.items.map((i) => i.id)).toEqual([paperId]);
    expect(filtered.tags.map((t) => t.name)).toEqual(['Protein Folding']);
    expect(filtered.collections).toMatchObject([
      { id: collection, paperCount: 1 },
    ]);
    expect(
      (
        await libraryPage(viewer, project, { sort: 'recent', q: 'Ada Fixture' })
      ).items.map((i) => i.id),
    ).toEqual([paperId]);
    expect(
      (await libraryPage(viewer, project, { sort: 'recent', q: '%' })).items,
    ).toEqual([]);
    const current = await getProjectPaper(owner, paperId);
    await research(owner, {
      command: 'paper.update',
      id: paperId,
      expectedVersion: current.version,
      readingStatus: 'READING',
    });
    expect(
      await failure(
        research(editor, {
          command: 'paper.update',
          id: paperId,
          expectedVersion: current.version,
          readingStatus: 'READ',
        }),
      ),
    ).toBe('CONFLICT');
    expect((await getProjectPaper(viewer, paperId)).readingStatus).toBe(
      'READING',
    );
    await research(owner, {
      command: 'paper.tag.remove',
      projectPaperId: paperId,
      tagId: tag.id,
    });
    expect((await getProjectPaper(owner, paperId)).tagIds).toEqual([]);
    const col = (await libraryPage(owner, project, { sort: 'recent' }))
      .collections[0]!;
    await research(owner, {
      command: 'collection.update',
      id: collection,
      expectedVersion: col.version,
      name: 'Attention models',
    });
    expect(
      await failure(
        research(owner, {
          command: 'collection.archive',
          id: collection,
          expectedVersion: col.version,
        }),
      ),
    ).toBe('CONFLICT');
  });
  it('archives papers out of the default view and restores them on re-save', async () => {
    const current = await getProjectPaper(owner, paperId);
    await research(owner, {
      command: 'paper.archive',
      id: paperId,
      expectedVersion: current.version,
    });
    expect(
      (await libraryPage(owner, project, { sort: 'recent' })).items.map(
        (i) => i.id,
      ),
    ).not.toContain(paperId);
    expect(
      (
        await libraryPage(owner, project, {
          sort: 'recent',
          status: 'ARCHIVED',
        })
      ).items.map((i) => i.id),
    ).toEqual([paperId]);
    expect(await savedCandidates(owner, project, [shared])).toEqual({});
    expect((await save(owner, project)).id).toBe(paperId);
    expect((await getProjectPaper(owner, paperId)).readingStatus).toBe(
      'TO_READ',
    );
  });
  it('paginates with actor- and filter-bound signed cursors', async () => {
    const page = await libraryPage(owner, project, { sort: 'recent' });
    expect(page.nextCursor).toBeNull();
    const forged = Buffer.from(
      JSON.stringify({ o: 0, s: '0'.repeat(32), a: owner.id }),
    ).toString('base64url');
    expect(
      await failure(
        libraryPage(owner, project, {
          sort: 'recent',
          cursor: `${forged}.${'0'.repeat(64)}`,
        }),
      ),
    ).toBe('VALIDATION_ERROR');
  });
  it('exports deterministic BibTeX and RIS from saved metadata only', async () => {
    const papers = await exportProject(viewer, project, undefined);
    const bib = renderExport(papers, 'bibtex').body;
    expect(bib).toContain('doi = {10.5555/atlas.fixture.0001}');
    expect(bib).toContain('@misc{anonndunpublished');
    expect(renderExport(papers, 'ris').body).toContain('TY  - JOUR');
  });

  let sourceVersionId: string;
  const storage = memoryStorage();
  it('quarantines verified uploads and rejects mismatches, replays and expired grants', async () => {
    const bytes = pdf('genuine');
    const input = {
      fileName: 'paper.pdf',
      mediaType: 'application/pdf' as const,
      byteSize: bytes.length,
      sha256: sha(bytes),
      projectPaperId: paperId,
      idempotencyKey: randomUUID(),
    };
    expect(
      await failure(
        createUpload(viewer, project, input, randomUUID(), storage),
      ),
    ).toBe('NOT_FOUND');
    expect(
      await failure(
        createUpload(owner, otherProject, input, randomUUID(), storage),
      ),
    ).toBe('NOT_FOUND');
    const intent = await createUpload(
      owner,
      project,
      input,
      randomUUID(),
      storage,
    );
    sourceVersionId = intent.sourceVersionId;
    expect(intent).toMatchObject({ state: 'PENDING_UPLOAD' });
    expect(intent.upload?.url).toBeTruthy();
    const replay = await createUpload(
      owner,
      project,
      input,
      randomUUID(),
      storage,
    );
    expect(replay.id).toBe(intent.id);
    expect(
      await failure(
        createUpload(
          owner,
          project,
          { ...input, byteSize: bytes.length + 1 },
          randomUUID(),
          storage,
        ),
      ),
    ).toBe('CONFLICT');
    // Finalizing before the object exists does not consume the intent.
    expect(
      await failure(finalizeUpload(owner, intent.id, randomUUID(), storage)),
    ).toBe('VALIDATION_ERROR');
    expect(
      await failure(finalizeUpload(editor, intent.id, randomUUID(), storage)),
    ).toBe('NOT_FOUND');
    const key = (
      await admin.sourceVersion.findUniqueOrThrow({
        where: { id: sourceVersionId },
      })
    ).quarantineKey;
    storage.objects.set(key, bytes);
    expect(
      await finalizeUpload(owner, intent.id, randomUUID(), storage),
    ).toMatchObject({ state: 'QUARANTINED' });
    expect(
      await finalizeUpload(owner, intent.id, randomUUID(), storage),
    ).toMatchObject({ state: 'QUARANTINED' });
    expect((await uploadStatus(owner, intent.id)).state).toBe('QUARANTINED');
    // Unscanned files are never readable.
    expect(await failure(sourceAccess(owner, sourceVersionId, storage))).toBe(
      'CONFLICT',
    );

    for (const [label, body, declared] of [
      ['wrong checksum', pdf('tampered'), pdf('declared')],
      [
        'not a pdf',
        new TextEncoder().encode('<html><script>x</script></html>'),
        null,
      ],
      ['truncated', new TextEncoder().encode('%PDF-1.7\n1 0 obj'), null],
    ] as const) {
      const claimed = declared ?? body;
      const rejected = await createUpload(
        owner,
        project,
        {
          ...input,
          byteSize: body.length,
          sha256: sha(claimed),
          idempotencyKey: randomUUID(),
        },
        randomUUID(),
        storage,
      );
      const rk = (
        await admin.sourceVersion.findUniqueOrThrow({
          where: { id: rejected.sourceVersionId },
        })
      ).quarantineKey;
      storage.objects.set(rk, body);
      const result = await finalizeUpload(
        owner,
        rejected.id,
        randomUUID(),
        storage,
      );
      expect(result, label).toMatchObject({ state: 'REJECTED' });
      expect(storage.objects.has(rk), label).toBe(false);
    }
    const late = await createUpload(
      owner,
      project,
      { ...input, idempotencyKey: randomUUID() },
      randomUUID(),
      storage,
    );
    await admin.$executeRaw`UPDATE upload_intents SET expires_at=now()-interval '1 minute' WHERE id=${late.id}::uuid`;
    expect(
      await finalizeUpload(owner, late.id, randomUUID(), storage),
    ).toMatchObject({ state: 'REJECTED' });
  });
  it('accepts scanned files through leased jobs and binds the accepted object', async () => {
    const jobs = await claimScanJobs({ max: 10, leaseSeconds: 60 }, storage);
    expect(jobs.map((j) => j.sourceVersionId)).toEqual([sourceVersionId]);
    expect(await claimScanJobs({ max: 10, leaseSeconds: 60 }, storage)).toEqual(
      [],
    );
    const job = jobs[0]!;
    // Transient scanner errors stay quarantined and retryable.
    expect(
      await completeScan(
        {
          jobId: job.jobId,
          attempt: job.attempt,
          verdict: 'ERROR',
          sha256: job.sha256,
          scanner: 'test-protocol',
        },
        storage,
      ),
    ).toEqual({
      state: 'QUARANTINED',
    });
    await admin.$executeRaw`UPDATE ingestion_jobs SET available_at=now() WHERE id=${job.jobId}::uuid`;
    const [again] = await claimScanJobs({ max: 1, leaseSeconds: 60 }, storage);
    expect(again?.attempt).toBe(2);
    // A wrong checksum can never produce a READY source.
    await expect(
      completeScan(
        {
          jobId: job.jobId,
          attempt: again!.attempt,
          verdict: 'CLEAN',
          sha256: 'f'.repeat(64),
          scanner: 'test-protocol',
        },
        storage,
      ),
    ).resolves.toEqual({ state: 'REJECTED' });
  });
  it('makes only scanner-accepted versions readable, for authorized members only', async () => {
    const bytes = pdf('accepted');
    const intent = await createUpload(
      owner,
      project,
      {
        fileName: 'accepted.pdf',
        mediaType: 'application/pdf',
        byteSize: bytes.length,
        sha256: sha(bytes),
        projectPaperId: paperId,
        idempotencyKey: randomUUID(),
      },
      randomUUID(),
      storage,
    );
    const key = (
      await admin.sourceVersion.findUniqueOrThrow({
        where: { id: intent.sourceVersionId },
      })
    ).quarantineKey;
    storage.objects.set(key, bytes);
    await finalizeUpload(owner, intent.id, randomUUID(), storage);
    const [job] = await claimScanJobs({ max: 1, leaseSeconds: 60 }, storage);
    expect(
      await completeScan(
        {
          jobId: job!.jobId,
          attempt: job!.attempt,
          verdict: 'CLEAN',
          sha256: sha(bytes),
          scanner: 'test-protocol',
        },
        storage,
      ),
    ).toEqual({
      state: 'READY',
    });
    sourceVersionId = intent.sourceVersionId;
    const access = await sourceAccess(viewer, sourceVersionId, storage);
    expect(access.url).toContain('ttl=60');
    expect(access.sha256).toBe(sha(bytes));
    expect(await failure(sourceAccess(other, sourceVersionId, storage))).toBe(
      'NOT_FOUND',
    );
    expect(await failure(sourceAccess(wsAdmin, sourceVersionId, storage))).toBe(
      'NOT_FOUND',
    );
    // The version is immutable even for the migration owner.
    await expect(
      admin.$executeRaw`UPDATE source_versions SET sha256=${'0'.repeat(64)} WHERE id=${sourceVersionId}::uuid`,
    ).rejects.toThrow();
    await expect(
      admin.$executeRaw`DELETE FROM source_versions WHERE id=${sourceVersionId}::uuid`,
    ).rejects.toThrow();
  });
  it('fences stale attempts, concurrent completions and cleans losing copies after failure', async () => {
    const bytes = pdf('racing scans');
    const raceStorage = memoryStorage();
    const intent = await createUpload(
      owner,
      project,
      {
        fileName: 'race.pdf',
        mediaType: 'application/pdf',
        byteSize: bytes.length,
        sha256: sha(bytes),
        projectPaperId: paperId,
        idempotencyKey: randomUUID(),
      },
      randomUUID(),
      raceStorage,
    );
    const source = await admin.sourceVersion.findUniqueOrThrow({
      where: { id: intent.sourceVersionId },
    });
    raceStorage.objects.set(source.quarantineKey, bytes);
    await finalizeUpload(owner, intent.id, randomUUID(), raceStorage);
    const [old] = await claimScanJobs(
      { max: 1, leaseSeconds: 30 },
      raceStorage,
    );
    await admin.$executeRaw`UPDATE ingestion_jobs SET locked_until=now()-interval '1 second' WHERE id=${old!.jobId}::uuid`;
    const [current] = await claimScanJobs(
      { max: 1, leaseSeconds: 60 },
      raceStorage,
    );
    const verdict = {
      jobId: old!.jobId,
      attempt: old!.attempt,
      verdict: 'CLEAN' as const,
      sha256: sha(bytes),
      scanner: 'test-race',
    };
    expect(await failure(completeScan(verdict, raceStorage))).toBe('CONFLICT');
    // Both copies finish before either database verdict; exactly one wins.
    const copy = raceStorage.accept;
    let copies = 0;
    let release: () => void = () => {};
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    raceStorage.accept = async (from, to) => {
      await copy(from, to);
      if (++copies === 2) release();
      await barrier;
    };
    const results = await Promise.allSettled([
      completeScan({ ...verdict, attempt: current!.attempt }, raceStorage),
      completeScan({ ...verdict, attempt: current!.attempt }, raceStorage),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const ready = await admin.sourceVersion.findUniqueOrThrow({
      where: { id: intent.sourceVersionId },
    });
    expect(ready.state).toBe('READY');
    expect(
      [...raceStorage.objects.keys()].filter((k) => k.startsWith('accepted/')),
    ).toHaveLength(2);
    await admin.$executeRaw`UPDATE scan_object_cleanup SET created_at=now()-interval '2 hours'`;
    const remove = raceStorage.removeAccepted;
    raceStorage.removeAccepted = async () => {
      throw new Error('storage unavailable');
    };
    await expect(cleanupScanObjects(raceStorage)).rejects.toThrow(
      'storage unavailable',
    );
    expect(await admin.scanObjectCleanup.count()).toBeGreaterThan(0);
    raceStorage.removeAccepted = remove;
    await cleanupScanObjects(raceStorage);
    expect(
      [...raceStorage.objects.keys()].filter((k) => k.startsWith('accepted/')),
    ).toEqual([ready.objectKey]);
    expect(await admin.scanObjectCleanup.count()).toBe(0);
    expect(
      await failure(
        completeScan({ ...verdict, attempt: current!.attempt }, raceStorage),
      ),
    ).toBe('CONFLICT');
  });
  it('anchors annotations to the version with author-only private notes', async () => {
    const shared = await research(editor, {
      command: 'annotation.create',
      sourceVersionId,
      kind: 'HIGHLIGHT',
      visibility: 'PROJECT',
      body: 'Key claim',
      anchor,
      idempotencyKey: randomUUID(),
    });
    const secret = await research(owner, {
      command: 'annotation.create',
      sourceVersionId,
      kind: 'NOTE',
      visibility: 'PRIVATE',
      body: 'Private reviewer note',
      anchor,
      idempotencyKey: randomUUID(),
    });
    const ownerView = await sourceAnnotations(owner, sourceVersionId);
    expect(ownerView.map((a) => a.id).sort()).toEqual(
      [shared.id, secret.id].sort(),
    );
    expect(ownerView.find((a) => a.id === shared.id)).toMatchObject({
      editable: false,
      anchorStatus: 'PRECISE',
      anchor,
    });
    const editorView = await sourceAnnotations(editor, sourceVersionId);
    expect(editorView.map((a) => a.id)).toEqual([shared.id]);
    expect(
      await failure(
        research(editor, {
          command: 'annotation.update',
          id: secret.id,
          expectedVersion: 1,
          body: 'x',
        }),
      ),
    ).toBe('NOT_FOUND');
    expect(
      await failure(
        research(owner, {
          command: 'annotation.update',
          id: shared.id,
          expectedVersion: 1,
          body: 'hijack',
        }),
      ),
    ).toBe('FORBIDDEN');
    expect(
      await failure(
        research(viewer, {
          command: 'annotation.create',
          sourceVersionId,
          kind: 'NOTE',
          anchor,
          idempotencyKey: randomUUID(),
        }),
      ),
    ).toBe('NOT_FOUND');
    await research(editor, {
      command: 'annotation.update',
      id: shared.id,
      expectedVersion: 1,
      body: 'Revised claim',
    });
    expect(
      await failure(
        research(editor, {
          command: 'annotation.delete',
          id: shared.id,
          expectedVersion: 1,
        }),
      ),
    ).toBe('CONFLICT');
    await research(editor, {
      command: 'annotation.delete',
      id: shared.id,
      expectedVersion: 2,
    });
    expect(
      (await sourceAnnotations(viewer, sourceVersionId)).map((a) => a.id),
    ).toEqual([]);
    // Annotations cannot be re-anchored or hard-deleted.
    await expect(
      admin.$executeRaw`UPDATE paper_annotations SET anchor='{"pageNumber":9}'::jsonb WHERE id=${secret.id}::uuid`,
    ).rejects.toThrow();
    expect(await failure(sourceAnnotations(other, sourceVersionId))).toBe(
      'NOT_FOUND',
    );
    // Quarantined/rejected versions cannot be annotated.
    const rejected = await admin.sourceVersion.findFirstOrThrow({
      where: { state: 'REJECTED' },
    });
    expect(
      await failure(
        research(owner, {
          command: 'annotation.create',
          sourceVersionId: rejected.id,
          kind: 'NOTE',
          anchor,
          idempotencyKey: randomUUID(),
        }),
      ),
    ).toBe('CONFLICT');
  });
  it('revokes library, annotation and file access with the project membership', async () => {
    const bytes = pdf('revoked during scanning');
    const pending = await createUpload(
      editor,
      project,
      {
        fileName: 'revoked.pdf',
        mediaType: 'application/pdf',
        byteSize: bytes.length,
        sha256: sha(bytes),
        projectPaperId: paperId,
        idempotencyKey: randomUUID(),
      },
      randomUUID(),
      storage,
    );
    const pendingSource = await admin.sourceVersion.findUniqueOrThrow({
      where: { id: pending.sourceVersionId },
    });
    storage.objects.set(pendingSource.quarantineKey, bytes);
    await finalizeUpload(editor, pending.id, randomUUID(), storage);
    const [leased] = await claimScanJobs({ max: 1, leaseSeconds: 60 }, storage);
    const member = await admin.projectMembership.findUniqueOrThrow({
      where: {
        projectId_profileId: { projectId: project, profileId: editor.id },
      },
    });
    await platform(owner, {
      command: 'membership.remove',
      scope: 'project',
      scopeId: project,
      profileId: editor.id,
      expectedVersion: member.version,
    });
    expect(
      await failure(libraryPage(editor, project, { sort: 'recent' })),
    ).toBe('NOT_FOUND');
    expect(await failure(sourceAccess(editor, sourceVersionId, storage))).toBe(
      'NOT_FOUND',
    );
    expect(await failure(sourceAnnotations(editor, sourceVersionId))).toBe(
      'NOT_FOUND',
    );
    expect(await failure(save(editor, project))).toBe('NOT_FOUND');
    expect(
      await failure(
        completeScan(
          {
            jobId: leased!.jobId,
            attempt: leased!.attempt,
            verdict: 'CLEAN',
            sha256: sha(bytes),
            scanner: 'revocation-test',
          },
          storage,
        ),
      ),
    ).toBe('CONFLICT');
    expect(await claimScanJobs({ max: 1, leaseSeconds: 60 }, storage)).toEqual(
      [],
    );
    expect(
      (
        await admin.sourceVersion.findUniqueOrThrow({
          where: { id: pending.sourceVersionId },
        })
      ).state,
    ).toBe('FAILED');
  });
  it('records audit events for research mutations without content', async () => {
    const events = await admin.auditEvent.findMany({
      where: { actorId: owner.id, action: { startsWith: 'paper.' } },
    });
    expect(events.length).toBeGreaterThan(0);
    expect(Object.keys(events[0]!)).not.toContain('body');
  });
});

describe('scanner request authentication', () => {
  const secret = 's'.repeat(40);
  const sign = (body: string, ts: number) =>
    new Headers({
      'x-atlas-scanner-timestamp': String(ts),
      'x-atlas-scanner-signature': createHmac('sha256', secret)
        .update(`${ts}.${body}`)
        .digest('hex'),
    });
  it('accepts fresh signatures and rejects stale, tampered or unconfigured requests', () => {
    const now = Date.now();
    const ts = Math.floor(now / 1000);
    expect(() =>
      verifyScannerRequest(sign('{}', ts), '{}', secret, now),
    ).not.toThrow();
    expect(() =>
      verifyScannerRequest(sign('{}', ts), '{"max":9}', secret, now),
    ).toThrow();
    expect(() =>
      verifyScannerRequest(sign('{}', ts - 600), '{}', secret, now),
    ).toThrow();
    expect(() =>
      verifyScannerRequest(sign('{}', ts), '{}', undefined, now),
    ).toThrow();
  });
});
