"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask, TextLayer } from "pdfjs-dist";
import type { ResearchAnnotation } from "@/lib/research-types";
export type PageSize = { width: number; height: number };
export type TextMatch = {
  page: number;
  start: number;
  end: number;
  index: number;
};
export type PdfSelection = {
  page: number;
  quote: string;
  rects: number[][];
  requestId: string;
};
export function normalizedRects(range: Range, node: HTMLElement) {
  const bounds = node.getBoundingClientRect();
  return [...range.getClientRects()]
    .filter(
      (r) =>
        r.width > 0 &&
        r.height > 0 &&
        r.right > bounds.left &&
        r.left < bounds.right &&
        r.bottom > bounds.top &&
        r.top < bounds.bottom,
    )
    .map((r) => {
      const x = Math.max(0, (r.left - bounds.left) / bounds.width),
        y = Math.max(0, (r.top - bounds.top) / bounds.height);
      return [
        x,
        y,
        Math.min((r.right - bounds.left) / bounds.width, 1) - x,
        Math.min((r.bottom - bounds.top) / bounds.height, 1) - y,
      ];
    })
    .filter((r) => r[2] > 0 && r[3] > 0)
    .slice(0, 100);
}
function searchRects(
  divs: HTMLElement[],
  strings: string[],
  match: TextMatch,
  node: HTMLElement,
) {
  let offset = 0,
    start: { node: Node; offset: number } | undefined,
    end: typeof start;
  for (let i = 0; i < strings.length; i++) {
    const text = strings[i],
      child = divs[i]?.firstChild;
    if (child?.nodeType === Node.TEXT_NODE) {
      if (!start && match.start >= offset && match.start < offset + text.length)
        start = { node: child, offset: match.start - offset };
      if (match.end > offset && match.end <= offset + text.length)
        end = { node: child, offset: match.end - offset };
    }
    offset += text.length + 1;
  }
  if (!start || !end) return [];
  const range = document.createRange();
  range.setStart(
    start.node,
    Math.min(start.offset, start.node.textContent?.length ?? 0),
  );
  range.setEnd(
    end.node,
    Math.min(end.offset, end.node.textContent?.length ?? 0),
  );
  return normalizedRects(range, node);
}
export function PdfPage({
  pdf,
  page,
  width,
  height,
  annotations,
  active,
  matches,
  currentMatch,
  onSize,
  onReady,
  onAnnotation,
  selected,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  width: number;
  height: number;
  annotations: ResearchAnnotation[];
  active: string | null;
  matches: TextMatch[];
  currentMatch: number;
  onSize: (page: number, size: PageSize) => void;
  onReady: (page: number, text: boolean) => void;
  onAnnotation: (a: ResearchAnnotation) => void;
  selected: PdfSelection | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    text = useRef<HTMLDivElement>(null),
    paper = useRef<HTMLDivElement>(null),
    layer = useRef<TextLayer | null>(null),
    strings = useRef<string[]>([]);
  const [renderedKey, setRenderedKey] = useState(""),
    [failure, setFailure] = useState<{ key: string; message: string } | null>(
      null,
    ),
    [retry, setRetry] = useState(0),
    [rects, setRects] = useState<{ rect: number[]; index: number }[]>([]),
    [hasText, setHasText] = useState(true);
  const renderKey = `${page}/${width}/${retry}`,
    rendered = renderedKey === renderKey,
    error = failure?.key === renderKey ? failure.message : "";
  useEffect(() => {
    let cancelled = false,
      task: RenderTask | undefined,
      textLayer: TextLayer | undefined,
      loaded: Awaited<ReturnType<PDFDocumentProxy["getPage"]>> | undefined;

    void (async () => {
      const pdfPage = await pdf.getPage(page);
      loaded = pdfPage;
      if (cancelled) return;
      const natural = pdfPage.getViewport({ scale: 1 });
      onSize(page, { width: natural.width, height: natural.height });
      const viewport = pdfPage.getViewport({
        scale: Math.min(
          width / natural.width,
          4000 / natural.width,
          Math.sqrt(16_000_000 / (natural.width * natural.height)),
        ),
      });
      const c = canvas.current,
        container = text.current,
        node = paper.current;
      if (!c || !container || !node || cancelled) return;
      const output = Math.min(
        devicePixelRatio || 1,
        2,
        Math.sqrt(16_000_000 / (viewport.width * viewport.height)),
      );
      c.width = Math.floor(viewport.width * output);
      c.height = Math.floor(viewport.height * output);
      c.style.width = "100%";
      c.style.height = "100%";
      node.style.setProperty("--scale-factor", String(viewport.scale));
      node.style.setProperty("--total-scale-factor", String(viewport.scale));
      node.style.setProperty("--user-unit", "1");
      task = pdfPage.render({
        canvas: c,
        viewport,
        transform: output === 1 ? undefined : [output, 0, 0, output, 0, 0],
        annotationMode: 0,
      });
      await task.promise;
      if (cancelled) return;
      const content = await pdfPage.getTextContent();
      if (cancelled) return;
      strings.current = content.items.flatMap((item) =>
        "str" in item ? [item.str] : [],
      );
      const lib = await import("pdfjs-dist");
      if (cancelled) return;
      container.replaceChildren();
      textLayer = new lib.TextLayer({
        textContentSource: content,
        container,
        viewport,
      });
      layer.current = textLayer;
      await textLayer.render();
      if (cancelled) return;
      const selectable = strings.current.some((s) => s.trim());
      setHasText(selectable);
      setRenderedKey(renderKey);
      onReady(page, selectable);
    })().catch((e) => {
      if (!cancelled && e?.name !== "RenderingCancelledException")
        setFailure({
          key: renderKey,
          message:
            "This page could not render. Retry it or download the original PDF.",
        });
    });
    return () => {
      cancelled = true;
      task?.cancel();
      textLayer?.cancel();
      layer.current = null;
      void task?.promise.catch(() => {}).then(() => loaded?.cleanup());
    };
  }, [pdf, page, width, onSize, onReady, retry, renderKey]);
  const matchesKey = matches
    .map((m) => `${m.start}:${m.end}:${m.index}`)
    .join(",");
  useEffect(() => {
    if (!rendered || !paper.current || !layer.current) {
      return;
    }
    const values = matches.flatMap((m) =>
      searchRects(
        layer.current!.textDivs,
        strings.current,
        m,
        paper.current!,
      ).map((rect) => ({ rect, index: m.index })),
    );
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setRects(values);
    });
    return () => {
      cancelled = true;
    };
    // Match content, rather than array identity, controls DOM range measurement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchesKey, rendered, width]);
  return (
    <div
      ref={paper}
      className={`pdf-paper ${rendered ? "is-rendered" : ""}`}
      data-page={page}
      style={{ width, height }}
      onPointerUp={(e) => {
        if ((getSelection()?.toString() ?? "").trim()) return;
        const box = e.currentTarget.getBoundingClientRect(),
          x = (e.clientX - box.left) / box.width,
          y = (e.clientY - box.top) / box.height;
        const hit = annotations.find(
          (a) =>
            a.kind === "highlight" &&
            a.rects.some(
              (r) =>
                x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3],
            ),
        );
        if (hit) onAnnotation(hit);
      }}
    >
      {!rendered && !error && (
        <span className="pdf-page-loading" role="status">
          Rendering page {page}…
        </span>
      )}
      {error ? (
        <div className="pdf-page-error" role="alert">
          <p>{error}</p>
          <button onClick={() => setRetry((n) => n + 1)}>
            Retry page {page}
          </button>
        </div>
      ) : (
        <>
          <canvas
            ref={canvas}
            aria-label={`PDF page ${page}`}
            style={{ visibility: rendered ? "visible" : "hidden" }}
          />
          <div ref={text} className="textLayer" />
          <div className="highlight-layer" aria-hidden="true">
            {annotations
              .filter((a) => a.kind === "highlight")
              .flatMap((a) =>
                a.rects.map((r, i) => (
                  <span
                    key={a.id + "/" + i}
                    data-annotation={a.id}
                    className={`pdf-highlight ${a.color} ${active === a.id ? "active" : ""}`}
                    style={{
                      left: r[0] * 100 + "%",
                      top: r[1] * 100 + "%",
                      width: r[2] * 100 + "%",
                      height: r[3] * 100 + "%",
                    }}
                  />
                )),
              )}
            {rects.map(({ rect: r, index }, i) => (
              <span
                key={i}
                className={`pdf-search-highlight ${index === currentMatch ? "current" : ""}`}
                data-match={index}
                style={{
                  left: r[0] * 100 + "%",
                  top: r[1] * 100 + "%",
                  width: r[2] * 100 + "%",
                  height: r[3] * 100 + "%",
                }}
              />
            ))}
            {selected?.page === page &&
              selected.rects.map((r, i) => (
                <span
                  key={"selection-" + i}
                  className="pdf-selection-preview"
                  style={{
                    left: r[0] * 100 + "%",
                    top: r[1] * 100 + "%",
                    width: r[2] * 100 + "%",
                    height: r[3] * 100 + "%",
                  }}
                />
              ))}
          </div>
          {annotations
            .filter((a) => a.kind === "highlight")
            .map((a) => (
              <button
                key={a.id}
                className={`pdf-note-marker ${a.color}`}
                style={{ top: (a.rects[0]?.[1] ?? 0) * 100 + "%" }}
                aria-label={`Open highlight on page ${page}: ${(a.body || a.quote).slice(0, 60)}`}
                onClick={() => onAnnotation(a)}
              >
                <span />
              </button>
            ))}
          {rendered && !hasText && (
            <span className="pdf-no-text">
              No selectable text · page notes still work
            </span>
          )}
        </>
      )}
    </div>
  );
}
