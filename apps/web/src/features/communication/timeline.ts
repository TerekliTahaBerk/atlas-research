import type { MessageDto, MessageReferenceInput } from '@atlas/core';

/*
 * Pure client-side timeline state. The server is authoritative: messages
 * arrive from pages and cursor backfills, Realtime only hints that a
 * backfill is due. Merging is idempotent (by ID, keeping the highest change
 * cursor), so duplicate, late or replayed events cannot duplicate or regress
 * a message. Pending sends live only in memory and reconcile by client key.
 */
export type SendStatus = 'sending' | 'retrying' | 'failed';
export interface PendingSend {
  clientKey: string;
  channelId: string;
  threadRootId: string | null;
  body: string;
  references: MessageReferenceInput[];
  /** Labels the sender already saw; never sent to the server. */
  labels: string[];
  status: SendStatus;
  error: string | null;
  createdAt: number;
}
export interface Timeline {
  messages: Record<string, MessageDto>;
  /** Highest change cursor fully applied; backfill resumes from here. */
  changeSeq: number;
  /** Older-page cursor (top-level sequence) or null at the beginning. */
  before: number | null;
  pending: PendingSend[];
}
export const emptyTimeline = (): Timeline => ({
  messages: {},
  changeSeq: 0,
  before: null,
  pending: [],
});

export function mergeMessages(
  state: Timeline,
  items: readonly MessageDto[],
  cursor?: { changeSeq?: number; before?: number | null },
): Timeline {
  let messages = state.messages;
  let changed = false;
  const delivered = new Set<string>();
  for (const item of items) {
    const current = messages[item.id];
    if (item.clientKey) delivered.add(item.clientKey);
    // Stale or duplicate events never regress a newer copy.
    if (
      current &&
      (current.changeSeq > item.changeSeq ||
        (current.changeSeq === item.changeSeq &&
          current.version >= item.version))
    )
      continue;
    if (!changed) {
      messages = { ...messages };
      changed = true;
    }
    messages[item.id] = item;
  }
  const pending = delivered.size
    ? state.pending.filter((p) => !delivered.has(p.clientKey))
    : state.pending;
  const changeSeq = Math.max(state.changeSeq, cursor?.changeSeq ?? 0);
  const before =
    cursor && 'before' in cursor ? (cursor.before ?? null) : state.before;
  if (
    !changed &&
    pending === state.pending &&
    changeSeq === state.changeSeq &&
    before === state.before
  )
    return state;
  return { messages, changeSeq, before, pending };
}

export function addPending(state: Timeline, send: PendingSend): Timeline {
  return {
    ...state,
    pending: [
      ...state.pending.filter((p) => p.clientKey !== send.clientKey),
      send,
    ],
  };
}
export function patchPending(
  state: Timeline,
  clientKey: string,
  patch: Partial<Pick<PendingSend, 'status' | 'error'>>,
): Timeline {
  return {
    ...state,
    pending: state.pending.map((p) =>
      p.clientKey === clientKey ? { ...p, ...patch } : p,
    ),
  };
}
export const dropPending = (state: Timeline, clientKey: string): Timeline => ({
  ...state,
  pending: state.pending.filter((p) => p.clientKey !== clientKey),
});

/** Top-level timeline in stable server order. */
export const topLevel = (state: Timeline) =>
  Object.values(state.messages)
    .filter((m) => m.threadRootId === null)
    .sort((a, b) => a.seq - b.seq);
export const repliesOf = (state: Timeline, rootId: string) =>
  Object.values(state.messages)
    .filter((m) => m.threadRootId === rootId)
    .sort((a, b) => a.seq - b.seq);
export const pendingFor = (state: Timeline, threadRootId: string | null) =>
  state.pending.filter((p) => p.threadRootId === threadRootId);
