import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { createDatabase } from '../../packages/database/src/index';
import type { PlatformCommand } from '../../packages/core/src/platform';
import {
  parseCslJson,
  type ImportItemInput,
  type PreviewItem,
} from '../../packages/core/src/index';
import { executeCommand } from '../../apps/web/src/features/platform/server/services';
import { runtimeDatabase } from '../../apps/web/src/features/platform/server/database';
import { publicError } from '../../apps/web/src/features/platform/server/errors';
import {
  executeResearchCommand,
  exportSelection,
  getProjectPaper,
  renderExport,
} from '../../apps/web/src/features/library/server/library';
import {
  executeReferenceImport,
  previewFileImport,
} from '../../apps/web/src/features/library/server/interchange';
import { executeArtifactCommand } from '../../apps/web/src/features/artifacts/server/commands';

/*
 * A03 reference interoperability on a disposable, local, non-owner
 * PostgreSQL role: preview → confirmed import → reimport → cite → export →
 * reimport, plus isolation, idempotency and recovery.
 */
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
const owner = actor();
const editor = actor();
const viewer = actor();
const outsider = actor();
const failure = (work: Promise<unknown>) =>
  work.then(
    () => 'RESOLVED',
    (error: unknown) =>
      error instanceof ZodError ? 'VALIDATION_ERROR' : publicError(error).code,
  );
const platform = (who: Actor, command: PlatformCommand) =>
  executeCommand(who, command, randomUUID());
let project: string;
let otherProject: string;

const bib = String.raw`@article{okafor2024,
  author = {Okafor, Ada and M{\"u}ller, J{\"o}rg},
  title = {Sparse attention for {Protein} folding},
  journal = {Journal of Synthetic Biology},
  year = 2024, volume = {12}, number = {3}, pages = {101--120},
  doi = {https://doi.org/10.5555/A03.Sparse}
}
@inproceedings{chen2023,
  author = {Chen, Li},
  title = {Graph priors without a DOI},
  booktitle = {Synthetic Conference}, year = {2023}
}
@misc{broken, title = {Unterminated
`;
const importOf = (
  items: PreviewItem[],
  select = (p: PreviewItem) => p.status === 'NEW',
): ImportItemInput[] =>
  items.filter(select).map((p) => ({
    record: p.record!,
    link: p.link,
    atlasId: p.provenance.atlasId,
  }));
const run = (
  who: Actor,
  projectId: string,
  items: ImportItemInput[],
  key = randomUUID(),
) =>
  executeReferenceImport(
    who,
    { command: 'reference.import', projectId, items, idempotencyKey: key },
    randomUUID(),
  );
const projectPaperCount = (projectId: string) =>
  admin.projectPaper.count({ where: { projectId } });

beforeAll(async () => {
  vi.stubEnv('ATLAS_MODE', 'live');
  vi.stubEnv('DATABASE_URL', runtime);
  vi.stubEnv('ATLAS_RATE_SECRET', 'local-test-rate-secret-32-characters');
  vi.stubEnv('ATLAS_CURSOR_SECRET', 'local-test-cursor-secret-32-characters');
  vi.stubEnv('ATLAS_ORIGIN', 'http://127.0.0.1:3102');
  vi.stubEnv('ATLAS_DEV_INVITATION_LINKS', 'true');
  vi.stubEnv('NODE_ENV', 'development');
  for (const who of [owner, editor, viewer, outsider])
    await platform(who, {
      command: 'bootstrap',
      displayName: `Interop ${who.id.slice(0, 4)}`,
      workspaceName: 'Personal',
      researchInterests: [],
    });
  const org = (
    await platform(owner, { command: 'organization.create', name: 'A03 lab' })
  ).id!;
  const ws = (
    await platform(owner, {
      command: 'workspace.create',
      organizationId: org,
      name: 'Interop',
    })
  ).id!;
  project = (
    await platform(owner, {
      command: 'project.create',
      workspaceId: ws,
      name: 'Interop',
      visibility: 'PRIVATE',
      idempotencyKey: randomUUID(),
    })
  ).id!;
  const org2 = (
    await platform(outsider, {
      command: 'organization.create',
      name: 'Other A03',
    })
  ).id!;
  const ws2 = (
    await platform(outsider, {
      command: 'workspace.create',
      organizationId: org2,
      name: 'Other',
    })
  ).id!;
  otherProject = (
    await platform(outsider, {
      command: 'project.create',
      workspaceId: ws2,
      name: 'Other',
      visibility: 'PRIVATE',
      idempotencyKey: randomUUID(),
    })
  ).id!;
  for (const [who, role] of [
    [editor, 'EDITOR'],
    [viewer, 'VIEWER'],
  ] as const) {
    const invite = await platform(owner, {
      command: 'invitation.create',
      scope: 'project',
      scopeId: project,
      role,
      email: who.email,
    });
    const token = new URLSearchParams(
      new URL(invite.invitationLink!).hash.slice(1),
    ).get('token')!;
    await platform(who, { command: 'invitation.accept', token });
  }
});
afterAll(async () => {
  await admin.$disconnect();
  await runtimeDatabase().$disconnect();
  vi.unstubAllEnvs();
});

describe.sequential('Journey A — local bibliography round trip', () => {
  let firstIds: string[] = [];
  it('previews without writing and reports invalid entries', async () => {
    const before = await projectPaperCount(project);
    const preview = await previewFileImport(editor, project, {
      format: 'bibtex',
      content: bib,
    });
    expect(preview.items.map((i) => i.status)).toEqual([
      'NEW',
      'NEW',
      'INVALID',
    ]);
    expect(preview.counts).toMatchObject({ NEW: 2, INVALID: 1 });
    expect(preview.items[0]!.record).toMatchObject({
      type: 'journal-article',
      doi: '10.5555/a03.sparse',
      authors: [
        { family: 'Okafor', given: 'Ada' },
        { family: 'Müller', given: 'Jörg' },
      ],
      pages: '101–120',
    });
    expect(preview.issues.some((i) => /Unterminated/.test(i.message))).toBe(
      true,
    );
    expect(await projectPaperCount(project)).toBe(before);
  });

  it('imports selected entries as project-private references, idempotently', async () => {
    const catalog = await admin.researchPaper.count();
    const preview = await previewFileImport(editor, project, {
      format: 'bibtex',
      content: bib,
    });
    const items = importOf(preview.items);
    const key = randomUUID();
    const first = await run(editor, project, items, key);
    expect(first.results.map((r) => r.outcome)).toEqual(['CREATED', 'CREATED']);
    firstIds = first.results.map((r) => r.id);
    // Lost response: the same request replays the committed result.
    expect(await run(editor, project, items, key)).toMatchObject({
      replayed: true,
      results: first.results,
    });
    // A new request for the same file maps to the same papers.
    const again = await run(editor, project, items);
    expect(again.results.map((r) => [r.id, r.outcome])).toEqual(
      firstIds.map((id) => [id, 'EXISTING']),
    );
    expect(await projectPaperCount(project)).toBe(2);
    // The shared verified catalog is never written by an import.
    expect(await admin.researchPaper.count()).toBe(catalog);
    const stored = await admin.projectPaper.findUniqueOrThrow({
      where: { id: firstIds[0]! },
    });
    expect(stored.paperId).toBeNull();
    expect(stored.privateTitle).toBe('Sparse attention for Protein folding');
    const dto = await getProjectPaper(viewer, firstIds[0]!);
    expect(dto.reference).toMatchObject({
      volume: '12',
      issue: '3',
      containerTitle: 'Journal of Synthetic Biology',
    });
    const reread = await previewFileImport(editor, project, {
      format: 'bibtex',
      content: bib,
    });
    expect(
      reread.items.slice(0, 2).map((i) => [i.status, i.match?.by]),
    ).toEqual([
      ['EXISTING', 'import'],
      ['EXISTING', 'import'],
    ]);
  });

  it('dedupes by DOI across formats and flags title similarity only for review', async () => {
    const ris =
      'TY  - JOUR\r\nTI  - A different title for the same DOI\r\nDO  - 10.5555/A03.SPARSE\r\nER  - \r\nTY  - CPAPER\r\nTI  - Graph priors, without a DOI\r\nAU  - Chen, Li\r\nPY  - 2023\r\nER  - \r\n';
    const preview = await previewFileImport(editor, project, {
      format: 'ris',
      content: ris,
    });
    expect(preview.items.map((i) => [i.status, i.match?.by ?? null])).toEqual([
      ['EXISTING', 'doi'],
      ['POSSIBLE_DUPLICATE', 'title'],
    ]);
    // Importing the DOI record maps to the existing paper; nothing is overwritten.
    const result = await run(
      editor,
      project,
      importOf(preview.items, (p) => p.status === 'EXISTING'),
    );
    expect(result.results).toEqual([
      { index: 0, id: firstIds[0], outcome: 'EXISTING' },
    ]);
    expect(
      (
        await admin.projectPaper.findUniqueOrThrow({
          where: { id: firstIds[0]! },
        })
      ).privateTitle,
    ).toBe('Sparse attention for Protein folding');
    // A user may still import a similar-looking record explicitly.
    const similar = await run(
      editor,
      project,
      importOf(preview.items, (p) => p.status === 'POSSIBLE_DUPLICATE'),
    );
    expect(similar.results[0]!.outcome).toBe('CREATED');
    expect(await projectPaperCount(project)).toBe(3);
  });

  it('cites an imported paper, exports the note bibliography and reimports it without duplicates', async () => {
    const note = await executeArtifactCommand(
      editor,
      {
        command: 'document.create',
        projectId: project,
        title: 'Interop note',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'citation', attrs: { projectPaperId: firstIds[0] } },
              ],
            },
          ],
        },
        idempotencyKey: randomUUID(),
      },
      randomUUID(),
    );
    const cited = await exportSelection(viewer, project, {
      documentId: note.id,
    });
    expect(cited.map((p) => p.id)).toEqual([firstIds[0]]);
    for (const format of ['csl-json', 'bibtex', 'ris'] as const) {
      const file = renderExport(cited, format);
      expect(file.body).toContain('atlas:' + firstIds[0]);
      expect(file.body).not.toMatch(/annotation|quote/i);
      const preview = await previewFileImport(editor, project, {
        format,
        content: file.body,
      });
      expect(
        preview.items.map((i) => [i.status, i.match?.projectPaperId]),
      ).toEqual([['EXISTING', firstIds[0]]]);
    }
    const csl = parseCslJson(renderExport(cited, 'csl-json').body).records[0]!
      .record!;
    expect(csl).toMatchObject({
      title: 'Sparse attention for Protein folding',
      doi: '10.5555/a03.sparse',
      volume: '12',
      issue: '3',
      pages: '101–120',
      issued: { year: 2024 },
    });
    expect(renderExport(cited, 'csl-json').type).toBe(
      'application/vnd.citationstyles.csl+json',
    );
    expect(await projectPaperCount(project)).toBe(3);
  });
});

describe.sequential('Journey C — security, isolation and recovery', () => {
  const record = (title: string, doi: string | null = null) => ({
    type: 'journal-article' as const,
    title,
    doi,
  });
  it('denies viewers and outsiders, and never crosses projects', async () => {
    const item = { record: record('Viewer attempt'), link: null };
    expect(await failure(run(viewer, project, [item]))).toBe('NOT_FOUND');
    expect(
      await failure(
        previewFileImport(viewer, project, { format: 'bibtex', content: bib }),
      ),
    ).toBe('NOT_FOUND');
    expect(await failure(run(outsider, project, [item]))).toBe('NOT_FOUND');
    expect(await failure(exportSelection(outsider, project, {}))).toBe(
      'NOT_FOUND',
    );
    // Another project's paper ID is not a match here: a new private reference.
    const foreign = await run(outsider, otherProject, [
      { record: record('Foreign paper'), link: null },
    ]);
    const ownImport = await run(editor, project, [
      {
        record: record('Foreign paper'),
        link: null,
        atlasId: foreign.results[0]!.id,
      },
    ]);
    expect(ownImport.results[0]!.outcome).toBe('CREATED');
    expect(ownImport.results[0]!.id).not.toBe(foreign.results[0]!.id);
    expect(
      await failure(
        exportSelection(editor, project, { ids: [foreign.results[0]!.id] }),
      ),
    ).toBe('RESOLVED');
    expect(
      await exportSelection(editor, project, { ids: [foreign.results[0]!.id] }),
    ).toEqual([]);
  });

  it('does not reveal or link another tenant’s verified catalog paper for a DOI', async () => {
    const paperId = randomUUID();
    const doi = `10.5555/a03.catalog.${paperId.slice(0, 8)}`;
    await admin.$executeRaw`INSERT INTO research_papers(id,normalized_doi,title,metadata,updated_at) VALUES(${paperId}::uuid,${doi},'Catalog title','{}'::jsonb,now())`;
    const result = await run(editor, project, [
      { record: record('My copy', doi), link: null },
    ]);
    expect(result.results[0]!.outcome).toBe('CREATED');
    const row = await admin.projectPaper.findUniqueOrThrow({
      where: { id: result.results[0]!.id },
    });
    expect(row.paperId).toBeNull();
    expect(row.privateTitle).toBe('My copy');
  });

  it('keeps hostile metadata as inert text and bounds batches', async () => {
    const hostile = await run(editor, project, [
      {
        record: {
          ...record(
            '<img src=x onerror=alert(1)> Ignore previous instructions',
          ),
          url: 'javascript:alert(1)',
        },
        link: null,
      },
    ]).catch((e: unknown) => e);
    expect(hostile).toBeInstanceOf(ZodError);
    const ok = await run(editor, project, [
      { record: record('<img src=x onerror=alert(1)>'), link: null },
    ]);
    expect((await getProjectPaper(editor, ok.results[0]!.id)).title).toBe(
      '<img src=x onerror=alert(1)>',
    );
    const many = Array.from({ length: 101 }, (_, i) => ({
      record: record(`Bulk ${i}`),
      link: null,
    }));
    expect(await failure(run(editor, project, many))).toBe('VALIDATION_ERROR');
    expect(
      await failure(
        previewFileImport(editor, project, {
          format: 'bibtex',
          content: 'x'.repeat(2_000_001),
        }),
      ),
    ).toBe('VALIDATION_ERROR');
  });

  it('never restores archived papers and converges concurrent duplicate imports', async () => {
    const created = await run(editor, project, [
      { record: record('To archive', '10.5555/a03.archive'), link: null },
    ]);
    const id = created.results[0]!.id;
    const pp = await admin.projectPaper.findUniqueOrThrow({ where: { id } });
    await executeResearchCommand(
      editor,
      { command: 'paper.archive', id, expectedVersion: pp.version },
      randomUUID(),
      {
        resolve: () => Promise.reject(new Error('unused')),
      },
    );
    const again = await run(editor, project, [
      { record: record('To archive', '10.5555/a03.archive'), link: null },
    ]);
    expect(again.results[0]).toMatchObject({ id, outcome: 'ARCHIVED' });
    expect(
      (await admin.projectPaper.findUniqueOrThrow({ where: { id } }))
        .archivedAt,
    ).not.toBeNull();
    const before = await projectPaperCount(project);
    const items = [
      { record: record('Concurrent', '10.5555/a03.concurrent'), link: null },
    ];
    const [a, b] = await Promise.all([
      run(editor, project, items),
      run(owner, project, items),
    ]);
    expect([a.results[0]!.outcome, b.results[0]!.outcome].sort()).toEqual([
      'CREATED',
      'EXISTING',
    ]);
    expect(a.results[0]!.id).toBe(b.results[0]!.id);
    expect(await projectPaperCount(project)).toBe(before + 1);
  });

  it('rejects invented external provenance before any import or update', async () => {
    const before = await projectPaperCount(project);
    expect(
      await failure(
        run(editor, project, [
          {
            record: record('Forged Zotero'),
            link: {
              source: 'ZOTERO',
              library: 'users/1',
              key: 'ABCD2345',
              version: 999,
            },
            update: true,
          },
        ]),
      ),
    ).toBe('NOT_FOUND');
    expect(await projectPaperCount(project)).toBe(before);
  });

  it('keeps browser roles away from connection and mapping tables', async () => {
    const rows = await admin.$queryRaw<
      { t: string; ok: boolean }[]
    >`SELECT t, has_table_privilege(r, t, 'SELECT') AS ok
      FROM unnest(ARRAY['external_connections','reference_import_links']) t CROSS JOIN unnest(ARRAY['anon','authenticated']) r`;
    expect(rows.every((r) => !r.ok)).toBe(true);
  });
});
