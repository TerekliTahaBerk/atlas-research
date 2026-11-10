"use client";
import {
  useEffect,
  useRef,
  useState,
  useMemo,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type {
  ResearchLibrary,
  ResearchDetail,
  ResearchSource,
} from "@/lib/research-types";
import {
  Discovery,
  SourceForm,
  SourceDetails,
  UploadVersion,
  authorLine,
  Empty,
  researchApi,
  researchPath,
} from "./research-source";
import {
  Failure,
  InlineError,
  Loading,
  Modal,
  Icon,
  PopoverMenu,
  useResource,
} from "./ui";
const readingLabels: Record<string, string> = {
  unread: "To read",
  reading: "Reading",
  done: "Read",
};
const narrowQuery = "(max-width:899px)";
function subscribeNarrow(fn: () => void) {
  const media = matchMedia(narrowQuery);
  media.addEventListener("change", fn);
  return () => media.removeEventListener("change", fn);
}
function getNarrow() {
  return matchMedia(narrowQuery).matches;
}
const serverNarrow = () => false;
export function LibraryExperience({
  w,
  p,
  userId,
  initialSourceId,
}: {
  w: string;
  p: string;
  userId: string;
  initialSourceId?: string;
}) {
  const narrow = useSyncExternalStore(subscribeNarrow, getNarrow, serverNarrow);
  const urlParams = useSearchParams();
  const [rememberedQuery, setRememberedQuery] = useState(() => {
    try {
      return location.search
        ? ""
        : (sessionStorage.getItem(`atlas-library:${userId}:${w}:${p}`) ?? "");
    } catch {
      return "";
    }
  });
  const params = useMemo(
      () => (urlParams.size ? urlParams : new URLSearchParams(rememberedQuery)),
      [urlParams, rememberedQuery],
    ),
    router = useRouter(),
    base = researchApi(w, p),
    path = researchPath(w, p) + "/sources";
  const view = params.get("view") === "discover" ? "discover" : "library";
  const query = params.get("q") ?? "",
    collection = params.get("collection") ?? "",
    tag = params.get("tag") ?? "",
    status = params.get("status") ?? "",
    sort = params.get("sort") ?? "added",
    pdf = params.get("pdf") ?? "",
    year = params.get("year") ?? "",
    archived = params.get("archived") === "true";
  const page = Math.max(0, Number(params.get("page")) || 0),
    sourceId = params.get("source") ?? initialSourceId;
  const filterQuery = new URLSearchParams({
    q: query,
    collection,
    tag,
    status,
    sort,
    pdf,
    year,
    page: String(page),
    archived: String(archived),
  }).toString();
  // Retain rows during same-project refreshes. This component is keyed by account/workspace/project.
  const library = useResource<ResearchLibrary>(
    `${base}/sources?${filterQuery}`,
    true,
  );
  const detail = useResource<ResearchDetail>(
    sourceId ? `${base}/sources/${sourceId}` : null,
  );
  const project = useResource<{
    project: {
      name: string;
      archivedAt: string | null;
      deletedAt: string | null;
    };
    workspace: { archivedAt: string | null };
    role: string;
  }>(`/api/projects/${p}?workspaceId=${w}`);
  const [add, setAdd] = useState(false),
    [edit, setEdit] = useState(false),
    [upload, setUpload] = useState(false),
    [collectionDialog, setCollectionDialog] = useState<{
      id?: string;
      name: string;
    } | null>(null),
    [error, setError] = useState<unknown>(),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [bulkAction, setBulkAction] = useState(""),
    [rail, setRail] = useState(false);
  const scroller = useRef<HTMLElement>(null),
    panel = useRef<HTMLElement>(null),
    closedSource = useRef<string | undefined>(undefined);
  const storageKey = `atlas-library:${userId}:${w}:${p}`,
    scrollKey = storageKey + ":scroll:" + filterQuery;
  const canEdit =
    !!project.data &&
    ["owner", "admin", "editor"].includes(project.data.role) &&
    !project.data.project.archivedAt &&
    !project.data.project.deletedAt &&
    !project.data.workspace.archivedAt;
  const canArchive = canEdit && ["owner", "admin"].includes(project.data!.role);
  const hasLibrary = !!library.data,
    hasDetail = !!detail.data;
  const filtersActive = !!(query || collection || tag || status || pdf || year);
  function update(values: Record<string, string>, reset = true) {
    const next = new URLSearchParams(params.toString());
    setRememberedQuery("");
    if (reset) {
      next.delete("page");
      setSelected([]);
    }
    for (const [key, value] of Object.entries(values))
      if (value) next.set(key, value);
      else next.delete(key);
    history.replaceState(null, "", path + "?" + next);
    window.dispatchEvent(new Event("atlas-location-changed"));
    setError(undefined);
    setNotice("");
  }
  function closeSource() {
    closedSource.current = sourceId;
    update({ source: "" }, false);
    if (initialSourceId)
      router.replace(
        path + "?" + params.toString().replace(/(^|&)source=[^&]*/g, ""),
      );
  }
  function reload() {
    library.reload();
    detail.reload();
    window.dispatchEvent(new Event("atlas-research-changed"));
  }
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, filterQuery);
    } catch {}
  }, [storageKey, filterQuery]);
  useEffect(() => {
    if (!hasLibrary || library.refreshing) return;
    const el = scroller.current;
    if (!el) return;
    try {
      el.scrollTop = Number(sessionStorage.getItem(scrollKey)) || 0;
    } catch {}
    if (location.hash === "#library-search")
      document.getElementById("library-search")?.focus();
  }, [scrollKey, library.refreshing, hasLibrary]);
  useEffect(() => {
    if (sourceId) {
      panel.current?.focus();
      return;
    }
    if (closedSource.current)
      document
        .getElementById("source-" + closedSource.current)
        ?.focus({ preventScroll: true });
  }, [sourceId, hasDetail, narrow]);
  useEffect(() => {
    const el = panel.current;
    if (!el || !sourceId) return;
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (
        e.key === "Escape" &&
        document.querySelector('details[name="atlas-popover"][open]')
      )
        return;
      if (e.key === "Escape") {
        e.preventDefault();
        el.querySelector<HTMLAnchorElement>(
          '[aria-label="Close source details"]',
        )?.click();
      }
      if (e.key === "Tab" && matchMedia("(max-width:899px)").matches) {
        const nodes = [
          ...el.querySelectorAll<HTMLElement>(
            'a[href],button:not([disabled]),input,select,textarea,[tabindex="0"]',
          ),
        ].filter((n) => n.getClientRects().length);
        const first = nodes[0],
          last = nodes.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === el)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sourceId, hasDetail]);
  useEffect(() => {
    if (!narrow || !sourceId) return;
    const nodes = [
      ...document.querySelectorAll<HTMLElement>(
        ".topbar,.sidebar,.library-tabs,.ai-panel",
      ),
    ].map((node) => ({ node, inert: node.inert }));
    nodes.forEach(({ node }) => {
      node.inert = true;
    });
    return () =>
      nodes.forEach(({ node, inert }) => {
        node.inert = inert;
      });
  }, [narrow, sourceId]);
  async function bulk(
    action: string,
    extra: Record<string, string> = {},
    ids = selected,
  ) {
    setBusy(true);
    setError(undefined);
    setNotice("");
    try {
      const r = await api<{ count: number }>(base + "/sources/bulk", {
        action,
        ids,
        ...extra,
      });
      setNotice(`${r.count} ${r.count === 1 ? "source" : "sources"} updated`);
      setBulkAction("");
      if (action === "archive" || action === "restore") setSelected([]);
      reload();
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (project.error || library.error)
    return (
      <Failure
        error={project.error ?? library.error}
        retry={() => {
          project.reload();
          library.reload();
        }}
      />
    );
  if (!library.data || !project.data) return <Loading />;
  const data = library.data,
    source = detail.data?.source;
  const context =
    filterQuery +
    "&view=" +
    view +
    (params.get("query")
      ? "&query=" +
        encodeURIComponent(params.get("query")!) +
        "&resultPage=" +
        (params.get("resultPage") ?? "0")
      : "");
  const sourceHref = (id: string) => path + "?" + context + "&source=" + id;
  const readerHref = (s: ResearchSource) => {
    const versions = data.versions.filter(
        (v) => v.sourceId === s.id && v.fileId,
      ),
      r = data.readings.find((r) => r.sourceId === s.id),
      version = versions.find((v) => v.id === r?.versionId) ?? versions[0];
    return `${path}/${s.id}/read?version=${version?.id ?? ""}&library=${encodeURIComponent(context)}`;
  };
  const chips: [string, string][] = [
    ["q", query && `Search: ${query}`],
    ["status", status && readingLabels[status]],
    [
      "collection",
      collection &&
        `Collection: ${data.collections.find((c) => c.id === collection)?.name ?? "Unavailable"}`,
    ],
    ["tag", tag && `#${tag}`],
    ["pdf", pdf && (pdf === "yes" ? "With PDF" : "Without PDF")],
    ["year", year && `Year: ${year}`],
  ];
  const railContent = (
    <>
      <button
        className={
          !status && !collection && !tag && !archived ? "selected" : ""
        }
        onClick={() =>
          update({ collection: "", tag: "", status: "", archived: "" })
        }
      >
        <Icon name="library" />
        <span>All sources</span>
        <small>{data.counts.all}</small>
      </button>
      {Object.entries(readingLabels).map(([key, label]) => (
        <button
          key={key}
          className={status === key && !archived ? "selected" : ""}
          onClick={() =>
            update({ status: status === key ? "" : key, archived: "" })
          }
        >
          <Icon
            name={
              key === "reading" ? "book" : key === "done" ? "check" : "bookmark"
            }
          />
          <span>{label}</span>
          <small>{data.counts[key as "unread" | "reading" | "done"]}</small>
        </button>
      ))}
      <div className="section-label">
        Collections
        {canEdit && (
          <button
            aria-label="Create collection"
            onClick={() => setCollectionDialog({ name: "" })}
          >
            <Icon name="plus" />
          </button>
        )}
      </div>
      {!data.collections.length && (
        <p className="rail-hint">Group sources by topic.</p>
      )}
      {data.collections.map((c) => (
        <div key={c.id} className="collection-entry">
          <button
            className={collection === c.id ? "selected" : ""}
            onClick={() =>
              update({
                collection: collection === c.id ? "" : c.id,
                archived: "",
              })
            }
          >
            <Icon name="folder" />
            <span>{c.name}</span>
            <small>{c.count ?? 0}</small>
          </button>
          {canEdit && (
            <button
              className="collection-manage"
              aria-label={`Manage ${c.name}`}
              onClick={() => setCollectionDialog({ id: c.id, name: c.name })}
            >
              <Icon name="options" />
            </button>
          )}
        </div>
      ))}
      <div className="section-label">Tags</div>
      {data.tags.map((t) => (
        <button
          key={t}
          className={tag === t ? "selected" : ""}
          onClick={() => update({ tag: tag === t ? "" : t, archived: "" })}
        >
          <Icon name="tag" />
          <span>#{t}</span>
        </button>
      ))}
      {!data.tags.length && (
        <p className="rail-hint">Add tags from a source or selection.</p>
      )}
      {canArchive && (
        <button
          className={archived ? "selected archive-rail" : "archive-rail"}
          onClick={() =>
            update({
              archived: archived ? "" : "true",
              collection: "",
              tag: "",
              status: "",
              page: "",
            })
          }
        >
          <Icon name="folder" />
          <span>Archived</span>
          <small>{data.counts.archived}</small>
        </button>
      )}
    </>
  );
  return (
    <div className="research-surface library-experience">
      <div className="library-tabs" aria-label="Library views">
        <h1 className="sr-only">Library</h1>
        <button
          aria-pressed={view === "library"}
          onClick={() => update({ view: "", source: "" }, false)}
        >
          My Library
        </button>
        <button
          aria-pressed={view === "discover"}
          onClick={() => update({ view: "discover", source: "" }, false)}
        >
          Discover
        </button>
        <span className="library-project" title={project.data.project.name}>
          Project · {project.data.project.name}
        </span>
      </div>
      <div className={`library-layout ${sourceId ? "has-inspector" : ""}`}>
        <aside className="collections-pane" aria-label="Library collections">
          {railContent}
        </aside>
        <section
          ref={scroller}
          className="library-main"
          aria-label="Project library"
          onScroll={(e) => {
            try {
              sessionStorage.setItem(
                scrollKey,
                String(e.currentTarget.scrollTop),
              );
            } catch {}
          }}
        >
          {view === "discover" ? (
            <Discovery
              w={w}
              p={p}
              canEdit={canEdit}
              onManual={() => setAdd(true)}
              onSaved={reload}
              libraryQuery={context}
            />
          ) : (
            <>
              <div className="library-toolbar">
                <button
                  className="toolbar-button rail-toggle"
                  aria-label="Collections and reading filters"
                  onClick={() => setRail(true)}
                >
                  <Icon name="panel" />
                </button>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    update({
                      q: String(new FormData(e.currentTarget).get("q")).trim(),
                    });
                  }}
                >
                  <button aria-label="Search library">
                    <Icon name="search" />
                  </button>
                  <input
                    key={query}
                    id="library-search"
                    name="q"
                    aria-label="Search library"
                    placeholder="Title, author, DOI or tag"
                    defaultValue={query}
                    maxLength={200}
                  />
                </form>
                <select
                  className="compact-sort"
                  aria-label="Sort sources"
                  value={sort}
                  onChange={(e) => update({ sort: e.target.value })}
                >
                  <option value="added">Recently added</option>
                  <option value="edited">Recently edited</option>
                  <option value="title">Title A–Z</option>
                  <option value="year">Newest publication</option>
                </select>
                <PopoverMenu className="library-filter-menu">
                  <summary className="toolbar-button">
                    <Icon name="filter" />
                    Filters
                  </summary>
                  <div>
                    <label>
                      Reading status
                      <select
                        aria-label="Reading status"
                        value={status}
                        onChange={(e) => update({ status: e.target.value })}
                      >
                        <option value="">Any status</option>
                        {Object.entries(readingLabels).map(([v, l]) => (
                          <option value={v} key={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Collection
                      <select
                        aria-label="Collection"
                        value={collection}
                        onChange={(e) => update({ collection: e.target.value })}
                      >
                        <option value="">All collections</option>
                        {data.collections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Tag
                      <select
                        aria-label="Tag"
                        value={tag}
                        onChange={(e) => update({ tag: e.target.value })}
                      >
                        <option value="">All tags</option>
                        {data.tags.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      PDF availability
                      <select
                        aria-label="PDF availability"
                        value={pdf}
                        onChange={(e) => update({ pdf: e.target.value })}
                      >
                        <option value="">Any source</option>
                        <option value="yes">With PDF</option>
                        <option value="no">Without PDF</option>
                      </select>
                    </label>
                    <label>
                      Publication year
                      <select
                        aria-label="Publication year"
                        value={year}
                        onChange={(e) => update({ year: e.target.value })}
                      >
                        <option value="">Any year</option>
                        {data.years.map((y) => (
                          <option key={y}>{y}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </PopoverMenu>
                <PopoverMenu className="export-menu">
                  <summary
                    className="toolbar-button"
                    aria-label="Export all project sources"
                  >
                    <Icon name="download" />
                  </summary>
                  <div>
                    <span>All active project sources</span>
                    <a href={`${base}/export?format=bib`}>BibTeX ↓</a>
                    <a href={`${base}/export?format=ris`}>RIS ↓</a>
                  </div>
                </PopoverMenu>
                {canEdit && (
                  <button
                    className="toolbar-button outlined library-add"
                    onClick={() => setAdd(true)}
                  >
                    <Icon name="plus" />
                    Add source
                  </button>
                )}
              </div>
              {filtersActive && (
                <div className="library-chips" aria-label="Active filters">
                  {chips
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <button
                        key={k}
                        onClick={() => update({ [k]: "" })}
                        aria-label={`Remove ${v}`}
                      >
                        {v}
                        <Icon name="close" />
                      </button>
                    ))}
                  <button
                    onClick={() =>
                      update({
                        q: "",
                        collection: "",
                        tag: "",
                        status: "",
                        pdf: "",
                        year: "",
                      })
                    }
                  >
                    Clear filters
                  </button>
                </div>
              )}
              <InlineError error={error} />
              <span role="status" className="library-notice">
                {busy ? "Saving…" : notice}
              </span>
              <div className="library-selection">
                <label className="compact-check">
                  <input
                    type="checkbox"
                    aria-label="Select all sources on this page"
                    disabled={!data.items.length || library.refreshing || busy}
                    checked={
                      !!data.items.length &&
                      data.items.every((s) => selected.includes(s.id))
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? data.items.map((s) => s.id) : [],
                      )
                    }
                  />
                  {selected.length
                    ? `${selected.length} selected on this page`
                    : `${data.total} ${data.total === 1 ? "source" : "sources"}${archived ? " · Archived" : ""}`}
                </label>
                {!!selected.length && (
                  <>
                    <select
                      aria-label="Bulk action"
                      value={bulkAction}
                      disabled={busy}
                      onChange={(e) => setBulkAction(e.target.value)}
                    >
                      <option value="">Actions…</option>
                      {!archived && (
                        <option value="reading">My reading status</option>
                      )}
                      {canEdit && !archived && (
                        <>
                          <option value="collection-add">
                            Add to collection
                          </option>
                          <option value="collection-remove">
                            Remove from collection
                          </option>
                          <option value="tag-add">Add tag</option>
                          <option value="tag-remove">Remove tag</option>
                        </>
                      )}
                      {canArchive && (
                        <option value={archived ? "restore" : "archive"}>
                          {archived ? "Restore sources" : "Archive sources"}
                        </option>
                      )}
                    </select>
                    <a
                      className="toolbar-button"
                      href={`${base}/export?format=bib&ids=${selected.join(",")}`}
                    >
                      BibTeX
                    </a>
                    <a
                      className="toolbar-button"
                      href={`${base}/export?format=ris&ids=${selected.join(",")}`}
                    >
                      RIS
                    </a>
                    <button
                      className="toolbar-button"
                      onClick={() => setSelected([])}
                    >
                      Clear selection
                    </button>
                  </>
                )}
                <span className="muted">
                  {library.refreshing
                    ? "Updating…"
                    : data.hasMore || page > 0
                      ? `Page ${page + 1}`
                      : ""}
                </span>
              </div>
              <div aria-busy={library.refreshing}>
                {!data.items.length ? (
                  <Empty
                    title={
                      filtersActive
                        ? "No matching sources"
                        : archived
                          ? "No archived sources"
                          : "No sources yet"
                    }
                    text={
                      filtersActive
                        ? "Try fewer filters or a broader search."
                        : archived
                          ? "Archived sources can be restored here."
                          : "Save a paper from Discover or add a source."
                    }
                    action={
                      filtersActive ? (
                        <button
                          onClick={() =>
                            update({
                              q: "",
                              collection: "",
                              tag: "",
                              status: "",
                              pdf: "",
                              year: "",
                            })
                          }
                        >
                          Clear filters
                        </button>
                      ) : (
                        <button onClick={() => update({ view: "discover" })}>
                          Discover papers
                        </button>
                      )
                    }
                  />
                ) : (
                  <div className="paper-list">
                    {data.items.map((s) => {
                      const version = data.versions.find(
                          (v) => v.sourceId === s.id && v.fileId,
                        ),
                        reading = data.readings.find(
                          (r) => r.sourceId === s.id,
                        ),
                        cs = data.collections.filter((c) =>
                          data.links.some(
                            (l) =>
                              l.sourceId === s.id && l.collectionId === c.id,
                          ),
                        );
                      return (
                        <article
                          key={s.id}
                          className={`paper-row ${sourceId === s.id ? "selected" : ""}`}
                          onClick={(e) => {
                            if (
                              !(e.target as HTMLElement).closest(
                                "a,button,input,select,summary,details",
                              )
                            )
                              update({ source: s.id }, false);
                          }}
                        >
                          <input
                            className="paper-select"
                            type="checkbox"
                            aria-label={`Select ${s.title}`}
                            checked={selected.includes(s.id)}
                            disabled={busy || library.refreshing}
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? [...new Set([...selected, s.id])]
                                  : selected.filter((id) => id !== s.id),
                              )
                            }
                          />
                          <div className="paper-info">
                            <Link
                              id={"source-" + s.id}
                              className="paper-title"
                              href={sourceHref(s.id)}
                              scroll={false}
                            >
                              {s.title}
                            </Link>
                            <div className="paper-meta">
                              <span className="paper-bibliography">
                                {authorLine(s)}
                              </span>
                              <span className="file-state">
                                {!version
                                  ? "Metadata only"
                                  : version.extractionStatus === "ready"
                                    ? "PDF ready"
                                    : ["failed", "protected"].includes(
                                          version.extractionStatus,
                                        )
                                      ? "PDF · needs attention"
                                      : version.extractionStatus ===
                                          "image_only"
                                        ? "PDF · no text"
                                        : "PDF · processing"}
                              </span>
                            </div>
                            {(s.tags.length > 0 || cs.length > 0) && (
                              <div className="paper-labels">
                                {cs.slice(0, 2).map((c) => (
                                  <button
                                    className="tag-chip"
                                    key={c.id}
                                    onClick={() => update({ collection: c.id })}
                                  >
                                    <Icon name="folder" />
                                    {c.name}
                                  </button>
                                ))}
                                {cs.length > 2 && (
                                  <span>+{cs.length - 2} collections</span>
                                )}
                                {s.tags.slice(0, 3).map((t) => (
                                  <button
                                    className="tag-chip"
                                    key={t}
                                    onClick={() => update({ tag: t })}
                                  >
                                    #{t}
                                  </button>
                                ))}
                                {s.tags.length > 3 && (
                                  <span>+{s.tags.length - 3} tags</span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="paper-actions">
                            <span
                              className={`reading-badge ${reading?.status ?? "unread"}`}
                            >
                              <i />
                              {readingLabels[reading?.status ?? "unread"]}
                            </span>
                            <Link
                              className="row-read"
                              href={version ? readerHref(s) : sourceHref(s.id)}
                              title={version ? "Read PDF" : "Source details"}
                              aria-label={
                                version
                                  ? `Read PDF: ${s.title}`
                                  : `Details: ${s.title}`
                              }
                            >
                              <Icon name={version ? "book" : "file"} />
                            </Link>
                            <PopoverMenu className="action-menu">
                              <summary
                                className="icon-button"
                                aria-label={`Actions: ${s.title}`}
                              >
                                <Icon name="options" />
                              </summary>
                              <div>
                                <Link href={sourceHref(s.id)}>
                                  Source details
                                </Link>
                                {!archived &&
                                  Object.entries(readingLabels).map(
                                    ([k, l]) => (
                                      <button
                                        key={k}
                                        disabled={busy}
                                        onClick={() =>
                                          void bulk("reading", { status: k }, [
                                            s.id,
                                          ])
                                        }
                                      >
                                        Mark {l.toLowerCase()}
                                      </button>
                                    ),
                                  )}
                                <a
                                  href={`${base}/export?format=bib&ids=${s.id}`}
                                >
                                  Export BibTeX
                                </a>
                                <a
                                  href={`${base}/export?format=ris&ids=${s.id}`}
                                >
                                  Export RIS
                                </a>
                                {canArchive && (
                                  <button
                                    onClick={() => {
                                      setSelected([s.id]);
                                      setBulkAction(
                                        archived ? "restore" : "archive",
                                      );
                                    }}
                                  >
                                    {archived
                                      ? "Restore source"
                                      : "Archive source"}
                                  </button>
                                )}
                              </div>
                            </PopoverMenu>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
              {(page > 0 || data.hasMore) && (
                <div className="pagination">
                  <button
                    disabled={!page || library.refreshing}
                    onClick={() => {
                      setSelected([]);
                      update({ page: String(page - 1) }, false);
                    }}
                  >
                    Previous
                  </button>
                  <span>
                    Page {page + 1} of {Math.max(1, Math.ceil(data.total / 30))}
                  </span>
                  <button
                    disabled={!data.hasMore || library.refreshing}
                    onClick={() => {
                      setSelected([]);
                      update({ page: String(page + 1) }, false);
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </section>
        {sourceId && (
          <aside
            ref={panel}
            tabIndex={-1}
            className="source-inspector"
            aria-label="Source details"
            role={narrow ? "dialog" : undefined}
            aria-modal={narrow || undefined}
          >
            <div className="inspector-heading">
              <span>Source details</span>
              <a
                className="icon-button"
                href={path + "?" + context}
                aria-label="Close source details"
                onClick={(e) => {
                  e.preventDefault();
                  closeSource();
                }}
              >
                <Icon name="close" />
              </a>
            </div>
            {detail.error ? (
              <Failure error={detail.error} retry={detail.reload} />
            ) : source && detail.data ? (
              <>
                <h2 className="source-title">{source.title}</h2>
                <p className="source-authors">{authorLine(source)}</p>
                {source.archivedAt && (
                  <p className="notice">
                    Archived · PDF versions and notes are preserved.
                    {canArchive && (
                      <button
                        disabled={busy}
                        onClick={() => void bulk("restore", {}, [source.id])}
                      >
                        Restore source
                      </button>
                    )}
                  </p>
                )}
                {canEdit && !source.archivedAt && (
                  <button
                    className="toolbar-button outlined"
                    onClick={() => setEdit(true)}
                  >
                    Edit details, tags & collections
                  </button>
                )}
                <SourceDetails
                  w={w}
                  p={p}
                  detail={detail.data}
                  canEdit={canEdit && !source.archivedAt}
                  onUpload={() => setUpload(true)}
                  reload={reload}
                  libraryQuery={context}
                />
              </>
            ) : (
              <Loading />
            )}
          </aside>
        )}
      </div>
      {rail && (
        <Modal title="Collections and reading" onClose={() => setRail(false)}>
          <aside
            className="collections-pane mobile-collections"
            onClick={(e) => {
              if (
                (e.target as HTMLElement).closest(
                  "button:not(.collection-manage)",
                )
              )
                setRail(false);
            }}
          >
            {railContent}
          </aside>
        </Modal>
      )}
      {add && (
        <Modal title="Add a source" onClose={() => setAdd(false)}>
          <div className="add-source-intro">
            <button
              className="toolbar-button"
              onClick={() => {
                setAdd(false);
                update({ view: "discover", source: "" }, false);
              }}
            >
              <Icon name="telescope" />
              Find papers in Discover
            </button>
            <p className="muted">
              Or use a DOI, article link, bibliographic details or private PDF
              below.
            </p>
          </div>
          <SourceForm
            w={w}
            p={p}
            onSaved={(id) => {
              setAdd(false);
              setNotice("Source saved. Open its details or add a PDF.");
              reload();
              update({
                view: "",
                q: "",
                collection: "",
                tag: "",
                status: "",
                pdf: "",
                year: "",
                archived: "",
                source: id,
                page: "",
              });
            }}
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
      {upload && source && (
        <Modal title="Add a PDF version" onClose={() => setUpload(false)}>
          <UploadVersion
            w={w}
            p={p}
            sourceId={source.id}
            onSaved={(v) => {
              setUpload(false);
              reload();
              router.push(
                `${path}/${source.id}/read?version=${v}&library=${encodeURIComponent(context)}`,
              );
            }}
          />
        </Modal>
      )}
      {collectionDialog && (
        <CollectionDialog
          base={base}
          collection={collectionDialog}
          onClose={() => setCollectionDialog(null)}
          onSaved={(removed) => {
            if (removed && collection === collectionDialog.id)
              update({ collection: "" });
            setCollectionDialog(null);
            reload();
          }}
        />
      )}
      {bulkAction && (
        <Modal
          title={
            bulkAction === "archive"
              ? "Archive selected sources"
              : bulkAction === "restore"
                ? "Restore selected sources"
                : "Update selected sources"
          }
          onClose={() => setBulkAction("")}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const values = new FormData(e.currentTarget),
                extra: Record<string, string> = {};
              if (bulkAction.startsWith("collection-"))
                extra.collectionId = String(values.get("collectionId"));
              if (bulkAction.startsWith("tag-"))
                extra.tag = String(values.get("tag"));
              if (bulkAction === "reading")
                extra.status = String(values.get("status"));
              await bulk(bulkAction, extra);
            }}
          >
            <p>
              {selected.length} selected{" "}
              {selected.length === 1 ? "source" : "sources"}. The entire
              selection is updated together.
            </p>
            {bulkAction.startsWith("collection-") && (
              <label>
                Collection
                <select
                  aria-label="Collection"
                  name="collectionId"
                  required
                  defaultValue={collection}
                >
                  {data.collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {bulkAction.startsWith("tag-") && (
              <label>
                Tag
                <input
                  aria-label="Tag"
                  name="tag"
                  required
                  maxLength={40}
                  list="existing-tags"
                  autoFocus
                />
                <datalist id="existing-tags">
                  {data.tags.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </datalist>
              </label>
            )}
            {bulkAction === "reading" && (
              <label>
                My reading status
                <select aria-label="My reading status" name="status">
                  {Object.entries(readingLabels).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(bulkAction === "archive" || bulkAction === "restore") && (
              <p>
                PDFs, annotations and research links remain intact. You can
                restore sources from Archived.
              </p>
            )}
            <InlineError error={error} />
            <button
              className="primary"
              disabled={
                busy ||
                (bulkAction.startsWith("collection-") &&
                  !data.collections.length)
              }
            >
              {busy ? "Saving…" : "Apply to selection"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
function CollectionDialog({
  base,
  collection,
  onClose,
  onSaved,
}: {
  base: string;
  collection: { id?: string; name: string };
  onClose: () => void;
  onSaved: (removed?: boolean) => void;
}) {
  const [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [remove, setRemove] = useState(false);
  return (
    <Modal
      title={collection.id ? "Manage collection" : "New collection"}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            if (collection.id)
              await api(
                base + "/collections/" + collection.id,
                {
                  action: remove ? "remove" : "rename",
                  ...(remove
                    ? {}
                    : {
                        name: String(new FormData(e.currentTarget).get("name")),
                      }),
                  expectedName: collection.name,
                },
                "PATCH",
              );
            else
              await api(base + "/collections", {
                name: String(new FormData(e.currentTarget).get("name")),
              });
            onSaved(remove);
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        {remove ? (
          <p>
            Remove “{collection.name}”? Its sources, PDFs and notes stay in the
            project library.
          </p>
        ) : (
          <label>
            Collection name
            <input
              name="name"
              required
              maxLength={80}
              defaultValue={collection.name}
              autoFocus
            />
          </label>
        )}
        <InlineError error={error} />
        <div className="actions">
          <button className="primary" disabled={busy}>
            {busy
              ? "Saving…"
              : remove
                ? "Remove collection"
                : collection.id
                  ? "Rename collection"
                  : "Create collection"}
          </button>
          {collection.id && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setRemove((v) => !v)}
            >
              {remove ? "Keep collection" : "Remove collection…"}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
