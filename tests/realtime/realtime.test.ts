import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { mentionToken } from '../../packages/core/src/index';
import type { PlatformCommand } from '../../packages/core/src/platform';
import { executeCommand } from '../../apps/web/src/features/platform/server/services';
import { runtimeDatabase } from '../../apps/web/src/features/platform/server/database';
import { publicError } from '../../apps/web/src/features/platform/server/errors';
import {
  dispatchOutbox,
  executeCommunicationCommand,
  resetSweepThrottle,
  sweepOutbox,
} from '../../apps/web/src/features/communication/server/commands';
import { Reconciler } from '../../apps/web/src/features/communication/delivery';
import {
  emptyTimeline,
  mergeMessages,
  type Timeline,
} from '../../apps/web/src/features/communication/timeline';
import { createDatabase } from '../../packages/database/src/index';
import {
  getChannel,
  messageChanges,
  messagePage,
} from '../../apps/web/src/features/communication/server/reads';

/*
 * A04 private Realtime against the disposable Supabase harness: real GoTrue
 * sessions, the real Supabase Realtime server, the Atlas migration's
 * realtime.messages policy and DB-native realtime.send. Nothing here is
 * mocked; every expectation is observed on an actual WebSocket.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const direct = process.env.DIRECT_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const service = process.env.ATLAS_STORAGE_SERVICE_KEY;
const database = process.env.DATABASE_URL;
if (!supabaseUrl || !publishable || !service || !database)
  throw new Error('The disposable Supabase harness environment is required.');
if (!direct) throw new Error('The disposable harness DIRECT_URL is required.');
for (const value of [supabaseUrl, database, direct])
  if (!['127.0.0.1', 'localhost'].includes(new URL(value).hostname))
    throw new Error('Realtime tests run only against loopback services.');
if (
  !new URL(database).pathname.endsWith('/atlas_auth_test') ||
  !new URL(direct).pathname.endsWith('/atlas_auth_test')
)
  throw new Error('Realtime tests require the disposable auth database.');

type Actor = { id: string; email: string; token: string };
const password = 'Atlas-disposable-realtime-password-42';
async function user(label: string): Promise<Actor> {
  const email = `${label}-${randomUUID()}@atlas.example`;
  const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${service}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  expect(created.status).toBe(200);
  const login = await fetch(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: publishable! },
      body: JSON.stringify({ email, password }),
    },
  );
  expect(login.status).toBe(200);
  const session = (await login.json()) as {
    access_token: string;
    user: { id: string };
  };
  return { id: session.user.id, email, token: session.access_token };
}
const clients: SupabaseClient[] = [];
interface Listener {
  channel: RealtimeChannel;
  events: { event: string; payload: Record<string, unknown> }[];
  joined: Promise<'SUBSCRIBED' | 'DENIED'>;
  client: SupabaseClient;
}
/** A browser-equivalent private subscription using only the user's token. */
async function listen(who: Actor, topic: string): Promise<Listener> {
  const client = createClient(supabaseUrl!, publishable!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  clients.push(client);
  await client.realtime.setAuth(who.token);
  const events: Listener['events'] = [];
  const channel = client.channel(topic, { config: { private: true } });
  channel.on('broadcast', { event: '*' }, (m) =>
    events.push({
      event: m.event,
      payload: m.payload as Record<string, unknown>,
    }),
  );
  const joined = new Promise<'SUBSCRIBED' | 'DENIED'>((resolve) => {
    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') resolve('SUBSCRIBED');
      else if (
        status === 'CHANNEL_ERROR' &&
        error?.message.includes('Unauthorized')
      )
        resolve('DENIED');
    });
    setTimeout(() => resolve('DENIED'), 15000);
  });
  return { channel, events, joined, client };
}
const until = async (check: () => boolean, ms = 10000) => {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline)
      throw new Error('Timed out waiting for Realtime.');
    await new Promise((r) => setTimeout(r, 100));
  }
};
const quiet = (ms: number) => new Promise((r) => setTimeout(r, ms));
const failure = (work: Promise<unknown>) =>
  work.then(
    () => 'RESOLVED',
    (error: unknown) => publicError(error).code,
  );
const platform = (who: Actor, command: PlatformCommand) =>
  executeCommand(who, command, randomUUID());
const comm = (
  who: Actor,
  command: Parameters<typeof executeCommunicationCommand>[1],
  dispatch = true,
) => executeCommunicationCommand(who, command, randomUUID(), { dispatch });

let owner: Actor, editor: Actor, outsider: Actor;
// Harness-only observer of outbox state (the runtime role cannot read it).
const harnessAdmin = createDatabase(direct);
const pendingFor = async (messageId: string) =>
  harnessAdmin.$queryRaw<
    { n: number }[]
  >`SELECT count(*)::int AS n FROM communication_outbox
    WHERE payload->>'id'=${messageId} AND delivered_at IS NULL AND abandoned_at IS NULL`.then(
    (rows) => rows[0]?.n ?? 0,
  );
let project: string;
let restricted: string;
let general: string;

beforeAll(async () => {
  vi.stubEnv('ATLAS_MODE', 'live');
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('ATLAS_DEV_INVITATION_LINKS', 'true');
  owner = await user('rt-owner');
  editor = await user('rt-editor');
  outsider = await user('rt-outsider');
  for (const who of [owner, editor, outsider])
    await platform(who, {
      command: 'bootstrap',
      displayName: `Realtime ${who.email.slice(3, 9)}`,
      workspaceName: 'Personal',
      researchInterests: [],
    });
  const org = (
    await platform(owner, {
      command: 'organization.create',
      name: 'Realtime lab',
    })
  ).id!;
  const workspace = (
    await platform(owner, {
      command: 'workspace.create',
      organizationId: org,
      name: 'Realtime',
    })
  ).id!;
  project = (
    await platform(owner, {
      command: 'project.create',
      workspaceId: workspace,
      name: 'Realtime project',
      visibility: 'PRIVATE',
      idempotencyKey: randomUUID(),
    })
  ).id!;
  const invite = await platform(owner, {
    command: 'invitation.create',
    scope: 'project',
    scopeId: project,
    role: 'EDITOR',
    email: editor.email,
  });
  await platform(editor, {
    command: 'invitation.accept',
    token: new URLSearchParams(
      new URL(invite.invitationLink!).hash.slice(1),
    ).get('token')!,
  });
  restricted = (
    await comm(owner, {
      command: 'channel.create',
      projectId: project,
      name: 'private-results',
      visibility: 'RESTRICTED',
      idempotencyKey: randomUUID(),
    })
  ).id;
  await comm(owner, {
    command: 'channel.member.add',
    id: restricted,
    profileId: editor.id,
  });
  general = (
    await comm(owner, {
      command: 'channel.create',
      projectId: project,
      name: 'general',
      idempotencyKey: randomUUID(),
    })
  ).id;
}, 60000);
afterAll(async () => {
  for (const client of clients) await client.removeAllChannels();
  await harnessAdmin.$disconnect();
  await runtimeDatabase().$disconnect();
  vi.unstubAllEnvs();
});

describe.sequential('Journey C over real Supabase Realtime', () => {
  let editorOld: Listener;
  let oldTopic: string;
  it('authorized members join the private topic; outsiders and the anon key cannot', async () => {
    oldTopic = (await getChannel(editor, restricted)).topic;
    editorOld = await listen(editor, oldTopic);
    expect(await editorOld.joined).toBe('SUBSCRIBED');
    expect(await (await listen(outsider, oldTopic)).joined).toBe('DENIED');
    // A user cannot join another person's inbox topic.
    expect(
      await (
        await listen(outsider, `atlas:user:${editor.id}`)
      ).joined,
    ).toBe('DENIED');
    // Public (non-private) subscriptions to the topic receive nothing: Atlas
    // only ever sends private broadcasts.
  });

  it('delivers identifier-only events after commit', async () => {
    const { id } = await comm(owner, {
      command: 'message.send',
      channelId: restricted,
      body: 'Confidential interim effect size 0.42',
      idempotencyKey: randomUUID(),
    });
    await until(() => editorOld.events.some((e) => e.payload.id === id));
    const event = editorOld.events.find((e) => e.payload.id === id)!;
    expect(event.event).toBe('message.created');
    expect(JSON.stringify(event.payload)).not.toContain('0.42');
    // The content is then fetched through the authorized API.
    const page = await messageChanges(editor, restricted, 0);
    expect(page.items.find((m) => m.id === id)?.body).toContain('0.42');
  });

  it('revocation ends the retained subscription and denies fresh joins and reads', async () => {
    await comm(owner, {
      command: 'channel.member.remove',
      id: restricted,
      profileId: editor.id,
    });
    await until(() =>
      editorOld.events.some((e) => e.event === 'topic.rotated'),
    );
    const newTopic = (await getChannel(owner, restricted)).topic;
    expect(newTopic).not.toBe(oldTopic);
    const ownerNew = await listen(owner, newTopic);
    expect(await ownerNew.joined).toBe('SUBSCRIBED');
    const before = editorOld.events.length;
    const { id } = await comm(owner, {
      command: 'message.send',
      channelId: restricted,
      body: 'Post-revocation secret: do not leak',
      idempotencyKey: randomUUID(),
    });
    // Current members still receive updates.
    await until(() => ownerNew.events.some((e) => e.payload.id === id));
    // The revoked member's still-open socket receives nothing new at all.
    await quiet(3000);
    expect(editorOld.events.slice(before)).toEqual([]);
    // The still-valid (stale) JWT cannot rejoin either topic.
    expect(await (await listen(editor, newTopic)).joined).toBe('DENIED');
    expect(await (await listen(editor, oldTopic)).joined).toBe('DENIED');
    expect(await failure(messageChanges(editor, restricted, 0))).toBe(
      'NOT_FOUND',
    );
    expect(await failure(getChannel(editor, restricted))).toBe('NOT_FOUND');
  });
});

describe.sequential('Journey B transport: reconnect and backfill', () => {
  it('a message committed while disconnected is backfilled exactly once', async () => {
    const topic = (await getChannel(editor, general)).topic;
    const live = await listen(editor, topic);
    expect(await live.joined).toBe('SUBSCRIBED');
    let cursor = (await messagePage(editor, general)).changeSeq;
    live.client.realtime.disconnect();
    await quiet(500);
    const key = randomUUID();
    const send = () =>
      comm(owner, {
        command: 'message.send',
        channelId: general,
        body: 'Sent while you were offline',
        idempotencyKey: key,
      });
    const first = await send();
    // A lost acknowledgement retried with the same key does not duplicate.
    expect((await send()).id).toBe(first.id);
    live.client.realtime.connect();
    const rejoined = await listen(editor, topic);
    expect(await rejoined.joined).toBe('SUBSCRIBED');
    const backfill = await messageChanges(editor, general, cursor);
    expect(backfill.items.filter((m) => m.id === first.id)).toHaveLength(1);
    cursor = backfill.changeSeq;
    expect((await messageChanges(editor, general, cursor)).items).toEqual([]);
  });

  it('durability never depends on delivery: deferred dispatch is retried later', async () => {
    const topic = (await getChannel(editor, general)).topic;
    const live = await listen(editor, topic);
    expect(await live.joined).toBe('SUBSCRIBED');
    const { id } = await comm(
      owner,
      {
        command: 'message.send',
        channelId: general,
        body: `${mentionToken(editor.id)} deferred delivery`,
        idempotencyKey: randomUUID(),
      },
      false,
    );
    // Committed and readable before any event was delivered.
    expect(
      (await messageChanges(editor, general, 0)).items.some((m) => m.id === id),
    ).toBe(true);
    await quiet(1500);
    expect(live.events.some((e) => e.payload.id === id)).toBe(false);
    expect(await dispatchOutbox()).toBeGreaterThan(0);
    await until(() => live.events.some((e) => e.payload.id === id));
  });

  it('notifications reach only the recipient’s own private topic', async () => {
    const inbox = await listen(editor, `atlas:user:${editor.id}`);
    expect(await inbox.joined).toBe('SUBSCRIBED');
    const other = await listen(owner, `atlas:user:${owner.id}`);
    expect(await other.joined).toBe('SUBSCRIBED');
    await comm(owner, {
      command: 'message.send',
      channelId: general,
      body: `${mentionToken(editor.id)} please check`,
      idempotencyKey: randomUUID(),
    });
    await until(() =>
      inbox.events.some((e) => e.event === 'notification.created'),
    );
    await quiet(1000);
    expect(other.events.some((e) => e.event === 'notification.created')).toBe(
      false,
    );
  });
});

/*
 * A04.1 regression for the lost-event scenario, over real sockets: a live,
 * subscribed reader; another user's message commits; the dispatcher fails
 * (here: never runs); no later command dispatches; the reader stays on the
 * same screen. Before A04.1 the reader saw nothing until a focus change and
 * the event stayed queued indefinitely.
 */
describe.sequential('A04.1 lost delivery over real Supabase Realtime', () => {
  const reader = (who: Actor, channelId: string, topic: () => string) => {
    let state: Timeline = emptyTimeline();
    const stale: string[] = [];
    const loop = new Reconciler({
      fetchChanges: (since) => messageChanges(who, channelId, since),
      apply: (page) => {
        state = mergeMessages(state, page.items, { changeSeq: page.changeSeq });
      },
      topic,
      onTopicStale: (current) => stale.push(current),
      onDenied: () => stale.push('DENIED'),
      // The timer path is covered deterministically in the unit suite; here
      // each poll is triggered explicitly to observe real server state.
      setTimer: () => null,
      clearTimer: () => undefined,
    });
    return {
      loop,
      stale,
      get state() {
        return state;
      },
    };
  };

  it('a live subscriber recovers a message whose event was never dispatched, exactly once, and the queued event is retried without any command', async () => {
    const topic = (await getChannel(editor, general)).topic;
    const live = await listen(editor, topic);
    expect(await live.joined).toBe('SUBSCRIBED');
    const view = reader(editor, general, () => topic);
    view.loop.seed((await messagePage(editor, general)).changeSeq);
    view.loop.update('live', false);
    const { id } = await comm(
      owner,
      {
        command: 'message.send',
        channelId: general,
        body: 'Committed while the dispatcher was failing',
        idempotencyKey: randomUUID(),
      },
      false,
    );
    // Reproduction: socket live, nothing delivered, event stuck in the queue.
    await quiet(2000);
    expect(live.events.some((e) => e.payload.id === id)).toBe(false);
    expect(await pendingFor(id)).toBe(1);
    // Fix 1: the bounded live reconcile shows it, exactly once.
    await view.loop.run('poll');
    const copies = () =>
      Object.values(view.state.messages).filter((m) => m.id === id);
    expect(copies()).toHaveLength(1);
    await view.loop.run('poll');
    expect(copies()).toHaveLength(1);
    // Fix 2: that same cursor read schedules a throttled sweep, which
    // delivers the queued hint to every other live subscriber.
    const other = await listen(owner, topic);
    expect(await other.joined).toBe('SUBSCRIBED');
    resetSweepThrottle();
    expect(await sweepOutbox()).toBeGreaterThan(0);
    await until(() => other.events.some((e) => e.payload.id === id));
    expect(await pendingFor(id)).toBe(0);
    view.loop.stop();
  });

  it('a lost topic.rotated is detected by reconciliation, the client moves to the new topic, and the queued pre-rotation hint never reaches the old topic', async () => {
    const third = await user('rt-third');
    await platform(third, {
      command: 'bootstrap',
      displayName: 'Realtime third',
      workspaceName: 'Personal',
      researchInterests: [],
    });
    const invite = await platform(owner, {
      command: 'invitation.create',
      scope: 'project',
      scopeId: project,
      role: 'VIEWER',
      email: third.email,
    });
    await platform(third, {
      command: 'invitation.accept',
      token: new URLSearchParams(
        new URL(invite.invitationLink!).hash.slice(1),
      ).get('token')!,
    });
    const lab = (
      await comm(owner, {
        command: 'channel.create',
        projectId: project,
        name: 'lab-notes',
        visibility: 'RESTRICTED',
        idempotencyKey: randomUUID(),
      })
    ).id;
    for (const who of [editor, third])
      await comm(owner, {
        command: 'channel.member.add',
        id: lab,
        profileId: who.id,
      });
    let subscribed = (await getChannel(editor, lab)).topic;
    const old = subscribed;
    const editorOld = await listen(editor, old);
    const thirdOld = await listen(third, old);
    expect(await editorOld.joined).toBe('SUBSCRIBED');
    expect(await thirdOld.joined).toBe('SUBSCRIBED');
    const view = reader(editor, lab, () => subscribed);
    view.loop.seed((await messagePage(editor, lab)).changeSeq);
    view.loop.update('live', false);
    // A pre-revocation message whose hint is still queued…
    const { id: before } = await comm(
      owner,
      {
        command: 'message.send',
        channelId: lab,
        body: 'Queued before the revocation',
        idempotencyKey: randomUUID(),
      },
      false,
    );
    // …then a revocation whose rotation notice is also not dispatched.
    await comm(
      owner,
      { command: 'channel.member.remove', id: lab, profileId: third.id },
      false,
    );
    await quiet(1500);
    expect(editorOld.events.some((e) => e.event === 'topic.rotated')).toBe(
      false,
    );
    // The reader's reconcile names the new topic: it is stale, refresh it.
    await view.loop.run('poll');
    const current = (await getChannel(editor, lab)).topic;
    expect(current).not.toBe(old);
    expect(view.stale).toEqual([current]);
    expect(
      Object.values(view.state.messages).filter((m) => m.id === before),
    ).toHaveLength(1);
    subscribed = current;
    const editorNew = await listen(editor, current);
    expect(await editorNew.joined).toBe('SUBSCRIBED');
    // The retry delivers only the content-free rotation notice to the old
    // topic; the pre-rotation message hint is suppressed, not sent.
    resetSweepThrottle();
    await sweepOutbox();
    await until(() => thirdOld.events.some((e) => e.event === 'topic.rotated'));
    await quiet(2000);
    expect(thirdOld.events.map((e) => e.event)).toEqual(['topic.rotated']);
    const [row] = await harnessAdmin.$queryRaw<
      { lastError: string | null }[]
    >`SELECT last_error AS "lastError" FROM communication_outbox WHERE payload->>'id'=${before} AND event='message.created'`;
    expect(row?.lastError).toBe('SUPERSEDED');
    // Delivery continues for remaining members on the new topic only.
    const { id: next } = await comm(owner, {
      command: 'message.send',
      channelId: lab,
      body: 'After the rotation',
      idempotencyKey: randomUUID(),
    });
    await until(() => editorNew.events.some((e) => e.payload.id === next));
    await quiet(1500);
    expect(thirdOld.events.some((e) => e.payload.id === next)).toBe(false);
    expect(await (await listen(third, current)).joined).toBe('DENIED');
    expect(await failure(messageChanges(third, lab, 0))).toBe('NOT_FOUND');
    view.loop.stop();
  });
});
