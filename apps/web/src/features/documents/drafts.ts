'use client';
/*
 * Bounded interrupted-draft recovery (docs/documents/AUTOSAVE_AND_RECOVERY.md).
 * Browser storage is never authoritative: it only keeps the latest unsaved
 * editor JSON per (actor, project, document) so a crash, offline period or
 * conflict cannot destroy work. Entries expire after seven days, are removed
 * once the server confirms a save, are purged for other accounts on load and
 * on sign-out, and are only ever restored after an explicit user choice.
 */
const PREFIX = 'atlas:draft:v1:';
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 450_000;

export interface StoredDraft {
  content: unknown;
  baseRevision: number;
  savedAt: number;
}
const keyOf = (actorId: string, projectId: string, documentId: string) =>
  `${PREFIX}${actorId}:${projectId}:${documentId}`;
function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
export function writeDraft(
  actorId: string,
  projectId: string,
  documentId: string,
  draft: Omit<StoredDraft, 'savedAt'>,
  now = Date.now(),
) {
  const store = storage();
  if (!store) return false;
  const value = JSON.stringify({ ...draft, savedAt: now });
  if (value.length > MAX_BYTES) return false;
  try {
    store.setItem(keyOf(actorId, projectId, documentId), value);
    return true;
  } catch {
    return false;
  }
}
export function readDraft(
  actorId: string,
  projectId: string,
  documentId: string,
  now = Date.now(),
): StoredDraft | null {
  const store = storage();
  const key = keyOf(actorId, projectId, documentId);
  try {
    const raw = store?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    if (
      typeof parsed.savedAt !== 'number' ||
      typeof parsed.baseRevision !== 'number' ||
      now - parsed.savedAt > DRAFT_TTL_MS ||
      !parsed.content
    ) {
      store?.removeItem(key);
      return null;
    }
    return parsed as StoredDraft;
  } catch {
    store?.removeItem(key);
    return null;
  }
}
export function clearDraft(
  actorId: string,
  projectId: string,
  documentId: string,
) {
  try {
    storage()?.removeItem(keyOf(actorId, projectId, documentId));
  } catch {
    // Storage may be unavailable; nothing to clear.
  }
}
/**
 * Removes expired drafts and every draft belonging to a different account
 * (or all drafts when no account is given, e.g. on sign-out).
 */
export function purgeDrafts(currentActorId?: string, now = Date.now()) {
  const store = storage();
  if (!store) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      const owner = key.slice(PREFIX.length).split(':')[0];
      let expired = true;
      try {
        const parsed = JSON.parse(
          store.getItem(key) ?? '{}',
        ) as Partial<StoredDraft>;
        expired =
          typeof parsed.savedAt !== 'number' ||
          now - parsed.savedAt > DRAFT_TTL_MS;
      } catch {
        expired = true;
      }
      if (!currentActorId || owner !== currentActorId || expired)
        store.removeItem(key);
    }
  } catch {
    // Best effort.
  }
}
