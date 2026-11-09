"use client";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { flushSync } from "react-dom";
import { api, ApiError } from "@/lib/api";
import {
  citationIds,
  plainDocument,
  documentMarkdown,
  type DocNode,
} from "@/lib/document-model";
import type {
  DocumentData,
  DocumentDetail,
  CitationView,
} from "@/lib/collaboration-types";
import type { ResearchLibrary, ResearchDetail } from "@/lib/research-types";
import { WorkspaceShell } from "./workspace-shell";
import {
  Failure,
  InlineError,
  Loading,
  Modal,
  ToolbarActions,
  useResource,
  Icon,
} from "./ui";
import {
  CreateArtifactDialog,
  ResearchActions,
  collabApi,
  collabPath,
} from "./collaboration-shared";
const RichEditor = dynamic(
  () => import("./document-editor").then((m) => m.RichEditor),
  { ssr: false, loading: () => <p className="muted">Opening editor…</p> },
);
type Draft = { title: string; body: DocNode; revision: number };
type Pending = {
  action: "save";
  requestId: string;
  revision: number;
  title: string;
  body: DocNode;
  checkpoint: boolean;
};
function useDocumentSave(
  initial: DocumentData,
  endpoint: string,
  userId: string,
  enabled: boolean,
) {
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
    inFlight = useRef(false),
    blocked = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    active = useRef(true),
    allowed = useRef(enabled),
    saveRef = useRef<(checkpoint?: boolean) => Promise<void>>(async () => {});
  useEffect(() => {
    allowed.current = enabled;
  }, [enabled]);
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
      /* In-memory input remains; visible state never claims a local save. */
    }
  }, [key]);
  const save = useCallback(
    async (checkpoint = false) => {
      if (!allowed.current || inFlight.current) return;
      if (blocked.current) {
        try {
          setConflict(await api<DocumentDetail>(endpoint));
        } catch (e) {
          setError(e);
        }
        return;
      }
      const d = current.current;
      if (
        !pending.current &&
        !checkpoint &&
        JSON.stringify(saved.current) ===
          JSON.stringify({ title: d.title, body: d.body })
      )
        return;
      if (!navigator.onLine) {
        setStatus("Offline");
        remember();
        return;
      }
      if (!d.title.trim()) {
        setStatus("Save failed");
        setError(new ApiError(400, "INVALID_INPUT"));
        return;
      }
      const payload = pending.current ?? {
        action: "save" as const,
        requestId: crypto.randomUUID(),
        revision: d.revision,
        title: d.title.trim(),
        body: d.body,
        checkpoint,
      };
      pending.current = payload;
      remember();
      inFlight.current = true;
      setStatus("Saving…");
      setError(undefined);
      try {
        const result = await api<{ revision: number }>(
          endpoint,
          payload,
          "PATCH",
        );
        pending.current = null;
        saved.current = { title: payload.title, body: payload.body };
        current.current = { ...current.current, revision: result.revision };
        if (!active.current) return;
        setDraft(current.current);
        const changed =
          JSON.stringify(saved.current) !==
          JSON.stringify({
            title: current.current.title.trim(),
            body: current.current.body,
          });
        setDirty(changed);
        setStatus(changed ? "Unsaved changes" : "Saved");
        if (changed) {
          remember();
          timer.current = setTimeout(() => void saveRef.current(), 1200);
        } else
          try {
            sessionStorage.removeItem(key);
          } catch {}
      } catch (e) {
        if (!active.current) return;
        setError(e);
        if (e instanceof ApiError && e.status === 409) {
          blocked.current = true;
          setStatus("Conflict");
          try {
            setConflict(await api<DocumentDetail>(endpoint));
          } catch (e) {
            setError(e);
          }
        } else setStatus(navigator.onLine ? "Save failed" : "Offline");
        remember();
      } finally {
        inFlight.current = false;
      }
    },
    [endpoint, key, remember],
  );
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    active.current = true;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const local = JSON.parse(raw);
        if (
          local.at > Date.now() - 86400000 &&
          typeof local.title === "string" &&
          local.body
        ) {
          current.current = {
            title: local.title,
            body: local.body,
            revision: local.revision,
          };
          pending.current = local.pending ?? null;
          blocked.current = true;
          setDraft(current.current);
          setDirty(true);
          setStatus("Recovered draft");
          void api<DocumentDetail>(endpoint).then(setConflict).catch(setError);
        } else sessionStorage.removeItem(key);
      }
    } catch {}
    const online = () => {
      if (!blocked.current) void saveRef.current();
    };
    const offline = () => {
      if (
        JSON.stringify(saved.current) !==
        JSON.stringify({
          title: current.current.title,
          body: current.current.body,
        })
      ) {
        setStatus("Offline");
        remember();
      }
    };
    const leave = (e: BeforeUnloadEvent) => {
      if (
        pending.current ||
        JSON.stringify(saved.current) !==
          JSON.stringify({
            title: current.current.title,
            body: current.current.body,
          })
      ) {
        remember();
        e.preventDefault();
      }
    };
    const beforeSignout = (event: Event) => {
      if (
        pending.current ||
        JSON.stringify(saved.current) !==
          JSON.stringify({
            title: current.current.title,
            body: current.current.body,
          })
      ) {
        remember();
        event.preventDefault();
      }
    };
    window.addEventListener("atlas-before-signout", beforeSignout);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("beforeunload", leave);
    return () => {
      active.current = false;
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("atlas-before-signout", beforeSignout);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("beforeunload", leave);
    };
    // Initialization is scoped to the account/document; editor changes stay in refs.
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
    setGeneration((v) => v + 1);
    setDirty(useLocal);
    if (useLocal) {
      remember();
      void saveRef.current(true);
    } else {
      setStatus("Saved");
      try {
        sessionStorage.removeItem(key);
      } catch {}
    }
  }
  return {
    draft,
    status,
    error,
    conflict,
    generation,
    dirty,
    change,
    save,
    resolve,
  };
}
export function DocumentsScreen({
  w,
  p,
  id,
}: {
  w: string;
  p: string;
  id?: string;
}) {
  return (
    <WorkspaceShell title={id ? "Document" : "Documents"} surface="documents">
      {({ me }) =>
        id ? (
          <DocumentPage
            key={`${me.user.id}/${id}`}
            w={w}
            p={p}
            id={id}
            userId={me.user.id}
          />
        ) : (
          <DocumentList w={w} p={p} />
        )
      }
    </WorkspaceShell>
  );
}
function DocumentList({ w, p }: { w: string; p: string }) {
  const [archived, setArchived] = useState(false),
    [creating, setCreating] = useState(false),
    data = useResource<{ items: DocumentData[]; canEdit: boolean }>(
      collabApi(w, p) + "/documents" + (archived ? "?archived=true" : ""),
    );
  return (
    <div className="collab-list-page">
      <ToolbarActions>
        {data.data?.canEdit && (
          <button className="toolbar-button" onClick={() => setCreating(true)}>
            <Icon name="plus" />
            New document
          </button>
        )}
      </ToolbarActions>
      <div className="collab-list-heading">
        <h1>Documents</h1>
        <label className="compact-check">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          Archived
        </label>
      </div>
      {data.error ? (
        <Failure error={data.error} retry={data.reload} />
      ) : !data.data ? (
        <Loading />
      ) : (
        <div className="collab-rows">
          {!data.data.items.length && (
            <div className="empty">
              <Icon name="note" />
              <h2>
                {archived
                  ? "No archived documents"
                  : "Write from your research"}
              </h2>
              <p>
                Open a source or PDF note to keep its context, or start a
                document.
              </p>
              {data.data.canEdit && (
                <button onClick={() => setCreating(true)}>New document</button>
              )}
            </div>
          )}
          {data.data.items.map((d) => (
            <Link
              className="collab-row"
              href={collabPath(w, p) + "/docs/" + d.id}
              key={d.id}
            >
              <Icon name="note" />
              <span>
                <strong>{d.title}</strong>
                <small>
                  Revision {d.revision} ·{" "}
                  {new Date(d.updatedAt).toLocaleString()}
                </small>
              </span>
              <Icon name="arrow" />
            </Link>
          ))}
        </div>
      )}
      {creating && (
        <CreateArtifactDialog
          w={w}
          p={p}
          kind="document"
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
function DocumentPage({
  w,
  p,
  id,
  userId,
}: {
  w: string;
  p: string;
  id: string;
  userId: string;
}) {
  const endpoint = collabApi(w, p) + "/documents/" + id,
    data = useResource<DocumentDetail>(endpoint);
  if (data.error) return <Failure error={data.error} retry={data.reload} />;
  if (!data.data) return <Loading />;
  return (
    <DocumentWriting
      w={w}
      p={p}
      endpoint={endpoint}
      detail={data.data}
      reload={data.reload}
      userId={userId}
    />
  );
}
function DocumentTitle({
  value,
  readOnly,
  onChange,
}: {
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const resize = () => {
      node.style.height = "auto";
      node.style.height = node.scrollHeight + "px";
    };
    resize();
    let width = node.clientWidth;
    const observer = new ResizeObserver(() => {
      if (node.clientWidth !== width) {
        width = node.clientWidth;
        resize();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className="document-title"
      aria-label="Document title"
      value={value}
      maxLength={300}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value.replaceAll("\n", " "))}
    />
  );
}
function DocumentWriting({
  w,
  p,
  endpoint,
  detail,
  reload,
  userId,
}: {
  w: string;
  p: string;
  endpoint: string;
  detail: DocumentDetail;
  reload: () => void;
  userId: string;
}) {
  const state = useDocumentSave(
      detail.document,
      endpoint,
      userId,
      detail.canEdit,
    ),
    [citations, setCitations] = useState(detail.citations),
    [picker, setPicker] = useState(false),
    [history, setHistory] = useState(false),
    [preview, setPreview] = useState<{
      revision: number;
      title: string;
      body: DocNode;
      id: string;
    } | null>(null),
    [actionError, setActionError] = useState<unknown>(),
    insertRef = useRef<((id: string) => void) | null>(null),
    [restoring, setRestoring] = useState(false);
  const used = citationIds(state.draft.body).flatMap(
    (id) => citations.find((c) => c.id === id) ?? [],
  );
  async function archive() {
    setActionError(undefined);
    try {
      await api(
        endpoint,
        {
          action: "archive",
          revision: state.draft.revision,
          archived: !detail.document.archivedAt,
        },
        "PATCH",
      );
      location.reload();
    } catch (e) {
      setActionError(e);
    }
  }
  async function restore() {
    if (!preview) return;
    setRestoring(true);
    try {
      await api(
        endpoint,
        {
          action: "restore",
          requestId: crypto.randomUUID(),
          revision: state.draft.revision,
          versionId: preview.id,
        },
        "PATCH",
      );
      location.reload();
    } catch (e) {
      setActionError(e);
    } finally {
      setRestoring(false);
    }
  }
  return (
    <div className="document-screen">
      <ToolbarActions>
        <span
          className="save-indicator"
          role="status"
          aria-live="polite"
          data-state={state.status}
        >
          {detail.canEdit
            ? state.status
            : detail.document.archivedAt
              ? "Archived"
              : "Read only"}
        </span>
        <button
          className="toolbar-button"
          onClick={() => {
            reload();
            setHistory(true);
          }}
        >
          History
        </button>
        <a className="toolbar-button" href={endpoint + "/export"}>
          Export Markdown
        </a>
      </ToolbarActions>
      <div className="document-scroll">
        <article className="document-page">
          <div className="document-meta">
            <Icon name="note" />
            Research document · revision {state.draft.revision}
          </div>
          <DocumentTitle
            value={state.draft.title}
            readOnly={!detail.canEdit}
            onChange={(title) => state.change({ title })}
          />
          <div className="document-actions">
            {detail.canEdit && (
              <>
                <button onClick={() => setPicker(true)}>
                  <Icon name="book" />
                  Add citation
                </button>
                <button onClick={() => void state.save(true)}>
                  Save checkpoint
                </button>
              </>
            )}
            {detail.canManage && !state.dirty && (
              <button onClick={archive}>
                {detail.document.archivedAt
                  ? "Restore document"
                  : "Archive document"}
              </button>
            )}
          </div>
          {(state.status === "Save failed" || state.status === "Offline") && (
            <div className="save-warning" role="alert">
              <p>
                {state.status === "Offline"
                  ? "No connection. Your text is still here."
                  : "Saving failed. Your text is still here."}
              </p>
              <button onClick={() => void state.save()}>Retry save</button>
            </div>
          )}
          <InlineError error={state.error} />
          <InlineError error={actionError} />
          <RichEditor
            key={state.generation}
            initial={state.draft.body}
            editable={detail.canEdit && !state.conflict}
            onChange={(body) => state.change({ body })}
            citations={citations}
            insertRef={insertRef}
          />
          {used.length > 0 && (
            <section className="document-references">
              <h2>References</h2>
              {used.map((c, i) => (
                <p key={c.id}>
                  <span>[{i + 1}] </span>
                  <Link href={c.href}>
                    {c.authors.join("; ")} ({c.year ?? "n.d."}). {c.title}.
                  </Link>{" "}
                  {c.venue}
                  {c.doi ? " · DOI: " + c.doi : ""}
                  {c.page ? " · p. " + c.page : ""}
                  {c.archived && <strong> · Archived/removed target</strong>}
                </p>
              ))}
            </section>
          )}
          <ResearchActions
            w={w}
            p={p}
            id={detail.document.id}
            canEdit={detail.canEdit}
          />
        </article>
      </div>
      {picker && (
        <CitationPicker
          w={w}
          p={p}
          endpoint={endpoint}
          onClose={() => setPicker(false)}
          onInsert={(all) => {
            const added = all.find(
              (c) => !citations.some((old) => old.id === c.id),
            );
            flushSync(() => setCitations(all));
            if (added) insertRef.current?.(added.id);
            setPicker(false);
          }}
        />
      )}
      {history && (
        <Modal
          title="Version history"
          onClose={() => {
            setHistory(false);
            setPreview(null);
          }}
        >
          <p className="muted">
            Automatic checkpoints at most once per minute; Save checkpoint keeps
            a named point now. Current writing is saved independently.
          </p>
          <div className="version-list">
            {detail.versions.map((v) => (
              <button
                key={v.id}
                onClick={async () => {
                  try {
                    const r = await api<{ version: typeof preview }>(
                      endpoint + "/versions/" + v.id,
                    );
                    setPreview(r.version);
                  } catch (e) {
                    setActionError(e);
                  }
                }}
              >
                Revision {v.revision} · {new Date(v.createdAt).toLocaleString()}
              </button>
            ))}
          </div>
          {preview && (
            <>
              <h3>
                {preview.title} · revision {preview.revision}
              </h3>
              <RichEditor
                key={preview.id}
                initial={preview.body}
                editable={false}
                citations={citations}
              />
              {detail.canEdit && (
                <button disabled={state.dirty || restoring} onClick={restore}>
                  Restore as a new revision
                </button>
              )}
              {state.dirty && (
                <p>Save your current changes before restoring.</p>
              )}
            </>
          )}
          <InlineError error={actionError} />
        </Modal>
      )}
      {state.conflict && (
        <ConflictDialog
          local={state.draft}
          remote={state.conflict.document}
          resolve={state.resolve}
        />
      )}
    </div>
  );
}
function ConflictDialog({
  local,
  remote,
  resolve,
}: {
  local: Draft;
  remote: DocumentData;
  resolve: (local: boolean) => void;
}) {
  function download(title: string, body: DocNode) {
    const u = URL.createObjectURL(
      new Blob(["# " + title + "\n\n" + documentMarkdown(body, new Map())], {
        type: "text/markdown",
      }),
    );
    const a = document.createElement("a");
    a.href = u;
    a.download = "atlas-recovered-draft.md";
    a.click();
    URL.revokeObjectURL(u);
  }
  return (
    <Modal title="Recover your writing" dismissible={false} onClose={() => {}}>
      <p>
        Your draft and the server revision are kept below. Review both before
        continuing; no automatic overwrite was made.
      </p>
      <div className="conflict-columns">
        <label>
          Your draft
          <textarea
            aria-label="Your draft"
            readOnly
            value={local.title + "\n\n" + plainDocument(local.body)}
          />
          <button onClick={() => download(local.title, local.body)}>
            Download my draft
          </button>
        </label>
        <label>
          Server · revision {remote.revision}
          <textarea
            aria-label="Server copy"
            readOnly
            value={remote.title + "\n\n" + plainDocument(remote.body)}
          />
          <button onClick={() => download(remote.title, remote.body)}>
            Download server copy
          </button>
        </label>
      </div>
      <div className="actions">
        <button onClick={() => resolve(true)}>Keep my draft and resume</button>
        <button onClick={() => resolve(false)}>Use server version</button>
      </div>
      <p className="muted">
        Keeping your draft creates a new revision and preserves the server
        content in history. Local recovery belongs to this account, tab and
        document and expires after 24 hours.
      </p>
    </Modal>
  );
}
function CitationPicker({
  w,
  p,
  endpoint,
  onClose,
  onInsert,
}: {
  w: string;
  p: string;
  endpoint: string;
  onClose: () => void;
  onInsert: (all: CitationView[]) => void;
}) {
  const [q, setQ] = useState(""),
    [source, setSource] = useState(""),
    [version, setVersion] = useState(""),
    [annotation, setAnnotation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  const library = useResource<ResearchLibrary>(
      `/api/research/${w}/${p}/sources?q=${encodeURIComponent(q)}`,
    ),
    detail = useResource<ResearchDetail>(
      source ? `/api/research/${w}/${p}/sources/${source}` : null,
    );
  return (
    <Modal title="Add source citation" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            const all = await api<CitationView[]>(endpoint + "/citations", {
              sourceId: source,
              ...(version ? { versionId: version } : {}),
              ...(annotation ? { annotationId: annotation } : {}),
            });
            onInsert(all);
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Find a source
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search this project’s library"
          />
        </label>
        <label>
          Source
          <select
            aria-label="Source"
            required
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setVersion("");
              setAnnotation("");
            }}
          >
            <option value="">Choose a source…</option>
            {library.data?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        {detail.data && (
          <>
            <label>
              Source version
              <select
                aria-label="Source version"
                value={version || detail.data.versions[0]?.id || ""}
                onChange={(e) => {
                  setVersion(e.target.value);
                  setAnnotation("");
                }}
              >
                {detail.data.versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    Version {v.ordinal} · {v.fileId ? "PDF" : "Metadata only"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              PDF note (optional)
              <select
                aria-label="PDF note (optional)"
                value={annotation}
                onChange={(e) => setAnnotation(e.target.value)}
              >
                <option value="">Source citation without a page locator</option>
                {detail.data.annotations
                  .filter(
                    (a) =>
                      a.versionId === (version || detail.data!.versions[0]?.id),
                  )
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      p. {a.page} · {(a.body || a.quote).slice(0, 100)}
                    </option>
                  ))}
              </select>
            </label>
          </>
        )}
        <InlineError error={error} />
        <button className="primary" disabled={!source || busy}>
          Insert citation
        </button>
      </form>
    </Modal>
  );
}
