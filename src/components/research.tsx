"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { api, ApiError } from "@/lib/api";
import type {
  MetadataInput,
  ResearchSource,
  ResearchLibrary,
  ResearchDetail,
  DiscoveryItem,
} from "@/lib/research-types";
import { ResearchActions } from "./collaboration-shared";
import { WorkspaceShell } from "./workspace-shell";
import {
  Failure,
  InlineError,
  Loading,
  Modal,
  Icon,
  ToolbarActions,
  useResource,
} from "./ui";
const PdfReader = dynamic(
  () => import("./research-reader").then((m) => m.PdfReader),
  { ssr: false, loading: () => <Loading /> },
);
export const researchApi = (w: string, p: string) => `/api/research/${w}/${p}`;
export const researchPath = (w: string, p: string) => `/w/${w}/p/${p}`;
export function ResearchScreen({
  w,
  p,
  mode,
  sourceId,
}: {
  w: string;
  p: string;
  mode: "library" | "discover" | "source" | "reader";
  sourceId?: string;
}) {
  const detail = useResource<ResearchDetail>(
    sourceId ? `${researchApi(w, p)}/sources/${sourceId}` : null,
  );
  return (
    <WorkspaceShell
      surface={mode}
      title={
        mode === "discover"
          ? "Research"
          : mode === "reader"
            ? (detail.data?.source.title ?? "PDF Reader")
            : "Library"
      }
    >
      {({ me }) => (
        <ResearchBody
          key={`${w}/${p}/${mode}/${sourceId}`}
          w={w}
          p={p}
          mode={mode}
          sourceId={sourceId}
          userId={me.user.id}
          detail={detail}
        />
      )}
    </WorkspaceShell>
  );
}
function ResearchBody({
  w,
  p,
  mode,
  sourceId,
  userId,
  detail,
}: {
  w: string;
  p: string;
  mode: string;
  sourceId?: string;
  userId: string;
  detail: { data?: ResearchDetail; error?: unknown; reload: () => void };
}) {
  const router = useRouter();
  const base = researchApi(w, p),
    path = researchPath(w, p),
    project = useResource<{
      project: {
        name: string;
        archivedAt: string | null;
        deletedAt: string | null;
      };
      workspace: { archivedAt: string | null };
      role: string;
    }>(`/api/projects/${p}?workspaceId=${w}`);
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [collection, setCollection] = useState(""),
    [tag, setTag] = useState(""),
    [status, setStatus] = useState("");
  const library = useResource<ResearchLibrary>(
    mode === "library" || mode === "source"
      ? `${base}/sources?${new URLSearchParams({ q: query, page: String(page), collection, tag, status })}`
      : null,
  );
  const [add, setAdd] = useState(false),
    [edit, setEdit] = useState(false),
    [upload, setUpload] = useState(false),
    [newCollection, setNewCollection] = useState(false),
    [error, setError] = useState<unknown>();
  const reload = () => {
    library.reload();
    detail.reload();
  };
  useEffect(() => {
    if (library.data && location.hash === "#library-search") {
      document.getElementById("library-search")?.focus();
      history.replaceState(null, "", location.pathname + location.search);
    }
  }, [library.data]);
  if (project.error || library.error || detail.error)
    return (
      <Failure
        error={project.error ?? library.error ?? detail.error}
        retry={() => {
          project.reload();
          reload();
        }}
      />
    );
  if (
    !project.data ||
    (["library", "source"].includes(mode) && !library.data) ||
    (sourceId && !detail.data)
  )
    return <Loading />;
  const canEdit =
    ["owner", "admin", "editor"].includes(project.data.role) &&
    !project.data.project.archivedAt &&
    !project.data.project.deletedAt &&
    !project.data.workspace.archivedAt;
  const s = detail.data?.source;
  return (
    <div
      className={`research-surface ${mode === "reader" ? "reader-surface" : ""}`}
    >
      {mode !== "reader" && (
        <ToolbarActions>
          {mode === "discover" ? (
            <Link className="toolbar-button" href={path + "/sources"}>
              <Icon name="library" />
              Library
            </Link>
          ) : (
            <details className="export-menu">
              <summary className="toolbar-button">
                <Icon name="download" />
                <span>Export</span>
              </summary>
              <div>
                <a href={`${base}/export?format=bib`}>BibTeX ↓</a>
                <a href={`${base}/export?format=ris`}>RIS ↓</a>
              </div>
            </details>
          )}
          {canEdit && (
            <>
              <button
                className="toolbar-button import-button"
                onClick={() => setAdd(true)}
              >
                <Icon name="upload" />
                Import PDF
              </button>
              <button
                className="toolbar-button outlined"
                onClick={() => setAdd(true)}
              >
                <Icon name="plus" />
                Add paper
              </button>
            </>
          )}
        </ToolbarActions>
      )}
      {mode === "reader" && detail.data ? (
        <PdfReader
          w={w}
          p={p}
          detail={detail.data}
          userId={userId}
          canEdit={canEdit}
          reload={detail.reload}
        />
      ) : (
        <>
          <InlineError error={error} />
          {mode === "discover" && (
            <Discovery
              w={w}
              p={p}
              canEdit={canEdit}
              onManual={() => setAdd(true)}
            />
          )}
          {library.data && (
            <div className={`library-layout ${s ? "has-inspector" : ""}`}>
              <aside
                className="collections-pane"
                aria-label="Library collections"
              >
                <button
                  className={!collection && !tag && !status ? "selected" : ""}
                  onClick={() => {
                    setCollection("");
                    setTag("");
                    setStatus("");
                    setPage(0);
                  }}
                >
                  <Icon name="library" />
                  <span>All papers</span>
                </button>
                <button
                  className={status === "reading" ? "selected" : ""}
                  onClick={() => {
                    setStatus("reading");
                    setPage(0);
                  }}
                >
                  <Icon name="book" />
                  <span>Currently reading</span>
                </button>
                <button
                  className={status === "unread" ? "selected" : ""}
                  onClick={() => {
                    setStatus("unread");
                    setPage(0);
                  }}
                >
                  <Icon name="bookmark" />
                  <span>To read</span>
                </button>
                <div className="section-label">
                  Collections
                  {canEdit && (
                    <button
                      aria-label="Create collection"
                      onClick={() => setNewCollection(true)}
                    >
                      <Icon name="plus" />
                    </button>
                  )}
                </div>
                {library.data.collections.map((c) => (
                  <button
                    key={c.id}
                    className={collection === c.id ? "selected" : ""}
                    onClick={() => {
                      setCollection(c.id);
                      setPage(0);
                    }}
                  >
                    <Icon name="folder" />
                    <span>{c.name}</span>
                  </button>
                ))}
                <div className="section-label">Tags</div>
                {library.data.tags.map((t) => (
                  <button
                    key={t}
                    className={tag === t ? "selected" : ""}
                    onClick={() => {
                      setTag(tag === t ? "" : t);
                      setPage(0);
                    }}
                  >
                    <Icon name="tag" />
                    <span>#{t}</span>
                  </button>
                ))}
              </aside>
              <section className="library-main" aria-label="Project library">
                <h1 className="sr-only">Library</h1>
                <div className="library-toolbar">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setQuery(String(new FormData(e.currentTarget).get("q")));
                      setPage(0);
                    }}
                  >
                    <button aria-label="Search library">
                      <Icon name="search" />
                    </button>
                    <input
                      id="library-search"
                      aria-label="Search library"
                      name="q"
                      placeholder="Filter by title, author, tag"
                      defaultValue={query}
                    />
                  </form>
                  <div
                    className="segmented reading-tabs"
                    role="group"
                    aria-label="Reading status"
                  >
                    {[
                      ["", "All"],
                      ["unread", "To read"],
                      ["reading", "Reading"],
                      ["done", "Read"],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        aria-pressed={status === key}
                        onClick={() => {
                          setStatus(key);
                          setPage(0);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <details className="library-filter-menu">
                    <summary className="toolbar-button">
                      <Icon name="filter" />
                      Filters
                    </summary>
                    <div>
                      <label>
                        Collection
                        <select
                          value={collection}
                          onChange={(e) => {
                            setCollection(e.target.value);
                            setPage(0);
                          }}
                        >
                          <option value="">All collections</option>
                          {library.data.collections.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Tag
                        <select
                          value={tag}
                          onChange={(e) => {
                            setTag(e.target.value);
                            setPage(0);
                          }}
                        >
                          <option value="">All tags</option>
                          {library.data.tags.map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                      </label>
                      {canEdit && (
                        <button onClick={() => setNewCollection(true)}>
                          New collection
                        </button>
                      )}
                    </div>
                  </details>
                </div>
                <p className="sr-only">
                  {library.data.items.length} sources on this page
                </p>
                {library.data.items.length === 0 ? (
                  <Empty
                    title={
                      query || collection || tag || status
                        ? "No matching sources"
                        : "Your library is empty"
                    }
                    text="Upload a PDF, add a source, or save papers from Research."
                    action={
                      <>
                        {canEdit && (
                          <button
                            className="ink-button"
                            onClick={() => setAdd(true)}
                          >
                            <Icon name="upload" />
                            Import PDFs
                          </button>
                        )}
                        <Link className="button" href={path + "/discover"}>
                          Search literature
                        </Link>
                      </>
                    }
                  />
                ) : (
                  <div className="paper-list">
                    {library.data.items.map((source) => {
                      const version = library.data!.versions.find(
                          (v) => v.sourceId === source.id && v.fileId,
                        ),
                        reading = library.data!.readings.find(
                          (r) => r.sourceId === source.id,
                        );
                      return (
                        <article
                          className={`paper-row ${s?.id === source.id ? "selected" : ""}`}
                          key={source.id}
                        >
                          <div className="paper-info">
                            <Link
                              className="paper-title"
                              href={`${path}/sources/${source.id}`}
                            >
                              {source.title}
                            </Link>
                            <div className="paper-meta">
                              <span>{authorLine(source)}</span>
                              {source.tags.map((t) => (
                                <button
                                  className="tag-chip"
                                  key={t}
                                  onClick={() => {
                                    setTag(t);
                                    setPage(0);
                                  }}
                                >
                                  #{t}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="paper-actions">
                            {version && (
                              <Link
                                className="row-read"
                                href={`${path}/sources/${source.id}/read`}
                                title="Read PDF"
                              >
                                <Icon name="book" />
                                <span className="sr-only">Read PDF</span>
                              </Link>
                            )}
                            <span
                              className={`reading-badge ${reading?.status ?? "unread"}`}
                            >
                              <i />
                              {reading?.status === "done"
                                ? "Read"
                                : reading?.status === "reading"
                                  ? "Reading"
                                  : "To read"}
                            </span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
                {(page > 0 || library.data.hasMore) && (
                  <div className="pagination">
                    <button
                      disabled={!page}
                      onClick={() => setPage((v) => v - 1)}
                    >
                      Previous
                    </button>
                    <span>Page {page + 1}</span>
                    <button
                      disabled={!library.data.hasMore}
                      onClick={() => setPage((v) => v + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </section>
              {s && detail.data && (
                <aside className="source-inspector" aria-label="Source details">
                  <div className="inspector-heading">
                    <span>Source details</span>
                    <Link
                      className="icon-button"
                      href={path + "/sources"}
                      aria-label="Close source details"
                    >
                      <Icon name="close" />
                    </Link>
                  </div>
                  <h1>{s.title}</h1>
                  <p className="source-authors">{authorLine(s)}</p>
                  {canEdit && (
                    <button
                      className="toolbar-button outlined"
                      onClick={() => setEdit(true)}
                    >
                      Edit details
                    </button>
                  )}
                  <SourceDetails
                    w={w}
                    p={p}
                    detail={detail.data}
                    canEdit={canEdit}
                    onUpload={() => setUpload(true)}
                    reload={detail.reload}
                  />
                </aside>
              )}
            </div>
          )}
        </>
      )}
      {add && (
        <Modal
          title="Add a source"
          onClose={() => {
            setAdd(false);
            reload();
          }}
        >
          <SourceForm
            w={w}
            p={p}
            onSaved={(id) => router.push(`${path}/sources/${id}`)}
          />
        </Modal>
      )}
      {edit && detail.data && (
        <Modal title="Edit source details" onClose={() => setEdit(false)}>
          <SourceForm
            w={w}
            p={p}
            existing={detail.data}
            onSaved={() => {
              setEdit(false);
              reload();
            }}
          />
        </Modal>
      )}
      {upload && s && (
        <Modal
          title="Add a PDF version"
          onClose={() => {
            setUpload(false);
            reload();
          }}
        >
          <UploadVersion
            w={w}
            p={p}
            sourceId={s.id}
            onSaved={(v) =>
              router.push(`${path}/sources/${s.id}/read?version=${v}`)
            }
          />
        </Modal>
      )}
      {newCollection && (
        <Modal title="New collection" onClose={() => setNewCollection(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get("name"));
              try {
                await api(`${base}/collections`, { name });
                setNewCollection(false);
                reload();
              } catch (error) {
                setError(error);
              }
            }}
          >
            <label>
              Collection name
              <input name="name" required maxLength={80} autoFocus />
            </label>
            <button className="primary">Create collection</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
export function authorLine(s: MetadataInput) {
  return [
    s.authors.length
      ? s.authors.slice(0, 4).join(", ") +
        (s.authors.length > 4 ? " et al." : "")
      : "Authors not supplied",
    s.venue,
    s.year,
  ]
    .filter(Boolean)
    .join(" · ");
}
function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="research-empty">
      <span aria-hidden="true">
        <Icon name="library" />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}
function Discovery({
  w,
  p,
  canEdit,
  onManual,
}: {
  w: string;
  p: string;
  canEdit: boolean;
  onManual: () => void;
}) {
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [results, setResults] = useState<{
      items: DiscoveryItem[];
      hasMore: boolean;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [selected, setSelected] = useState<DiscoveryItem | null>(null),
    [saving, setSaving] = useState<string | null>(null);
  async function search(next: number) {
    if (query.trim().length < 2) return;
    setBusy(true);
    setError(undefined);
    try {
      const value = await api<{ items: DiscoveryItem[]; hasMore: boolean }>(
        `${researchApi(w, p)}/discover?${new URLSearchParams({ q: query, page: String(next) })}`,
      );
      setResults(value);
      setPage(next);
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  async function save(item: DiscoveryItem) {
    setSaving(item.providerId);
    setError(undefined);
    try {
      const { providerId: _, existingSourceId: __, ...metadata } = item;
      void _;
      void __;
      const response = await api<{ source: ResearchSource }>(
        `${researchApi(w, p)}/sources`,
        metadata,
      );
      setResults((current) =>
        current
          ? {
              ...current,
              items: current.items.map((i) =>
                i.providerId === item.providerId
                  ? { ...i, existingSourceId: response.source.id }
                  : i,
              ),
            }
          : current,
      );
      setSelected((current) =>
        current?.providerId === item.providerId
          ? { ...current, existingSourceId: response.source.id }
          : current,
      );
    } catch (error) {
      setError(error);
    } finally {
      setSaving(null);
    }
  }
  const saveButton = (item: DiscoveryItem) =>
    item.existingSourceId ? (
      <Link
        className="button"
        href={`${researchPath(w, p)}/sources/${item.existingSourceId}`}
      >
        Open saved source
      </Link>
    ) : (
      <button
        className="primary"
        disabled={!canEdit || saving !== null}
        onClick={() => void save(item)}
      >
        {saving === item.providerId ? "Saving…" : "Save to library"}
      </button>
    );
  return (
    <section className="discovery">
      <h1>What are you researching?</h1>
      <form
        className="discovery-search"
        onSubmit={(e) => {
          e.preventDefault();
          void search(0);
        }}
      >
        <textarea
          rows={2}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search academic papers"
          placeholder="Ask a question, paste a DOI, or describe a method"
          minLength={2}
          maxLength={200}
          required
        />
        <div className="discovery-composer-footer">
          <span className="mode-pill">Literature review</span>
          <span className="provider-label">Crossref</span>
          <button
            className="search-submit ink-button"
            aria-label="Search papers"
            disabled={busy}
          >
            <Icon name="arrow" />
          </button>
        </div>
      </form>
      <p className="provider-note">
        Search scholarly metadata. Add missing details yourself.
      </p>
      <InlineError error={error} />
      {!!error && (
        <div className="actions">
          <button disabled={busy} onClick={() => void search(page)}>
            Try search again
          </button>
          <button onClick={onManual}>Add a source manually</button>
        </div>
      )}
      {busy ? (
        <Loading />
      ) : results?.items.length === 0 ? (
        <Empty
          title="No papers found"
          text="Try a broader query or add your source manually."
          action={<button onClick={onManual}>Add source</button>}
        />
      ) : results ? (
        <>
          <div className="section-heading">
            <h2>Search results</h2>
            <span className="muted">Page {page + 1}</span>
          </div>
          <div className="paper-list">
            {results.items.map((item) => (
              <article
                className="paper-row discovery-row"
                key={item.providerId}
              >
                <div className="paper-glyph" aria-hidden="true">
                  ▤
                </div>
                <div className="paper-info">
                  <button
                    className="paper-title text-button"
                    onClick={() => setSelected(item)}
                  >
                    {item.title}
                  </button>
                  <p>{authorLine(item)}</p>
                  {item.abstract && (
                    <p className="abstract-preview">{item.abstract}</p>
                  )}
                  <span className="muted">DOI {item.doi}</span>
                </div>
                <div className="paper-actions">
                  {saveButton(item)}
                  <button onClick={() => setSelected(item)}>Details</button>
                </div>
              </article>
            ))}
          </div>
          <div className="pagination">
            <button
              disabled={!page || busy}
              onClick={() => void search(page - 1)}
            >
              Previous
            </button>
            <span>Page {page + 1}</span>
            <button
              disabled={!results.hasMore || busy}
              onClick={() => void search(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      ) : null}
      {selected && (
        <Modal title="Paper details" onClose={() => setSelected(null)}>
          <div className="source-summary">
            <h2>{selected.title}</h2>
            <p>{authorLine(selected)}</p>
            <p>
              {selected.abstract || "No abstract was supplied by the provider."}
            </p>
            <a
              href={selected.url ?? undefined}
              target="_blank"
              rel="noreferrer"
            >
              Open DOI ↗
            </a>
            <div className="actions">{saveButton(selected)}</div>
          </div>
        </Modal>
      )}
    </section>
  );
}
export function uploadVersion(
  w: string,
  p: string,
  s: string,
  file: File,
  progress: (n: number) => void,
  uploadId = crypto.randomUUID(),
): Promise<{ versionId: string; duplicate: boolean }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${researchApi(w, p)}/sources/${s}/upload`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", "application/pdf");
    xhr.setRequestHeader("X-Upload-Id", uploadId);
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        progress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onerror = () => reject(new ApiError(0, "NETWORK_ERROR"));
    xhr.onload = () => {
      let data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        reject(new ApiError(xhr.status, "UPLOAD_FAILED"));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        progress(100);
        resolve(data);
      } else
        reject(
          new ApiError(
            xhr.status,
            data.error ?? "UPLOAD_FAILED",
            data.requestId,
          ),
        );
    };
    xhr.send(file);
  });
}
function FilePicker({ onFile }: { onFile: (file: File | null) => void }) {
  return (
    <label className="file-picker">
      PDF document <span className="optional">up to 25 MB · 500 pages</span>
      <input
        type="file"
        accept="application/pdf,.pdf"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}
function UploadProgress({ value }: { value: number }) {
  return (
    <div role="status" className="upload-progress">
      <progress max={100} value={value} />
      <span>
        {value < 100
          ? `Uploading ${value}% · keep this page open`
          : "PDF stored. Preparing text…"}
      </span>
    </div>
  );
}
export function UploadVersion({
  w,
  p,
  sourceId,
  onSaved,
}: {
  w: string;
  p: string;
  sourceId: string;
  onSaved: (v: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState<unknown>();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) return;
        setBusy(true);
        setError(undefined);
        try {
          if (file.size > 25 * 1024 * 1024)
            throw new ApiError(413, "FILE_TOO_LARGE");
          const result = await uploadVersion(w, p, sourceId, file, setProgress);
          onSaved(result.versionId);
        } catch (error) {
          setError(error);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Each different PDF creates an immutable version. Earlier highlights stay
        with their original PDF.
      </p>
      <FilePicker onFile={setFile} />
      {busy && <UploadProgress value={progress} />}
      <InlineError error={error} />
      <button className="primary" disabled={!file || busy}>
        {busy ? "Storing PDF…" : error ? "Retry upload" : "Upload PDF"}
      </button>
    </form>
  );
}
const blankMetadata: MetadataInput = {
  title: "",
  authors: [],
  year: null,
  venue: "",
  doi: null,
  url: null,
  abstract: "",
  provider: "manual",
};
function SourceForm({
  w,
  p,
  existing,
  onSaved,
}: {
  w: string;
  p: string;
  existing?: ResearchDetail;
  onSaved: (id: string) => void;
}) {
  const [meta, setMeta] = useState<MetadataInput>(
      existing ? { ...existing.source, provider: "manual" } : blankMetadata,
    ),
    [authors, setAuthors] = useState(existing?.source.authors.join("; ") ?? ""),
    [tags, setTags] = useState(existing?.source.tags.join(", ") ?? ""),
    [collections, setCollections] = useState(existing?.collectionIds ?? []),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [looking, setLooking] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState<unknown>(),
    [notice, setNotice] = useState(""),
    [createdId, setCreatedId] = useState<string | null>(null);
  const change = (key: keyof MetadataInput, value: unknown) =>
    setMeta((m) => ({ ...m, [key]: value }));
  async function lookup() {
    const doi =
      meta.doi ||
      (/^https?:\/\/(?:dx\.)?doi\.org\//i.test(meta.url ?? "") ? meta.url : "");
    if (!doi) {
      setNotice(
        "DOI lookup supports DOI links. You can add other links manually below.",
      );
      return;
    }
    setLooking(true);
    setError(undefined);
    try {
      const r = await api<{ items: DiscoveryItem[] }>(
        `${researchApi(w, p)}/discover?${new URLSearchParams({ doi })}`,
      );
      if (!r.items[0]) throw new ApiError(404, "PROVIDER_UNAVAILABLE");
      setMeta(r.items[0]);
      setAuthors(r.items[0].authors.join("; "));
      setNotice("Metadata found. Review the details before saving.");
    } catch (error) {
      setError(error);
    } finally {
      setLooking(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const metadata = {
        ...meta,
        authors: authors
          .split(";")
          .map((a) => a.trim())
          .filter(Boolean),
        doi: meta.doi?.trim() || null,
        url: meta.url?.trim() || null,
      };
      if (existing) {
        await api(
          `${researchApi(w, p)}/sources/${existing.source.id}`,
          {
            action: "metadata",
            metadata,
            tags: tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
            collectionIds: collections,
            revision: existing.source.revision,
          },
          "PATCH",
        );
        onSaved(existing.source.id);
      } else {
        if (file && file.size > 25 * 1024 * 1024)
          throw new ApiError(413, "FILE_TOO_LARGE");
        const id =
          createdId ??
          (
            await api<{ source: ResearchSource }>(
              `${researchApi(w, p)}/sources`,
              metadata,
            )
          ).source.id;
        setCreatedId(id);
        if (file) await uploadVersion(w, p, id, file, setProgress);
        onSaved(id);
      }
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="metadata-form">
      <div className="form-pair">
        <label>
          DOI
          <input
            value={meta.doi ?? ""}
            onChange={(e) => change("doi", e.target.value)}
            placeholder="10.… or https://doi.org/…"
            maxLength={250}
          />
        </label>
        <button
          type="button"
          disabled={looking || busy}
          onClick={() => void lookup()}
        >
          {looking ? "Looking up…" : "Find metadata"}
        </button>
      </div>
      <label>
        Article URL
        <input
          type="url"
          value={meta.url ?? ""}
          onChange={(e) => change("url", e.target.value)}
          placeholder="https://…"
          maxLength={2000}
        />
      </label>
      <label>
        Title
        <input
          required
          autoFocus
          value={meta.title}
          onChange={(e) => change("title", e.target.value)}
          maxLength={500}
        />
      </label>
      <label>
        Authors <span className="optional">separate names with semicolons</span>
        <input
          value={authors}
          onChange={(e) => setAuthors(e.target.value)}
          placeholder="Leave empty if unknown"
        />
      </label>
      <div className="form-pair">
        <label>
          Year
          <input
            type="number"
            min={1000}
            max={2200}
            value={meta.year ?? ""}
            onChange={(e) =>
              change("year", e.target.value ? Number(e.target.value) : null)
            }
          />
        </label>
        <label>
          Journal or venue
          <input
            value={meta.venue}
            onChange={(e) => change("venue", e.target.value)}
            maxLength={500}
          />
        </label>
      </div>
      <label>
        Abstract <span className="optional">optional</span>
        <textarea
          rows={4}
          value={meta.abstract}
          onChange={(e) => change("abstract", e.target.value)}
          maxLength={12000}
        />
      </label>
      {existing ? (
        <>
          <label>
            Tags <span className="optional">comma separated</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} />
          </label>
          <fieldset>
            <legend>Collections</legend>
            {existing.collections.length ? (
              existing.collections.map((c) => (
                <label className="check-label" key={c.id}>
                  <input
                    type="checkbox"
                    checked={collections.includes(c.id)}
                    onChange={(e) =>
                      setCollections((all) =>
                        e.target.checked
                          ? [...all, c.id]
                          : all.filter((id) => id !== c.id),
                      )
                    }
                  />
                  {c.name}
                </label>
              ))
            ) : (
              <p className="muted">
                Create a collection from the library first.
              </p>
            )}
          </fieldset>
        </>
      ) : (
        <FilePicker
          onFile={(f) => {
            setFile(f);
            if (f && !meta.title)
              change("title", f.name.replace(/\.pdf$/i, ""));
          }}
        />
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {busy && file && <UploadProgress value={progress} />}
      <InlineError error={error} />
      {createdId && !!error && (
        <Link
          className="button"
          href={`${researchPath(w, p)}/sources/${createdId}`}
        >
          Open saved source
        </Link>
      )}
      <button className="primary" disabled={busy || looking}>
        {busy ? "Saving…" : existing ? "Save source details" : "Add to library"}
      </button>
    </form>
  );
}
function SourceDetails({
  w,
  p,
  detail,
  canEdit,
  onUpload,
  reload,
}: {
  w: string;
  p: string;
  detail: ResearchDetail;
  canEdit: boolean;
  onUpload: () => void;
  reload: () => void;
}) {
  const [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    s = detail.source,
    reading = detail.reading,
    base = `${researchApi(w, p)}/sources/${s.id}`,
    versions = detail.versions.filter((v) => v.fileId),
    latest = versions[0];
  return (
    <div className="source-detail-grid">
      <section className="source-summary">
        <ResearchActions
          w={w}
          p={p}
          id={s.id}
          origin={{ sourceId: s.id }}
          canEdit={canEdit}
        />

        <div className="actions">
          {latest && (
            <Link
              className="button primary"
              href={`${researchPath(w, p)}/sources/${s.id}/read`}
            >
              Read PDF
            </Link>
          )}
          {canEdit && detail.storageAvailable && (
            <button onClick={onUpload}>
              {latest ? "Upload a new PDF version" : "Upload PDF"}
            </button>
          )}
          <label className="reading-control">
            My reading status
            <select
              disabled={busy}
              value={reading?.status ?? "unread"}
              onChange={async (e) => {
                const status = e.target.value;
                setBusy(true);
                try {
                  await api(
                    base,
                    {
                      action: "reading",
                      status,
                      versionId: reading?.versionId ?? latest?.id ?? null,
                      page: reading?.page ?? 1,
                      zoom: reading?.zoom ?? 1,
                      position: reading?.position ?? 0,
                    },
                    "PATCH",
                  );
                  reload();
                } catch (error) {
                  setError(error);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <option value="unread">To read</option>
              <option value="reading">Reading</option>
              <option value="done">Read</option>
            </select>
          </label>
        </div>
        <InlineError error={error} />
        <h2>Abstract</h2>
        <p className="abstract-full">
          {s.abstract ||
            "No abstract yet. Add any known details without guessing missing information."}
        </p>
        <dl className="source-fields">
          <div>
            <dt>DOI</dt>
            <dd>
              {s.doi ? (
                <a
                  href={`https://doi.org/${s.doi}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {s.doi} ↗
                </a>
              ) : (
                "Not supplied"
              )}
            </dd>
          </div>
          <div>
            <dt>Article</dt>
            <dd>
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer">
                  Open article ↗
                </a>
              ) : (
                "Not supplied"
              )}
            </dd>
          </div>
          <div>
            <dt>Tags</dt>
            <dd>
              {s.tags.length ? s.tags.map((t) => "#" + t).join(" ") : "No tags"}
            </dd>
          </div>
          <div>
            <dt>Collections</dt>
            <dd>
              {detail.collections
                .filter((c) => detail.collectionIds.includes(c.id))
                .map((c) => c.name)
                .join(", ") || "Uncollected"}
            </dd>
          </div>
        </dl>
      </section>
      <aside className="version-list">
        <div className="section-heading">
          <h2>PDF versions</h2>
          <span className="count">{versions.length}</span>
        </div>
        {versions.length ? (
          versions.map((v) => {
            const f = detail.files.find((f) => f.id === v.fileId),
              job = detail.jobs.find((j) => j.versionId === v.id);
            return (
              <div key={v.id} className="version-card">
                <strong>Version {v.ordinal}</strong>
                <span className="muted">
                  {f?.filename} · {((f?.bytes ?? 0) / 1024 / 1024).toFixed(2)}{" "}
                  MB
                </span>
                <span>
                  {v.pageCount ? `${v.pageCount} pages · ` : ""}
                  {v.extractionStatus.replaceAll("_", " ")}
                </span>
                {job?.error && (
                  <span className="muted">
                    {job.error === "PASSWORD_PROTECTED"
                      ? "Password protected. Upload an unlocked copy."
                      : job.error === "PAGE_LIMIT"
                        ? "Text processing supports up to 500 pages."
                        : "Text processing could not finish. The PDF may still be readable."}
                  </span>
                )}
                <div className="actions">
                  <Link
                    className="button"
                    href={`${researchPath(w, p)}/sources/${s.id}/read?version=${v.id}`}
                  >
                    Open version
                  </Link>
                  {canEdit &&
                    ["failed", "cancelled"].includes(job?.state ?? "") && (
                      <button
                        onClick={async () => {
                          try {
                            await api(`${base}/versions/${v.id}/retry`, {});
                            reload();
                          } catch (error) {
                            setError(error);
                          }
                        }}
                      >
                        Retry text processing
                      </button>
                    )}
                </div>
              </div>
            );
          })
        ) : (
          <Empty
            title="Metadata saved"
            text="A source can live in your library before you have its PDF."
          />
        )}
        <p className="muted">
          Notes remain attached to the PDF version where they were written.
        </p>
      </aside>
    </div>
  );
}
