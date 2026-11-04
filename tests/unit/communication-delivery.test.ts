import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MessageChangesDto,
  MessageDto,
} from '../../packages/core/src/index';
import {
  DEGRADED_RECONCILE_MS,
  LIVE_RECONCILE_MS,
  Reconciler,
  reconcileDelay,
  type DeliveryHealth,
} from '@/features/communication/delivery';
import {
  emptyTimeline,
  mergeMessages,
  topLevel,
  type Timeline,
} from '@/features/communication/timeline';

/*
 * A04.1 deterministic regression for lost Realtime delivery. A fake server
 * holds the committed rows; the "socket" is live but never delivers the
 * event (dispatcher failure / dropped broadcast / lost topic.rotated). The
 * subscriber must still converge, exactly once, without any user action.
 */
const channelId = '44444444-4444-4444-8444-444444444444';
const msg = (n: number, over: Partial<MessageDto> = {}): MessageDto => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  channelId,
  projectId: '55555555-5555-4555-8555-555555555555',
  seq: n,
  changeSeq: n,
  threadRootId: null,
  kind: 'USER',
  author: { id: '11111111-1111-4111-8111-111111111111', name: 'Ada' },
  body: `message ${n}`,
  mentions: [],
  references: [],
  reactions: [],
  replyCount: 0,
  lastReplyAt: null,
  version: 1,
  createdAt: '2026-11-04T10:00:00.000Z',
  editedAt: null,
  deleted: false,
  aiRunId: null,
  clientKey: null,
  ...over,
});

function harness(pageSize = 50) {
  const server = {
    rows: [] as MessageDto[],
    topic: 'atlas:channel:c:epoch-1',
    denied: false,
    reads: 0,
    fail: false,
  };
  let state: Timeline = emptyTimeline();
  let subscribed: string | null = server.topic;
  const stale: string[] = [];
  const health: DeliveryHealth[] = [];
  let denied = 0;
  const loop = new Reconciler({
    fetchChanges: async (since): Promise<MessageChangesDto> => {
      server.reads += 1;
      if (server.denied)
        throw Object.assign(new Error('x'), { code: 'NOT_FOUND' });
      if (server.fail) throw Object.assign(new Error('x'), { code: 'NETWORK' });
      const after = server.rows
        .filter((m) => m.changeSeq > since)
        .sort((a, b) => a.changeSeq - b.changeSeq);
      const page = after.slice(0, pageSize);
      const more = after.length > pageSize;
      const head = Math.max(0, ...server.rows.map((m) => m.changeSeq));
      return {
        items: page,
        changeSeq: more ? page.at(-1)!.changeSeq : head,
        more,
        topic: server.topic,
      };
    },
    apply: (page) => {
      state = mergeMessages(state, page.items, { changeSeq: page.changeSeq });
    },
    topic: () => subscribed,
    onTopicStale: (current) => {
      stale.push(current);
      subscribed = current; // the owner re-fetches detail and resubscribes
    },
    onDenied: () => {
      denied += 1;
    },
    onHealth: (h) => health.push(h),
  });
  return {
    server,
    loop,
    stale,
    health,
    get denied() {
      return denied;
    },
    get state() {
      return state;
    },
    get subscribed() {
      return subscribed;
    },
  };
}
const flush = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('A04.1 reconciliation when Realtime events are lost', () => {
  it('a committed message whose event was dropped appears exactly once while the socket stays live', async () => {
    const h = harness();
    h.loop.update('live', false);
    await vi.advanceTimersByTimeAsync(LIVE_RECONCILE_MS);
    expect(h.server.reads).toBe(1);
    expect(h.health).toEqual([]);
    // Another user commits; the dispatcher fails, so no event ever arrives
    // and no later command triggers dispatch.
    h.server.rows.push(msg(1));
    // No focus change, no reconnect: only the bounded live reconcile runs.
    await vi.advanceTimersByTimeAsync(LIVE_RECONCILE_MS - 1);
    expect(topLevel(h.state)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(topLevel(h.state).map((m) => m.body)).toEqual(['message 1']);
    // Visible, non-alarming degraded hint.
    expect(h.health).toEqual(['delayed']);
    // Later passes and a late duplicate event never duplicate it.
    h.loop.hint(1);
    await vi.advanceTimersByTimeAsync(LIVE_RECONCILE_MS * 3);
    expect(topLevel(h.state)).toHaveLength(1);
    expect(h.state.changeSeq).toBe(1);
    expect(h.health.at(-1)).toBe('ok');
    h.loop.stop();
  });

  it('a lost topic.rotated notice is detected from the change page and the topic is refreshed', async () => {
    const h = harness();
    h.loop.update('live', false);
    // A member was removed: the epoch rotated but the notice was dropped,
    // so this client still listens on the superseded topic.
    h.server.topic = 'atlas:channel:c:epoch-2';
    h.server.rows.push(msg(1));
    await vi.advanceTimersByTimeAsync(LIVE_RECONCILE_MS);
    expect(h.stale).toEqual(['atlas:channel:c:epoch-2']);
    expect(h.subscribed).toBe('atlas:channel:c:epoch-2');
    expect(topLevel(h.state)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(LIVE_RECONCILE_MS);
    expect(h.stale).toHaveLength(1);
    h.loop.stop();
  });

  it('revocation discovered by reconciliation stops content and reports denial', async () => {
    const h = harness();
    h.loop.update('live', false);
    h.server.rows.push(msg(1));
    await vi.advanceTimersByTimeAsync(LIVE_RECONCILE_MS);
    h.server.denied = true;
    h.server.rows.push(msg(2, { body: 'post-revocation secret' }));
    await vi.advanceTimersByTimeAsync(LIVE_RECONCILE_MS);
    expect(h.denied).toBe(1);
    expect(Object.values(h.state.messages).map((m) => m.body)).not.toContain(
      'post-revocation secret',
    );
    h.loop.stop();
  });

  it('drains multi-page backlogs in cursor order without gaps or duplicates', async () => {
    const h = harness(7);
    h.loop.update('reconnecting', false);
    for (let n = 1; n <= 30; n += 1) h.server.rows.push(msg(n));
    // An edit of message 3 is a later change of the same row.
    h.server.rows.push(msg(3, { changeSeq: 31, version: 2, body: 'edited' }));
    h.server.rows.splice(2, 1);
    await vi.advanceTimersByTimeAsync(DEGRADED_RECONCILE_MS);
    const timeline = topLevel(h.state);
    expect(timeline.map((m) => m.seq)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
    expect(timeline[2]?.body).toBe('edited');
    expect(h.state.changeSeq).toBe(31);
    h.loop.stop();
  });

  it('is bounded: one request in flight, paused while hidden, resumed when visible', async () => {
    const h = harness();
    expect(reconcileDelay('live', false)).toBe(LIVE_RECONCILE_MS);
    expect(reconcileDelay('offline', false)).toBe(DEGRADED_RECONCILE_MS);
    expect(reconcileDelay('live', true)).toBeNull();
    h.loop.update('live', true);
    await vi.advanceTimersByTimeAsync(LIVE_RECONCILE_MS * 10);
    expect(h.server.reads).toBe(0);
    h.server.rows.push(msg(1));
    h.loop.update('live', false); // tab visible again: immediate resync
    await flush();
    expect(h.server.reads).toBe(1);
    expect(topLevel(h.state)).toHaveLength(1);
    // Ten concurrent triggers coalesce into the running pass plus one.
    const calls = Array.from({ length: 10 }, () => h.loop.run('command'));
    await Promise.all(calls);
    expect(h.server.reads).toBe(3);
    // Ten minutes live: at most one read per interval.
    const before = h.server.reads;
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(h.server.reads - before).toBeLessThanOrEqual(
      (10 * 60_000) / LIVE_RECONCILE_MS,
    );
    h.loop.stop();
  });

  it('a caller awaiting run() observes changes committed before it called, even mid-flight', async () => {
    const h = harness();
    h.loop.update('live', false);
    const first = h.loop.run('resync');
    h.server.rows.push(msg(1)); // committed after the first fetch started
    await h.loop.run('command');
    await first;
    expect(topLevel(h.state)).toHaveLength(1);
    h.loop.stop();
  });

  it('network failures keep the cursor and retry on the next pass', async () => {
    const h = harness();
    h.loop.update('offline', false);
    h.server.rows.push(msg(1));
    h.server.fail = true;
    await vi.advanceTimersByTimeAsync(DEGRADED_RECONCILE_MS);
    expect(topLevel(h.state)).toHaveLength(0);
    h.server.fail = false;
    await vi.advanceTimersByTimeAsync(DEGRADED_RECONCILE_MS);
    expect(topLevel(h.state)).toHaveLength(1);
    expect(h.denied).toBe(0);
    h.loop.stop();
  });
});
