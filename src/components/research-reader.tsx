"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PDFDocumentProxy, RenderTask, TextLayer } from "pdfjs-dist";
import { api } from "@/lib/api";
import type {
  ResearchAnnotation,
  ResearchDetail,
  ResearchVersion,
} from "@/lib/research-types";
import { InlineError, Modal, Icon, ToolbarActions } from "./ui";

type Props = {
  w: string;
  p: string;
  detail: ResearchDetail;
  userId: string;
  canEdit: boolean;
  reload: () => void;
};
export function PdfReader(props: Props) {
  const versions = props.detail.versions.filter((v) => v.fileId);
  const [versionId, setVersionId] = useState(() => {
    const url = new URL(location.href);
    return (
      url.searchParams.get("version") ??
      props.detail.reading?.versionId ??
      versions[0]?.id
    );
  });
  const version = versions.find((v) => v.id === versionId) ?? versions[0];
  if (!version)
    return (
      <section className="research-empty">
        <h1>No PDF yet</h1>
        <p>
          The bibliographic record is saved. Add a PDF from the source details.
        </p>
        <Link
          href={`/w/${props.w}/p/${props.p}/sources/${props.detail.source.id}`}
        >
          Source details
        </Link>
      </section>
    );
  return (
    <ReaderDocument
      key={version.id}
      {...props}
      version={version}
      onVersion={(id) => {
        const url = new URL(location.href);
        url.search = new URLSearchParams({ version: id }).toString();
        history.replaceState(null, "", url);
        setVersionId(id);
      }}
    />
  );
}
function ReaderDocument({
  w,
  p,
  detail,
  userId,
  canEdit,
  reload,
  version,
  onVersion,
}: Props & { version: ResearchVersion; onVersion: (id: string) => void }) {
  const base = `/api/research/${w}/${p}`,
    sourceUrl = `/w/${w}/p/${p}/sources/${detail.source.id}`,
    fileUrl = `${base}/sources/${detail.source.id}/versions/${version.id}/file`;
  const [initial] = useState(
    (() => {
      const q = new URL(location.href).searchParams,
        reading =
          detail.reading?.versionId === version.id ? detail.reading : null;
      return {
        page: Number(q.get("page")) || reading?.page || 1,
        zoom: reading?.zoom ?? 1,
        position: q.has("page") ? 0 : (reading?.position ?? 0),
        annotation: q.get("annotation"),
      };
    })(),
  );
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [loadError, setLoadError] = useState(""),
    [error, setError] = useState<unknown>();
  const [page, setPage] = useState(initial.page),
    [zoom, setZoom] = useState(initial.zoom),
    [rendered, setRendered] = useState(false),
    [saved, setSaved] = useState("");
  const [query, setQuery] = useState(""),
    [searching, setSearching] = useState(false),
    [searchResult, setSearchResult] = useState("");
  const [selection, setSelection] = useState<{
      quote: string;
      rects: number[][];
    } | null>(null),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [notesOpen, setNotesOpen] = useState(false),
    [panelOpen, setPanelOpen] = useState(true),
    [composing, setComposing] = useState(false),
    [color, setColor] = useState<"yellow" | "blue" | "green">("yellow"),
    [active, setActive] = useState<string | null>(initial.annotation);
  const canvas = useRef<HTMLCanvasElement>(null),
    text = useRef<HTMLDivElement>(null),
    paper = useRef<HTMLDivElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    position = useRef(initial.position),
    saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    mounted = useRef(true),
    restored = useRef(false);
  const readingStatus = useRef(
      detail.reading?.status === "done" ? "done" : "reading",
    ),
    current = useRef({ page, zoom });
  const [width, setWidth] = useState(760);
  const annotations = detail.annotations.filter(
    (a) => a.versionId === version.id,
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(260, entries[0].contentRect.width - 48)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false,
      task: ReturnType<typeof import("pdfjs-dist").getDocument> | undefined;
    void import("pdfjs-dist")
      .then((lib) => {
        if (cancelled) return;
        lib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        task = lib.getDocument({
          url: fileUrl,
          withCredentials: true,
          cMapUrl: "/pdfjs/cmaps/",
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          wasmUrl: "/pdfjs/wasm/",
          enableXfa: false,
          disableWorkerRendering: true,
          verbosity: 0,
        });
        return task.promise;
      })
      .then((document) => {
        if (!cancelled && document) {
          setPdf(document);
          setPage((n) => Math.max(1, Math.min(document.numPages, n)));
        }
      })
      .catch((reason) => {
        if (!cancelled)
          setLoadError(
            reason?.name === "PasswordException"
              ? "This PDF is password protected. Upload an unlocked copy from source details."
              : "The PDF could not be opened. Check your access or upload a readable replacement from source details.",
          );
      });
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [fileUrl]);
  useEffect(() => {
    if (!pdf || !canvas.current || !text.current || !paper.current) return;
    let cancelled = false,
      render: RenderTask | undefined,
      layer: TextLayer | undefined;
    setRendered(false);
    setSelection(null);
    void (async () => {
      const pdfPage = await pdf.getPage(page);
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 }),
        scale = (Math.min(width, 650) / base.width) * zoom,
        viewport = pdfPage.getViewport({
          scale: Math.min(
            scale,
            4000 / base.width,
            Math.sqrt(16_000_000 / (base.width * base.height)),
          ),
        }),
        output = Math.min(
          devicePixelRatio || 1,
          2,
          Math.sqrt(16_000_000 / (viewport.width * viewport.height)),
        );
      const c = canvas.current!,
        container = text.current!,
        node = paper.current!;
      c.width = Math.floor(viewport.width * output);
      c.height = Math.floor(viewport.height * output);
      c.style.width = `${viewport.width}px`;
      c.style.height = `${viewport.height}px`;
      node.style.width = `${viewport.width}px`;
      node.style.height = `${viewport.height}px`;
      node.style.setProperty("--scale-factor", String(viewport.scale));
      node.style.setProperty("--total-scale-factor", String(viewport.scale));
      node.style.setProperty("--user-unit", "1");
      container.replaceChildren();
      render = pdfPage.render({
        canvas: c,
        viewport,
        transform: output === 1 ? undefined : [output, 0, 0, output, 0, 0],
        annotationMode: 0,
      });
      await render.promise;
      if (cancelled) return;
      const lib = await import("pdfjs-dist"),
        content = await pdfPage.getTextContent();
      if (cancelled) return;
      layer = new lib.TextLayer({
        textContentSource: content,
        container,
        viewport,
      });
      await layer.render();
      if (cancelled) return;
      setRendered(true);
      if (scroll.current) {
        if (!restored.current) {
          scroll.current.scrollTop =
            position.current *
            Math.max(
              0,
              scroll.current.scrollHeight - scroll.current.clientHeight,
            );
          restored.current = true;
        } else scroll.current.scrollTop = 0;
      }
    })().catch((reason) => {
      if (!cancelled && reason?.name !== "RenderingCancelledException")
        setLoadError(
          "This page could not be rendered. Try another page or download the PDF.",
        );
    });
    return () => {
      cancelled = true;
      render?.cancel();
      layer?.cancel();
    };
  }, [pdf, page, zoom, width]);
  function savePosition() {
    if (!pdf) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaved("Saving reading position…");
      const value = current.current;
      void api(
        `${base}/sources/${detail.source.id}`,
        {
          action: "reading",
          versionId: version.id,
          status: readingStatus.current,
          page: value.page,
          zoom: value.zoom,
          position: position.current,
        },
        "PATCH",
      )
        .then(() => {
          if (mounted.current) setSaved("Reading position saved");
        })
        .catch((error) => {
          if (mounted.current) {
            setError(error);
            setSaved("Reading position was not saved");
          }
        });
    }, 600);
  }
  useEffect(() => {
    current.current = { page, zoom };
    savePosition(); /* Save only navigation changes, not polling metadata. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, zoom, pdf]);
  function navigate(next: number, annotation?: string) {
    if (!pdf) return;
    position.current = 0;
    setPage(Math.max(1, Math.min(pdf.numPages, next)));
    setActive(annotation ?? null);
    setSelection(null);
    const url = new URL(location.href);
    url.search = new URLSearchParams({
      version: version.id,
      page: String(next),
      ...(annotation ? { annotation } : {}),
    }).toString();
    history.replaceState(null, "", url);
    if (scroll.current) scroll.current.scrollTop = 0;
  }
  function selectText() {
    if (!canEdit || !rendered) return;
    const selected = getSelection(),
      node = paper.current;
    if (
      !selected ||
      selected.isCollapsed ||
      !node ||
      !node.contains(selected.anchorNode) ||
      !node.contains(selected.focusNode)
    ) {
      setSelection(null);
      return;
    }
    const quote = selected.toString().trim().slice(0, 6000),
      bounds = node.getBoundingClientRect(),
      range = selected.getRangeAt(0);
    const rects = Array.from(range.getClientRects())
      .map((r) => [
        Math.max(0, (r.left - bounds.left) / bounds.width),
        Math.max(0, (r.top - bounds.top) / bounds.height),
        Math.min(1, r.width / bounds.width),
        Math.min(1, r.height / bounds.height),
      ])
      .filter((r) => r[2] > 0 && r[3] > 0 && r[0] < 1 && r[1] < 1)
      .slice(0, 100)
      .map((r) => [
        r[0],
        r[1],
        Math.min(r[2], 1 - r[0]),
        Math.min(r[3], 1 - r[1]),
      ]);
    setSelection(quote && rects.length ? { quote, rects } : null);
  }
  async function add(kind: "note" | "highlight") {
    if (kind === "highlight" && !selection) return;
    setBusy(true);
    setError(undefined);
    try {
      const value = await api<ResearchAnnotation>(
        `${base}/sources/${detail.source.id}/versions/${version.id}/annotations`,
        {
          kind,
          page,
          quote: kind === "highlight" ? selection!.quote : "",
          rects: kind === "highlight" ? selection!.rects : [],
          body: note,
          color,
        },
      );
      setNote("");
      setSelection(null);
      getSelection()?.removeAllRanges();
      setActive(value.id);
      setSaved("Note saved to Atlas");
      reload();
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  async function search() {
    if (!pdf || !query.trim()) return;
    setSearching(true);
    setSearchResult("");
    try {
      for (let offset = 1; offset <= Math.min(pdf.numPages, 500); offset++) {
        const n = ((page - 1 + offset) % pdf.numPages) + 1,
          content = await (await pdf.getPage(n)).getTextContent(),
          value = content.items.map((i) => ("str" in i ? i.str : "")).join(" ");
        if (
          value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
        ) {
          navigate(n);
          setSearchResult(`Found on page ${n}`);
          return;
        }
      }
      setSearchResult(
        pdf.numPages > 500
          ? "No match in the first 500 pages searched."
          : "No matching text. Image-only PDFs may not have selectable text.",
      );
    } catch {
      setSearchResult("Search could not finish. Try again.");
    } finally {
      setSearching(false);
    }
  }
  const notes = (
    <>
      <div className="reader-notes-header">
        <h2>Notes</h2>
        <button
          className="toolbar-button"
          onClick={() => setComposing((v) => !v)}
          disabled={!canEdit}
          aria-label="Add page note"
        >
          <Icon name="plus" />
          <span className="note-add-label">Add note</span>
        </button>
      </div>
      <p className="notes-version">
        Version {version.ordinal} · {annotations.length} notes & highlights
      </p>{" "}
      <div className="annotation-list">
        {annotations.length === 0 ? (
          <p className="muted">Your first observation belongs here.</p>
        ) : (
          annotations.map((a) => (
            <AnnotationCard
              key={`${a.id}/${a.revision}`}
              annotation={a}
              active={active === a.id}
              canEdit={
                canEdit &&
                (a.authorId === userId ||
                  ["owner", "admin"].includes(detail.role))
              }
              jump={() => {
                navigate(a.page, a.id);
                setNotesOpen(false);
              }}
              update={async (body) => {
                try {
                  await api(
                    `${base}/annotations/${a.id}`,
                    { ...body, revision: a.revision },
                    "PATCH",
                  );
                  reload();
                } catch (error) {
                  setError(error);
                }
              }}
            />
          ))
        )}
      </div>
      {canEdit && (selection || composing) ? (
        <form
          className="annotation-compose"
          onSubmit={(e) => {
            e.preventDefault();
            void add(selection ? "highlight" : "note");
          }}
        >
          {selection ? (
            <blockquote>{selection.quote}</blockquote>
          ) : (
            <p>Select text to highlight, or leave a note on page {page}.</p>
          )}
          <label>
            {selection ? "Comment (optional)" : "Page note"}
            <textarea
              aria-label="Annotation note"
              rows={3}
              maxLength={10000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required={!selection}
            />
          </label>
          <div className="actions">
            <button
              className="primary"
              disabled={busy || (!selection && !note.trim())}
            >
              {busy
                ? "Saving…"
                : selection
                  ? "Save highlight"
                  : "Save page note"}
            </button>
            {selection && (
              <button type="button" onClick={() => setSelection(null)}>
                Clear selection
              </button>
            )}
          </div>
        </form>
      ) : !canEdit ? (
        <p className="notice">
          Read only · Your reading position is personal. Shared notes require an
          editor role.
        </p>
      ) : null}
    </>
  );
  return (
    <section className="pdf-reader">
      <h1 className="sr-only">{detail.source.title}</h1>
      <ToolbarActions>
        <form
          className="pdf-search"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <Icon name="search" />
          <input
            aria-label="Search PDF text"
            placeholder="Search in PDF"
            value={query}
            maxLength={200}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            aria-label="Find next"
            className="icon-button"
            disabled={!pdf || searching}
          >
            <Icon name="arrow" />
          </button>
        </form>
        <div
          className="highlight-colors"
          role="group"
          aria-label="Highlight color"
        >
          {(["yellow", "blue", "green"] as const).map((value) => (
            <button
              key={value}
              aria-label={`Highlight color ${value}`}
              aria-pressed={color === value}
              className={value}
              onClick={() => setColor(value)}
            />
          ))}
        </div>
        <button
          className="icon-button zoom-step"
          aria-label="Zoom out"
          disabled={zoom <= 0.5}
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
        >
          <Icon name="zoomOut" />
        </button>
        <label className="reader-zoom">
          <span className="sr-only">Zoom</span>
          <select
            aria-label="PDF zoom"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 2, 2.5].map((z) => (
              <option value={z} key={z}>
                {z * 100}%
              </option>
            ))}
          </select>
        </label>
        <button
          className="icon-button zoom-step"
          aria-label="Zoom in"
          disabled={zoom >= 2.5}
          onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))}
        >
          <Icon name="zoomIn" />
        </button>
        <button
          className="toolbar-button notes-toggle"
          onClick={() => {
            if (innerWidth < 1200) setNotesOpen(true);
            else setPanelOpen((v) => !v);
          }}
          aria-label={`Notes (${annotations.length})`}
        >
          <Icon name="panel" />
          <span>Notes ({annotations.length})</span>
        </button>
      </ToolbarActions>
      <InlineError error={error} />
      <p className="reader-status sr-only" role="status">
        {saved || "Your reading position is saved as you go."}
      </p>
      <div className={`reader-workspace ${panelOpen ? "" : "notes-hidden"}`}>
        <div className="pdf-document">
          {searchResult && (
            <div className="reader-search-result" role="status">
              {searchResult}
            </div>
          )}
          <div
            className="pdf-scroll"
            ref={scroll}
            onScroll={() => {
              const node = scroll.current;
              if (node && rendered) {
                position.current =
                  node.scrollTop /
                  Math.max(1, node.scrollHeight - node.clientHeight);
                savePosition();
              }
            }}
            tabIndex={0}
            aria-label="PDF document"
            onMouseUp={selectText}
            onKeyUp={selectText}
            onTouchEnd={() => setTimeout(selectText, 50)}
          >
            {loadError ? (
              <div className="pdf-error" role="alert">
                <h2>PDF unavailable</h2>
                <p>{loadError}</p>
                <Link href={sourceUrl}>Back to source details</Link>
              </div>
            ) : (
              <>
                {!rendered && (
                  <p className="pdf-loading" role="status">
                    Rendering page…
                  </p>
                )}
                <div
                  className="pdf-paper"
                  ref={paper}
                  style={{ visibility: rendered ? "visible" : "hidden" }}
                >
                  <canvas ref={canvas} aria-label={`PDF page ${page}`} />
                  <div className="textLayer" ref={text} />
                  <div className="highlight-layer" aria-hidden="true">
                    {annotations
                      .filter((a) => a.page === page && a.kind === "highlight")
                      .flatMap((a) =>
                        a.rects.map((r, i) => (
                          <span
                            key={`${a.id}/${i}`}
                            className={`pdf-highlight ${a.color} ${active === a.id ? "active" : ""}`}
                            style={{
                              left: `${r[0] * 100}%`,
                              top: `${r[1] * 100}%`,
                              width: `${r[2] * 100}%`,
                              height: `${r[3] * 100}%`,
                            }}
                          />
                        )),
                      )}
                  </div>
                </div>
              </>
            )}
          </div>
          <footer className="pdf-pagebar">
            <Link
              className="icon-button"
              href={sourceUrl}
              aria-label="Source details"
            >
              <Icon name="arrow" />
            </Link>
            <div className="reader-pages">
              <button
                aria-label="Previous page"
                disabled={!pdf || page <= 1}
                onClick={() => navigate(page - 1)}
              >
                <Icon name="chevron" />
              </button>
              <label>
                Page
                <input
                  aria-label="PDF page"
                  type="number"
                  min={1}
                  max={pdf?.numPages ?? 500}
                  value={page}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (n >= 1 && n <= (pdf?.numPages ?? 1)) navigate(n);
                  }}
                />
              </label>
              <span>of {pdf?.numPages ?? "—"}</span>
              <button
                aria-label="Next page"
                disabled={!pdf || page >= pdf.numPages}
                onClick={() => navigate(page + 1)}
              >
                <Icon name="chevron" />
              </button>
            </div>
            <details className="reader-file-menu">
              <summary className="icon-button" aria-label="PDF options">
                <Icon name="options" />
              </summary>
              <div>
                <label>
                  PDF version
                  <select
                    aria-label="PDF version"
                    value={version.id}
                    onChange={(e) => onVersion(e.target.value)}
                  >
                    {detail.versions
                      .filter((v) => v.fileId)
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          Version {v.ordinal} ·{" "}
                          {new Date(v.createdAt).toLocaleDateString()}
                        </option>
                      ))}
                  </select>
                </label>
                <a href={fileUrl} download>
                  <Icon name="download" />
                  Download PDF
                </a>
                <Link href={sourceUrl}>Source details</Link>
              </div>
            </details>
          </footer>
        </div>
        <aside className="reader-notes">{notes}</aside>
      </div>
      {notesOpen && (
        <Modal title="Notes & highlights" onClose={() => setNotesOpen(false)}>
          <div className="mobile-reader-notes">{notes}</div>
        </Modal>
      )}
    </section>
  );
}
function AnnotationCard({
  annotation: a,
  active,
  canEdit,
  jump,
  update,
}: {
  annotation: ResearchAnnotation;
  active: boolean;
  canEdit: boolean;
  jump: () => void;
  update: (value: { body?: string; deleted?: boolean }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false),
    [body, setBody] = useState(a.body),
    [busy, setBusy] = useState(false);
  return (
    <article
      data-color={a.color}
      className={`annotation-card ${active ? "active" : ""}`}
    >
      <button className="annotation-page" onClick={jump}>
        Page {a.page} ↗
      </button>
      {a.quote && <blockquote>{a.quote}</blockquote>}
      {editing ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await update({ body });
            setBusy(false);
            setEditing(false);
          }}
        >
          <label>
            Edit note
            <textarea
              value={body}
              maxLength={10000}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <div className="actions">
            <button disabled={busy}>Save note</button>
            <button type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <p>{a.body}</p>
      )}
      {canEdit && !editing && (
        <div className="annotation-actions">
          <button onClick={() => setEditing(true)}>Edit note</button>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await update({ deleted: true });
              setBusy(false);
            }}
          >
            Remove
          </button>
        </div>
      )}
    </article>
  );
}
