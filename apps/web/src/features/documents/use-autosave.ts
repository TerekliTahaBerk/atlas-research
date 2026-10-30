'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { ApiError, artifactCommand } from '@/features/artifacts/client';
import { clearDraft, writeDraft } from './drafts';

/** Only a confirmed result acknowledges a server response for this attempt.
 * Unchanged is a local no-op; neither in-flight nor cancelled confirms a write.
 */
export type SaveResult =
  | {
      kind: 'confirmed';
      revision: number;
      current: boolean;
      unchanged: boolean;
    }
  | { kind: 'unchanged'; revision: number }
  | { kind: 'in-flight' }
  | { kind: 'cancelled' }
  | { kind: 'disabled' }
  | { kind: 'conflict'; message: string }
  | { kind: 'uncertain'; code: string; message: string }
  | { kind: 'failed'; code: string; message: string };

export type SaveStatus =
  'saved' | 'unsaved' | 'saving' | 'offline' | 'failed' | 'conflict';
export const saveLabels: Record<SaveStatus, string> = {
  saved: 'Saved',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  offline: 'Offline · changes kept on this device',
  failed: 'Save failed · changes kept on this device',
  conflict: 'Conflict · someone saved a newer revision',
};
/** Debounce after the last keystroke, and a ceiling while typing continues. */
export const AUTOSAVE_DEBOUNCE_MS = 1500;
export const AUTOSAVE_MAX_WAIT_MS = 10000;

/**
 * Debounced autosave with the revision as an optimistic-concurrency token.
 * `Saved` appears only after the server confirms the commit. A retry of the
 * same content reuses its request ID, so a lost response can never create a
 * duplicate revision. Conflicts stop autosave and keep the local draft.
 */
export function useAutosave({
  actorId,
  projectId,
  documentId,
  revision: initialRevision,
  initialContent,
  enabled,
  onSaved,
}: {
  actorId: string;
  projectId: string;
  documentId: string;
  revision: number;
  initialContent: JSONContent;
  enabled: boolean;
  onSaved?: (revision: number) => void;
}) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [revision, setRevision] = useState(initialRevision);
  const [error, setError] = useState('');
  const state = useRef({
    revision: initialRevision,
    latest: JSON.stringify(initialContent),
    saved: JSON.stringify(initialContent),
    attempt: null as {
      body: string;
      id: string;
      revision: number;
      uncertain: boolean;
      minimumRevision: number;
    } | null,
    inflight: false,
    firstDirtyAt: 0,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    retry: 0,
    conflict: false,
  });
  const onSavedRef = useRef(onSaved);
  const lifetime = useRef({ active: false });
  useEffect(() => {
    onSavedRef.current = onSaved;
  });

  const saveRef = useRef<() => Promise<SaveResult>>(async () => ({
    kind: 'cancelled',
  }));
  const save = useCallback(
    async (minimumRevision = 0): Promise<SaveResult> => {
      const s = state.current;
      const pending = lifetime.current;
      clearTimeout(s.timer);
      if (!pending.active) return { kind: 'cancelled' };
      if (!enabled) return { kind: 'disabled' };
      if (s.inflight) return { kind: 'in-flight' };
      if (s.conflict)
        return {
          kind: 'conflict',
          message: 'Review the latest revision before saving your draft.',
        };
      const body = s.latest;
      if (body === s.saved && !s.attempt?.uncertain) {
        setStatus('saved');
        return { kind: 'unchanged', revision: s.revision };
      }
      // Same content after a failure reuses the request ID (idempotent retry).
      if (!s.attempt || s.attempt.body !== body)
        s.attempt = {
          body,
          id: crypto.randomUUID(),
          revision: s.revision,
          uncertain: false,
          minimumRevision,
        };
      const attempt = s.attempt;
      attempt.minimumRevision = Math.max(
        attempt.minimumRevision,
        minimumRevision,
      );
      s.inflight = true;
      setStatus('saving');
      try {
        const result = await artifactCommand({
          command: 'document.save',
          id: documentId,
          expectedRevision: attempt.revision,
          clientRequestId: attempt.id,
          content: JSON.parse(body) as unknown,
        });
        s.inflight = false;
        if (!pending.active) return { kind: 'cancelled' };
        if (
          result.id !== documentId ||
          result.revision === undefined ||
          result.revision < attempt.revision ||
          (result.revision === attempt.revision &&
            !result.unchanged &&
            !result.replayed)
        )
          throw new ApiError(
            'The save response did not confirm a revision.',
            'INTERNAL_ERROR',
            0,
          );
        // A replay can confirm an older commit that another writer has since
        // superseded. Keep the draft and require another explicit review.
        if (result.revision < attempt.minimumRevision) {
          s.attempt = null;
          s.conflict = true;
          setStatus('conflict');
          const message =
            'Your earlier save was confirmed, but a newer revision exists. Compare revisions before saving again.';
          setError(message);
          return { kind: 'conflict', message };
        }
        s.revision = result.revision;
        s.saved = body;
        s.attempt = null;
        s.retry = 0;
        s.firstDirtyAt = 0;
        setRevision(s.revision);
        setError('');
        onSavedRef.current?.(s.revision);
        if (s.latest === body) {
          clearDraft(actorId, projectId, documentId);
          setStatus('saved');
        } else {
          setStatus('unsaved');
          s.timer = setTimeout(
            () => void saveRef.current(),
            AUTOSAVE_DEBOUNCE_MS,
          );
        }
        return {
          kind: 'confirmed',
          revision: s.revision,
          current: s.latest === body,
          unchanged: result.unchanged === true,
        };
      } catch (e) {
        s.inflight = false;
        if (!pending.active) return { kind: 'cancelled' };
        const code = e instanceof ApiError ? e.code : 'INTERNAL_ERROR';
        const message = e instanceof Error ? e.message : 'Unable to save.';
        setError(message);
        // A definite rejection resolves the earlier uncertainty as well.
        attempt.uncertain = code === 'NETWORK' || code === 'INTERNAL_ERROR';
        if (code === 'CONFLICT') {
          s.conflict = true;
          setStatus('conflict');
          return { kind: 'conflict', message };
        }
        // A lost/unreadable response or server failure may follow a commit.
        // Retain the complete attempt for an exact idempotent retry.
        setStatus(code === 'NETWORK' ? 'offline' : 'failed');
        // Bounded backoff for transient failures; validation errors wait for edits.
        if (
          code === 'NETWORK' ||
          code === 'RATE_LIMITED' ||
          code === 'INTERNAL_ERROR'
        ) {
          s.retry = Math.min(s.retry + 1, 5);
          s.timer = setTimeout(
            () => void saveRef.current(),
            2000 * 2 ** s.retry,
          );
        }
        return attempt.uncertain
          ? {
              kind: 'uncertain',
              code,
              message:
                'Save could not be confirmed. Your draft is kept on this device; retry or check version history.',
            }
          : { kind: 'failed', code, message };
      }
    },
    [actorId, documentId, enabled, projectId],
  );
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const change = useCallback(
    (content: JSONContent) => {
      const s = state.current;
      const body = JSON.stringify(content);
      if (body === s.latest) return;
      s.latest = body;
      // Kept locally until the server confirms; never authoritative.
      writeDraft(actorId, projectId, documentId, {
        content,
        baseRevision: s.revision,
      });
      if (s.conflict) return;
      setStatus((current) => (current === 'saving' ? current : 'unsaved'));
      const now = Date.now();
      if (!s.firstDirtyAt) s.firstDirtyAt = now;
      clearTimeout(s.timer);
      const wait =
        now - s.firstDirtyAt >= AUTOSAVE_MAX_WAIT_MS ? 0 : AUTOSAVE_DEBOUNCE_MS;
      s.timer = setTimeout(() => void save(), wait);
    },
    [actorId, documentId, projectId, save],
  );

  /**
   * Explicit, user-confirmed conflict resolution: save the local draft as a
   * new revision on top of `latestRevision`. The other person's revision
   * stays in history; nothing is silently overwritten.
   */
  const saveOnTop = useCallback(
    async (latestRevision: number): Promise<SaveResult> => {
      const s = state.current;
      if (!lifetime.current.active) return { kind: 'cancelled' };
      if (!enabled) return { kind: 'disabled' };
      // Do not rebase or replace the identity of a dispatched request.
      if (s.inflight) return { kind: 'in-flight' };
      const retry =
        s.attempt?.uncertain && s.attempt.body === s.latest ? s.attempt : null;
      writeDraft(actorId, projectId, documentId, {
        content: JSON.parse(s.latest) as unknown,
        baseRevision: s.revision,
      });
      s.conflict = false;
      s.revision = latestRevision;
      s.saved = '';
      s.attempt = retry;
      return save(latestRevision);
    },
    [actorId, documentId, enabled, projectId, save],
  );
  /** Adopt freshly loaded server content (after restore or reload). */
  const reset = useCallback((nextRevision: number, content: JSONContent) => {
    const s = state.current;
    clearTimeout(s.timer);
    s.conflict = false;
    s.revision = nextRevision;
    s.latest = s.saved = JSON.stringify(content);
    s.attempt = null;
    s.firstDirtyAt = 0;
    setRevision(nextRevision);
    setStatus('saved');
    setError('');
  }, []);

  useEffect(() => {
    const pending = { active: true };
    lifetime.current = pending;
    const online = () => {
      if (state.current.latest !== state.current.saved) void save();
    };
    const leave = (event: BeforeUnloadEvent) => {
      if (state.current.latest !== state.current.saved) event.preventDefault();
    };
    window.addEventListener('online', online);
    window.addEventListener('beforeunload', leave);
    const s = state.current;
    return () => {
      pending.active = false;
      window.removeEventListener('online', online);
      window.removeEventListener('beforeunload', leave);
      clearTimeout(s.timer);
    };
  }, [save]);

  return { status, revision, error, change, save, saveOnTop, reset };
}
