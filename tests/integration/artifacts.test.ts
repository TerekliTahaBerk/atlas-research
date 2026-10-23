import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { createDatabase } from '../../packages/database/src/index';
import type { PlatformCommand } from '../../packages/core/src/platform';
import type {
  ArtifactCommandInput,
  DocNode,
} from '../../packages/core/src/index';
import { executeCommand } from '../../apps/web/src/features/platform/server/services';
import {
  runtimeDatabase,
  withActor,
} from '../../apps/web/src/features/platform/server/database';
import { publicError } from '../../apps/web/src/features/platform/server/errors';
import { executeResearchCommand } from '../../apps/web/src/features/library/server/library';
import { executeArtifactCommand } from '../../apps/web/src/features/artifacts/server/commands';
import {
  exportDocument,
  getDocument,
  getVersion,
  listDocuments,
  listVersions,
} from '../../apps/web/src/features/documents/server/documents';
import {
  getTask,
  listTasks,
} from '../../apps/web/src/features/tasks/server/tasks';
import {
  artifactLinks,
  artifactOptions,
  projectGraph,
} from '../../apps/web/src/features/artifacts/server/links';
import { searchArtifacts } from '../../apps/web/src/features/artifacts/server/search';
import { buildProposal } from '../../apps/web/src/features/ai/server/proposals';

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
const outsider = actor(); // other tenant
const wsAdmin = actor(); // workspace admin without a project grant
const leaver = actor(); // editor whose access is revoked mid-suite
const failure = (work: Promise<unknown>) =>
  work.then(
    () => 'RESOLVED',
    // Same mapping as the HTTP boundary: schema failures are validation errors.
    (error: unknown) =>
      error instanceof ZodError ? 'VALIDATION_ERROR' : publicError(error).code,
  );
const platform = (who: Actor, command: PlatformCommand) =>
  executeCommand(who, command, randomUUID());
const run = (who: Actor, command: ArtifactCommandInput) =>
  executeArtifactCommand(who, command, randomUUID());
const doc = (...blocks: DocNode[]): DocNode => ({
  type: 'doc',
  content: blocks,
});
const para = (...content: DocNode[]): DocNode => ({
  type: 'paragraph',
  content,
});
const text = (t: string): DocNode => ({ type: 'text', text: t });
const cite = (
  projectPaperId: string,
  extra: Record<string, unknown> = {},
): DocNode => ({
  type: 'citation',
  attrs: { projectPaperId, ...extra },
});

let project: string;
let otherProject: string;
let workspaceId: string;
let paper: { id: string; artifactId: string };
let otherPaper: { id: string; artifactId: string };
const paperOf = async (who: Actor, projectId: string, title: string) => {
  const { id } = await executeResearchCommand(
    who,
    { command: 'paper.create', projectId, title, idempotencyKey: randomUUID() },
    randomUUID(),
    { resolve: () => Promise.reject(new Error('unused')) },
  );
  const row = await admin.projectPaper.findUniqueOrThrow({ where: { id } });
  return { id, artifactId: row.artifactId };
};
const memberVersion = async (projectId: string, profileId: string) =>
  (
    await admin.projectMembership.findUniqueOrThrow({
      where: { projectId_profileId: { projectId, profileId } },
    })
  ).version;

beforeAll(async () => {
  vi.stubEnv('ATLAS_MODE', 'live');
  vi.stubEnv('DATABASE_URL', runtime);
  vi.stubEnv('ATLAS_RATE_SECRET', 'local-test-rate-secret-32-characters');
  vi.stubEnv('ATLAS_CURSOR_SECRET', 'local-test-cursor-secret-32-characters');
  vi.stubEnv('ATLAS_ORIGIN', 'http://127.0.0.1:3102');
  vi.stubEnv('ATLAS_DEV_INVITATION_LINKS', 'true');
  vi.stubEnv('NODE_ENV', 'development');
  for (const who of [owner, editor, viewer, outsider, wsAdmin, leaver])
    await platform(who, {
      command: 'bootstrap',
      displayName: `Tester ${who.id.slice(0, 4)}`,
      workspaceName: 'Personal',
      researchInterests: [],
    });
  const org = (
    await platform(owner, {
      command: 'organization.create',
      name: 'Artifact lab',
    })
  ).id!;
  workspaceId = (
    await platform(owner, {
      command: 'workspace.create',
      organizationId: org,
      name: 'Artifacts',
    })
  ).id!;
  project = (
    await platform(owner, {
      command: 'project.create',
      workspaceId,
      name: 'Linked research',
      visibility: 'PRIVATE',
      idempotencyKey: randomUUID(),
    })
  ).id!;
  const otherOrg = (
    await platform(outsider, {
      command: 'organization.create',
      name: 'Other lab',
    })
  ).id!;
  const otherWs = (
    await platform(outsider, {
      command: 'workspace.create',
      organizationId: otherOrg,
      name: 'Other',
    })
  ).id!;
  otherProject = (
    await platform(outsider, {
      command: 'project.create',
      workspaceId: otherWs,
      name: 'Other',
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
  await grant(leaver, 'project', project, 'EDITOR');
  await grant(wsAdmin, 'workspace', workspaceId, 'ADMIN');
  paper = await paperOf(
    owner,
    project,
    'U-Net: convolutional networks for biomedical segmentation',
  );
  otherPaper = await paperOf(
    outsider,
    otherProject,
    'Confidential other-tenant source',
  );
});
afterAll(async () => {
  await admin.$disconnect();
  await runtimeDatabase().$disconnect();
  vi.unstubAllEnvs();
});

describe.sequential('documents on real non-owner PostgreSQL', () => {
  let docId: string;
  it('creates a document with its artifact and first immutable revision atomically', async () => {
    const key = randomUUID();
    const created = await run(owner, {
      command: 'document.create',
      projectId: project,
      title: 'Brain segmentation literature review',
      kind: 'LITERATURE_REVIEW',
      content: doc(para(text('Initial notes.'))),
      idempotencyKey: key,
    });
    docId = created.id;
    expect(created.revision).toBe(1);
    // Replay returns the original document; a changed payload conflicts.
    const replay = await run(owner, {
      command: 'document.create',
      projectId: project,
      title: 'Brain segmentation literature review',
      kind: 'LITERATURE_REVIEW',
      content: doc(para(text('Initial notes.'))),
      idempotencyKey: key,
    });
    expect(replay).toMatchObject({ id: docId, replayed: true });
    expect(
      await failure(
        run(owner, {
          command: 'document.create',
          projectId: project,
          title: 'Different',
          idempotencyKey: key,
        }),
      ),
    ).toBe('CONFLICT');
    const row = await admin.document.findUniqueOrThrow({
      where: { id: docId },
    });
    const artifact = await admin.artifact.findUniqueOrThrow({
      where: { id: row.artifactId },
    });
    expect(artifact).toMatchObject({ kind: 'DOCUMENT', projectId: project });
    expect(
      await admin.documentVersion.count({ where: { documentId: docId } }),
    ).toBe(1);
    expect(
      await admin.artifact.count({
        where: { projectId: project, kind: 'DOCUMENT' },
      }),
    ).toBe(1);
  });

  it('saves with optimistic revisions, deduplicates retries and no-ops unchanged content', async () => {
    const request = randomUUID();
    const content = doc(
      para(text('Second draft with '), cite(paper.id), text(' cited.')),
    );
    const saved = await run(editor, {
      command: 'document.save',
      id: docId,
      expectedRevision: 1,
      clientRequestId: request,
      content,
    });
    expect(saved.revision).toBe(2);
    const retry = await run(editor, {
      command: 'document.save',
      id: docId,
      expectedRevision: 1,
      clientRequestId: request,
      content,
    });
    expect(retry).toMatchObject({ revision: 2, replayed: true });
    // Reusing a request ID for different content is a conflict, not a write.
    expect(
      await failure(
        run(editor, {
          command: 'document.save',
          id: docId,
          expectedRevision: 1,
          clientRequestId: request,
          content: doc(para(text('other'))),
        }),
      ),
    ).toBe('CONFLICT');
    const same = await run(owner, {
      command: 'document.save',
      id: docId,
      expectedRevision: 2,
      clientRequestId: randomUUID(),
      content,
    });
    expect(same).toMatchObject({ revision: 2, unchanged: true });
    expect(
      await admin.documentVersion.count({ where: { documentId: docId } }),
    ).toBe(2);
    const dto = await getDocument(viewer, docId);
    expect(dto.content).toEqual(content);
    expect(dto.references).toEqual([
      expect.objectContaining({
        artifactId: paper.artifactId,
        state: 'AVAILABLE',
        kind: 'PAPER',
      }),
    ]);
    expect(dto.capabilities).not.toContain('document.edit');
    // Content references become CONTENT links (DOCUMENT CITES PAPER).
    const links = await artifactLinks(owner, paper.artifactId);
    expect(links.links).toEqual([
      expect.objectContaining({
        relationship: 'CITES',
        origin: 'CONTENT',
        direction: 'incoming',
      }),
    ]);
  });

  it('detects concurrent saves from the same revision without overwriting either', async () => {
    const results = await Promise.allSettled([
      run(owner, {
        command: 'document.save',
        id: docId,
        expectedRevision: 2,
        clientRequestId: randomUUID(),
        content: doc(para(text('Session A'))),
      }),
      run(editor, {
        command: 'document.save',
        id: docId,
        expectedRevision: 2,
        clientRequestId: randomUUID(),
        content: doc(para(text('Session B'))),
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(publicError(rejected.reason).code).toBe('CONFLICT');
    expect((await getDocument(owner, docId)).revision).toBe(3);
    // A stale revision is rejected outright.
    expect(
      await failure(
        run(editor, {
          command: 'document.save',
          id: docId,
          expectedRevision: 1,
          clientRequestId: randomUUID(),
          content: doc(para(text('stale'))),
        }),
      ),
    ).toBe('CONFLICT');
  });

  it('keeps versions immutable and restores by creating a new revision', async () => {
    const restored = await run(owner, {
      command: 'document.restore-version',
      id: docId,
      expectedRevision: 3,
      revision: 2,
      clientRequestId: randomUUID(),
    });
    expect(restored.revision).toBe(4);
    const v4 = await getVersion(owner, docId, 4);
    const v2 = await getVersion(owner, docId, 2);
    expect(v4.content).toEqual(v2.content);
    expect(v4).toMatchObject({ source: 'RESTORE', restoredFromRevision: 2 });
    const history = await listVersions(viewer, docId, undefined);
    expect(history.items.map((v) => v.revision)).toEqual([4, 3, 2, 1]);
    // Even the database owner cannot rewrite or delete history.
    await expect(
      admin.$executeRaw`UPDATE document_versions SET change_summary='x' WHERE document_id=${docId}::uuid`,
    ).rejects.toThrow();
    await expect(
      admin.$executeRaw`DELETE FROM document_versions WHERE document_id=${docId}::uuid`,
    ).rejects.toThrow();
  });

  it('rejects malicious or forged content at both the server and SQL boundaries', async () => {
    const save = (content: unknown, who: Actor = owner) =>
      failure(
        run(who, {
          command: 'document.save',
          id: docId,
          expectedRevision: 4,
          clientRequestId: randomUUID(),
          content,
        } as ArtifactCommandInput),
      );
    const bad = [
      { type: 'doc', content: [{ type: 'script', text: 'alert(1)' }] },
      doc(
        para({
          type: 'text',
          text: 'x',
          marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
        }),
      ),
      doc(
        para({
          type: 'text',
          text: 'x',
          marks: [{ type: 'link', attrs: { href: 'data:text/html,<script>' } }],
        }),
      ),
      doc({
        type: 'paragraph',
        attrs: { onclick: 'alert(1)' },
        content: [text('x')],
      }),
      doc({
        type: 'iframe',
        attrs: { src: 'https://evil.example' },
      } as DocNode),
      doc(para(cite(otherPaper.id))), // other tenant's paper
      doc(para(cite(randomUUID()))), // nonexistent
      doc(para(cite(paper.id, { quote: 'fabricated quote', page: 4 }))), // unverifiable location
      doc(
        para({
          type: 'personMention',
          attrs: { profileId: outsider.id, label: 'x' },
        }),
      ), // outsider
      doc(
        para({
          type: 'documentRef',
          attrs: { documentId: docId, label: 'self' },
        }),
      ),
    ];
    for (const content of bad)
      expect(await save(content)).toBe('VALIDATION_ERROR');
    // Deep nesting and oversize payloads fail closed.
    let deep: DocNode = para(text('x'));
    for (let i = 0; i < 30; i++) deep = { type: 'blockquote', content: [deep] };
    expect(await save(doc(deep))).toBe('VALIDATION_ERROR');
    expect(
      await save(
        doc(...Array.from({ length: 30 }, () => para(text('y'.repeat(15000))))),
      ),
    ).toBe('VALIDATION_ERROR');
    // Bypassing the server validator: the SQL boundary still refuses forged references.
    const direct = await failure(
      withActor(
        owner,
        (tx) =>
          tx.$queryRaw`SELECT atlas_private.mutate('document.save',${JSON.stringify(
            {
              id: docId,
              expectedRevision: 4,
              clientRequestId: randomUUID(),
              searchText: '',
              content: doc(para(cite(otherPaper.id))),
            },
          )}::jsonb,${randomUUID()}::uuid)`,
      ),
    );
    expect(direct).toBe('VALIDATION_ERROR');
    const evilType = await failure(
      withActor(
        owner,
        (tx) =>
          tx.$queryRaw`SELECT atlas_private.mutate('document.save',${JSON.stringify(
            {
              id: docId,
              expectedRevision: 4,
              clientRequestId: randomUUID(),
              searchText: '',
              content: {
                type: 'doc',
                content: [{ type: 'rawHtml', text: '<img onerror=alert(1)>' }],
              },
            },
          )}::jsonb,${randomUUID()}::uuid)`,
      ),
    );
    expect(evilType).toBe('VALIDATION_ERROR');
    expect((await getDocument(owner, docId)).revision).toBe(4);
  });

  it('accepts citations only with a real annotation or extracted chunk location', async () => {
    // Synthetic READY source/annotation/chunk inserted by the fixture owner.
    const sv = randomUUID();
    const sha = 'a'.repeat(64);
    await admin.$executeRaw`INSERT INTO source_versions(id,organization_id,workspace_id,project_id,project_paper_id,ordinal,source_type,rights_basis,state,file_name,media_type,declared_size,declared_sha256,byte_size,sha256,quarantine_key,object_key,scan_completed_at,ready_at,created_by_id,updated_at)
      SELECT ${sv}::uuid,organization_id,workspace_id,project_id,id,1,'UPLOAD','USER_UPLOAD','READY','unet.pdf','application/pdf',100,${sha},100,${sha},${`q/${sv}`},${`accepted/${project}/${sv}/${'b'.repeat(32)}.pdf`},now(),now(),${owner.id}::uuid,now() FROM project_papers WHERE id=${paper.id}::uuid`;
    const annotation = randomUUID();
    await admin.$executeRaw`INSERT INTO paper_annotations(id,organization_id,workspace_id,project_id,project_paper_id,source_version_id,author_id,kind,body,anchor,updated_at)
      SELECT ${annotation}::uuid,organization_id,workspace_id,project_id,project_paper_id,id,${owner.id}::uuid,'HIGHLIGHT',NULL,${JSON.stringify({ pageNumber: 3, quote: 'skip connections preserve detail', prefix: null, suffix: null, startOffset: 10, endOffset: 42, rects: [] })}::jsonb,now() FROM source_versions WHERE id=${sv}::uuid`;
    const good = cite(paper.id, {
      sourceVersionId: sv,
      annotationId: annotation,
      page: 3,
      quote: 'skip connections preserve detail',
      startOffset: 10,
      endOffset: 42,
      sourceChecksum: sha,
      label: 'Ronneberger, 2015',
    });
    const saved = await run(owner, {
      command: 'document.save',
      id: docId,
      expectedRevision: 4,
      clientRequestId: randomUUID(),
      content: doc(para(text('Located '), good)),
    });
    expect(saved.revision).toBe(5);
    const forgedPage = cite(paper.id, { ...good.attrs, page: 9 });
    expect(
      await failure(
        run(owner, {
          command: 'document.save',
          id: docId,
          expectedRevision: 5,
          clientRequestId: randomUUID(),
          content: doc(para(forgedPage)),
        }),
      ),
    ).toBe('VALIDATION_ERROR');
    const forgedChecksum = cite(paper.id, {
      ...good.attrs,
      sourceChecksum: 'c'.repeat(64),
    });
    expect(
      await failure(
        run(owner, {
          command: 'document.save',
          id: docId,
          expectedRevision: 5,
          clientRequestId: randomUUID(),
          content: doc(para(forgedChecksum)),
        }),
      ),
    ).toBe('VALIDATION_ERROR');
  });

  it('keeps archived-paper citations historical and blocks new ones', async () => {
    const archivedPaper = await paperOf(owner, project, 'Attention U-Net');
    const r = await run(owner, {
      command: 'document.save',
      id: docId,
      expectedRevision: 5,
      clientRequestId: randomUUID(),
      content: doc(para(text('Also '), cite(archivedPaper.id))),
    });
    const pp = await admin.projectPaper.findUniqueOrThrow({
      where: { id: archivedPaper.id },
    });
    await executeResearchCommand(
      owner,
      {
        command: 'paper.archive',
        id: archivedPaper.id,
        expectedVersion: pp.version,
      },
      randomUUID(),
      {
        resolve: () => Promise.reject(new Error('unused')),
      },
    );
    // Re-saving with the unchanged historical citation still works.
    const again = await run(owner, {
      command: 'document.save',
      id: docId,
      expectedRevision: r.revision!,
      clientRequestId: randomUUID(),
      content: doc(
        para(text('Also '), cite(archivedPaper.id)),
        para(text('more')),
      ),
    });
    expect(
      (await getDocument(owner, docId)).references.find(
        (x) => x.id === archivedPaper.id,
      )?.state,
    ).toBe('ARCHIVED');
    // A new citation to the archived paper elsewhere is refused.
    const other = await run(owner, {
      command: 'document.create',
      projectId: project,
      title: 'Other note',
      idempotencyKey: randomUUID(),
    });
    expect(
      await failure(
        run(owner, {
          command: 'document.save',
          id: other.id,
          expectedRevision: 1,
          clientRequestId: randomUUID(),
          content: doc(para(cite(archivedPaper.id))),
        }),
      ),
    ).toBe('CONFLICT');
    expect(again.revision).toBe(r.revision! + 1);
  });

  it('denies reads, history and export outside the project and to administrators without a grant', async () => {
    for (const who of [outsider, wsAdmin]) {
      expect(await failure(getDocument(who, docId))).toBe('NOT_FOUND');
      expect(await failure(listVersions(who, docId, undefined))).toBe(
        'NOT_FOUND',
      );
      expect(await failure(getVersion(who, docId, 1))).toBe('NOT_FOUND');
      expect(await failure(exportDocument(who, docId, 'markdown'))).toBe(
        'NOT_FOUND',
      );
      expect(await failure(listDocuments(who, project, {}))).toBe('NOT_FOUND');
      expect(
        await failure(
          run(who, {
            command: 'document.save',
            id: docId,
            expectedRevision: 1,
            clientRequestId: randomUUID(),
            content: doc(para(text('x'))),
          }),
        ),
      ).toBe('NOT_FOUND');
    }
    expect(
      await failure(
        run(viewer, {
          command: 'document.save',
          id: docId,
          expectedRevision: 7,
          clientRequestId: randomUUID(),
          content: doc(para(text('x'))),
        }),
      ),
    ).toBe('NOT_FOUND');
    // Raw runtime SQL sees nothing of another tenant and can write nothing.
    const leaked = await withActor(
      outsider,
      (tx) =>
        tx.$queryRaw<
          unknown[]
        >`SELECT id FROM documents WHERE project_id=${project}::uuid`,
    );
    expect(leaked).toEqual([]);
    expect(
      await failure(
        withActor(
          owner,
          (tx) =>
            tx.$executeRaw`UPDATE documents SET title='hijack' WHERE id=${docId}::uuid`,
        ),
      ),
    ).not.toBe('RESOLVED');
    expect(
      await failure(
        withActor(
          owner,
          (tx) =>
            tx.$executeRaw`INSERT INTO document_versions(id) VALUES (gen_random_uuid())`,
        ),
      ),
    ).not.toBe('RESOLVED');
  });

  it('exports sanitized Markdown, text and HTML with re-authorized labels', async () => {
    const xss = await run(owner, {
      command: 'document.create',
      projectId: project,
      title: '<img src=x onerror=alert(1)>',
      content: doc(
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [text('<script>alert(1)</script>')],
        },
        para({
          type: 'text',
          text: 'link',
          marks: [
            {
              type: 'link',
              attrs: { href: 'https://example.org/"onmouseover="x' },
            },
          ],
        }),
        para(cite(paper.id)),
      ),
      idempotencyKey: randomUUID(),
    });
    const html = await exportDocument(viewer, xss.id, 'html');
    // Only allowlisted tags and attributes are emitted; everything else is text.
    const tags = [...html.body.matchAll(/<\/?([a-zA-Z0-9!]+)([^>]*)>/g)];
    expect(
      tags.every(([, name]) =>
        /^(!doctype|html|head|meta|title|body|h[1-3]|p|a|span|strong|em|s|code|u|ul|ol|li|blockquote|pre|hr|br|input)$/i.test(
          name!,
        ),
      ),
    ).toBe(true);
    for (const [, , attrs] of tags)
      expect(
        attrs!
          .replace(
            /\s(href|rel|class|charset|start|type|disabled|checked)(="[^"]*")?/g,
            '',
          )
          .trim(),
      ).toMatch(/^(html)?$/);
    expect(html.body).toContain('&lt;script&gt;');
    expect(html.body).toContain('[Private source]');
    const md = await exportDocument(viewer, xss.id, 'markdown');
    expect(md.body).toContain('## \\<script\\>');
    const plain = await exportDocument(viewer, xss.id, 'text');
    expect(plain.body).toContain('<script>alert(1)</script>');
  });

  it('duplicates within the project and hides archived documents from viewers, exports and search', async () => {
    const copy = await run(editor, {
      command: 'document.duplicate',
      id: docId,
      idempotencyKey: randomUUID(),
    });
    expect((await getDocument(editor, copy.id)).title).toBe(
      'Copy of Brain segmentation literature review',
    );
    const current = await getDocument(owner, copy.id);
    await run(owner, {
      command: 'document.archive',
      id: copy.id,
      expectedVersion: current.version,
    });
    expect(await failure(getDocument(viewer, copy.id))).toBe('NOT_FOUND');
    expect(await failure(exportDocument(owner, copy.id, 'text'))).toBe(
      'NOT_FOUND',
    );
    expect(
      (await listDocuments(viewer, project, { archived: 'true' })).items,
    ).toEqual([]);
    expect(
      (await listDocuments(owner, project, { archived: 'true' })).items.map(
        (d) => d.id,
      ),
    ).toEqual([copy.id]);
    const archivedVersions = await withActor(
      owner,
      (tx) =>
        tx.$queryRaw<
          unknown[]
        >`SELECT id FROM document_versions WHERE document_id=${copy.id}::uuid`,
    );
    expect(archivedVersions).toEqual([]);
    await run(owner, {
      command: 'document.restore',
      id: copy.id,
      expectedVersion: current.version + 1,
    });
    expect((await getDocument(viewer, copy.id)).archived).toBe(false);
  });
});

describe.sequential(
  'tasks, milestones and assignment on real PostgreSQL',
  () => {
    let taskId: string;
    let milestoneId: string;
    it('creates numbered tasks with milestones and eligible assignees only', async () => {
      milestoneId = (
        await run(owner, {
          command: 'milestone.create',
          projectId: project,
          title: 'Model evaluation',
          targetDate: '2026-12-01',
          idempotencyKey: randomUUID(),
        })
      ).id;
      const tasks = await Promise.all(
        ['Benchmark Attention U-Net', 'Collect datasets', 'Write methods'].map(
          (title) =>
            run(editor, {
              command: 'task.create',
              projectId: project,
              title,
              priority: 'HIGH',
              milestoneId,
              idempotencyKey: randomUUID(),
            }),
        ),
      );
      expect(tasks.map((t) => t.taskNumber).sort()).toEqual([1, 2, 3]);
      taskId = tasks[0]!.id;
      for (const ineligible of [
        outsider.id,
        viewer.id,
        wsAdmin.id,
        randomUUID(),
      ])
        expect(
          await failure(
            run(owner, {
              command: 'task.create',
              projectId: project,
              title: 'x',
              assigneeId: ineligible,
              idempotencyKey: randomUUID(),
            }),
          ),
        ).toBe('VALIDATION_ERROR');
      expect(
        await failure(
          run(owner, {
            command: 'task.create',
            projectId: project,
            title: 'x',
            milestoneId: randomUUID(),
            idempotencyKey: randomUUID(),
          }),
        ),
      ).toBe('VALIDATION_ERROR');
      const task = (await getTask(owner, taskId)).task;
      const assigned = await run(owner, {
        command: 'task.assign',
        id: taskId,
        expectedVersion: task.version,
        assigneeId: leaver.id,
      });
      expect(assigned.id).toBe(taskId);
      expect((await getTask(viewer, taskId)).task.assignee).toMatchObject({
        id: leaver.id,
        state: 'ACTIVE',
      });
    });

    it('enforces the transition policy and task versions server-side', async () => {
      let task = (await getTask(owner, taskId)).task;
      expect(
        await failure(
          run(owner, {
            command: 'task.transition',
            id: taskId,
            expectedVersion: task.version,
            status: 'DONE',
          }),
        ),
      ).toBe('CONFLICT');
      await run(editor, {
        command: 'task.transition',
        id: taskId,
        expectedVersion: task.version,
        status: 'IN_PROGRESS',
      });
      // Concurrent updates from the same version: exactly one wins.
      task = (await getTask(owner, taskId)).task;
      const results = await Promise.allSettled([
        run(owner, {
          command: 'task.update',
          id: taskId,
          expectedVersion: task.version,
          priority: 'URGENT',
        }),
        run(editor, {
          command: 'task.transition',
          id: taskId,
          expectedVersion: task.version,
          status: 'IN_REVIEW',
        }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        await failure(
          run(owner, {
            command: 'task.update',
            id: taskId,
            expectedVersion: task.version,
            title: 'stale',
          }),
        ),
      ).toBe('CONFLICT');
      expect(
        await failure(
          run(viewer, {
            command: 'task.update',
            id: (await getTask(owner, taskId)).task.id,
            expectedVersion: 99,
            title: 'x',
          }),
        ),
      ).toBe('NOT_FOUND');
      const page = await listTasks(viewer, project, { sort: 'number' });
      expect(page.items.map((t) => t.number)).toEqual([1, 2, 3]);
      expect(page.milestones[0]).toMatchObject({
        title: 'Model evaluation',
        openTasks: 3,
      });
      expect(page.participants.find((p) => p.id === viewer.id)).toMatchObject({
        assignable: false,
      });
      expect(await failure(listTasks(outsider, project, {}))).toBe('NOT_FOUND');
      expect(await failure(getTask(wsAdmin, taskId))).toBe('NOT_FOUND');
    });

    it('applies the revocation policy when an assignee loses project access', async () => {
      await platform(owner, {
        command: 'membership.remove',
        scope: 'project',
        scopeId: project,
        profileId: leaver.id,
        expectedVersion: await memberVersion(project, leaver.id),
      });
      const task = (await getTask(owner, taskId)).task;
      // Stored but hidden; the former participant cannot read the task or be newly assigned.
      expect(task.assignee).toEqual({
        id: leaver.id,
        name: null,
        state: 'REVOKED',
      });
      expect(await failure(getTask(leaver, taskId))).toBe('NOT_FOUND');
      const second = (await listTasks(owner, project, {})).items.find(
        (t) => t.id !== taskId,
      )!;
      expect(
        await failure(
          run(owner, {
            command: 'task.assign',
            id: second.id,
            expectedVersion: second.version,
            assigneeId: leaver.id,
          }),
        ),
      ).toBe('VALIDATION_ERROR');
      // Other fields stay editable; reassignment to an eligible participant works.
      await run(owner, {
        command: 'task.update',
        id: taskId,
        expectedVersion: task.version,
        description: 'Re-run with new splits',
      });
      await run(owner, {
        command: 'task.assign',
        id: taskId,
        expectedVersion: task.version + 1,
        assigneeId: editor.id,
      });
      expect((await getTask(owner, taskId)).task.assignee).toMatchObject({
        id: editor.id,
        state: 'ACTIVE',
      });
    });
  },
);

describe.sequential('typed links, search, graph and AI proposals', () => {
  let docArtifact: string;
  let taskA: { id: string; artifactId: string };
  let taskB: { id: string; artifactId: string };
  let docId: string;
  it('validates the link matrix, project scope, duplicates and dependency cycles', async () => {
    docId = (await listDocuments(owner, project, {})).items.find((d) =>
      d.title.startsWith('Brain'),
    )!.id;
    docArtifact = (await getDocument(owner, docId)).artifactId;
    const tasks = (await listTasks(owner, project, {})).items;
    taskA = tasks.find((t) => t.title.startsWith('Benchmark'))!;
    taskB = tasks.find((t) => t.title === 'Collect datasets')!;
    const link = (
      source: string,
      target: string,
      relationship: 'TRACKS' | 'DEPENDS_ON' | 'CITES' | 'REFERENCES',
      who: Actor = owner,
      projectId = project,
    ) =>
      run(who, {
        command: 'artifact.link.create',
        projectId,
        sourceArtifactId: source,
        targetArtifactId: target,
        relationship,
        idempotencyKey: randomUUID(),
      });
    const tracks = await link(docArtifact, taskA.artifactId, 'TRACKS');
    expect((await link(docArtifact, taskA.artifactId, 'TRACKS')).existing).toBe(
      true,
    );
    expect(await failure(link(taskA.artifactId, docArtifact, 'TRACKS'))).toBe(
      'VALIDATION_ERROR',
    );
    expect(
      await failure(link(docArtifact, paper.artifactId, 'REFERENCES')),
    ).toBe('VALIDATION_ERROR');
    expect(
      await failure(link(docArtifact, otherPaper.artifactId, 'CITES')),
    ).toBe('NOT_FOUND');
    expect(
      await failure(
        link(docArtifact, paper.artifactId, 'CITES', outsider, otherProject),
      ),
    ).toBe('NOT_FOUND');
    expect(
      await failure(link(docArtifact, taskA.artifactId, 'TRACKS', viewer)),
    ).toBe('NOT_FOUND');
    await link(taskA.artifactId, taskB.artifactId, 'DEPENDS_ON');
    expect(
      await failure(link(taskB.artifactId, taskA.artifactId, 'DEPENDS_ON')),
    ).toBe('CONFLICT');
    expect(
      await failure(link(taskA.artifactId, taskA.artifactId, 'DEPENDS_ON')),
    ).toBe('VALIDATION_ERROR');
    // The database itself rejects a cross-project or invalid-kind edge.
    await expect(
      admin.$executeRaw`INSERT INTO research_artifact_links(id,organization_id,workspace_id,project_id,source_artifact_id,source_kind,target_artifact_id,target_kind,relationship,created_by_id)
        SELECT gen_random_uuid(),organization_id,workspace_id,project_id,${docArtifact}::uuid,'DOCUMENT',${otherPaper.artifactId}::uuid,'PAPER','CITES',${owner.id}::uuid FROM projects WHERE id=${project}::uuid`,
    ).rejects.toThrow();
    await expect(
      admin.$executeRaw`INSERT INTO research_artifact_links(id,organization_id,workspace_id,project_id,source_artifact_id,source_kind,target_artifact_id,target_kind,relationship,created_by_id)
        SELECT gen_random_uuid(),organization_id,workspace_id,project_id,${paper.artifactId}::uuid,'PAPER',${docArtifact}::uuid,'DOCUMENT','DEPENDS_ON',${owner.id}::uuid FROM projects WHERE id=${project}::uuid`,
    ).rejects.toThrow();
    // A forged artifact kind cannot be smuggled into an owner row.
    await expect(
      admin.$executeRaw`UPDATE documents SET artifact_kind='TASK' WHERE id=${docId}::uuid`,
    ).rejects.toThrow();
    const detail = await getTask(viewer, taskA.id);
    expect(detail.links.map((l) => l.relationship).sort()).toEqual([
      'DEPENDS_ON',
      'TRACKS',
    ]);
    expect(detail.task.linkedDocuments).toBe(1);
    // Archived targets stay historically linked but render safely and refuse new links.
    await run(owner, {
      command: 'task.archive',
      id: taskB.id,
      expectedVersion: (await getTask(owner, taskB.id)).task.version,
    });
    expect(
      (await getTask(owner, taskA.id)).links.find(
        (l) => l.relationship === 'DEPENDS_ON',
      )?.other.state,
    ).toBe('ARCHIVED');
    expect(await failure(link(docArtifact, taskB.artifactId, 'TRACKS'))).toBe(
      'CONFLICT',
    );
    await run(owner, { command: 'artifact.link.remove', id: tracks.id });
    expect(
      await failure(
        run(owner, { command: 'artifact.link.remove', id: tracks.id }),
      ),
    ).toBe('NOT_FOUND');
  });

  it('searches only authorized, active artifacts with bounded plain snippets', async () => {
    const hits = await searchArtifacts(viewer, project, { q: 'segmentation' });
    expect(new Set(hits.items.map((h) => h.kind))).toEqual(
      new Set(['DOCUMENT', 'PAPER']),
    );
    expect(
      hits.items.every(
        (h) => h.snippet.length <= 400 && !/<[a-z]/i.test(h.snippet),
      ),
    ).toBe(true);
    expect(
      (await searchArtifacts(viewer, project, { q: 'benchm', kind: 'TASK' }))
        .items[0],
    ).toMatchObject({
      kind: 'TASK',
      title: 'Benchmark Attention U-Net',
      detail: expect.stringMatching(/^#[1-3]$/),
    });
    expect(
      await failure(searchArtifacts(outsider, project, { q: 'segmentation' })),
    ).toBe('NOT_FOUND');
    expect(
      await failure(searchArtifacts(wsAdmin, project, { q: 'segmentation' })),
    ).toBe('NOT_FOUND');
    // The other tenant's own project never returns this project's text.
    expect(
      (await searchArtifacts(outsider, otherProject, { q: 'segmentation' }))
        .items,
    ).toEqual([]);
    // Archived tasks are excluded.
    expect(
      (await searchArtifacts(owner, project, { q: 'datasets' })).items,
    ).toEqual([]);
    // Many hits paginate with signed cursors bound to the actor and query.
    for (let i = 0; i < 22; i++)
      await run(owner, {
        command: 'task.create',
        projectId: project,
        title: `Pagination probe ${i}`,
        idempotencyKey: randomUUID(),
      });
    const first = await searchArtifacts(owner, project, { q: 'probe' });
    expect(first.items).toHaveLength(20);
    const next = await searchArtifacts(owner, project, {
      q: 'probe',
      cursor: first.nextCursor!,
    });
    expect(next.items).toHaveLength(2);
    expect(
      await failure(
        searchArtifacts(editor, project, {
          q: 'probe',
          cursor: first.nextCursor!,
        }),
      ),
    ).toBe('VALIDATION_ERROR');
    expect(
      await failure(
        searchArtifacts(owner, project, {
          q: 'other',
          cursor: first.nextCursor!,
        }),
      ),
    ).toBe('VALIDATION_ERROR');
  });

  it('offers mention options and a graph projection from this project only', async () => {
    const options = await artifactOptions(editor, project, { q: '' });
    expect(
      options.items.some((o) => o.artifactId === otherPaper.artifactId),
    ).toBe(false);
    expect(options.people.some((p) => p.id === outsider.id)).toBe(false);
    expect(options.people.some((p) => p.id === leaver.id)).toBe(false);
    const graph = await projectGraph(viewer, project);
    expect(graph.nodes.some((n) => n.artifactId === docArtifact)).toBe(true);
    expect(
      graph.nodes.some((n) => n.artifactId === otherPaper.artifactId),
    ).toBe(false);
    expect(graph.edges.some((e) => e.relationship === 'CITES')).toBe(true);
  });

  it('applies AI proposals only after approval, with fresh revision and capability checks', async () => {
    const conversation = randomUUID();
    const runId = randomUUID();
    await admin.$executeRaw`INSERT INTO ai_conversations(id,organization_id,workspace_id,project_id,actor_id,title) SELECT ${conversation}::uuid,organization_id,workspace_id,id,${editor.id}::uuid,'Plan' FROM projects WHERE id=${project}::uuid`;
    const citations = [
      {
        evidenceId: 'paper-1',
        quote: 'U-Net',
        startOffset: 0,
        endOffset: 5,
        projectId: project,
        projectPaperId: paper.id,
        sourceVersionId: null,
        page: null,
        checksum: 'd'.repeat(64),
        title: 'U-Net',
        kind: 'metadata',
        location: 'verified',
        claimSupport: 'not-evaluated',
      },
    ];
    await admin.$executeRaw`INSERT INTO ai_runs(id,organization_id,workspace_id,project_id,actor_id,conversation_id,idempotency_key,request_hash,state,provider,model,prompt,answer,citations)
      SELECT ${runId}::uuid,organization_id,workspace_id,id,${editor.id}::uuid,${conversation}::uuid,gen_random_uuid(),${'e'.repeat(64)},'COMPLETED','openai','synthetic','Plan the benchmark',
       ${'Proposed plan [1].\n\n- Prepare splits — stratify by scanner [1]\n- Train baseline U-Net\n- Compare Dice scores'},${JSON.stringify(citations)}::jsonb FROM projects WHERE id=${project}::uuid`;
    const before = (await getDocument(editor, docId)).revision;
    const preview = await buildProposal(editor, {
      type: 'document.insert',
      runId,
      documentId: docId,
    });
    expect(preview.type).toBe('document.insert');
    // Previewing writes nothing.
    expect((await getDocument(editor, docId)).revision).toBe(before);
    if (preview.type !== 'document.insert') throw new Error('unexpected');
    // Another user cannot apply someone else's run; viewers cannot apply at all.
    for (const who of [owner, viewer])
      expect(
        await failure(
          run(who, {
            command: 'ai.document-proposal.apply',
            id: docId,
            runId,
            expectedRevision: before,
            proposalHash: preview.proposalHash,
            clientRequestId: randomUUID(),
            approved: true,
          }),
        ),
      ).toBe('NOT_FOUND');
    expect(
      await failure(
        run(editor, {
          command: 'ai.document-proposal.apply',
          id: docId,
          runId,
          expectedRevision: before,
          proposalHash: 'f'.repeat(64),
          clientRequestId: randomUUID(),
          approved: true,
        }),
      ),
    ).toBe('CONFLICT');
    // Without explicit approval the command is invalid.
    expect(
      await failure(
        run(editor, {
          command: 'ai.document-proposal.apply',
          id: docId,
          runId,
          expectedRevision: before,
          proposalHash: preview.proposalHash,
          clientRequestId: randomUUID(),
        } as unknown as ArtifactCommandInput),
      ),
    ).toBe('VALIDATION_ERROR');
    const applied = await run(editor, {
      command: 'ai.document-proposal.apply',
      id: docId,
      runId,
      expectedRevision: before,
      proposalHash: preview.proposalHash,
      clientRequestId: randomUUID(),
      approved: true,
    });
    expect(applied.revision).toBe(before + 1);
    expect((await getVersion(editor, docId, before + 1)).source).toBe(
      'AI_PROPOSAL',
    );
    // A stale proposal is refused rather than overwriting newer work.
    expect(
      await failure(
        run(editor, {
          command: 'ai.document-proposal.apply',
          id: docId,
          runId,
          expectedRevision: before,
          proposalHash: preview.proposalHash,
          clientRequestId: randomUUID(),
          approved: true,
        }),
      ),
    ).toBe('CONFLICT');
    const plan = await buildProposal(editor, {
      type: 'task.create',
      runId,
      projectId: project,
    });
    if (plan.type !== 'task.create') throw new Error('unexpected');
    expect(plan.tasks.map((t) => t.title)).toEqual([
      'Prepare splits',
      'Train baseline U-Net',
      'Compare Dice scores',
    ]);
    expect(plan.tasks[0]!.references[0]).toMatchObject({
      artifactId: paper.artifactId,
    });
    expect(
      await failure(
        run(editor, {
          command: 'ai.task-proposal.apply',
          projectId: project,
          runId,
          proposalHash: plan.proposalHash,
          selected: [0],
          assigneeId: outsider.id,
          approved: true,
          idempotencyKey: randomUUID(),
        }),
      ),
    ).toBe('VALIDATION_ERROR');
    const created = await run(editor, {
      command: 'ai.task-proposal.apply',
      projectId: project,
      runId,
      proposalHash: plan.proposalHash,
      selected: [0, 2],
      approved: true,
      idempotencyKey: randomUUID(),
    });
    expect(created.taskIds).toHaveLength(2);
    const detail = await getTask(editor, created.taskIds![0]!);
    expect(detail.task.title).toBe('Prepare splits');
    expect(detail.links[0]).toMatchObject({
      relationship: 'REFERENCES',
      other: expect.objectContaining({ artifactId: paper.artifactId }),
    });
    // Revoked access ends the ability to apply the actor's own run.
    await platform(owner, {
      command: 'membership.remove',
      scope: 'project',
      scopeId: project,
      profileId: editor.id,
      expectedVersion: await memberVersion(project, editor.id),
    });
    expect(
      await failure(
        run(editor, {
          command: 'ai.task-proposal.apply',
          projectId: project,
          runId,
          proposalHash: plan.proposalHash,
          selected: [1],
          approved: true,
          idempotencyKey: randomUUID(),
        }),
      ),
    ).toBe('NOT_FOUND');
  });
});

describe.sequential('performance boundaries', () => {
  it('keeps board, search, graph and history reads bounded at scale', async () => {
    const scale = (
      await platform(owner, {
        command: 'project.create',
        workspaceId,
        name: 'Scale probe',
        visibility: 'PRIVATE',
        idempotencyKey: randomUUID(),
      })
    ).id!;
    // Bulk fixture rows through the owner role; reads run as the runtime.
    await admin.$executeRaw`WITH p AS (SELECT * FROM projects WHERE id=${scale}::uuid),
      a AS (INSERT INTO artifacts(id,organization_id,workspace_id,project_id,kind)
        SELECT gen_random_uuid(),p.organization_id,p.workspace_id,p.id,'TASK' FROM p, generate_series(1,500) RETURNING id)
      INSERT INTO tasks(id,organization_id,workspace_id,project_id,artifact_id,task_number,title,description,created_by_id,updated_by_id)
      SELECT gen_random_uuid(),p.organization_id,p.workspace_id,p.id,a.id,row_number() OVER (),'Scale task '||row_number() OVER (),
        'Synthetic segmentation workload description',${owner.id}::uuid,${owner.id}::uuid FROM p, a`;
    for (let i = 0; i < 20; i++)
      await run(owner, {
        command: 'document.create',
        projectId: scale,
        title: `Scale document ${i}`,
        content: doc(para(text(`Segmentation notes ${i} `.repeat(200)))),
        idempotencyKey: randomUUID(),
      });
    const time = async <T>(work: () => Promise<T>) => {
      const start = performance.now();
      const result = await work();
      return { result, ms: Math.round(performance.now() - start) };
    };
    const board = await time(() => listTasks(owner, scale, {}));
    const search = await time(() =>
      searchArtifacts(owner, scale, { q: 'segmentation' }),
    );
    const graph = await time(() => projectGraph(owner, scale));
    const options = await time(() =>
      artifactOptions(owner, scale, { q: 'scale' }),
    );
    expect(board.result.items).toHaveLength(300);
    expect(board.result.nextCursor).not.toBeNull();
    expect(search.result.items).toHaveLength(20);
    expect(graph.result.nodes).toHaveLength(300);
    expect(graph.result.truncated).toBe(true);
    process.stdout.write(
      `ARTIFACT_PERFORMANCE ${JSON.stringify({
        tasks: 500,
        documents: 20,
        boardPageMs: board.ms,
        searchMs: search.ms,
        graphMs: graph.ms,
        mentionOptionsMs: options.ms,
      })}\n`,
    );
    // Generous ceilings catch accidental N+1 or unbounded scans in CI.
    for (const ms of [board.ms, search.ms, graph.ms, options.ms])
      expect(ms).toBeLessThan(5000);
  });
});
