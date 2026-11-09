"use client";
import { PopoverMenu } from "./ui";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { usePageTitle } from "./working-tabs";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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
  Member,
} from "@/lib/collaboration-types";
import type { ResearchLibrary, ResearchDetail } from "@/lib/research-types";
import { WorkspaceShell } from "./workspace-shell";
import { Failure, InlineError, Loading, Modal, useResource, Icon } from "./ui";
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
import type { EditorControls } from "./document-editor";
import { useDocumentSave, type Draft } from "./use-document-save";
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
          <DocumentList
            key={`${me.user.id}/${w}/${p}`}
            w={w}
            p={p}
            userId={me.user.id}
          />
        )
      }
    </WorkspaceShell>
  );
}
type ListItem = Omit<DocumentData, "body"> & { preview: string };
function DocumentList({
  w,
  p,
  userId,
}: {
  w: string;
  p: string;
  userId: string;
}) {
  const search = useSearchParams(),
    storageKey = `atlas-documents:${userId}/${w}/${p}`;
  const [filter, setFilter] = useState(() => {
      let old: Record<string, unknown> = {};
      if (!search.toString() && typeof window !== "undefined")
        try {
          old = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}");
        } catch {}
      return {
        q: (search.get("q") ?? (typeof old.q === "string" ? old.q : "")).slice(
          0,
          200,
        ),
        sort:
          (search.get("sort") ?? old.sort) === "title" ? "title" : "updated",
        archived: (search.get("archived") ?? String(old.archived)) === "true",
        page: Math.max(0, Number(search.get("page") ?? old.page) || 0),
      };
    }),
    [term, setTerm] = useState(filter.q),
    [creating, setCreating] = useState(false),
    [rename, setRename] = useState<ListItem | null>(null),
    [title, setTitle] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  const params = new URLSearchParams({
    q: filter.q,
    sort: filter.sort,
    archived: String(filter.archived),
    page: String(filter.page),
  }).toString();
  useEffect(() => {
    const t = setTimeout(() => setTerm(filter.q), 250);
    return () => clearTimeout(t);
  }, [filter.q]);
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(filter));
    } catch {}
    window.history.replaceState(null, "", collabPath(w, p) + "/docs?" + params);
    window.dispatchEvent(new Event("atlas-location-changed"));
  }, [filter, params, storageKey, w, p]);
  const data = useResource<{
    items: ListItem[];
    total: number;
    pageSize: number;
    canEdit: boolean;
    canManage: boolean;
  }>(
    collabApi(w, p) +
      "/documents?" +
      new URLSearchParams({
        ...Object.fromEntries(new URLSearchParams(params)),
        q: term,
      }),
  );
  async function archive(d: ListItem) {
    setBusy(true);
    setError(undefined);
    try {
      await api(
        collabApi(w, p) + "/documents/" + d.id,
        { action: "archive", revision: d.revision, archived: !filter.archived },
        "PATCH",
      );
      data.reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="documents-library">
      <header className="documents-list-header">
        <div>
          <h1>Documents</h1>
          <p>Research notes and writing in this project</p>
        </div>
        {data.data?.canEdit && (
          <button className="primary" onClick={() => setCreating(true)}>
            <Icon name="plus" /> New document
          </button>
        )}
      </header>
      <div className="documents-list-tools">
        <label className="documents-search">
          <Icon name="search" />
          <input
            aria-label="Search documents"
            placeholder="Search titles and writing…"
            maxLength={200}
            value={filter.q}
            onChange={(e) =>
              setFilter({ ...filter, q: e.target.value, page: 0 })
            }
          />
        </label>
        <select
          aria-label="Sort documents"
          value={filter.sort}
          onChange={(e) =>
            setFilter({ ...filter, sort: e.target.value, page: 0 })
          }
        >
          <option value="updated">Last edited</option>
          <option value="title">Title A–Z</option>
        </select>
        <label className="compact-check">
          <input
            type="checkbox"
            checked={filter.archived}
            onChange={(e) =>
              setFilter({ ...filter, archived: e.target.checked, page: 0 })
            }
          />{" "}
          Archived
        </label>
      </div>
      <InlineError error={error} />
      {data.error ? (
        <Failure error={data.error} retry={data.reload} />
      ) : !data.data ? (
        <Loading />
      ) : (
        <>
          <p className="documents-count">
            {data.data.total} {data.data.total === 1 ? "document" : "documents"}
            {filter.archived ? " · Archived" : ""}
          </p>
          <div className="documents-rows">
            {!data.data.items.length ? (
              <div className="empty">
                <Icon name="note" />
                <h2>
                  {filter.q
                    ? "No matching documents"
                    : filter.page
                      ? "No documents on this page"
                      : filter.archived
                        ? "No archived documents"
                        : "A place for your research writing"}
                </h2>
                <p>
                  {filter.q
                    ? "Try a different title or phrase from the writing."
                    : filter.archived
                      ? "Archived documents can be restored here."
                      : "Start a note, literature review or draft. They stay together in Documents."}
                </p>
                {filter.q || filter.page > 0 ? (
                  <button
                    onClick={() => setFilter({ ...filter, q: "", page: 0 })}
                  >
                    Clear search & return to first page
                  </button>
                ) : (
                  data.data?.canEdit &&
                  !filter.archived && (
                    <button onClick={() => setCreating(true)}>
                      New document
                    </button>
                  )
                )}
              </div>
            ) : (
              data.data.items.map((d) => (
                <div className="documents-row" key={d.id}>
                  <Link
                    href={
                      collabPath(w, p) +
                      "/docs/" +
                      d.id +
                      "?documents=" +
                      encodeURIComponent(params)
                    }
                  >
                    <Icon name="note" />
                    <span>
                      <strong>{d.title}</strong>
                      <span className="document-excerpt">
                        {d.preview || "No writing yet"}
                      </span>
                      <small>
                        Edited {new Date(d.updatedAt).toLocaleString()}
                      </small>
                    </span>
                  </Link>
                  {(data.data?.canEdit || data.data?.canManage) && (
                    <PopoverMenu className="action-menu">
                      <summary
                        className="icon-button"
                        aria-label={`Actions: ${d.title}`}
                      >
                        <Icon name="options" />
                      </summary>
                      <div>
                        {data.data?.canEdit && !filter.archived && (
                          <button
                            onClick={() => {
                              setRename(d);
                              setTitle(d.title);
                              setError(undefined);
                            }}
                          >
                            Rename
                          </button>
                        )}
                        {data.data?.canManage && (
                          <button
                            disabled={busy}
                            onClick={() => void archive(d)}
                          >
                            {filter.archived
                              ? "Restore document"
                              : "Archive document"}
                          </button>
                        )}
                      </div>
                    </PopoverMenu>
                  )}
                </div>
              ))
            )}
          </div>
          {(data.data.total > data.data.pageSize || filter.page > 0) && (
            <nav className="documents-pagination" aria-label="Document pages">
              <button
                disabled={!filter.page}
                onClick={() => setFilter({ ...filter, page: filter.page - 1 })}
              >
                Previous
              </button>
              <span>
                Page {filter.page + 1} of{" "}
                {Math.max(1, Math.ceil(data.data.total / data.data.pageSize))}
              </span>
              <button
                disabled={
                  (filter.page + 1) * data.data.pageSize >= data.data.total
                }
                onClick={() => setFilter({ ...filter, page: filter.page + 1 })}
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
      {creating && (
        <CreateArtifactDialog
          w={w}
          p={p}
          kind="document"
          returnQuery={params}
          onClose={() => setCreating(false)}
        />
      )}
      {rename && (
        <Modal title="Rename document" onClose={() => setRename(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(undefined);
              try {
                const current = await api<DocumentDetail>(
                  collabApi(w, p) + "/documents/" + rename.id,
                );
                await api(
                  collabApi(w, p) + "/documents/" + rename.id,
                  {
                    action: "save",
                    requestId: crypto.randomUUID(),
                    revision: rename.revision,
                    title: title.trim(),
                    body: current.document.body,
                    checkpoint: true,
                  },
                  "PATCH",
                );
                setRename(null);
                data.reload();
              } catch (e) {
                setError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Document title
              <input
                autoFocus
                required
                maxLength={300}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <InlineError error={error} />
            <button className="primary" disabled={busy}>
              Save title
            </button>
          </form>
        </Modal>
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
    data = useResource<DocumentDetail>(endpoint, false, true);
  if (data.error && !data.data)
    return <Failure error={data.error} retry={data.reload} />;
  if (!data.data) return <Loading />;
  return (
    <DocumentWriting
      w={w}
      p={p}
      endpoint={endpoint}
      detail={data.data}
      reload={data.reload}
      userId={userId}
      readError={data.error}
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
const documentNarrowQuery = "(max-width:1199px)";
function subscribeDocumentNarrow(fn: () => void) {
  const m = matchMedia(documentNarrowQuery);
  m.addEventListener("change", fn);
  return () => m.removeEventListener("change", fn);
}
function DocumentWriting({
  w,
  p,
  endpoint,
  detail,
  reload,
  userId,
  readError,
}: {
  readError?: unknown;
  w: string;
  p: string;
  endpoint: string;
  detail: DocumentDetail;
  reload: () => void;
  userId: string;
}) {
  const query = useSearchParams(),
    router = useRouter(),
    narrow = useSyncExternalStore(
      subscribeDocumentNarrow,
      () => matchMedia(documentNarrowQuery).matches,
      () => false,
    );
  const state = useDocumentSave(
      detail.document,
      endpoint,
      userId,
      detail.canEdit,
    ),
    [localCitations, setCitations] = useState<CitationView[]>([]),
    [picker, setPicker] = useState(!!query.get("citeSource") && detail.canEdit),
    [panel, setPanel] = useState<
      "sources" | "outline" | "history" | "related" | null
    >(query.get("citeSource") ? "sources" : null),
    [selectedCitation, setSelectedCitation] = useState<string | null>(null),
    [preview, setPreview] = useState<{
      revision: number;
      title: string;
      body: DocNode;
      id: string;
    } | null>(null),
    [actionError, setActionError] = useState<unknown>(),
    [notice, setNotice] = useState(""),
    [restoring, setRestoring] = useState(false),
    [exporting, setExporting] = useState(false),
    [creating, setCreating] = useState<{
      kind: "task" | "discussion";
      text: string;
    } | null>(null),
    insertRef = useRef<((id: string, quote?: string) => void) | null>(null),
    editorRef = useRef<EditorControls | null>(null),
    restoreRequest = useRef<{
      versionId: string;
      revision: number;
      requestId: string;
    } | null>(null);
  useEffect(() => {
    if (panel) window.dispatchEvent(new Event("atlas-document-tools-open"));
  }, [panel]);
  useEffect(() => {
    const close = () => setPanel(null);
    window.addEventListener("atlas-ai-opened", close);
    return () => window.removeEventListener("atlas-ai-opened", close);
  }, []);
  const members = useResource<{ members: Member[] }>(
    panel === "history" ? `/api/projects/${p}/members?workspaceId=${w}` : null,
  );
  const citations = useMemo(
    () => [
      ...new Map(
        [...localCitations, ...detail.citations].map((c) => [c.id, c]),
      ).values(),
    ],
    [localCitations, detail.citations],
  );
  const used = citationIds(state.draft.body).flatMap(
      (id) => citations.find((c) => c.id === id) ?? [],
    ),
    selected = citations.find((c) => c.id === selectedCitation),
    listUrl =
      collabPath(w, p) +
      "/docs" +
      (query.get("documents") ? "?" + query.get("documents") : "");
  usePageTitle(state.draft.title);
  function closePanel() {
    setPanel(null);
    editorRef.current?.focus();
  }
  function closePicker() {
    setPicker(false);
    const url = new URL(location.href);
    for (const k of ["citeSource", "citeVersion", "citeAnnotation"])
      url.searchParams.delete(k);
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new Event("atlas-location-changed"));
    editorRef.current?.focus();
  }
  async function archive() {
    setActionError(undefined);
    if (!(await state.flush())) return;
    try {
      await api(
        endpoint,
        {
          action: "archive",
          revision: state.snapshot().revision,
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
    if (!preview || !(await state.flush())) return;
    setRestoring(true);
    setActionError(undefined);
    const revision = state.snapshot().revision;
    if (
      restoreRequest.current?.versionId !== preview.id ||
      restoreRequest.current?.revision !== revision
    )
      restoreRequest.current = {
        versionId: preview.id,
        revision,
        requestId: crypto.randomUUID(),
      };
    try {
      await api(
        endpoint,
        { action: "restore", ...restoreRequest.current },
        "PATCH",
      );
      location.reload();
    } catch (e) {
      setActionError(e);
    } finally {
      setRestoring(false);
    }
  }
  async function exportMarkdown() {
    setExporting(true);
    setActionError(undefined);
    setNotice("");
    try {
      if (!(await state.flush())) return;
      const r = await fetch(endpoint + "/export", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!r.ok) throw new ApiError(r.status, "UNAVAILABLE");
      const blob = await r.blob(),
        u = URL.createObjectURL(blob),
        a = document.createElement("a"),
        name = r.headers
          .get("Content-Disposition")
          ?.match(/filename\*=UTF-8''([^;]+)/)?.[1];
      a.href = u;
      a.download = name ? decodeURIComponent(name) : "atlas-document.md";
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
      setNotice(
        "Exported saved revision " +
          (r.headers.get("X-Atlas-Revision") ?? state.snapshot().revision),
      );
    } catch (e) {
      setActionError(e);
    } finally {
      setExporting(false);
    }
  }
  async function createResearch(kind: "task" | "discussion", text = "") {
    if (!(await state.flush())) return;
    setPanel(null);
    setCreating({ kind, text: text ? "Selected passage:\n\n" + text : "" });
  }
  const headings: { title: string; level: number }[] = [];
  function collect(n: DocNode) {
    if (n.type === "heading")
      headings.push({ title: plainDocument(n), level: Number(n.attrs?.level) });
    for (const c of n.content ?? []) collect(c);
  }
  collect(state.draft.body);
  const panelContent = (
    <>
      <div
        className="document-panel-tabs"
        role="group"
        aria-label="Document panels"
      >
        {(["sources", "outline", "history", "related"] as const).map((v) => (
          <button
            key={v}
            aria-pressed={panel === v}
            onClick={() => {
              setPanel(v);
              if (v === "history") reload();
            }}
          >
            {v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
        {!narrow && (
          <button
            className="icon-button"
            aria-label="Close document panel"
            onClick={closePanel}
          >
            <Icon name="close" />
          </button>
        )}
      </div>
      <div className="document-panel-content">
        {panel === "sources" && (
          <>
            {selected && (
              <section className="citation-summary">
                <h2>{selected.title}</h2>
                <p>
                  {selected.authors.join("; ") || "Author not provided"} ·{" "}
                  {selected.year ?? "n.d."}
                </p>
                {selected.venue && <p>{selected.venue}</p>}
                {selected.page && <p>PDF page {selected.page}</p>}
                {selected.quote && <blockquote>{selected.quote}</blockquote>}
                {selected.archived && (
                  <p>
                    Archived source — this citation keeps its original version.
                  </p>
                )}
                {selected.unavailable ? (
                  <p role="status">
                    This source is unavailable. Your writing and reference are
                    retained.
                  </p>
                ) : (
                  <Link href={selected.href} onClick={() => void state.save()}>
                    {selected.page ? "Read PDF location" : "Open source"}{" "}
                    <Icon name="arrow" />
                  </Link>
                )}
              </section>
            )}
            {detail.canEdit && (
              <button
                className="toolbar-button"
                onClick={() => {
                  setPicker((v) => !v);
                  setSelectedCitation(null);
                }}
              >
                <Icon name="plus" />{" "}
                {picker ? "Close source picker" : "Add citation"}
              </button>
            )}
            {picker && detail.canEdit ? (
              <CitationPicker
                w={w}
                p={p}
                endpoint={endpoint}
                embedded
                onClose={closePicker}
                onInsert={(all, includeQuote) => {
                  const added = all.find(
                    (c) => !citations.some((o) => o.id === c.id),
                  );
                  flushSync(() => setCitations(all));
                  if (added)
                    insertRef.current?.(
                      added.id,
                      includeQuote ? added.quote : undefined,
                    );
                  closePicker();
                  if (added) setSelectedCitation(added.id);
                }}
              />
            ) : (
              <>
                <h3>In this writing · {used.length}</h3>
                {used.length ? (
                  used.map((c, i) => (
                    <button
                      className="document-source-row"
                      key={c.id}
                      onClick={() => setSelectedCitation(c.id)}
                      aria-pressed={selectedCitation === c.id}
                    >
                      <span>
                        [{i + 1}] {c.title}
                      </span>
                      <small>
                        {c.authors[0] ?? "Author not provided"} ·{" "}
                        {c.year ?? "n.d."}
                        {c.page ? " · p. " + c.page : ""}
                      </small>
                    </button>
                  ))
                ) : (
                  <p className="muted">
                    Add a source from this project’s Library. PDF notes keep
                    their exact version and page.
                  </p>
                )}
              </>
            )}
          </>
        )}
        {panel === "outline" && (
          <>
            <h2>In this document</h2>
            {headings.length ? (
              headings.map((h, i) => (
                <button
                  className="document-outline-row"
                  key={i}
                  style={{ paddingLeft: 8 + (h.level - 1) * 12 }}
                  onClick={() => {
                    editorRef.current?.heading(i);
                    if (narrow) setPanel(null);
                  }}
                >
                  {h.title || "Untitled heading"}
                </button>
              ))
            ) : (
              <p className="muted">
                Headings in your writing appear here. Use Text style or Insert
                to add one.
              </p>
            )}
          </>
        )}
        {panel === "history" && (
          <>
            <p className="muted">
              Automatic checkpoints are at least a minute apart, or kept when
              the author changes. Current writing saves independently.
            </p>
            {detail.canEdit && (
              <button
                onClick={async () => {
                  await state.flush(true);
                  reload();
                }}
              >
                Save checkpoint
              </button>
            )}
            <div className="version-list">
              {detail.versions.map((v) => (
                <button
                  key={v.id}
                  aria-pressed={preview?.id === v.id}
                  onClick={async () => {
                    try {
                      const r = await api<{
                        version: NonNullable<typeof preview>;
                      }>(endpoint + "/versions/" + v.id);
                      setPreview(r.version);
                    } catch (e) {
                      setActionError(e);
                    }
                  }}
                >
                  Revision {v.revision}
                  <small>
                    {new Date(v.createdAt).toLocaleString()}
                    {v.createdBy
                      ? " · " +
                        (v.createdBy === userId
                          ? "You"
                          : (members.data?.members.find(
                              (m) => m.userId === v.createdBy,
                            )?.name ?? "Project member"))
                      : ""}
                  </small>
                </button>
              ))}
            </div>
            {preview && (
              <section className="document-history-preview">
                <h2>{preview.title}</h2>
                <p>Preview · revision {preview.revision}</p>
                <RichEditor
                  key={preview.id}
                  initial={preview.body}
                  editable={false}
                  citations={citations}
                />
                {detail.canEdit && (
                  <button
                    disabled={state.dirty || restoring}
                    onClick={() => void restore()}
                  >
                    Restore as a new revision
                  </button>
                )}
                {state.dirty && (
                  <p>Save your current writing before restoring.</p>
                )}
              </section>
            )}
          </>
        )}
        {panel === "related" && (
          <ResearchActions
            w={w}
            p={p}
            id={detail.document.id}
            canEdit={false}
          />
        )}
        <InlineError error={actionError} />
      </div>
    </>
  );
  return (
    <div className="document-screen document-experience">
      <div
        className="document-controls"
        role="toolbar"
        aria-label="Document controls"
      >
        <Link
          className="icon-button"
          href={listUrl}
          aria-label="Back to Documents"
          onClick={async (e) => {
            if (state.dirty) {
              e.preventDefault();
              if (await state.flush()) router.push(listUrl);
            }
          }}
        >
          <Icon name="arrow" />
        </Link>
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
        <div className="document-control-spacer" />
        {(["sources", "outline", "history", "related"] as const).map((v) => (
          <button
            className={`toolbar-button document-panel-toggle panel-${v}`}
            key={v}
            aria-pressed={panel === v}
            onClick={() => {
              setPanel(panel === v ? null : v);
              if (v === "history") reload();
            }}
          >
            {v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
        <button
          className="toolbar-button document-export"
          disabled={exporting}
          onClick={() => void exportMarkdown()}
        >
          <Icon name="download" />
          <span>Export Markdown</span>
        </button>
        <PopoverMenu className="action-menu">
          <summary className="icon-button" aria-label="Document options">
            <Icon name="options" />
          </summary>
          <div>
            {(["sources", "outline", "history", "related"] as const).map(
              (v) => (
                <button
                  className="mobile-document-tool"
                  key={v}
                  onClick={() => {
                    setPanel(v);
                    if (v === "history") reload();
                  }}
                >
                  {v[0].toUpperCase() + v.slice(1)}
                </button>
              ),
            )}
            <button disabled={exporting} onClick={() => void exportMarkdown()}>
              Export Markdown
            </button>
            {detail.canEdit && (
              <>
                <button
                  onClick={() => void state.flush(true).then(() => reload())}
                >
                  Save checkpoint
                </button>
                <button
                  onClick={() =>
                    void createResearch(
                      "task",
                      editorRef.current?.selection() ?? "",
                    )
                  }
                >
                  Create task
                </button>
                <button
                  onClick={() =>
                    void createResearch(
                      "discussion",
                      editorRef.current?.selection() ?? "",
                    )
                  }
                >
                  Discuss
                </button>
              </>
            )}
            {detail.canManage && (
              <button onClick={() => void archive()}>
                {detail.document.archivedAt
                  ? "Restore document"
                  : "Archive document"}
              </button>
            )}
          </div>
        </PopoverMenu>
      </div>
      {notice && (
        <p className="document-notice" role="status">
          {notice}
        </p>
      )}
      <div className="document-body-layout">
        <div className="document-scroll">
          <article className="document-page">
            <div className="document-meta">
              <Icon name="note" /> Research document · revision{" "}
              {state.draft.revision}
            </div>
            <DocumentTitle
              value={state.draft.title}
              readOnly={!detail.canEdit}
              onChange={(title) => state.change({ title })}
            />
            {(state.status === "Save failed" || state.status === "Offline") && (
              <div className="save-warning" role="alert">
                <p>
                  {state.status === "Offline"
                    ? "No connection. Your writing is still here."
                    : "Saving failed. Your writing is still here."}
                </p>
                <button onClick={() => void state.flush()}>Retry save</button>
              </div>
            )}
            {!!readError && (
              <div className="save-warning">
                <InlineError error={readError} />
                <button onClick={reload}>Retry refresh</button>
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
              editorRef={editorRef}
              onCitation={() => {
                setPanel("sources");
                setPicker(true);
                setSelectedCitation(null);
              }}
              onCitationSelect={(id) => {
                setSelectedCitation(id);
                setPicker(false);
                setPanel("sources");
              }}
              onResearch={(kind, text) => void createResearch(kind, text)}
            />
            {used.length > 0 && (
              <section className="document-references">
                <h2>References</h2>
                {used.map((c, i) => (
                  <p key={c.id}>
                    <span>[{i + 1}] </span>
                    <Link href={c.href}>
                      {c.authors.join("; ") || "Author not provided"} (
                      {c.year ?? "n.d."}). {c.title}.
                    </Link>{" "}
                    {c.venue}
                    {c.doi ? " · DOI: " + c.doi : ""}
                    {c.page ? " · p. " + c.page : ""}
                    {c.archived && <strong> · Archived/removed target</strong>}
                  </p>
                ))}
              </section>
            )}
          </article>
        </div>
        {panel && !narrow && (
          <aside className="document-panel" aria-label="Document side panel">
            {panelContent}
          </aside>
        )}
      </div>
      {panel && narrow && (
        <Modal title="Document tools" onClose={closePanel}>
          {panelContent}
        </Modal>
      )}
      {creating && (
        <CreateArtifactDialog
          w={w}
          p={p}
          kind={creating.kind}
          initialText={creating.text}
          originId={detail.document.id}
          onClose={() => setCreating(null)}
        />
      )}
      {state.conflict && (
        <ConflictDialog
          local={state.draft}
          remote={state.conflict.document}
          resolve={state.resolve}
          citations={citations}
        />
      )}
    </div>
  );
}
function ConflictDialog({
  local,
  remote,
  resolve,
  citations,
}: {
  citations: CitationView[];
  local: Draft;
  remote: DocumentData;
  resolve: (local: boolean) => void;
}) {
  function download(title: string, body: DocNode) {
    const order = citationIds(body),
      refs = order.flatMap((id) => citations.find((c) => c.id === id) ?? []),
      numbers = new Map(order.map((id, i) => [id, i + 1]));
    const u = URL.createObjectURL(
      new Blob(
        [
          "# " +
            title +
            "\n\n" +
            documentMarkdown(body, numbers) +
            "\n## References\n\n" +
            refs
              .map(
                (c, i) =>
                  `[${i + 1}] ${c.authors.join("; ")} (${c.year ?? "n.d."}). ${c.title}. ${c.page ? "p. " + c.page : ""}\n${c.href}`,
              )
              .join("\n\n"),
        ],
        {
          type: "text/markdown",
        },
      ),
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
  embedded = false,
}: {
  embedded?: boolean;
  w: string;
  p: string;
  endpoint: string;
  onClose: () => void;
  onInsert: (all: CitationView[], includeQuote: boolean) => void;
}) {
  const query = useSearchParams();
  const [q, setQ] = useState(""),
    [source, setSource] = useState(query.get("citeSource") ?? ""),
    [version, setVersion] = useState(query.get("citeVersion") ?? ""),
    [annotation, setAnnotation] = useState(query.get("citeAnnotation") ?? ""),
    [includeQuote, setIncludeQuote] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  const library = useResource<ResearchLibrary>(
      `/api/research/${w}/${p}/sources?q=${encodeURIComponent(q)}`,
    ),
    detail = useResource<ResearchDetail>(
      source ? `/api/research/${w}/${p}/sources/${source}` : null,
    );
  const form = (
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
          onInsert(all, includeQuote);
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
      {annotation &&
        detail.data?.annotations.find((a) => a.id === annotation)?.quote && (
          <label className="check-label">
            <input
              type="checkbox"
              checked={includeQuote}
              onChange={(e) => setIncludeQuote(e.target.checked)}
            />
            Include selected quotation
          </label>
        )}
      <InlineError error={error ?? library.error ?? detail.error} />
      <button className="primary" disabled={!source || busy || !detail.data}>
        Insert citation
      </button>
    </form>
  );
  return embedded ? (
    form
  ) : (
    <Modal title="Add source citation" onClose={onClose}>
      {form}
    </Modal>
  );
}
