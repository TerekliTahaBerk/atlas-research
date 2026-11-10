"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigationBlocker } from "./navigation-safety";
import { api, ApiError } from "@/lib/api";
import { cleanDocument, type DocNode } from "@/lib/document-model";
import type { DocumentData, DocumentDetail } from "@/lib/collaboration-types";
export type Draft = { title: string; body: DocNode; revision: number };
type Pending = Draft & {
  action: "save";
  requestId: string;
  checkpoint: boolean;
};
export function useDocumentSave(
  initial: DocumentData,
  endpoint: string,
  userId: string,
  enabled: boolean,
) {
  // Keep the existing recovery key and payload readable across this release.
  const key = `atlas-draft-v1:${userId}:${endpoint}`;
  const [draft, setDraft] = useState<Draft>({
      title: initial.title,
      body: initial.body,
      revision: initial.revision,
    }),
    [status, setStatus] = useState("Saved"),
    [error, setError] = useState<unknown>(),
    [conflict, setConflict] = useState<DocumentDetail | null>(null),
    [generation, setGeneration] = useState(0),
    [dirty, setDirty] = useState(false);
  const current = useRef(draft),
    saved = useRef({ title: initial.title, body: initial.body }),
    pending = useRef<Pending | null>(null),
    flight = useRef<Promise<boolean> | null>(null),
    blocked = useRef(false),
    active = useRef(true),
    allowed = useRef(enabled),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    saveRef = useRef<(checkpoint?: boolean) => Promise<boolean>>(
      async () => false,
    );
  useEffect(() => {
    allowed.current = enabled;
  }, [enabled]);
  const changed = useCallback(
    () =>
      JSON.stringify(saved.current) !==
      JSON.stringify({
        title: current.current.title.trim(),
        body: current.current.body,
      }),
    [],
  );
  const remember = useCallback(() => {
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          ...current.current,
          pending: pending.current,
          at: Date.now(),
        }),
      );
    } catch {
      /* Text remains in memory; no local-save claim. */
    }
  }, [key]);
  const clearLocal = useCallback(() => {
    try {
      sessionStorage.removeItem(key);
    } catch {}
  }, [key]);
  const save = useCallback(
    async (checkpoint = false): Promise<boolean> => {
      if (flight.current) {
        await flight.current;
        return saveRef.current(checkpoint);
      }
      if (!allowed.current) return !changed();
      if (blocked.current) {
        try {
          const remote = await api<DocumentDetail>(endpoint);
          if (active.current) setConflict(remote);
        } catch (e) {
          if (active.current) setError(e);
        }
        return false;
      }
      if (!pending.current && !checkpoint && !changed()) return true;
      if (!navigator.onLine) {
        if (active.current) setStatus("Offline");
        remember();
        return false;
      }
      if (!current.current.title.trim()) {
        setStatus("Save failed");
        setError(new ApiError(400, "INVALID_INPUT"));
        return false;
      }
      const payload = pending.current ?? {
        ...current.current,
        title: current.current.title.trim(),
        action: "save" as const,
        requestId: crypto.randomUUID(),
        checkpoint,
      };
      pending.current = payload;
      remember();
      if (active.current) {
        setStatus("Saving…");
        setError(undefined);
      }
      const work = (async () => {
        try {
          const result = await api<{ revision: number }>(
            endpoint,
            payload,
            "PATCH",
          );
          pending.current = null;
          saved.current = { title: payload.title, body: payload.body };
          current.current = { ...current.current, revision: result.revision };
          const more = changed();
          if (more) remember();
          else clearLocal();
          if (active.current) {
            setDraft(current.current);
            setDirty(more);
            setStatus(more ? "Unsaved changes" : "Saved");
            if (more)
              timer.current = setTimeout(() => void saveRef.current(), 1200);
          }
          return true;
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) blocked.current = true;
          if (active.current) {
            setError(e);
            setStatus(
              blocked.current
                ? "Conflict"
                : navigator.onLine
                  ? "Save failed"
                  : "Offline",
            );
            if (blocked.current)
              try {
                setConflict(await api<DocumentDetail>(endpoint));
              } catch (e) {
                setError(e);
              }
          }
          remember();
          return false;
        }
      })();
      flight.current = work;
      try {
        return await work;
      } finally {
        flight.current = null;
      }
    },
    [changed, clearLocal, endpoint, remember],
  );
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  const flush = useCallback(
    async (checkpoint = false) => {
      if (timer.current) clearTimeout(timer.current);
      // Drain edits typed during a slow acknowledgement before an export or connected action.
      for (let i = 0; i < 8; i++) {
        if (!(await saveRef.current(checkpoint && i === 0))) return false;
        if (!pending.current && !changed()) return true;
      }
      return false;
    },
    [changed],
  );
  useEffect(() => {
    active.current = true;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw && enabled) {
        const local = JSON.parse(raw);
        if (
          local.at > Date.now() - 86400000 &&
          typeof local.title === "string" &&
          Number.isInteger(local.revision)
        ) {
          const body = cleanDocument(local.body);
          current.current = {
            title: local.title,
            body,
            revision: local.revision,
          };
          pending.current = local.pending ?? null;
          blocked.current = true;
          setDraft(current.current);
          setDirty(true);
          setStatus("Recovered draft");
          void api<DocumentDetail>(endpoint).then(setConflict).catch(setError);
        } else clearLocal();
      }
    } catch {
      /* A malformed device draft cannot replace the server content. */
    }
    const online = () => {
      if (!blocked.current) void saveRef.current();
    };
    const offline = () => {
      if (changed() || pending.current) {
        setStatus("Offline");
        remember();
      }
    };
    const leave = (e: BeforeUnloadEvent) => {
      if (changed() || pending.current) {
        remember();
        void saveRef.current();
        e.preventDefault();
      }
    };
    const beforeSignout = (e: Event) => {
      if (changed() || pending.current) {
        remember();
        void saveRef.current();
        e.preventDefault();
      }
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") {
        if (changed()) remember();
        void saveRef.current();
      }
    };
    const shortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("beforeunload", leave);
    window.addEventListener("atlas-before-signout", beforeSignout);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("keydown", shortcut);
    return () => {
      active.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (changed() || pending.current) {
        remember();
        void saveRef.current();
      }
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("beforeunload", leave);
      window.removeEventListener("atlas-before-signout", beforeSignout);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("keydown", shortcut);
    };
    // Initial recovery is account/document scoped. Later edits stay in refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, endpoint]);
  function change(value: Partial<Pick<Draft, "title" | "body">>) {
    if (
      Object.entries(value).every(
        ([k, v]) =>
          JSON.stringify(current.current[k as "title" | "body"]) ===
          JSON.stringify(v),
      )
    )
      return;
    current.current = { ...current.current, ...value };
    setDraft(current.current);
    setDirty(true);
    setStatus(
      blocked.current
        ? "Conflict"
        : navigator.onLine
          ? "Unsaved changes"
          : "Offline",
    );
    remember();
    if (timer.current) clearTimeout(timer.current);
    if (!blocked.current)
      timer.current = setTimeout(() => void saveRef.current(), 1200);
  }
  function resolve(useLocal: boolean) {
    if (!conflict) return;
    const remote = conflict.document;
    pending.current = null;
    blocked.current = false;
    saved.current = { title: remote.title, body: remote.body };
    current.current = useLocal
      ? { ...current.current, revision: remote.revision }
      : { title: remote.title, body: remote.body, revision: remote.revision };
    setDraft(current.current);
    setConflict(null);
    setError(undefined);
    setGeneration((n) => n + 1);
    setDirty(useLocal);
    if (useLocal) {
      remember();
      void saveRef.current(true);
    } else {
      setStatus("Saved");
      clearLocal();
    }
  }
  useNavigationBlocker({
    label:
      "Document changes are not saved. Review the editor or keep the existing private recovery draft.",
    pending: () => changed() || !!pending.current,
    flush: () => flush(),
    recover: () => {
      remember();
      try {
        const raw = JSON.parse(sessionStorage.getItem(key) ?? "null");
        return (
          raw?.at > Date.now() - 60000 &&
          raw.title === current.current.title &&
          JSON.stringify(raw.body) === JSON.stringify(current.current.body)
        );
      } catch {
        return false;
      }
    },
  });
  return {
    draft,
    status,
    error,
    conflict,
    generation,
    dirty,
    change,
    save,
    flush,
    resolve,
    snapshot: () => current.current,
  };
}
