"use client";
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type {
  MetadataInput,
  ResearchSource,
  ResearchDetail,
  DiscoveryItem,
} from "@/lib/research-types";
import { ResearchActions } from "./collaboration-shared";
import { InlineError, Modal, Icon } from "./ui";
export const researchApi = (w: string, p: string) => `/api/research/${w}/${p}`;
export const researchPath = (w: string, p: string) => `/w/${w}/p/${p}`;
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
export function Empty({
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
export function Discovery({
  w,
  p,
  canEdit,
  onManual,
  onSaved,
  libraryQuery,
}: {
  w: string;
  p: string;
  canEdit: boolean;
  onManual: () => void;
  onSaved: () => void;
  libraryQuery: string;
}) {
  const searchParams = useSearchParams(),
    initialQuery = searchParams.get("query") ?? "",
    restored = useRef(false);
  const [query, setQuery] = useState(initialQuery),
    [page, setPage] = useState(0),
    [results, setResults] = useState<{
      items: DiscoveryItem[];
      hasMore: boolean;
      limitReached?: boolean;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [selected, setSelected] = useState<DiscoveryItem | null>(null),
    [saving, setSaving] = useState<string | null>(null);
  const search = useCallback(
    async (next: number) => {
      if (query.trim().length < 2) return;
      setBusy(true);
      setError(undefined);
      try {
        const isDoi =
          /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?10\.\d{4,9}\//i.test(
            query.trim(),
          );
        const value = await api<{
          items: DiscoveryItem[];
          hasMore: boolean;
          limitReached?: boolean;
        }>(
          `${researchApi(w, p)}/discover?${new URLSearchParams({ [isDoi ? "doi" : "q"]: query.trim().replace(/^doi:\s*/i, ""), page: String(next) })}`,
        );
        setResults(value);
        setPage(next);
        const url = new URL(location.href);
        url.searchParams.set("query", query.trim());
        url.searchParams.set("resultPage", String(next));
        history.replaceState(null, "", url);
        window.dispatchEvent(new Event("atlas-location-changed"));
      } catch (error) {
        setError(error);
      } finally {
        setBusy(false);
      }
    },
    [w, p, query],
  );
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (initialQuery)
      queueMicrotask(
        () => void search(Number(searchParams.get("resultPage")) || 0),
      );
  }, [initialQuery, searchParams, search]);
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
      onSaved();
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
        href={`${researchPath(w, p)}/sources?${libraryQuery}&source=${item.existingSourceId}`}
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
      <h2 className="sr-only">Discover papers</h2>
      <form
        className="library-toolbar discover-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          void search(0);
        }}
      >
        <div className="discover-input">
          <Icon name="search" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search academic papers"
            placeholder="Search papers, authors or DOI"
            minLength={2}
            maxLength={200}
            required
          />
          <button
            className="toolbar-button"
            aria-label="Search papers"
            disabled={busy}
          >
            {busy ? "Searching…" : "Search"}
          </button>
        </div>
        <span className="provider-label">Crossref</span>
        {canEdit && (
          <button
            className="toolbar-button outlined"
            type="button"
            onClick={onManual}
          >
            <Icon name="plus" />
            Add source
          </button>
        )}
      </form>
      <InlineError error={error} />
      {!!error && (
        <div className="actions">
          <button disabled={busy} onClick={() => void search(page)}>
            Try search again
          </button>
          <button onClick={onManual}>Add a source manually</button>
        </div>
      )}
      {busy && (
        <span role="status" className="muted">
          Searching scholarly metadata…
        </span>
      )}
      {results?.items.length === 0 ? (
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
                  <Icon name="file" />
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
          {results.limitReached && (
            <p className="notice">
              Crossref browsing limit reached. Refine this search to find more
              relevant papers.
            </p>
          )}
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
      ) : (
        <Empty
          title="Find your next source"
          text="Search scholarly metadata by topic, author or DOI. Save useful papers to this project."
        />
      )}
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
export function SourceForm({
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
  const [baseRevision] = useState(existing?.source.revision);
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
    [createdId, setCreatedId] = useState<string | null>(null),
    [duplicate, setDuplicate] = useState<ResearchSource | null>(null);
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
            revision: baseRevision,
          },
          "PATCH",
        );
        onSaved(existing.source.id);
      } else {
        if (file && file.size > 25 * 1024 * 1024)
          throw new ApiError(413, "FILE_TOO_LARGE");
        let id = createdId;
        if (!id) {
          const result = await api<{
            source: ResearchSource;
            duplicate: boolean;
          }>(`${researchApi(w, p)}/sources`, metadata);
          id = result.source.id;
          if (result.duplicate) {
            setDuplicate(result.source);
            return;
          }
        }
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
      {duplicate && (
        <div className="notice" role="status">
          <strong>Already in this project</strong>
          <p>
            {duplicate.title}
            {duplicate.archivedAt ? " · Archived" : ""}
          </p>
          <button type="button" onClick={() => onSaved(duplicate.id)}>
            Open existing source
          </button>
          {file && !duplicate.archivedAt && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(undefined);
                try {
                  await uploadVersion(w, p, duplicate.id, file, setProgress);
                  onSaved(duplicate.id);
                } catch (e) {
                  setError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Add this PDF to existing source
            </button>
          )}
        </div>
      )}

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
export function SourceDetails({
  w,
  p,
  detail,
  canEdit,
  onUpload,
  reload,
  libraryQuery,
}: {
  w: string;
  p: string;
  detail: ResearchDetail;
  canEdit: boolean;
  onUpload: () => void;
  reload: () => void;
  libraryQuery: string;
}) {
  const [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false),
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
          compact
        />

        <div className="actions">
          {latest && (
            <Link
              className="button primary"
              href={`${researchPath(w, p)}/sources/${s.id}/read?version=${versions.some((v) => v.id === reading?.versionId) ? reading!.versionId : latest.id}&library=${encodeURIComponent(libraryQuery)}`}
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
        <div className="source-references actions">
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  `${s.authors.join(", ")}${s.year ? " (" + s.year + ")." : ""} ${s.title}. ${s.venue}${s.doi ? " https://doi.org/" + s.doi : s.url ? " " + s.url : ""}`,
                );
                setCopied(true);
              } catch (e) {
                setError(e);
              }
            }}
          >
            {copied ? "Reference copied" : "Copy reference"}
          </button>
          <a
            className="button"
            href={`${researchApi(w, p)}/export?format=bib&ids=${s.id}`}
          >
            BibTeX ↓
          </a>
          <a
            className="button"
            href={`${researchApi(w, p)}/export?format=ris&ids=${s.id}`}
          >
            RIS ↓
          </a>
        </div>
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
      <section className="source-annotations">
        <h2>Annotations · {detail.annotations.length}</h2>
        {detail.annotations.length ? (
          <ul>
            {detail.annotations.map((a) => (
              <li key={a.id}>
                <Link
                  href={`${researchPath(w, p)}/sources/${s.id}/read?version=${a.versionId}&page=${a.page}&annotation=${a.id}&library=${encodeURIComponent(libraryQuery)}`}
                >
                  Page {a.page} · {a.kind === "highlight" ? a.quote : a.body}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            Notes and highlights appear here after reading.
          </p>
        )}
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
                    href={`${researchPath(w, p)}/sources/${s.id}/read?version=${v.id}&library=${encodeURIComponent(libraryQuery)}`}
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
          <p className="muted">No PDF yet. Add a copy to read and annotate.</p>
        )}
        <p className="muted">
          Notes remain attached to the PDF version where they were written.
        </p>
      </aside>
    </div>
  );
}
