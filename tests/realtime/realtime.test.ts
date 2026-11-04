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
} from '../../apps/web/src/features/communication/server/commands';
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
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const service = process.env.ATLAS_STORAGE_SERVICE_KEY;
const database = process.env.DATABASE_URL;
if (!supabaseUrl || !publishable || !service || !database)
  throw new Error('The disposable Supabase harness environment is required.');
for (const value of [supabaseUrl, database])
  if (!['127.0.0.1', 'localhost'].includes(new URL(value).hostname))
    throw new Error('Realtime tests run only against loopback services.');
if (!new URL(database).pathname.endsWith('/atlas_auth_test'))
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
