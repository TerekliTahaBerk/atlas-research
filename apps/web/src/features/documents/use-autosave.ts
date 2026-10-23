'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { ApiError, artifactCommand } from '@/features/artifacts/client';
import { clearDraft, writeDraft } from './drafts';

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
    attempt: null as { body: string; id: string } | null,
    inflight: false,
    firstDirtyAt: 0,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    retry: 0,
    conflict: false,
  });
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  });

  const saveRef = useRef<() => Promise<void>>(async () => {});
  const save = useCallback(async (): Promise<void> => {
    const s = state.current;
    clearTimeout(s.timer);
    if (!enabled || s.conflict) return;
    if (s.inflight) return;
    const body = s.latest;
    if (body === s.saved) {
      setStatus('saved');
      return;
    }
    // Same content after a failure reuses the request ID (idempotent retry).
    if (!s.attempt || s.attempt.body !== body)
      s.attempt = { body, id: crypto.randomUUID() };
    s.inflight = true;
    setStatus('saving');
    try {
      const result = await artifactCommand({
        command: 'document.save',
        id: documentId,
        expectedRevision: s.revision,
        clientRequestId: s.attempt.id,
        content: JSON.parse(body) as unknown,
      });
      s.inflight = false;
      s.revision = result.revision ?? s.revision;
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
    } catch (e) {
      s.inflight = false;
      const code = e instanceof ApiError ? e.code : 'INTERNAL_ERROR';
      setError(e instanceof Error ? e.message : 'Unable to save.');
      if (code === 'CONFLICT') {
        s.conflict = true;
        setStatus('conflict');
        return;
      }
      setStatus(code === 'NETWORK' ? 'offline' : 'failed');
      // Bounded backoff for transient failures; validation errors wait for edits.
      if (
        code === 'NETWORK' ||
        code === 'RATE_LIMITED' ||
        code === 'INTERNAL_ERROR'
      ) {
        s.retry = Math.min(s.retry + 1, 5);
        s.timer = setTimeout(() => void saveRef.current(), 2000 * 2 ** s.retry);
      }
    }
  }, [actorId, documentId, enabled, projectId]);
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
    (latestRevision: number) => {
      const s = state.current;
      s.conflict = false;
      s.revision = latestRevision;
      s.saved = '';
      s.attempt = null;
      setRevision(latestRevision);
      return save();
    },
    [save],
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
      window.removeEventListener('online', online);
      window.removeEventListener('beforeunload', leave);
      clearTimeout(s.timer);
    };
  }, [save]);

  return { status, revision, error, change, save, saveOnTop, reset };
}
