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
import { runtimeDatabase } from '../../apps/web/src/features/platform/server/database';
import { publicError } from '../../apps/web/src/features/platform/server/errors';
import { executeResearchCommand } from '../../apps/web/src/features/library/server/library';
import { executeArtifactCommand } from '../../apps/web/src/features/artifacts/server/commands';
import { getDocument } from '../../apps/web/src/features/documents/server/documents';
import { getTask } from '../../apps/web/src/features/tasks/server/tasks';
import {
  artifactLinks,
  projectGraph,
} from '../../apps/web/src/features/artifacts/server/links';
import { searchArtifacts } from '../../apps/web/src/features/artifacts/server/search';

/*
 * A02 connected research journey on a disposable, local, non-owner
 * PostgreSQL role: Reader evidence → research note → task → back to the
 * paper and its page, plus the multi-user and failure-recovery matrices.
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
const leaver = actor();
const failure = (work: Promise<unknown>) =>
  work.then(
    () => 'RESOLVED',
    (error: unknown) =>
      error instanceof ZodError ? 'VALIDATION_ERROR' : publicError(error).code,
  );
const platform = (who: Actor, command: PlatformCommand) =>
  executeCommand(who, command, randomUUID());
type CiteInput = Extract<
  ArtifactCommandInput,
  { command: 'document.cite-source' }
>;
const run = (who: Actor, command: ArtifactCommandInput) =>
  executeArtifactCommand(who, command, randomUUID());
const unusedProvider = { resolve: () => Promise.reject(new Error('unused')) };
const research = (
  who: Actor,
  command: Parameters<typeof executeResearchCommand>[1],
) => executeResearchCommand(who, command, randomUUID(), unusedProvider);

let project: string;
let otherProject: string;
let paper: { id: string; artifactId: string };
let otherPaper: { id: string; artifactId: string };
const v1 = randomUUID();
const v1Sha = 'd'.repeat(64);
const quote = 'Sparse attention reduces memory without losing accuracy';
const anchor = (page: number, q: string | null, start: number | null) => ({
  pageNumber: page,
  quote: q,
  prefix: null,
  suffix: null,
  startOffset: start,
  endOffset: start === null || q === null ? null : start + q.length,
  rects: [],
});
const annotations: Record<string, string> = {};

const paperOf = async (who: Actor, projectId: string, title: string) => {
  const { id } = await research(who, {
    command: 'paper.create',
    projectId,
    title,
    idempotencyKey: randomUUID(),
  });
  const row = await admin.projectPaper.findUniqueOrThrow({ where: { id } });
  return { id, artifactId: row.artifactId };
};
const readyVersion = async (
  paperId: string,
  versionId: string,
  sha: string,
  ordinal: number,
) =>
  admin.$executeRaw`INSERT INTO source_versions(id,organization_id,workspace_id,project_id,project_paper_id,ordinal,source_type,rights_basis,state,file_name,media_type,declared_size,declared_sha256,byte_size,sha256,quarantine_key,object_key,scan_completed_at,ready_at,created_by_id,updated_at)
    SELECT ${versionId}::uuid,organization_id,workspace_id,project_id,id,${ordinal},'UPLOAD','USER_UPLOAD','READY','synthetic.pdf','application/pdf',100,${sha},100,${sha},${`q/${versionId}`},${`accepted/${project}/${versionId}/${'e'.repeat(32)}.pdf`},now(),now(),${owner.id}::uuid,now() FROM project_papers WHERE id=${paperId}::uuid`;
const memberVersion = async (projectId: string, profileId: string) =>
  (
    await admin.projectMembership.findUniqueOrThrow({
      where: { projectId_profileId: { projectId, profileId } },
    })
  ).version;
const citationsOf = (content: unknown) => {
  const found: DocNode[] = [];
  const walk = (node: DocNode) => {
    if (node.type === 'citation') found.push(node);
    node.content?.forEach(walk);
  };
  walk(content as DocNode);
  return found;
};

beforeAll(async () => {
  vi.stubEnv('ATLAS_MODE', 'live');
  vi.stubEnv('DATABASE_URL', runtime);
  vi.stubEnv('ATLAS_RATE_SECRET', 'local-test-rate-secret-32-characters');
  vi.stubEnv('ATLAS_CURSOR_SECRET', 'local-test-cursor-secret-32-characters');
  vi.stubEnv('ATLAS_ORIGIN', 'http://127.0.0.1:3102');
  vi.stubEnv('ATLAS_DEV_INVITATION_LINKS', 'true');
  vi.stubEnv('NODE_ENV', 'development');
  for (const who of [owner, editor, viewer, outsider, leaver])
    await platform(who, {
      command: 'bootstrap',
      displayName: `Journey ${who.id.slice(0, 4)}`,
      workspaceName: 'Personal',
      researchInterests: [],
    });
  const org = (
    await platform(owner, { command: 'organization.create', name: 'A02 lab' })
  ).id!;
  const workspaceId = (
    await platform(owner, {
      command: 'workspace.create',
      organizationId: org,
      name: 'Journey',
    })
  ).id!;
  project = (
    await platform(owner, {
      command: 'project.create',
      workspaceId,
      name: 'Connected journey',
      visibility: 'PRIVATE',
      idempotencyKey: randomUUID(),
    })
  ).id!;
  const otherOrg = (
    await platform(outsider, {
      command: 'organization.create',
      name: 'Other A02 lab',
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
      name: 'Other journey',
      visibility: 'PRIVATE',
      idempotencyKey: randomUUID(),
    })
  ).id!;
  for (const [who, role] of [
    [editor, 'EDITOR'],
    [viewer, 'VIEWER'],
    [leaver, 'EDITOR'],
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
  paper = await paperOf(owner, project, 'Sparse Evoformer attention');
  otherPaper = await paperOf(outsider, otherProject, 'Confidential A02 source');
  await readyVersion(paper.id, v1, v1Sha, 1);
  const create = async (
    key: string,
    who: Actor,
    kind: 'HIGHLIGHT' | 'PAGE_NOTE',
    visibility: 'PROJECT' | 'PRIVATE',
    a: ReturnType<typeof anchor>,
    body?: string,
  ) => {
    annotations[key] = (
      await research(who, {
        command: 'annotation.create',
        sourceVersionId: v1,
        kind,
        visibility,
        ...(body ? { body } : {}),
        anchor: a,
        idempotencyKey: randomUUID(),
      })
    ).id;
  };
  await create('shared', owner, 'HIGHLIGHT', 'PROJECT', anchor(4, quote, 120));
  await create(
    'pageNote',
    owner,
    'PAGE_NOTE',
    'PROJECT',
    anchor(7, null, null),
    'Compare with the baseline table.',
  );
  await create(
    'ownerPrivate',
    owner,
    'HIGHLIGHT',
    'PRIVATE',
    anchor(5, 'Owner private synthetic passage', 10),
  );
  await create(
    'editorPrivate',
    editor,
    'HIGHLIGHT',
    'PRIVATE',
    anchor(6, 'Editor private synthetic passage', 30),
  );
  await create(
    'longQuote',
    owner,
    'HIGHLIGHT',
    'PROJECT',
    anchor(8, 'x'.repeat(2500), 0),
  );
});
afterAll(async () => {
  await admin.$disconnect();
  await runtimeDatabase().$disconnect();
  vi.unstubAllEnvs();
});

describe.sequential(
  'Journey A — reader evidence to note, task and back',
  () => {
    let noteId: string;
    let noteArtifact: string;
    let taskId: string;
    const createRequest = randomUUID();
    const newNote = (): CiteInput => ({
      command: 'document.cite-source',
      projectId: project,
      projectPaperId: paper.id,
      sourceVersionId: v1,
      annotationId: annotations.shared!,
      target: { kind: 'new', title: 'Evoformer reading note' },
      commentary: 'Check whether the memory claim holds at 4k tokens.',
      clientRequestId: createRequest,
    });

    it('creates a research note and its exact quotation citation in one transaction', async () => {
      const created = await run(editor, newNote());
      noteId = created.id;
      expect(created.revision).toBe(1);
      const note = await getDocument(editor, noteId);
      noteArtifact = note.artifactId;
      expect(note.kind).toBe('RESEARCH_NOTE');
      const [citation] = citationsOf(note.content);
      // Every attribute comes from the stored annotation and version rows.
      expect(citation?.attrs).toEqual({
        projectPaperId: paper.id,
        sourceVersionId: v1,
        annotationId: annotations.shared,
        chunkId: null,
        page: 4,
        quote,
        startOffset: 120,
        endOffset: 120 + quote.length,
        sourceChecksum: v1Sha,
        label: null,
      });
      // Quotation, citation and user commentary stay separate blocks.
      const blocks = (note.content as DocNode).content ?? [];
      expect(blocks.map((b) => b.type)).toEqual(['blockquote', 'paragraph']);
      expect(JSON.stringify(blocks[1])).toContain('4k tokens');
      expect(note.references).toEqual([
        expect.objectContaining({
          artifactId: paper.artifactId,
          state: 'AVAILABLE',
        }),
      ]);
    });

    it('replays a lost create response without a second note', async () => {
      const replay = await run(editor, newNote());
      expect(replay).toMatchObject({ id: noteId, replayed: true });
      expect(
        await admin.document.count({
          where: { projectId: project, title: 'Evoformer reading note' },
        }),
      ).toBe(1);
      // The same key with different evidence is a conflict, not a new note.
      expect(
        await failure(
          run(editor, { ...newNote(), annotationId: annotations.pageNote! }),
        ),
      ).toBe('CONFLICT');
    });

    it('appends a page-level reference to an existing note with optimistic concurrency', async () => {
      const request = randomUUID();
      const append = (expectedRevision: number): CiteInput => ({
        command: 'document.cite-source',
        projectId: project,
        projectPaperId: paper.id,
        sourceVersionId: v1,
        annotationId: annotations.pageNote!,
        target: { kind: 'existing', documentId: noteId, expectedRevision },
        clientRequestId: request,
      });
      const saved = await run(editor, append(1));
      expect(saved.revision).toBe(2);
      // Repeated submission (lost response) returns the same revision.
      expect(await run(editor, append(1))).toMatchObject({
        revision: 2,
        replayed: true,
      });
      const note = await getDocument(editor, noteId);
      const page = citationsOf(note.content).find(
        (c) => c.attrs?.annotationId === annotations.pageNote,
      );
      expect(page?.attrs).toMatchObject({ page: 7, quote: null });
      // The quoted citation from revision 1 is preserved verbatim.
      expect(citationsOf(note.content)).toHaveLength(2);
      expect(
        await admin.documentVersion.count({ where: { documentId: noteId } }),
      ).toBe(2);
      // A stale revision never overwrites newer content.
      expect(
        await failure(
          run(editor, {
            ...append(1),
            clientRequestId: randomUUID(),
          }),
        ),
      ).toBe('CONFLICT');
      expect((await getDocument(editor, noteId)).revision).toBe(2);
    });

    it('records only a version for page-less evidence and preserves version identity after a newer upload', async () => {
      const saved = await run(owner, {
        command: 'document.cite-source',
        projectId: project,
        projectPaperId: paper.id,
        sourceVersionId: v1,
        target: { kind: 'existing', documentId: noteId, expectedRevision: 2 },
        clientRequestId: randomUUID(),
      });
      expect(saved.revision).toBe(3);
      await readyVersion(paper.id, randomUUID(), 'f'.repeat(64), 2);
      const note = await getDocument(owner, noteId);
      const versionOnly = citationsOf(note.content).at(-1);
      expect(versionOnly?.attrs).toMatchObject({
        sourceVersionId: v1,
        sourceChecksum: v1Sha,
        annotationId: null,
        page: null,
        quote: null,
      });
      // Long annotation quotes are refused rather than truncated or invented.
      expect(
        await failure(
          run(owner, {
            command: 'document.cite-source',
            projectId: project,
            projectPaperId: paper.id,
            sourceVersionId: v1,
            annotationId: annotations.longQuote!,
            target: {
              kind: 'existing',
              documentId: noteId,
              expectedRevision: 3,
            },
            clientRequestId: randomUUID(),
          }),
        ),
      ).toBe('VALIDATION_ERROR');
      expect((await getDocument(owner, noteId)).revision).toBe(3);
    });

    it('creates a task linked to the note and an explicitly selected paper, idempotently', async () => {
      const key = randomUUID();
      const create = (): ArtifactCommandInput => ({
        command: 'task.create',
        projectId: project,
        title: 'Reproduce the sparse attention memory result',
        description: 'From “Evoformer reading note”.',
        references: [noteArtifact, paper.artifactId],
        idempotencyKey: key,
      });
      const created = await run(editor, create());
      taskId = created.id;
      const replay = await run(editor, create());
      expect(replay).toMatchObject({ id: taskId, replayed: true });
      expect(
        await admin.task.count({
          where: {
            projectId: project,
            title: 'Reproduce the sparse attention memory result',
          },
        }),
      ).toBe(1);
      const detail = await getTask(editor, taskId);
      expect(
        detail.links.map((l) => [l.relationship, l.direction, l.other.kind]),
      ).toEqual(
        expect.arrayContaining([
          ['RELATES_TO', 'outgoing', 'DOCUMENT'],
          ['REFERENCES', 'outgoing', 'PAPER'],
        ]),
      );
    });

    it('records DOCUMENT TRACKS TASK when the note references the task', async () => {
      const note = await getDocument(editor, noteId);
      const content = note.content as DocNode;
      await run(editor, {
        command: 'document.save',
        id: noteId,
        expectedRevision: note.revision,
        clientRequestId: randomUUID(),
        content: {
          type: 'doc',
          content: [
            ...(content.content ?? []),
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Follow-up: ' },
                { type: 'taskRef', attrs: { taskId } },
              ],
            },
          ],
        },
      });
      const links = await artifactLinks(editor, noteArtifact);
      expect(
        links.links.map((l) => [l.relationship, l.direction, l.other.kind]),
      ).toEqual(
        expect.arrayContaining([
          ['CITES', 'outgoing', 'PAPER'],
          ['TRACKS', 'outgoing', 'TASK'],
          ['RELATES_TO', 'incoming', 'TASK'],
        ]),
      );
    });

    it('traverses task → note → paper → original page in both directions and in the graph', async () => {
      const task = await getTask(viewer, taskId);
      const toNote = task.links.find((l) => l.other.kind === 'DOCUMENT');
      expect(toNote?.other.href).toBe(
        `/app/projects/${project}/documents?doc=${noteId}`,
      );
      const note = await getDocument(viewer, noteId);
      const quoted = citationsOf(note.content)[0]!;
      // The reader URL is built from stored identity and page, never a title.
      expect(quoted.attrs).toMatchObject({ sourceVersionId: v1, page: 4 });
      const fromPaper = await artifactLinks(viewer, paper.artifactId);
      expect(
        fromPaper.links.map((l) => [l.relationship, l.direction, l.other.kind]),
      ).toEqual(
        expect.arrayContaining([
          ['CITES', 'incoming', 'DOCUMENT'],
          ['REFERENCES', 'incoming', 'TASK'],
        ]),
      );
      const graph = await projectGraph(viewer, project);
      const taskArtifact = task.task.artifactId;
      const edges = graph.edges.map((e) => [
        e.source,
        e.relationship,
        e.target,
      ]);
      expect(edges).toEqual(
        expect.arrayContaining([
          [noteArtifact, 'CITES', paper.artifactId],
          [noteArtifact, 'TRACKS', taskArtifact],
          [taskArtifact, 'RELATES_TO', noteArtifact],
          [taskArtifact, 'REFERENCES', paper.artifactId],
        ]),
      );
    });
  },
);

describe.sequential('Journey B — multi-user authorization', () => {
  let noteId: string;
  beforeAll(async () => {
    noteId = (
      await run(owner, {
        command: 'document.create',
        projectId: project,
        title: 'Owner synthesis',
        idempotencyKey: randomUUID(),
      })
    ).id;
  });
  const cite = (who: Actor, fields: Partial<CiteInput> = {}) =>
    failure(
      run(who, {
        command: 'document.cite-source',
        projectId: project,
        projectPaperId: paper.id,
        sourceVersionId: v1,
        annotationId: annotations.shared!,
        target: { kind: 'existing', documentId: noteId, expectedRevision: 1 },
        clientRequestId: randomUUID(),
        ...fields,
      }),
    );

  it('denies viewers and outsiders without changing anything', async () => {
    expect(await cite(viewer)).toBe('NOT_FOUND');
    expect(
      await cite(viewer, { target: { kind: 'new', title: 'Viewer note' } }),
    ).toBe('NOT_FOUND');
    expect(
      await failure(
        run(viewer, {
          command: 'task.create',
          projectId: project,
          title: 'Viewer task',
          references: [paper.artifactId],
          idempotencyKey: randomUUID(),
        }),
      ),
    ).toBe('NOT_FOUND');
    expect(await cite(outsider)).toBe('NOT_FOUND');
    expect(await failure(artifactLinks(outsider, paper.artifactId))).toBe(
      'NOT_FOUND',
    );
    // Search never reveals private project titles or snippets to outsiders.
    expect(
      await failure(searchArtifacts(outsider, project, { q: 'Evoformer' })),
    ).toBe('NOT_FOUND');
    expect((await getDocument(owner, noteId)).revision).toBe(1);
    expect(
      await admin.document.count({ where: { title: 'Viewer note' } }),
    ).toBe(0);
  });

  it('never exposes another member’s private annotation and requires consent for one’s own', async () => {
    // Indistinguishable from a missing annotation.
    expect(
      await cite(owner, { annotationId: annotations.editorPrivate! }),
    ).toBe('NOT_FOUND');
    expect(
      await cite(editor, { annotationId: annotations.ownerPrivate! }),
    ).toBe('NOT_FOUND');
    expect(
      await cite(editor, {
        annotationId: annotations.ownerPrivate!,
        sharePrivateAnnotation: true,
      }),
    ).toBe('NOT_FOUND');
    // A forged citation in a direct save fails in SQL as well.
    expect(
      await failure(
        run(editor, {
          command: 'document.save',
          id: noteId,
          expectedRevision: 1,
          clientRequestId: randomUUID(),
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'citation',
                    attrs: {
                      projectPaperId: paper.id,
                      sourceVersionId: v1,
                      annotationId: annotations.ownerPrivate,
                      page: 5,
                      quote: 'Owner private synthetic passage',
                      startOffset: 10,
                      endOffset: 41,
                    },
                  },
                ],
              },
            ],
          },
        }),
      ),
    ).toBe('VALIDATION_ERROR');
    expect(await cite(owner, { annotationId: annotations.ownerPrivate! })).toBe(
      'CONFLICT',
    );
    expect((await getDocument(owner, noteId)).revision).toBe(1);
    expect(
      await cite(owner, {
        annotationId: annotations.ownerPrivate!,
        sharePrivateAnnotation: true,
      }),
    ).toBe('RESOLVED');
    expect((await getDocument(owner, noteId)).revision).toBe(2);
  });

  it('rejects cross-project papers, notes and task links', async () => {
    expect(
      await cite(owner, {
        projectPaperId: otherPaper.id,
        sourceVersionId: null,
        annotationId: null,
      }),
    ).toBe('NOT_FOUND');
    const foreignNote = (
      await run(outsider, {
        command: 'document.create',
        projectId: otherProject,
        title: 'Foreign note',
        idempotencyKey: randomUUID(),
      })
    ).id;
    expect(
      await cite(owner, {
        target: {
          kind: 'existing',
          documentId: foreignNote,
          expectedRevision: 1,
        },
      }),
    ).toBe('NOT_FOUND');
    expect(
      await failure(
        run(outsider, {
          command: 'document.cite-source',
          projectId: otherProject,
          projectPaperId: paper.id,
          target: {
            kind: 'existing',
            documentId: foreignNote,
            expectedRevision: 1,
          },
          clientRequestId: randomUUID(),
        }),
      ),
    ).toBe('NOT_FOUND');
    expect(
      await failure(
        run(owner, {
          command: 'task.create',
          projectId: project,
          title: 'Cross-project task',
          references: [otherPaper.artifactId],
          idempotencyKey: randomUUID(),
        }),
      ),
    ).toBe('VALIDATION_ERROR');
    expect(
      await admin.task.count({ where: { title: 'Cross-project task' } }),
    ).toBe(0);
    // An annotation ID paired with a different paper is rejected.
    const second = await paperOf(owner, project, 'Unrelated baseline');
    expect(await cite(owner, { projectPaperId: second.id })).toBe('NOT_FOUND');
  });

  it('stops a revoked member from reusing a stale source reference or replay key', async () => {
    const request = randomUUID();
    const leaverCite = (): CiteInput => ({
      command: 'document.cite-source',
      projectId: project,
      projectPaperId: paper.id,
      sourceVersionId: v1,
      annotationId: annotations.shared!,
      target: { kind: 'new', title: 'Leaver note' },
      clientRequestId: request,
    });
    const first = await run(leaver, leaverCite());
    await platform(owner, {
      command: 'membership.remove',
      scope: 'project',
      scopeId: project,
      profileId: leaver.id,
      expectedVersion: await memberVersion(project, leaver.id),
    });
    expect(await failure(run(leaver, leaverCite()))).toBe('NOT_FOUND');
    expect(await failure(getDocument(leaver, first.id))).toBe('NOT_FOUND');
    expect(
      await failure(
        run(leaver, {
          ...leaverCite(),
          clientRequestId: randomUUID(),
          target: {
            kind: 'existing',
            documentId: first.id,
            expectedRevision: 1,
          },
        }),
      ),
    ).toBe('NOT_FOUND');
  });
});

describe.sequential('Journey C — failure recovery', () => {
  let noteId: string;
  beforeAll(async () => {
    noteId = (
      await run(editor, {
        command: 'document.create',
        projectId: project,
        title: 'Recovery note',
        idempotencyKey: randomUUID(),
      })
    ).id;
  });
  const cite = (fields: Record<string, unknown> = {}) =>
    failure(
      run(editor, {
        command: 'document.cite-source',
        projectId: project,
        projectPaperId: paper.id,
        sourceVersionId: v1,
        annotationId: annotations.shared!,
        target: { kind: 'existing', documentId: noteId, expectedRevision: 1 },
        clientRequestId: randomUUID(),
        ...fields,
      } as ArtifactCommandInput),
    );

  it('fails safely for deleted annotations, unready versions and missing pairs', async () => {
    const victim = (
      await research(owner, {
        command: 'annotation.create',
        sourceVersionId: v1,
        kind: 'HIGHLIGHT',
        visibility: 'PROJECT',
        anchor: anchor(9, 'Soon deleted synthetic passage', 5),
        idempotencyKey: randomUUID(),
      })
    ).id;
    const row = await admin.paperAnnotation.findUniqueOrThrow({
      where: { id: victim },
    });
    await research(owner, {
      command: 'annotation.delete',
      id: victim,
      expectedVersion: row.version,
    });
    expect(await cite({ annotationId: victim })).toBe('NOT_FOUND');
    expect(await cite({ sourceVersionId: randomUUID() })).toBe('NOT_FOUND');
    expect(await cite({ sourceVersionId: null })).toBe('VALIDATION_ERROR');
    expect((await getDocument(editor, noteId)).revision).toBe(1);
  });

  it('refuses archived sources and archived notes without writing', async () => {
    const archived = await paperOf(
      owner,
      project,
      'Archived during navigation',
    );
    const pp = await admin.projectPaper.findUniqueOrThrow({
      where: { id: archived.id },
    });
    await research(owner, {
      command: 'paper.archive',
      id: archived.id,
      expectedVersion: pp.version,
    });
    expect(
      await cite({
        projectPaperId: archived.id,
        sourceVersionId: null,
        annotationId: null,
      }),
    ).toBe('CONFLICT');
    const meta = await admin.document.findUniqueOrThrow({
      where: { id: noteId },
    });
    await run(editor, {
      command: 'document.archive',
      id: noteId,
      expectedVersion: meta.version,
    });
    expect(await cite()).toBe('NOT_FOUND');
    expect(
      await admin.documentVersion.count({ where: { documentId: noteId } }),
    ).toBe(1);
  });
});

describe.sequential(
  'Journey D — citation replay integrity (A02 hardening)',
  () => {
    let noteId: string;
    const request = randomUUID();
    const original = (): CiteInput => ({
      command: 'document.cite-source',
      projectId: project,
      projectPaperId: paper.id,
      sourceVersionId: v1,
      annotationId: annotations.shared!,
      target: { kind: 'existing', documentId: noteId, expectedRevision: 1 },
      commentary: 'Original commentary.',
      clientRequestId: request,
    });
    const versions = () =>
      admin.documentVersion.findMany({
        where: { documentId: noteId },
        orderBy: { revision: 'asc' },
        select: { revision: true, contentHash: true, authorId: true },
      });
    beforeAll(async () => {
      noteId = (
        await run(editor, {
          command: 'document.create',
          projectId: project,
          title: 'Replay integrity note',
          idempotencyKey: randomUUID(),
        })
      ).id;
      expect((await run(editor, original())).revision).toBe(2);
    });

    it('confirms an identical retry, even after a newer revision exists, without a second insert', async () => {
      const before = await versions();
      expect(await run(editor, original())).toMatchObject({
        id: noteId,
        revision: 2,
        replayed: true,
      });
      // A lost response retried after someone else's save is still confirmed.
      const note = await getDocument(owner, noteId);
      await run(owner, {
        command: 'document.save',
        id: noteId,
        expectedRevision: note.revision,
        clientRequestId: randomUUID(),
        content: {
          type: 'doc',
          content: [
            ...((note.content as DocNode).content ?? []),
            { type: 'paragraph', content: [{ type: 'text', text: 'Later.' }] },
          ],
        },
      });
      expect(await run(editor, original())).toMatchObject({
        revision: 2,
        replayed: true,
      });
      const after = await versions();
      expect(after.slice(0, 2)).toEqual(before);
      expect(after).toHaveLength(3);
      const citations = citationsOf(
        (await getDocument(editor, noteId)).content,
      );
      expect(citations).toHaveLength(1);
    });

    it('rejects a reused request ID whose intent differs', async () => {
      const altered: CiteInput[] = [
        { ...original(), commentary: 'Different commentary.' },
        { ...original(), commentary: '' },
        { ...original(), annotationId: annotations.pageNote! },
        { ...original(), annotationId: null },
        { ...original(), sourceVersionId: null, annotationId: null },
        {
          ...original(),
          target: { kind: 'existing', documentId: noteId, expectedRevision: 2 },
        },
      ];
      for (const command of altered)
        expect(
          await failure(run(editor, command)),
          JSON.stringify(command),
        ).toBe('CONFLICT');
      expect(await versions()).toHaveLength(3);
    });

    it('never replays another actor’s request and discloses nothing across projects', async () => {
      // Same ID, same intent, different author: not this actor's request.
      expect(await failure(run(owner, original()))).toBe('CONFLICT');
      expect(await failure(run(viewer, original()))).toBe('NOT_FOUND');
      expect(await failure(run(outsider, original()))).toBe('NOT_FOUND');
      expect(
        await failure(
          run(outsider, {
            ...original(),
            projectId: otherProject,
            projectPaperId: otherPaper.id,
            sourceVersionId: null,
            annotationId: null,
          }),
        ),
      ).toBe('NOT_FOUND');
      expect(await versions()).toHaveLength(3);
    });

    it('requires the same private-annotation consent on replay', async () => {
      const privateRequest = randomUUID();
      const note = (
        await run(owner, {
          command: 'document.create',
          projectId: project,
          title: 'Private replay note',
          idempotencyKey: randomUUID(),
        })
      ).id;
      const cite = (share: boolean): CiteInput => ({
        command: 'document.cite-source',
        projectId: project,
        projectPaperId: paper.id,
        sourceVersionId: v1,
        annotationId: annotations.ownerPrivate!,
        target: { kind: 'existing', documentId: note, expectedRevision: 1 },
        sharePrivateAnnotation: share,
        clientRequestId: privateRequest,
      });
      expect((await run(owner, cite(true))).revision).toBe(2);
      expect(await run(owner, cite(true))).toMatchObject({ replayed: true });
      expect(await failure(run(owner, cite(false)))).toBe('CONFLICT');
    });
  },
);

describe.sequential('Journey E — task token contract (A02 hardening)', () => {
  it('commits consecutive tokens, conflicts on a reused one and never loses an update', async () => {
    const { id } = await run(editor, {
      command: 'task.create',
      projectId: project,
      title: 'Token contract task',
      idempotencyKey: randomUUID(),
    });
    // Rapid priority → due date → assignee, each naming the previous version.
    await run(editor, {
      command: 'task.update',
      id,
      expectedVersion: 1,
      priority: 'HIGH',
    });
    await run(editor, {
      command: 'task.update',
      id,
      expectedVersion: 2,
      dueDate: '2026-12-01',
    });
    await run(editor, {
      command: 'task.assign',
      id,
      expectedVersion: 3,
      assigneeId: editor.id,
    });
    const after = (await getTask(editor, id)).task;
    expect(after).toMatchObject({
      version: 4,
      priority: 'HIGH',
      dueDate: '2026-12-01',
      assignee: { id: editor.id },
    });
    // The pre-fix client sent the assignment with the due date's token.
    expect(
      await failure(
        run(editor, {
          command: 'task.assign',
          id,
          expectedVersion: 3,
          assigneeId: null,
        }),
      ),
    ).toBe('CONFLICT');
    // A concurrent external edit wins once; the stale writer conflicts.
    await run(owner, {
      command: 'task.update',
      id,
      expectedVersion: 4,
      priority: 'LOW',
    });
    expect(
      await failure(
        run(editor, {
          command: 'task.update',
          id,
          expectedVersion: 4,
          priority: 'URGENT',
        }),
      ),
    ).toBe('CONFLICT');
    expect((await getTask(editor, id)).task).toMatchObject({
      version: 5,
      priority: 'LOW',
      dueDate: '2026-12-01',
      assignee: { id: editor.id },
    });
  });
});
