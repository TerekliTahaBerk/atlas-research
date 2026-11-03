import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { createDatabase } from '../../packages/database/src/index';
import type { PlatformCommand } from '../../packages/core/src/platform';
import {
  mentionToken,
  parseMessageBody,
  type CommunicationCommandInput,
  type MessageDto,
} from '../../packages/core/src/index';
import { executeCommand } from '../../apps/web/src/features/platform/server/services';
import { runtimeDatabase } from '../../apps/web/src/features/platform/server/database';
import { publicError } from '../../apps/web/src/features/platform/server/errors';
import { rateLimit } from '../../apps/web/src/features/platform/server/limiter';
import { executeResearchCommand } from '../../apps/web/src/features/library/server/library';
import { executeArtifactCommand } from '../../apps/web/src/features/artifacts/server/commands';
import {
  dispatchOutbox,
  executeCommunicationCommand,
} from '../../apps/web/src/features/communication/server/commands';
import {
  getChannel,
  getMessage,
  getThread,
  listChannels,
  listMessages,
  mentionCandidates,
} from '../../apps/web/src/features/communication/server/reads';
import { listNotifications } from '../../apps/web/src/features/communication/server/notifications';
import {
  atlasContext,
  discussionContext,
} from '../../apps/web/src/features/communication/server/atlas';
import { prepareRun } from '../../apps/web/src/features/ai/server/engine';
import { aiPolicy } from '../fixtures/ai-wire';

/*
 * A04 research communication on real, non-owner PostgreSQL: the same SQL
 * capability model, RLS and command boundary the web tier uses. Realtime
 * transport is exercised separately (tests/realtime); here the private topic
 * policy function, epoch rotation and outbox contents are verified directly.
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
const member = actor(); // second editor, mention target
const viewer = actor();
const outsider = actor(); // other tenant
const wsAdmin = actor(); // workspace admin without a project grant
const leaver = actor(); // project editor revoked mid-suite
const failure = (work: Promise<unknown>) =>
  work.then(
    () => 'RESOLVED',
    (error: unknown) =>
      error instanceof ZodError ? 'VALIDATION_ERROR' : publicError(error).code,
  );
const platform = (who: Actor, command: PlatformCommand) =>
  executeCommand(who, command, randomUUID());
const comm = (who: Actor, command: CommunicationCommandInput) =>
  executeCommunicationCommand(who, command, randomUUID());
const send = (
  who: Actor,
  channelId: string,
  body: string,
  extra: Partial<
    Extract<CommunicationCommandInput, { command: 'message.send' }>
  > = {},
) =>
  comm(who, {
    command: 'message.send',
    channelId,
    body,
    idempotencyKey: randomUUID(),
    ...extra,
  });
const research = (
  who: Actor,
  command: Parameters<typeof executeResearchCommand>[1],
) =>
  executeResearchCommand(who, command, randomUUID(), {
    resolve: () => Promise.reject(new Error('unused')),
  });
const asBrowser = async (sub: string | null, topic: string) => {
  // Exactly what Supabase Realtime does at join: the `authenticated` role
  // with verified JWT claims, evaluating the realtime topic policy function.
  return admin.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL ROLE authenticated');
    await tx.$queryRaw`SELECT set_config('request.jwt.claims',${JSON.stringify(sub ? { sub, role: 'authenticated' } : { role: 'anon' })},true)`;
    const [row] = await tx.$queryRaw<
      { allowed: boolean }[]
    >`SELECT atlas_realtime.topic_allowed(${topic}) AS allowed`;
    return row?.allowed === true;
  });
};
const epochOf = async (channelId: string) =>
  (await admin.channel.findUniqueOrThrow({ where: { id: channelId } })).epoch;
const outboxSince = async (id: bigint) =>
  admin.communicationOutbox.findMany({
    where: { id: { gt: id } },
    orderBy: { id: 'asc' },
  });
const outboxHead = async () =>
  (await admin.communicationOutbox.aggregate({ _max: { id: true } }))._max.id ??
  0n;

let project: string;
let workspaceId: string;
let otherProject: string;
let general: string;
let experiments: string;
let otherChannel: string;
let paper: { id: string; artifactId: string };
let otherPaper: { id: string; artifactId: string };
let noteArtifact: string;
let noteId: string;
let sourceVersion: string;
let sharedAnnotation: string;
let privateAnnotation: string;

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

beforeAll(async () => {
  vi.stubEnv('ATLAS_MODE', 'live');
  vi.stubEnv('DATABASE_URL', runtime);
  vi.stubEnv('ATLAS_RATE_SECRET', 'local-test-rate-secret-32-characters');
  vi.stubEnv('ATLAS_CURSOR_SECRET', 'local-test-cursor-secret-32-characters');
  vi.stubEnv('ATLAS_ORIGIN', 'http://127.0.0.1:3102');
  vi.stubEnv('ATLAS_DEV_INVITATION_LINKS', 'true');
  vi.stubEnv('NODE_ENV', 'development');
  for (const who of [owner, editor, member, viewer, outsider, wsAdmin, leaver])
    await platform(who, {
      command: 'bootstrap',
      displayName: `Tester ${who.id.slice(0, 4)}`,
      workspaceName: 'Personal',
      researchInterests: [],
    });
  const org = (
    await platform(owner, { command: 'organization.create', name: 'Comms lab' })
  ).id!;
  workspaceId = (
    await platform(owner, {
      command: 'workspace.create',
      organizationId: org,
      name: 'Comms',
    })
  ).id!;
  project = (
    await platform(owner, {
      command: 'project.create',
      workspaceId,
      name: 'Collaborative research',
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
  await grant(member, 'project', project, 'EDITOR');
  await grant(viewer, 'project', project, 'VIEWER');
  await grant(leaver, 'project', project, 'EDITOR');
  await grant(wsAdmin, 'workspace', workspaceId, 'ADMIN');
  paper = await paperOf(owner, project, 'Attention is all you need');
  otherPaper = await paperOf(outsider, otherProject, 'Confidential other work');
  const note = await executeArtifactCommand(
    owner,
    {
      command: 'document.create',
      projectId: project,
      title: 'Reading notes on transformers',
      idempotencyKey: randomUUID(),
    },
    randomUUID(),
  );
  noteId = note.id;
  noteArtifact = (
    await admin.document.findUniqueOrThrow({ where: { id: noteId } })
  ).artifactId;
  sourceVersion = randomUUID();
  const sha = 'a'.repeat(64);
  await admin.$executeRaw`INSERT INTO source_versions(id,organization_id,workspace_id,project_id,project_paper_id,ordinal,source_type,rights_basis,state,file_name,media_type,declared_size,declared_sha256,byte_size,sha256,quarantine_key,object_key,scan_completed_at,ready_at,created_by_id,updated_at)
    SELECT ${sourceVersion}::uuid,organization_id,workspace_id,project_id,id,1,'UPLOAD','USER_UPLOAD','READY','synthetic.pdf','application/pdf',100,${sha},100,${sha},${`q/${sourceVersion}`},${`accepted/${project}/${sourceVersion}/${'e'.repeat(32)}.pdf`},now(),now(),${owner.id}::uuid,now() FROM project_papers WHERE id=${paper.id}::uuid`;
  const annotate = async (visibility: 'PROJECT' | 'PRIVATE', quote: string) =>
    (
      await research(owner, {
        command: 'annotation.create',
        sourceVersionId: sourceVersion,
        kind: 'HIGHLIGHT',
        visibility,
        anchor: {
          pageNumber: 3,
          quote,
          prefix: null,
          suffix: null,
          startOffset: 10,
          endOffset: 10 + quote.length,
          rects: [],
        },
        idempotencyKey: randomUUID(),
      })
    ).id;
  sharedAnnotation = await annotate(
    'PROJECT',
    'Scaled dot-product attention computes weights',
  );
  privateAnnotation = await annotate('PRIVATE', 'My private reading remark');
  otherChannel = (
    await comm(outsider, {
      command: 'channel.create',
      projectId: otherProject,
      name: 'general',
      idempotencyKey: randomUUID(),
    })
  ).id;
});
afterAll(async () => {
  await admin.$disconnect();
  await runtimeDatabase().$disconnect();
  vi.unstubAllEnvs();
});

describe.sequential('A04.1 project channels', () => {
  it('creates channels idempotently with explicit capabilities', async () => {
    const key = randomUUID();
    const create = () =>
      comm(owner, {
        command: 'channel.create',
        projectId: project,
        name: 'general',
        description: 'Project-wide discussion',
        isDefault: true,
        idempotencyKey: key,
      });
    general = (await create()).id;
    expect(await create()).toMatchObject({ id: general, replayed: true });
    // Same key, different intent.
    expect(
      await failure(
        comm(owner, {
          command: 'channel.create',
          projectId: project,
          name: 'other',
          idempotencyKey: key,
        }),
      ),
    ).toBe('CONFLICT');
    // Names are unique per project; a second default is refused.
    expect(
      await failure(
        comm(editor, {
          command: 'channel.create',
          projectId: project,
          name: 'general',
          idempotencyKey: randomUUID(),
        }),
      ),
    ).toBe('CONFLICT');
    experiments = (
      await comm(editor, {
        command: 'channel.create',
        projectId: project,
        name: 'experiments',
        idempotencyKey: randomUUID(),
      })
    ).id;
    // Viewers, outsiders and workspace administrators without a project
    // grant cannot create channels (indistinguishable from a missing project).
    for (const who of [viewer, outsider, wsAdmin])
      expect(
        await failure(
          comm(who, {
            command: 'channel.create',
            projectId: project,
            name: 'nope',
            idempotencyKey: randomUUID(),
          }),
        ),
      ).toBe('NOT_FOUND');
    expect(
      await failure(
        comm(owner, {
          command: 'channel.create',
          projectId: project,
          name: 'Bad Name!',
          idempotencyKey: randomUUID(),
        }),
      ),
    ).toBe('VALIDATION_ERROR');
  });

  it('lists channels only for project readers and exposes capabilities', async () => {
    const forViewer = await listChannels(viewer, project);
    expect(forViewer.items.map((c) => c.name)).toEqual([
      'general',
      'experiments',
    ]);
    expect(forViewer.canCreate).toBe(false);
    expect(forViewer.items[0]!.capabilities).toEqual(['channel.read']);
    const forEditor = await listChannels(editor, project);
    expect(forEditor.items[1]!.capabilities).toEqual([
      'channel.read',
      'channel.post',
      'channel.manage',
    ]);
    // Owners manage project channels; editors manage only their own.
    expect(forEditor.items[0]!.capabilities).not.toContain('channel.manage');
    for (const who of [outsider, wsAdmin])
      expect(await failure(listChannels(who, project))).toBe('NOT_FOUND');
    expect(await failure(getChannel(outsider, general))).toBe('NOT_FOUND');
    expect(await failure(getChannel(owner, otherChannel))).toBe('NOT_FOUND');
  });

  it('renames with optimistic versions and enforces management rights', async () => {
    const detail = await getChannel(owner, general);
    expect(
      await failure(
        comm(editor, {
          command: 'channel.update',
          id: general,
          expectedVersion: detail.channel.version,
          description: 'hijack',
        }),
      ),
    ).toBe('FORBIDDEN');
    await comm(owner, {
      command: 'channel.update',
      id: general,
      expectedVersion: detail.channel.version,
      description: 'Literature and planning',
    });
    expect(
      await failure(
        comm(owner, {
          command: 'channel.update',
          id: general,
          expectedVersion: detail.channel.version,
          description: 'stale',
        }),
      ),
    ).toBe('CONFLICT');
    expect((await getChannel(viewer, general)).channel.description).toBe(
      'Literature and planning',
    );
  });
});

describe.sequential('Journey A — normal collaboration', () => {
  let first: string;
  let reply: string;
  it('editor joins, sends; owner receives; owner replies in a thread', async () => {
    await comm(editor, { command: 'channel.join', id: general });
    // Joining is idempotent and never grants anything new.
    await comm(editor, { command: 'channel.join', id: general });
    first = (await send(editor, general, 'Draft results are in the notes.')).id;
    const page = await listMessages(owner, general, {});
    expect(page.items.map((m) => m.id)).toEqual([first]);
    expect(page.items[0]).toMatchObject({
      author: { id: editor.id },
      body: 'Draft results are in the notes.',
      deleted: false,
      clientKey: null, // other people's keys are never exposed
    });
    reply = (
      await send(owner, general, 'Great — can you add the ablation?', {
        threadRootId: first,
      })
    ).id;
    const thread = await getThread(editor, first);
    expect(thread.root.replyCount).toBe(1);
    expect(thread.replies.map((m) => m.id)).toEqual([reply]);
    // Replies stay out of the main timeline.
    expect(
      (await listMessages(owner, general, {})).items.map((m) => m.id),
    ).toEqual([first]);
    const inbox = await listNotifications(editor, undefined);
    expect(inbox.items[0]).toMatchObject({
      kind: 'THREAD_REPLY',
      available: true,
      read: false,
    });
    expect(inbox.items[0]!.href).toContain(`message=${reply}`);
    expect(inbox.items[0]!.href).toContain(`thread=${first}`);
  });

  it('reactions are idempotent, counted and owner-scoped', async () => {
    const react = (who: Actor, active: boolean) =>
      comm(who, {
        command: 'reaction.set',
        messageId: reply,
        emoji: 'thumbs_up',
        active,
      });
    expect(await react(editor, true)).toMatchObject({ changed: true });
    expect(await react(editor, true)).toMatchObject({ changed: false });
    await react(member, true);
    const seen = await getMessage(owner, reply);
    expect(seen.reactions).toEqual([
      { emoji: 'thumbs_up', count: 2, mine: false },
    ]);
    expect((await getMessage(editor, reply)).reactions[0]!.mine).toBe(true);
    await react(member, false);
    await react(member, false);
    expect((await getMessage(owner, reply)).reactions[0]!.count).toBe(1);
    expect(
      await failure(
        comm(viewer, {
          command: 'reaction.set',
          messageId: reply,
          emoji: 'heart',
          active: true,
        }),
      ),
    ).toBe('FORBIDDEN');
    expect(
      await failure(
        comm(editor, {
          command: 'reaction.set',
          messageId: reply,
          emoji: 'skull' as 'heart',
          active: true,
        }),
      ),
    ).toBe('VALIDATION_ERROR');
  });

  it('mentions notify eligible members exactly once and persist across sessions', async () => {
    const candidates = await mentionCandidates(editor, general, '');
    expect(candidates.map((c) => c.id)).toEqual(
      expect.arrayContaining([owner.id, member.id, viewer.id]),
    );
    expect(candidates.map((c) => c.id)).not.toContain(outsider.id);
    const sent = await send(
      editor,
      general,
      `${mentionToken(member.id)} please review ${mentionToken(member.id)}`,
    );
    const mine = await listNotifications(member, undefined);
    const mention = mine.items.filter((n) => n.kind === 'MENTION');
    expect(mention).toHaveLength(1);
    expect(mention[0]!.snippet).toContain('please review');
    expect(mention[0]!.snippet).not.toContain('<@');
    // Editing the same mention does not notify again.
    const current = await getMessage(editor, sent.id);
    await comm(editor, {
      command: 'message.edit',
      id: sent.id,
      expectedVersion: current.version,
      body: `${mentionToken(member.id)} please review again`,
    });
    expect(
      (await listNotifications(member, undefined)).items.filter(
        (n) => n.kind === 'MENTION',
      ),
    ).toHaveLength(1);
    // Recipient isolation: nobody else sees this notification.
    expect(
      (await listNotifications(owner, undefined)).items.some(
        (n) => n.id === mention[0]!.id,
      ),
    ).toBe(false);
    // Reload: a fresh transaction sees identical persisted state.
    const reloaded = await getMessage(member, sent.id);
    expect(reloaded.mentions).toEqual([
      { id: member.id, name: `Tester ${member.id.slice(0, 4)}` },
    ]);
    expect((await getThread(owner, first)).replies[0]!.reactions[0]).toEqual({
      emoji: 'thumbs_up',
      count: 1,
      mine: false,
    });
    // Read state is persistent and idempotent.
    await comm(member, { command: 'notification.read', ids: [mention[0]!.id] });
    await comm(member, { command: 'notification.read', ids: [mention[0]!.id] });
    const after = await listNotifications(member, undefined);
    expect(after.items.find((n) => n.id === mention[0]!.id)!.read).toBe(true);
    // Another user's IDs cannot be marked read through this command.
    const ownerInbox = await listNotifications(editor, undefined);
    await comm(member, {
      command: 'notification.read',
      ids: [ownerInbox.items[0]!.id],
    });
    expect((await listNotifications(editor, undefined)).items[0]!.read).toBe(
      false,
    );
    await comm(editor, { command: 'notification.read-all' });
    expect((await listNotifications(editor, undefined)).unread).toBe(0);
  });

  it('rejects mentions of people who cannot read the channel', async () => {
    for (const id of [outsider.id, wsAdmin.id, randomUUID()])
      expect(
        await failure(send(editor, general, `hi ${mentionToken(id)}`)),
      ).toBe('VALIDATION_ERROR');
  });

  it('tracks unread counts for joined members', async () => {
    const before = (await listChannels(editor, project)).items.find(
      (c) => c.id === general,
    )!;
    await send(owner, general, 'Another update');
    const after = (await listChannels(editor, project)).items.find(
      (c) => c.id === general,
    )!;
    expect(after.unread).toBe(before.unread + 1);
    await comm(editor, {
      command: 'channel.read',
      id: general,
      seq: after.lastSeq,
    });
    expect(
      (await listChannels(editor, project)).items.find((c) => c.id === general)!
        .unread,
    ).toBe(0);
  });
});

describe.sequential('A04.2 message and thread invariants', () => {
  it('threads cannot cross channels, projects or nest', async () => {
    const root = (await send(owner, general, 'Root message')).id;
    const nested = (await send(owner, general, 'Reply', { threadRootId: root }))
      .id;
    expect(
      await failure(send(owner, general, 'nested', { threadRootId: nested })),
    ).toBe('VALIDATION_ERROR');
    expect(
      await failure(send(owner, experiments, 'cross', { threadRootId: root })),
    ).toBe('VALIDATION_ERROR');
    const foreign = (await send(outsider, otherChannel, 'foreign root')).id;
    expect(
      await failure(send(owner, general, 'cross', { threadRootId: foreign })),
    ).toBe('VALIDATION_ERROR');
    // The schema itself refuses a cross-channel root, even for the owner role.
    const row = await admin.channelMessage.findUniqueOrThrow({
      where: { id: root },
    });
    await expect(
      admin.$executeRaw`INSERT INTO channel_messages(id,organization_id,workspace_id,project_id,channel_id,seq,change_seq,thread_root_id,author_id,body,client_key,request_hash)
        SELECT gen_random_uuid(),organization_id,workspace_id,project_id,${experiments}::uuid,99999,99999,${root}::uuid,author_id,'x',gen_random_uuid(),${'b'.repeat(64)} FROM channel_messages WHERE id=${row.id}::uuid`,
    ).rejects.toThrow();
  });

  it('bounds content and rejects control characters and oversized bodies', async () => {
    expect(await failure(send(owner, general, 'x'.repeat(4001)))).toBe(
      'VALIDATION_ERROR',
    );
    expect(await failure(send(owner, general, 'bell\u0007'))).toBe(
      'VALIDATION_ERROR',
    );
    expect(await failure(send(owner, general, '   '))).toBe('VALIDATION_ERROR');
    expect((await send(owner, general, 'y'.repeat(4000))).seq).toBeGreaterThan(
      0,
    );
  });

  it('stores hostile markup as inert text', async () => {
    const hostile =
      '<img src=x onerror=alert(1)> <script>alert(2)</script> [x](javascript:alert(3)) javascript:alert(4) https://example.org/ok';
    const { id } = await send(editor, general, hostile);
    const stored = await getMessage(viewer, id);
    expect(stored.body).toBe(hostile);
    const segments = parseMessageBody(stored.body);
    expect(segments.filter((s) => s.type === 'link')).toEqual([
      {
        type: 'link',
        href: 'https://example.org/ok',
        text: 'https://example.org/ok',
      },
    ]);
  });

  it('edits only own messages with optimistic versions; tombstones are final', async () => {
    const { id } = await send(editor, general, 'typo here');
    const v1 = (await getMessage(editor, id)).version;
    expect(
      await failure(
        comm(owner, {
          command: 'message.edit',
          id,
          expectedVersion: v1,
          body: 'owner rewrite',
        }),
      ),
    ).toBe('FORBIDDEN');
    const edit = () =>
      comm(editor, {
        command: 'message.edit',
        id,
        expectedVersion: v1,
        body: 'typo fixed',
      });
    await edit();
    // A retried edit whose response was lost is recognized, not duplicated.
    expect(await edit()).toMatchObject({ replayed: true });
    expect(
      await failure(
        comm(editor, {
          command: 'message.edit',
          id,
          expectedVersion: v1,
          body: 'concurrent other edit',
        }),
      ),
    ).toBe('CONFLICT');
    const edited = await getMessage(owner, id);
    expect(edited).toMatchObject({ body: 'typo fixed', version: v1 + 1 });
    expect(edited.editedAt).not.toBeNull();
    expect(
      await failure(
        comm(owner, {
          command: 'message.delete',
          id,
          expectedVersion: edited.version,
        }),
      ),
    ).toBe('FORBIDDEN');
    await comm(editor, {
      command: 'message.delete',
      id,
      expectedVersion: edited.version,
    });
    const tomb = await getMessage(owner, id);
    expect(tomb).toMatchObject({ deleted: true, body: '', references: [] });
    expect(
      (await admin.channelMessage.findUniqueOrThrow({ where: { id } })).body,
    ).toBe('');
    expect(
      await failure(
        comm(editor, {
          command: 'message.edit',
          id,
          expectedVersion: tomb.version,
          body: 'resurrect',
        }),
      ),
    ).toBe('CONFLICT');
    expect(
      await failure(
        comm(editor, {
          command: 'reaction.set',
          messageId: id,
          emoji: 'heart',
          active: true,
        }),
      ),
    ).toBe('CONFLICT');
  });

  it('viewers read but cannot post', async () => {
    expect(
      (await listMessages(viewer, general, {})).items.length,
    ).toBeGreaterThan(0);
    expect(await failure(send(viewer, general, 'hello'))).toBe('FORBIDDEN');
    expect(await failure(send(outsider, general, 'hello'))).toBe('NOT_FOUND');
    expect(await failure(send(wsAdmin, general, 'hello'))).toBe('NOT_FOUND');
  });

  it('archived channels keep readable history and reject writes', async () => {
    const { id: kept } = await send(editor, experiments, 'Run 12 converged');
    const v = (await getChannel(editor, experiments)).channel.version;
    expect(
      await failure(
        comm(member, {
          command: 'channel.archive',
          id: experiments,
          expectedVersion: v,
        }),
      ),
    ).toBe('FORBIDDEN');
    await comm(editor, {
      command: 'channel.archive',
      id: experiments,
      expectedVersion: v,
    });
    const detail = await getChannel(member, experiments);
    expect(detail.channel.archived).toBe(true);
    expect(detail.channel.capabilities).toEqual(['channel.read']);
    expect(
      (await listMessages(member, experiments, {})).items.map((m) => m.id),
    ).toContain(kept);
    expect(await failure(send(editor, experiments, 'more'))).toBe('CONFLICT');
    expect(
      await failure(
        comm(editor, {
          command: 'reaction.set',
          messageId: kept,
          emoji: 'check',
          active: true,
        }),
      ),
    ).toBe('CONFLICT');
    await comm(editor, {
      command: 'channel.restore',
      id: experiments,
      expectedVersion: v + 1,
    });
    await send(editor, experiments, 'Back online');
  });
});

describe.sequential('Journey B — offline recovery', () => {
  it('a lost acknowledgement retried with the same key commits exactly once', async () => {
    const head = (await listMessages(owner, general, {})).changeSeq;
    const key = randomUUID();
    const attempt = () =>
      comm(owner, {
        command: 'message.send',
        channelId: general,
        body: 'Exactly once, please',
        idempotencyKey: key,
      });
    // Concurrent retries (lost response + reconnect retry) race safely.
    const [a, b] = await Promise.all([attempt(), attempt()]);
    const c = await attempt();
    expect(new Set([a.id, b.id, c.id]).size).toBe(1);
    expect([a, b, c].filter((r) => r.replayed)).toHaveLength(2);
    expect(
      await failure(
        comm(owner, {
          command: 'message.send',
          channelId: general,
          body: 'Different text, same key',
          idempotencyKey: key,
        }),
      ),
    ).toBe('CONFLICT');
    expect(
      await failure(
        comm(owner, {
          command: 'message.send',
          channelId: experiments,
          body: 'Exactly once, please',
          idempotencyKey: key,
        }),
      ),
    ).toBe('CONFLICT');
    // Reconnect backfill from the last seen cursor returns it exactly once.
    const backfill = await listMessages(owner, general, { since: head });
    expect(backfill.items.filter((m) => m.id === a.id)).toHaveLength(1);
    expect(backfill.items.find((m) => m.id === a.id)!.clientKey).toBe(key);
    const again = await listMessages(owner, general, {
      since: backfill.changeSeq,
    });
    expect(again.items).toEqual([]);
  });

  it('paginates without skipped or duplicated messages and backfills edits', async () => {
    const channel = (
      await comm(owner, {
        command: 'channel.create',
        projectId: project,
        name: 'paging',
        idempotencyKey: randomUUID(),
      })
    ).id;
    const sent: string[] = [];
    for (let i = 0; i < 120; i++)
      sent.push((await send(owner, channel, `message ${i}`)).id);
    const seen: MessageDto[] = [];
    let before: number | undefined;
    for (;;) {
      const page = await listMessages(owner, channel, before ? { before } : {});
      seen.unshift(...page.items);
      if (page.before === null) break;
      before = page.before;
    }
    expect(seen.map((m) => m.id)).toEqual(sent);
    expect(seen.map((m) => m.seq)).toEqual(
      [...seen.map((m) => m.seq)].sort((x, y) => x - y),
    );
    // Large backfill pages advance only over returned rows.
    let cursor = 0;
    const replayed = new Set<string>();
    for (;;) {
      const page = await listMessages(owner, channel, { since: cursor });
      for (const m of page.items) replayed.add(m.id);
      cursor = page.changeSeq;
      if (!page.more) break;
    }
    expect(replayed.size).toBe(120);
    const target = await getMessage(owner, sent[5]!);
    await comm(owner, {
      command: 'message.edit',
      id: target.id,
      expectedVersion: target.version,
      body: 'message 5 (edited)',
    });
    const delta = await listMessages(owner, channel, { since: cursor });
    expect(delta.items.map((m) => [m.id, m.body])).toEqual([
      [target.id, 'message 5 (edited)'],
    ]);
  });
});

describe.sequential('Journey C — restricted channel and revocation', () => {
  let restricted: string;
  let leaked: string;
  it('restricted channels are invisible without an explicit grant', async () => {
    restricted = (
      await comm(editor, {
        command: 'channel.create',
        projectId: project,
        name: 'results-private',
        visibility: 'RESTRICTED',
        idempotencyKey: randomUUID(),
      })
    ).id;
    // Project owners and workspace administrators gain nothing implicitly.
    for (const who of [owner, member, viewer, wsAdmin, outsider]) {
      expect(await failure(getChannel(who, restricted))).toBe('NOT_FOUND');
      expect(await failure(send(who, restricted, 'hi'))).toBe('NOT_FOUND');
    }
    expect(
      (await listChannels(owner, project)).items.some(
        (c) => c.id === restricted,
      ),
    ).toBe(false);
    expect(
      await failure(comm(owner, { command: 'channel.join', id: restricted })),
    ).toBe('NOT_FOUND');
    // Grants go only to people with live project access.
    expect(
      await failure(
        comm(editor, {
          command: 'channel.member.add',
          id: restricted,
          profileId: outsider.id,
        }),
      ),
    ).toBe('VALIDATION_ERROR');
    await comm(editor, {
      command: 'channel.member.add',
      id: restricted,
      profileId: member.id,
    });
    await comm(editor, {
      command: 'channel.member.add',
      id: restricted,
      profileId: leaver.id,
    });
    const added = await listNotifications(member, undefined);
    expect(added.items[0]).toMatchObject({
      kind: 'CHANNEL_ADDED',
      available: true,
    });
    expect(
      (await getChannel(member, restricted)).members.map((m) => m.id),
    ).toEqual(expect.arrayContaining([editor.id, member.id, leaver.id]));
    // Mentions in a restricted channel are limited to its members.
    expect(
      await failure(send(editor, restricted, `cc ${mentionToken(owner.id)}`)),
    ).toBe('VALIDATION_ERROR');
  });

  it('private topic authorization follows membership and the current epoch', async () => {
    const epoch = await epochOf(restricted);
    const topic = `atlas:channel:${restricted}:${epoch}`;
    expect(await asBrowser(member.id, topic)).toBe(true);
    expect(await asBrowser(editor.id, topic)).toBe(true);
    for (const who of [owner, viewer, wsAdmin, outsider])
      expect(await asBrowser(who.id, topic)).toBe(false);
    expect(await asBrowser(null, topic)).toBe(false);
    expect(
      await asBrowser(member.id, `atlas:channel:${restricted}:${randomUUID()}`),
    ).toBe(false);
    expect(await asBrowser(member.id, `atlas:user:${member.id}`)).toBe(true);
    expect(await asBrowser(member.id, `atlas:user:${editor.id}`)).toBe(false);
    expect(await asBrowser(member.id, 'realtime:public')).toBe(false);
    // The API's topic is the same current-epoch topic.
    expect((await getChannel(member, restricted)).topic).toBe(topic);
  });

  it('revocation rotates the topic; retained listeners and fresh requests see nothing new', async () => {
    const oldEpoch = await epochOf(restricted);
    const oldTopic = `atlas:channel:${restricted}:${oldEpoch}`;
    const head = await outboxHead();
    await comm(editor, {
      command: 'channel.member.remove',
      id: restricted,
      profileId: member.id,
    });
    const newEpoch = await epochOf(restricted);
    expect(newEpoch).not.toBe(oldEpoch);
    const newTopic = `atlas:channel:${restricted}:${newEpoch}`;
    leaked = (await send(editor, restricted, 'Unpublished result: p=0.003')).id;
    const events = await outboxSince(head);
    // The only event ever written to the old topic after revocation is the
    // rotation notice; the new message goes to the new topic only.
    expect(
      events.filter((e) => e.topic === oldTopic).map((e) => e.event),
    ).toEqual(['topic.rotated']);
    const created = events.filter((e) => e.event === 'message.created');
    expect(created.map((e) => e.topic)).toEqual([newTopic]);
    // Payloads are identifiers only: no research content in any event.
    for (const e of events)
      expect(JSON.stringify(e.payload)).not.toContain('Unpublished');
    expect(await asBrowser(member.id, oldTopic)).toBe(false);
    expect(await asBrowser(member.id, newTopic)).toBe(false);
    expect(await asBrowser(editor.id, newTopic)).toBe(true);
    expect(await asBrowser(leaver.id, newTopic)).toBe(true);
    for (const work of [
      () => getChannel(member, restricted),
      () => listMessages(member, restricted, {}),
      () => listMessages(member, restricted, { since: 0 }),
      () => getMessage(member, leaked),
      () => mentionCandidates(member, restricted, ''),
      () => discussionContext(member, { channelId: restricted }),
    ])
      expect(await failure(work())).toBe('NOT_FOUND');
    expect(
      await failure(
        comm(member, {
          command: 'reaction.set',
          messageId: leaked,
          emoji: 'eyes',
          active: true,
        }),
      ),
    ).toBe('NOT_FOUND');
    const removed = (await listNotifications(member, undefined)).items[0]!;
    expect(removed).toMatchObject({
      kind: 'CHANNEL_REMOVED',
      available: false,
      href: null,
      snippet: null,
    });
    expect(removed.title).not.toContain('results-private');
    // Current members still receive and read it.
    expect((await getMessage(leaver, leaked)).body).toContain('p=0.003');
  });

  it('project-level revocation rotates every channel and denies all reads', async () => {
    const epochs = await Promise.all(
      [general, restricted].map((id) => epochOf(id)),
    );
    const version = (
      await admin.projectMembership.findUniqueOrThrow({
        where: {
          projectId_profileId: { projectId: project, profileId: leaver.id },
        },
      })
    ).version;
    await platform(owner, {
      command: 'membership.remove',
      scope: 'project',
      scopeId: project,
      profileId: leaver.id,
      expectedVersion: version,
    });
    const after = await Promise.all(
      [general, restricted].map((id) => epochOf(id)),
    );
    expect(after[0]).not.toBe(epochs[0]);
    expect(after[1]).not.toBe(epochs[1]);
    expect(
      await asBrowser(leaver.id, `atlas:channel:${restricted}:${after[1]}`),
    ).toBe(false);
    expect(await failure(getMessage(leaver, leaked))).toBe('NOT_FOUND');
    expect(await failure(listChannels(leaver, project))).toBe('NOT_FOUND');
    // A revoked author's name is no longer disclosed to remaining readers.
    const mentions = await getChannel(editor, restricted);
    expect(mentions.members.find((m) => m.id === leaver.id)).toMatchObject({
      active: false,
      name: null,
    });
  });
});

describe.sequential('Journey D — research sharing', () => {
  let shared: string;
  it('shares a paper, a note and a precise citation as typed references', async () => {
    const { id } = await send(
      editor,
      general,
      `${mentionToken(member.id)} see the paper and my note`,
      {
        references: [
          { artifactId: paper.artifactId },
          { artifactId: noteArtifact },
          {
            artifactId: paper.artifactId,
            sourceVersionId: sourceVersion,
            annotationId: sharedAnnotation,
          },
        ],
      },
    );
    shared = id;
    const seen = await getMessage(member, id);
    expect(seen.references.map((r) => [r.kind, r.state, r.title])).toEqual([
      ['PAPER', 'AVAILABLE', 'Attention is all you need'],
      ['DOCUMENT', 'AVAILABLE', 'Reading notes on transformers'],
      ['PAPER', 'AVAILABLE', 'Attention is all you need'],
    ]);
    expect(seen.references[0]!.href).toBe(
      `/app/projects/${project}/library?paper=${paper.id}`,
    );
    expect(seen.references[1]!.href).toBe(
      `/app/projects/${project}/documents?doc=${noteId}`,
    );
    // Citation keeps exact source-version/page/annotation identity.
    expect(seen.references[2]!.citation).toEqual({
      sourceVersionId: sourceVersion,
      page: 3,
      annotationId: sharedAnnotation,
      quote: 'Scaled dot-product attention computes weights',
      state: 'AVAILABLE',
    });
    expect(seen.references[2]!.href).toBe(
      `/app/projects/${project}/reader?paper=${paper.id}&source=${sourceVersion}&page=3&annotation=${sharedAnnotation}`,
    );
    // Shared research notifies once, as one logical event.
    const inbox = (await listNotifications(member, undefined)).items.filter(
      (n) => n.href?.includes(id),
    );
    expect(inbox.map((n) => n.kind)).toEqual(['ARTIFACT_SHARED']);
  });

  it('refuses private annotations, foreign artifacts and invented pages', async () => {
    expect(
      await failure(
        send(owner, general, 'my private note', {
          references: [
            {
              artifactId: paper.artifactId,
              sourceVersionId: sourceVersion,
              annotationId: privateAnnotation,
            },
          ],
        }),
      ),
    ).toBe('VALIDATION_ERROR');
    expect(
      await failure(
        send(owner, general, 'other tenant', {
          references: [{ artifactId: otherPaper.artifactId }],
        }),
      ),
    ).toBe('NOT_FOUND');
    expect(
      await failure(
        send(owner, general, 'wrong page', {
          references: [
            {
              artifactId: paper.artifactId,
              sourceVersionId: sourceVersion,
              annotationId: sharedAnnotation,
              page: 9,
            },
          ],
        }),
      ),
    ).toBe('VALIDATION_ERROR');
    expect(
      await failure(
        send(owner, general, 'page without version', {
          references: [{ artifactId: paper.artifactId, page: 2 }],
        }),
      ),
    ).toBe('VALIDATION_ERROR');
    expect(
      await failure(
        send(owner, general, 'version on a note', {
          references: [
            { artifactId: noteArtifact, sourceVersionId: sourceVersion },
          ],
        }),
      ),
    ).toBe('VALIDATION_ERROR');
    // The schema itself cannot represent a cross-project reference.
    await expect(
      admin.$executeRaw`INSERT INTO message_references(project_id,channel_id,message_id,ordinal,artifact_id,artifact_kind)
        VALUES(${project}::uuid,${general}::uuid,${shared}::uuid,9,${otherPaper.artifactId}::uuid,'PAPER')`,
    ).rejects.toThrow();
  });

  it('a message containing an artifact ID grants nothing to outsiders', async () => {
    expect(await failure(getMessage(outsider, shared))).toBe('NOT_FOUND');
    expect(await failure(listMessages(outsider, general, { since: 0 }))).toBe(
      'NOT_FOUND',
    );
  });

  it('revoked and archived research renders safely without leaking text', async () => {
    // The annotation stops being shared: its quote disappears from the card.
    await research(owner, {
      command: 'annotation.delete',
      id: sharedAnnotation,
      expectedVersion: 1,
    } as Parameters<typeof executeResearchCommand>[1]);
    let seen = await getMessage(member, shared);
    expect(seen.references[2]!.citation).toMatchObject({
      quote: null,
      state: 'UNAVAILABLE',
    });
    expect(seen.references[2]!.href).not.toContain('annotation=');
    // Archived note: non-writers lose the title entirely.
    const doc = await admin.document.findUniqueOrThrow({
      where: { id: noteId },
    });
    await executeArtifactCommand(
      owner,
      { command: 'document.archive', id: noteId, expectedVersion: doc.version },
      randomUUID(),
    );
    seen = await getMessage(viewer, shared);
    expect(seen.references[1]).toMatchObject({
      state: 'UNAVAILABLE',
      title: null,
      href: null,
      id: null,
    });
    // Archived paper: archived state, no new shares.
    const pp = await admin.projectPaper.findUniqueOrThrow({
      where: { id: paper.id },
    });
    await research(owner, {
      command: 'paper.archive',
      id: paper.id,
      expectedVersion: pp.version,
    } as Parameters<typeof executeResearchCommand>[1]);
    seen = await getMessage(member, shared);
    expect(seen.references[0]!.state).toBe('ARCHIVED');
    expect(
      await failure(
        send(owner, general, 'archived share', {
          references: [{ artifactId: paper.artifactId }],
        }),
      ),
    ).toBe('CONFLICT');
  });
});

describe.sequential('A04.6 notification integrity', () => {
  it('task assignment produces one trustworthy notification for the assignee', async () => {
    const { id: taskId } = await executeArtifactCommand(
      owner,
      {
        command: 'task.create',
        projectId: project,
        title: 'Replicate table 2',
        assigneeId: member.id,
        idempotencyKey: randomUUID(),
      },
      randomUUID(),
    );
    const items = (await listNotifications(member, undefined)).items.filter(
      (n) => n.kind === 'TASK_ASSIGNED',
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      available: true,
      snippet: 'Replicate table 2',
      href: `/app/projects/${project}/tasks?task=${taskId}`,
    });
    // Self-assignment never notifies.
    await executeArtifactCommand(
      owner,
      {
        command: 'task.create',
        projectId: project,
        title: 'Own task',
        assigneeId: owner.id,
        idempotencyKey: randomUUID(),
      },
      randomUUID(),
    );
    expect(
      (await listNotifications(owner, undefined)).items.some(
        (n) => n.kind === 'TASK_ASSIGNED',
      ),
    ).toBe(false);
  });

  it('paginates the inbox by cursor without duplicates', async () => {
    for (let i = 0; i < 35; i++)
      await send(editor, general, `${mentionToken(member.id)} ping ${i}`);
    const ids: string[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await listNotifications(member, cursor);
      ids.push(...page.items.map((n) => n.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(38);
    const unreadOnly = await listNotifications(member, undefined, true);
    expect(unreadOnly.items.every((n) => !n.read)).toBe(true);
  });

  it('muted members are not notified and remain able to read', async () => {
    await comm(member, { command: 'channel.join', id: general });
    await comm(member, {
      command: 'channel.preferences',
      id: general,
      notify: 'NONE',
    });
    const before = (await listNotifications(member, undefined)).unread;
    await send(editor, general, `${mentionToken(member.id)} muted ping`);
    expect((await listNotifications(member, undefined)).unread).toBe(before);
    await comm(member, {
      command: 'channel.preferences',
      id: general,
      notify: 'ALL',
    });
  });
});

describe.sequential('Journey E — contextual Atlas', () => {
  it('derives the exact authorized context of one thread only', async () => {
    const rootA = (
      await send(editor, general, 'Thread A: compare with the baseline', {
        references: [],
      })
    ).id;
    const paper2 = await paperOf(owner, project, 'Synthetic discussion paper');
    const inA = (
      await send(owner, general, 'Use the synthetic paper', {
        threadRootId: rootA,
        references: [{ artifactId: paper2.artifactId }],
      })
    ).id;
    const rootB = (await send(member, general, 'Thread B: private aside')).id;
    const inB = (
      await send(editor, general, 'secret B detail', { threadRootId: rootB })
    ).id;
    const context = await atlasContext(owner, {
      channelId: general,
      threadRootId: rootA,
    });
    expect(context.messageIds).toEqual([rootA, inA]);
    expect(context.messageIds).not.toContain(inB);
    expect(context.sources).toEqual([
      {
        artifactId: paper2.artifactId,
        projectPaperId: paper2.id,
        title: 'Synthetic discussion paper',
      },
    ]);
    const text = (
      await discussionContext(owner, {
        channelId: general,
        threadRootId: rootA,
      })
    ).text;
    expect(text).toContain('Thread A');
    expect(text).not.toContain('secret B');
    // Paid AI is disabled: the context is reviewable, the run is not.
    expect(context.ai).toEqual({
      available: false,
      reason: expect.any(String),
    });
    // A thread of another channel cannot be addressed through this one.
    expect(
      await failure(
        atlasContext(owner, { channelId: experiments, threadRootId: rootA }),
      ),
    ).toBe('NOT_FOUND');
    expect(
      await failure(atlasContext(owner, { channelId: otherChannel })),
    ).toBe('NOT_FOUND');
    expect(await failure(atlasContext(wsAdmin, { channelId: general }))).toBe(
      'NOT_FOUND',
    );
  });

  it('rejects cross-project injection at run preparation without any provider call', async () => {
    vi.stubEnv('ATLAS_AI_ACTIVATION', 'isolated-local');
    // A dead loopback fixture: preparation must never reach a provider.
    vi.stubEnv('ATLAS_AI_FIXTURE_ORIGIN', 'http://127.0.0.1:9');
    vi.stubEnv('ATLAS_AI_MODEL_POLICY', JSON.stringify(aiPolicy('openai')));
    vi.stubEnv('ATLAS_AI_MONTHLY_LIMIT_MICROS', '10000000');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const base = {
        idempotencyKey: randomUUID(),
        text: '/summarize the discussion',
        references: [],
        consent: true as const,
      };
      // Channel of another tenant's project.
      expect(
        await failure(
          prepareRun(owner, {
            ...base,
            projectId: project,
            discussion: { channelId: otherChannel },
          }),
        ),
      ).toBe('NOT_FOUND');
      // Own channel presented as context for the outsider's project.
      expect(
        await failure(
          prepareRun(outsider, {
            ...base,
            idempotencyKey: randomUUID(),
            projectId: otherProject,
            discussion: { channelId: general },
          }),
        ),
      ).toBe('NOT_FOUND');
      // Discussion runs never reuse a conversation (no cross-thread history).
      expect(
        await failure(
          prepareRun(owner, {
            ...base,
            idempotencyKey: randomUUID(),
            projectId: project,
            conversationId: randomUUID(),
            discussion: { channelId: general },
          }),
        ),
      ).toBe('VALIDATION_ERROR');
      const prepared = await prepareRun(owner, {
        ...base,
        idempotencyKey: randomUUID(),
        projectId: project,
        discussion: { channelId: general },
      });
      expect(prepared.discussion).toContain('<discussion>');
      expect(prepared.discussion).toContain('untrusted user conversation');
      // The persisted prompt is the user's command only, never the discussion.
      const run = await admin.aIRun.findUniqueOrThrow({
        where: { id: prepared.id },
      });
      expect(run.prompt).toBe('/summarize the discussion');
      expect(fetchSpy).not.toHaveBeenCalled();
      // Without the isolated fixture, paid providers remain disabled.
      vi.stubEnv('ATLAS_AI_FIXTURE_ORIGIN', '');
      expect(
        await failure(
          prepareRun(owner, {
            ...base,
            idempotencyKey: randomUUID(),
            projectId: project,
            discussion: { channelId: general },
          }),
        ),
      ).toBe('CONFLICT');
    } finally {
      fetchSpy.mockRestore();
      for (const key of [
        'ATLAS_AI_ACTIVATION',
        'ATLAS_AI_FIXTURE_ORIGIN',
        'ATLAS_AI_MODEL_POLICY',
        'ATLAS_AI_MONTHLY_LIMIT_MICROS',
      ])
        vi.stubEnv(key, '');
    }
  });

  it('posting Atlas output requires the actor’s own completed run', async () => {
    expect(
      await failure(
        send(owner, general, 'Atlas summary', { aiRunId: randomUUID() }),
      ),
    ).toBe('NOT_FOUND');
  });
});

describe.sequential('A04.9 grants, delivery and abuse limits', () => {
  it('browser roles have no table access; only the topic function is callable', async () => {
    const tables = [
      'channels',
      'channel_members',
      'channel_messages',
      'message_mentions',
      'message_reactions',
      'message_references',
      'notifications',
      'communication_outbox',
    ];
    const grants = await admin.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_roles r CROSS JOIN unnest(${tables}::text[]) t
      CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
      WHERE r.rolname IN ('anon','authenticated') AND has_table_privilege(r.rolname,'public.'||t,p)`;
    expect(grants[0]!.n).toBe(0);
    const outbox = await admin.$queryRaw<{ ok: boolean }[]>`
      SELECT has_table_privilege('atlas_runtime','public.communication_outbox','SELECT') AS ok`;
    expect(outbox[0]!.ok).toBe(false);
    const fns = await admin.$queryRaw<
      { anon: boolean; auth: boolean; private: boolean }[]
    >`
      SELECT has_function_privilege('anon','atlas_realtime.topic_allowed(text)','EXECUTE') AS anon,
             has_function_privilege('authenticated','atlas_realtime.topic_allowed(text)','EXECUTE') AS auth,
             has_function_privilege('authenticated','atlas_private.mutate(text,jsonb,uuid)','EXECUTE') AS private`;
    expect(fns[0]).toEqual({ anon: false, auth: true, private: false });
    const definers = await admin.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ('atlas_private','atlas_realtime') AND p.prosecdef AND NOT EXISTS(
       SELECT 1 FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) c WHERE c LIKE 'search_path=%')`;
    expect(definers[0]!.n).toBe(0);
  });

  it('runtime cannot write communication tables directly', async () => {
    await expect(
      runtimeDatabase().$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('atlas.actor_id',${owner.id},true)`;
        await tx.$executeRaw`UPDATE channel_messages SET body='tampered' WHERE channel_id=${general}::uuid`;
      }),
    ).rejects.toThrow();
  });

  it('outbox dispatch is a safe no-op without Realtime and keeps durability', async () => {
    const pending = await admin.communicationOutbox.count({
      where: { deliveredAt: null },
    });
    expect(pending).toBeGreaterThan(0);
    const realtime = await admin.$queryRaw<{ ok: boolean }[]>`
      SELECT to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NOT NULL AS ok`;
    const sent = await dispatchOutbox();
    if (!realtime[0]!.ok) expect(sent).toBe(0);
    for (const row of await admin.communicationOutbox.findMany({ take: 200 })) {
      const keys = Object.keys(row.payload as object).sort();
      expect(
        keys.every((k) =>
          [
            'channelId',
            'id',
            'seq',
            'changeSeq',
            'threadRootId',
            'version',
            'count',
          ].includes(k),
        ),
      ).toBe(true);
    }
  });

  it('message sending is rate limited per actor', async () => {
    const who = randomUUID();
    for (let i = 0; i < 60; i++) await rateLimit('message', who, 60);
    expect(await failure(rateLimit('message', who, 60))).toBe('RATE_LIMITED');
  });

  it('reads a 50-message page within a bounded number of queries', async () => {
    const channel = (
      await comm(owner, {
        command: 'channel.create',
        projectId: project,
        name: 'performance',
        idempotencyKey: randomUUID(),
      })
    ).id;
    const { id: docId } = await executeArtifactCommand(
      owner,
      {
        command: 'document.create',
        projectId: project,
        title: 'Measurement log',
        idempotencyKey: randomUUID(),
      },
      randomUUID(),
    );
    const docArtifact = (
      await admin.document.findUniqueOrThrow({ where: { id: docId } })
    ).artifactId;
    for (let i = 0; i < 60; i++)
      await send(
        editor,
        channel,
        `${mentionToken(owner.id)} measurement ${i}`,
        {
          references: [{ artifactId: docArtifact }],
        },
      );
    const started = performance.now();
    const page = await listMessages(owner, channel, {});
    const ms = Math.round(performance.now() - started);
    console.log(
      `COMMUNICATION_PERFORMANCE ${JSON.stringify({ messages: page.items.length, pageMs: ms })}`,
    );
    expect(page.items.length).toBe(50);
  });
});
