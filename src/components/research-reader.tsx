"use client";
import { useNavigationBlocker } from "./navigation-safety";
import { WorkVisit } from "./work-visit";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { api } from "@/lib/api";
import type {
  ReaderPosition,
  ResearchAnnotation,
  ResearchDetail,
  ResearchVersion,
} from "@/lib/research-types";
import { ResearchActions, CreateArtifactDialog } from "./collaboration-shared";
import { InlineError, Modal, Icon, PopoverMenu, useResource } from "./ui";
import {
  PdfPage,
  normalizedRects,
  type PageSize,
  type PdfSelection,
  type TextMatch,
} from "./reader-pdf-page";
type Props = {
  w: string;
  p: string;
  detail: ResearchDetail;
  userId: string;
  canEdit: boolean;
  reload: () => void;
  readError?: unknown;
};
type Note = ResearchAnnotation & { deletedAt?: string | null };
type Outline = { title: string; page: number | null; children: Outline[] };
const mediaQuery = "(max-width:1199px)";
function subscribeNarrow(fn: () => void) {
  const m = matchMedia(mediaQuery);
  m.addEventListener("change", fn);
  return () => m.removeEventListener("change", fn);
}
function getNarrow() {
  return matchMedia(mediaQuery).matches;
}
const serverNarrow = () => false;
export function PdfReader(props: Props) {
  const [positions, setPositions] = useState<Record<string, ReaderPosition>>(
    {},
  );
  const rememberPosition = useCallback(
    (value: ReaderPosition) =>
      setPositions((old) => ({ ...old, [value.versionId]: value })),
    [],
  );
  const versions = props.detail.versions.filter((v) => v.fileId);
  const [versionId, setVersionId] = useState(
    () =>
      new URLSearchParams(location.search).get("version") ??
      versions.find((v) => v.id === props.detail.reading?.versionId)?.id ??
      versions[0]?.id,
  );
  const version = versions.find((v) => v.id === versionId);
  if (!version)
    return (
      <section className="research-empty">
        <h1>
          {versions.length ? "Requested PDF version unavailable" : "No PDF yet"}
        </h1>
        <p>
          This link keeps its exact version. Choose a PDF from the source
          details.
        </p>
        <Link
          href={`/w/${props.w}/p/${props.p}/sources/${props.detail.source.id}`}
        >
          Source details
        </Link>
      </section>
    );
  return (
    <>
      <WorkVisit
        w={props.w}
        p={props.p}
        id={props.detail.source.id}
        kind="source"
        versionId={version.id}
      />
      <ReaderDocument
        key={version.id}
        {...props}
        detail={{
          ...props.detail,
          positions: [
            ...(props.detail.positions ?? []).filter(
              (p) => !positions[p.versionId],
            ),
            ...Object.values(positions),
          ],
        }}
        onPositionSaved={rememberPosition}
        version={version}
        onVersion={(id) => {
          const url = new URL(location.href),
            library = url.searchParams.get("library");
          url.search = new URLSearchParams({
            version: id,
            ...(library ? { library } : {}),
          }).toString();
          history.replaceState(null, "", url);
          setVersionId(id);
        }}
      />
    </>
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
  readError,
  onPositionSaved,
}: Props & {
  version: ResearchVersion;
  onVersion: (id: string) => void;
  onPositionSaved: (value: ReaderPosition) => void;
}) {
  const base = `/api/research/${w}/${p}`,
    fileUrl = `${base}/sources/${detail.source.id}/versions/${version.id}/file`;
  const narrow = useSyncExternalStore(subscribeNarrow, getNarrow, serverNarrow);
  const [initial] = useState(() => {
    const q = new URLSearchParams(location.search),
      position =
        detail.positions?.find((r) => r.versionId === version.id) ??
        (detail.reading?.versionId === version.id ? detail.reading : null);
    return {
      page: Number(q.get("page")) || position?.page || 1,
      zoom: position?.zoom ?? 1,
      mode: position && "zoomMode" in position ? position.zoomMode : "manual",
      progress: q.has("page") ? 0 : (position?.position ?? 0),
      annotation: q.get("annotation"),
      library: q.get("library") ?? "",
    };
  });
  const libraryUrl = `/w/${w}/p/${p}/sources?${initial.library}`,
    sourceUrl = libraryUrl + "&source=" + detail.source.id;
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [fileError, setFileError] = useState(""),
    [retry, setRetry] = useState(0),
    [page, setPage] = useState(initial.page),
    [pageDraft, setPageDraft] = useState(String(initial.page)),
    [pageError, setPageError] = useState(""),
    [zoom, setZoom] = useState(initial.zoom),
    [mode, setMode] = useState(initial.mode),
    [viewport, setViewport] = useState({ width: 760, height: 900 }),
    [sizes, setSizes] = useState<Record<number, PageSize>>({}),
    [range, setRange] = useState({ start: initial.page, end: initial.page }),
    [pageLabels, setPageLabels] = useState<string[] | null>(null),
    [outline, setOutline] = useState<Outline[]>([]),
    [outlineBusy, setOutlineBusy] = useState(false),
    [pageText, setPageText] = useState<Record<number, boolean>>({}),
    [panel, setPanel] = useState<"notes" | "outline" | "source">("notes"),
    [panelOpen, setPanelOpen] = useState(true),
    [sheet, setSheet] = useState(false);
  const [query, setQuery] = useState(""),
    [searchOpen, setSearchOpen] = useState(false),
    [searched, setSearched] = useState(""),
    [searching, setSearching] = useState(false),
    [matches, setMatches] = useState<TextMatch[]>([]),
    [matchIndex, setMatchIndex] = useState(-1),
    [searchError, setSearchError] = useState("");
  const [selection, setSelection] = useState<PdfSelection | null>(null),
    [bubble, setBubble] = useState<{ x: number; y: number } | null>(null),
    [active, setActive] = useState<string | null>(initial.annotation),
    [draft, setDraft] = useState<{
      kind: "note" | "highlight";
      page: number;
      quote: string;
      rects: number[][];
      requestId: string;
      body: string;
    } | null>(null),
    [color, setColor] = useState<"yellow" | "blue" | "green">("yellow"),
    [switching, setSwitching] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [message, setMessage] = useState(""),
    [saved, setSaved] = useState(""),
    [noteQuery, setNoteQuery] = useState(""),
    [noteScope, setNoteScope] = useState("all"),
    [local, setLocal] = useState<Record<string, Note>>({}),
    [removed, setRemoved] = useState<Note | null>(null),
    [artifact, setArtifact] = useState<{
      kind: "document" | "task";
      annotation: ResearchAnnotation;
    } | null>(null),
    [jump, setJump] = useState({
      n: initial.page,
      progress: initial.progress,
      serial: 0,
    });
  const scroll = useRef<HTMLDivElement>(null),
    reader = useRef<HTMLElement>(null),
    bubbleNode = useRef<HTMLDivElement>(null),
    anchor = useRef({ page: initial.page, progress: initial.progress, x: 0.5 }),
    geometryRef = useRef<{
      tops: number[];
      heights: number[];
      widths: number[];
    }>({ tops: [], heights: [], widths: [] }),
    frame = useRef<number | undefined>(undefined),
    saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    ready = useRef(false),
    current = useRef({
      page: initial.page,
      zoom: initial.zoom,
      zoomMode: initial.mode,
      position: initial.progress,
    }),
    lastSaved = useRef(""),
    saveSequence = useRef(0),
    searchSequence = useRef(0),
    searchCache = useRef(new Map<number, string>()),
    lastSearchJump = useRef(""),
    readingStatus = useRef(
      detail.reading?.status === "done" ? "done" : "reading",
    ),
    pendingSave = useRef<Promise<unknown>>(Promise.resolve()),
    selectionRef = useRef<PdfSelection | null>(null),
    positionReady = useRef(false);
  useEffect(() => {
    const close = () => setPanelOpen(false);
    window.addEventListener("atlas-ai-docked", close);
    if (document.querySelector('.ai-island[data-presentation="docked"]'))
      close();
    return () => window.removeEventListener("atlas-ai-docked", close);
  }, []);
  useEffect(() => {
    readingStatus.current =
      detail.reading?.status === "done" ? "done" : "reading";
  }, [detail.reading?.status]);
  const members = useResource<{ members: { userId: string; name?: string }[] }>(
    `/api/projects/${p}/members?workspaceId=${w}`,
  );
  const annotations = useMemo(() => {
    const map = new Map(
      detail.annotations
        .filter((a) => a.versionId === version.id)
        .map((a) => [a.id, a as Note]),
    );
    for (const n of Object.values(local)) {
      const old = map.get(n.id);
      if (!old || n.revision >= old.revision) map.set(n.id, n);
    }
    return [...map.values()]
      .filter((a) => !a.deletedAt)
      .sort(
        (a, b) => a.page - b.page || a.createdAt.localeCompare(b.createdAt),
      );
  }, [detail.annotations, version.id, local]);
  const visibleNotes = annotations.filter(
    (a) =>
      (noteScope === "all" || a.page === page) &&
      `${a.quote} ${a.body}`
        .toLowerCase()
        .includes(noteQuery.trim().toLowerCase()),
  );
  const onSize = useCallback(
    (n: number, size: PageSize) =>
      setSizes((old) =>
        old[n]?.width === size.width && old[n]?.height === size.height
          ? old
          : { ...old, [n]: size },
      ),
    [],
  );
  const onReady = useCallback((n: number, text: boolean) => {
    setPageText((old) => (old[n] === text ? old : { ...old, [n]: text }));
  }, []);
  const geometry = useMemo(() => {
    const first = sizes[1] ?? { width: 612, height: 792 },
      baseWidth = Math.max(160, Math.min(viewport.width - 48, 650)),
      tops: number[] = [],
      heights: number[] = [],
      widths: number[] = [];
    let top = 24;
    for (let n = 1; n <= (pdf?.numPages ?? 0); n++) {
      const size = sizes[n] ?? first;
      const scale =
        mode === "page"
          ? Math.min(
              baseWidth / size.width,
              Math.max(120, viewport.height - 48) / size.height,
            )
          : (baseWidth / size.width) * (mode === "manual" ? zoom : 1);
      const safeScale = Math.min(
        scale,
        4000 / size.width,
        Math.sqrt(16_000_000 / (size.width * size.height)),
      );
      const width = size.width * safeScale,
        height = (size.height * width) / size.width;
      tops.push(top);
      widths.push(width);
      heights.push(height);
      top += height + 24;
    }
    return { tops, heights, widths };
  }, [pdf, sizes, viewport, mode, zoom]);
  useLayoutEffect(() => {
    geometryRef.current = geometry;
    const el = scroll.current;
    if (!pdf || !el || !geometry.tops.length) return;
    const a = anchor.current,
      n = Math.max(
        1,
        Math.min(pdf.numPages, jump.serial ? a.page : initial.page),
      );
    el.scrollTop =
      geometry.tops[n - 1] + geometry.heights[n - 1] * a.progress - 24;
    el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) * a.x);
    positionReady.current = true;
  }, [geometry, pdf, jump, initial.page]);
  function syncScroll() {
    const el = scroll.current,
      g = geometryRef.current;
    if (!el || !g.tops.length) return;
    const find = (y: number) => {
      let lo = 0,
        hi = g.tops.length - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (g.tops[mid] <= y) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    };
    const start = find(el.scrollTop + 28),
      end = find(el.scrollTop + el.clientHeight - 8),
      progress = Math.max(
        0,
        Math.min(1, (el.scrollTop + 24 - g.tops[start]) / g.heights[start]),
      );
    anchor.current = {
      page: start + 1,
      progress,
      x:
        el.scrollWidth > el.clientWidth
          ? el.scrollLeft / (el.scrollWidth - el.clientWidth)
          : 0.5,
    };
    current.current = {
      page: start + 1,
      zoom,
      zoomMode: mode,
      position: progress,
    };
    if (start + 1 !== page) setPageDraft(String(start + 1));
    setPage(start + 1);
    setRange((old) =>
      old.start === start + 1 && old.end === end + 1
        ? old
        : { start: start + 1, end: end + 1 },
    );
    if (positionReady.current) queueSave();
    placeBubble();
  }
  useEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setViewport((old) =>
        old.width === r.width && old.height === r.height
          ? old
          : { width: r.width, height: r.height },
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false,
      task: ReturnType<typeof import("pdfjs-dist").getDocument> | undefined;
    ready.current = false;
    positionReady.current = false;
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
      .then(async (doc) => {
        if (cancelled || !doc) return;
        const first = await doc.getPage(1);
        if (cancelled) return;
        const size = first.getViewport({ scale: 1 });
        onSize(1, { width: size.width, height: size.height });
        setPdf(doc);
        ready.current = true;
        const n = Math.max(1, Math.min(doc.numPages, initial.page));
        anchor.current.page = n;
        setPage(n);
        setRange({ start: n, end: n });
        setJump((old) => ({
          n,
          progress: initial.progress,
          serial: old.serial + 1,
        }));
        void doc
          .getPageLabels()
          .then((labels) => {
            if (!cancelled) setPageLabels(labels);
          })
          .catch(() => {});
      })
      .catch((e) => {
        if (!cancelled)
          setFileError(
            e?.name === "PasswordException"
              ? "This PDF is password protected. Add an unlocked copy from source details."
              : e?.status === 401 || e?.status === 403
                ? "Your session or project access ended. Sign in again or return to Library."
                : "This PDF could not be opened. Retry the file or check source details.",
          );
      });
    return () => {
      cancelled = true;

      void task?.destroy();
    };
  }, [fileUrl, retry, onSize, initial.page, initial.progress]);
  const saveReading = useCallback(
    (force = false) => {
      if (!ready.current) return Promise.resolve();
      const value = { ...current.current },
        key = JSON.stringify(value);
      if (!force && key === lastSaved.current) return pendingSave.current;
      const seq = ++saveSequence.current;
      setSaved("Saving reading position…");
      // Serialize only this version's writes, so an older slow request cannot replace a newer locator.
      const promise = pendingSave.current
        .catch(() => {})
        .then(() =>
          api(
            `${base}/sources/${detail.source.id}`,
            {
              action: "reading",
              versionId: version.id,
              status: readingStatus.current,
              ...value,
            },
            "PATCH",
          ),
        )
        .then(() => {
          lastSaved.current = key;
          onPositionSaved({ versionId: version.id, ...value });
          if (seq === saveSequence.current) setSaved("Reading position saved");
          return true;
        })
        .catch((e) => {
          if (seq === saveSequence.current) {
            setSaved("Reading position was not saved");
            setError(e);
          }
          return false;
        });
      pendingSave.current = promise;
      return promise;
    },
    [base, detail.source.id, version.id, onPositionSaved],
  );
  useNavigationBlocker({
    label: "The latest PDF reading position has not been saved.",
    pending: () =>
      ready.current && JSON.stringify(current.current) !== lastSaved.current,
    flush: async () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      return (await saveReading()) !== false;
    },
  });
  function queueSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveReading(), 800);
  }
  useEffect(() => {
    current.current = { ...current.current, zoom, zoomMode: mode };
    if (pdf) {
      syncScroll();
      queueSave();
    } /* Geometry preserves the current page anchor before this save. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, mode, pdf, geometry]);
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void saveReading();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (frame.current) cancelAnimationFrame(frame.current);
      void saveReading();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [saveReading]);
  function navigate(n: number, annotation?: ResearchAnnotation, progress = 0) {
    if (!pdf) return;
    setPageError("");
    const target = Math.max(1, Math.min(pdf.numPages, n));
    anchor.current = { ...anchor.current, page: target, progress };
    setPageDraft(String(target));
    setPage(target);
    setRange({ start: target, end: target });
    setActive(annotation?.id ?? null);
    setJump((old) => ({ n: target, progress, serial: old.serial + 1 }));
    const url = new URL(location.href);
    url.searchParams.set("version", version.id);
    url.searchParams.set("page", String(target));
    if (annotation) url.searchParams.set("annotation", annotation.id);
    else url.searchParams.delete("annotation");
    history.replaceState(null, "", url);
    window.dispatchEvent(new Event("atlas-location-changed"));
  }
  function focusAnnotation(a: ResearchAnnotation) {
    window.dispatchEvent(new Event("atlas-document-tools-open"));
    clearSelection();
    setActive(a.id);
    navigate(a.page, a, Math.max(0, (a.rects[0]?.[1] ?? 0) - 0.15));
    setPanel("notes");
    if (narrow) setSheet(true);
    else setPanelOpen(true);
    requestAnimationFrame(() =>
      document
        .getElementById("annotation-" + a.id)
        ?.scrollIntoView({ block: "nearest" }),
    );
  }
  useEffect(() => {
    if (!pdf || !initial.annotation) return;
    const a = annotations.find((a) => a.id === initial.annotation);
    const timer = requestAnimationFrame(() => {
      if (a) navigate(a.page, a, Math.max(0, (a.rects[0]?.[1] ?? 0) - 0.15));
      else
        setMessage(
          "This annotation is unavailable. The exact PDF version is still open.",
        );
    });
    return () => cancelAnimationFrame(timer);
    // Run once after the exact version loads, not on annotation polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf]);
  function placeBubble() {
    const s = selectionRef.current,
      node = scroll.current?.querySelector<HTMLElement>(
        `.pdf-paper[data-page="${s?.page}"]`,
      ),
      bounds = node?.getBoundingClientRect(),
      area = scroll.current?.getBoundingClientRect();
    if (!s || !bounds || !area) {
      setBubble(null);
      return;
    }
    const first = s.rects[0],
      last = s.rects.at(-1);
    if (!first || !last) return;
    const top = bounds.top + first[1] * bounds.height,
      bottom = bounds.top + (last[1] + last[3]) * bounds.height;
    if (bottom < area.top || top > area.bottom) {
      setBubble(null);
      return;
    }
    const width = Math.min(
        bubbleNode.current?.offsetWidth || 360,
        innerWidth - 16,
      ),
      height = bubbleNode.current?.offsetHeight || 42;
    setBubble({
      x: Math.max(
        8,
        Math.min(
          innerWidth - width - 8,
          bounds.left + (first[0] + first[2] / 2) * bounds.width - width / 2,
        ),
      ),
      y:
        top - height - 8 >= area.top
          ? top - height - 8
          : Math.min(area.bottom - height - 8, bottom + 8),
    });
  }
  useLayoutEffect(() => {
    selectionRef.current = selection;
    placeBubble();
    // Page geometry moves the same normalized selection without changing its saved content.
  }, [selection, geometry, range]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const capture = () => {
      const s = getSelection(),
        el = scroll.current;
      if (
        !s ||
        s.isCollapsed ||
        !el ||
        !el.contains(s.anchorNode) ||
        !el.contains(s.focusNode)
      )
        return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const range = s.getRangeAt(0),
          start = s.anchorNode?.parentElement?.closest(
            ".pdf-paper",
          ) as HTMLElement | null,
          end = s.focusNode?.parentElement?.closest(".pdf-paper");
        if (!start || start !== end) {
          setMessage(
            "Select text within one page to highlight or cite. You can still copy the native selection.",
          );
          return;
        }
        const quote = s.toString().trim();
        if (quote.length > 6000) {
          setMessage("Select a shorter passage (up to 6,000 characters).");
          return;
        }
        const rects = normalizedRects(range, start);
        if (quote && rects.length) {
          setSelection((old) =>
            old?.quote === quote && old.page === Number(start.dataset.page)
              ? old
              : {
                  page: Number(start.dataset.page),
                  quote,
                  rects,
                  requestId: crypto.randomUUID(),
                },
          );
          setMessage("");
        }
      }, 70);
    };
    document.addEventListener("selectionchange", capture);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", capture);
    };
  }, []);
  function clearSelection() {
    setSelection(null);
    selectionRef.current = null;
    getSelection()?.removeAllRanges();
  }
  async function saveAnnotation(
    value: {
      kind: "note" | "highlight";
      page: number;
      quote: string;
      rects: number[][];
      requestId: string;
      body: string;
    },
    next?: "document" | "task",
  ) {
    setBusy(true);
    setError(undefined);
    try {
      const a = await api<ResearchAnnotation>(
        `${base}/sources/${detail.source.id}/versions/${version.id}/annotations`,
        { ...value, color },
      );
      setLocal((old) => ({ ...old, [a.id]: a }));
      setActive(a.id);
      setDraft(null);
      clearSelection();
      setMessage(
        value.kind === "highlight" ? "Highlight saved" : "Page note saved",
      );
      reload();
      if (next) {
        await saveReading();
        setArtifact({ kind: next, annotation: a });
      }
      return a;
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  function actOnSelection(
    action: "highlight" | "comment" | "document" | "task",
  ) {
    if (!selection) return;
    const value = { ...selection, kind: "highlight" as const, body: "" };
    if (action === "comment") {
      setDraft(value);
      if (narrow) setSheet(false);
    } else
      void saveAnnotation(value, action === "highlight" ? undefined : action);
  }
  function beginNote() {
    setDraft({
      kind: "note",
      page,
      quote: "",
      rects: [],
      requestId: crypto.randomUUID(),
      body: "",
    });
  }
  async function runSearch() {
    if (!pdf || !query.trim()) return;
    lastSearchJump.current = "";
    const seq = ++searchSequence.current,
      q = query.trim().toLowerCase();
    setSearching(true);
    setSearched(query.trim());
    setSearchError("");
    setMatches([]);
    setMatchIndex(-1);
    const found: TextMatch[] = [];
    try {
      for (let n = 1; n <= pdf.numPages; n++) {
        if (seq !== searchSequence.current) return;
        let value = searchCache.current.get(n);
        if (value === undefined) {
          value = (await (await pdf.getPage(n)).getTextContent()).items
            .flatMap((i) => ("str" in i ? [i.str] : []))
            .join(" ");
          searchCache.current.set(n, value);
        }
        const lower = value.toLowerCase();
        let at = 0;
        while ((at = lower.indexOf(q, at)) >= 0) {
          found.push({
            page: n,
            start: at,
            end: at + q.length,
            index: found.length,
          });
          at += Math.max(1, q.length);
        }
        if (n % 10 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      if (seq !== searchSequence.current) return;
      setMatches(found);
      if (found.length) {
        const first = found.findIndex((m) => m.page >= page);
        setMatchIndex(first < 0 ? 0 : first);
        navigate(found[first < 0 ? 0 : first].page);
      }
    } catch {
      if (seq === searchSequence.current)
        setSearchError("Search could not finish. Try again.");
    } finally {
      if (seq === searchSequence.current) setSearching(false);
    }
  }
  function stepMatch(delta: number) {
    lastSearchJump.current = "";
    if (!matches.length) return;
    const next = (matchIndex + delta + matches.length) % matches.length;
    setMatchIndex(next);
    navigate(matches[next].page);
  }
  useEffect(() => {
    if (
      matchIndex < 0 ||
      lastSearchJump.current === `${searched}/${matchIndex}`
    )
      return;
    const el = scroll.current;
    const timer = setTimeout(() => {
      const match = el?.querySelector<HTMLElement>(
          `.pdf-search-highlight.current`,
        ),
        paper = match?.closest<HTMLElement>(".pdf-page-slot");
      if (match && paper && el) {
        const top = paper.offsetTop + match.offsetTop - el.clientHeight * 0.35;
        lastSearchJump.current = `${searched}/${matchIndex}`;
        el.scrollTop = Math.max(0, top);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [matchIndex, range, pageText, searched]);
  async function loadOutline() {
    if (!pdf || outline.length || outlineBusy) return;
    setOutlineBusy(true);
    try {
      const build = async (
        items: Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>,
      ): Promise<Outline[]> =>
        Promise.all(
          (items ?? []).map(async (item) => {
            let n: number | null = null;
            try {
              const dest =
                typeof item.dest === "string"
                  ? await pdf.getDestination(item.dest)
                  : item.dest;
              if (Array.isArray(dest)) {
                const target = dest[0];
                n =
                  (typeof target === "number"
                    ? target
                    : await pdf.getPageIndex(target)) + 1;
              }
            } catch {}
            return {
              title: item.title,
              page: n,
              children: await build(item.items),
            };
          }),
        );
      setOutline(await build(await pdf.getOutline()));
    } catch {
      setMessage(
        "The PDF outline could not be read. Page navigation is still available.",
      );
    } finally {
      setOutlineBusy(false);
    }
  }
  function showPanel(next: "notes" | "outline" | "source") {
    window.dispatchEvent(new Event("atlas-document-tools-open"));
    setPanel(next);
    if (next === "outline") void loadOutline();
    if (narrow) setSheet(true);
    else setPanelOpen(true);
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable="true"],dialog',
        )
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() =>
          document.getElementById("reader-search")?.focus(),
        );
      }
      if (e.key === "Escape" && selection) {
        clearSelection();
        return;
      }
      if (!scroll.current?.contains(document.activeElement)) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        navigate(page + 1);
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        navigate(page - 1);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
    // Shortcuts read current page/selection; form fields always keep their native keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pdf, selection]);
  const panelContent = (
    <>
      <div
        className="reader-panel-tabs"
        role="group"
        aria-label="Reader side panel"
      >
        {(["notes", "outline", "source"] as const).map((tab) => (
          <button
            key={tab}
            aria-pressed={panel === tab}
            onClick={() => {
              setPanel(tab);
              if (tab === "outline") void loadOutline();
            }}
          >
            {tab === "notes"
              ? "Notes"
              : tab === "outline"
                ? "Outline"
                : "Source"}
          </button>
        ))}
        {!narrow && (
          <button
            className="icon-button"
            aria-label="Close Reader panel"
            onClick={() => setPanelOpen(false)}
          >
            <Icon name="close" />
          </button>
        )}
      </div>
      {panel === "notes" ? (
        <>
          <div className="reader-notes-tools">
            <input
              aria-label="Find notes"
              placeholder="Find notes"
              value={noteQuery}
              onChange={(e) => setNoteQuery(e.target.value)}
            />
            <select
              aria-label="Notes scope"
              value={noteScope}
              onChange={(e) => setNoteScope(e.target.value)}
            >
              <option value="all">All pages</option>
              <option value="page">This page</option>
            </select>
            {canEdit && (
              <button
                className="icon-button"
                aria-label="Add page note"
                onClick={beginNote}
              >
                <Icon name="plus" />
              </button>
            )}
          </div>
          <p className="notes-version">
            Version {version.ordinal} · {annotations.length} notes & highlights
          </p>
          {!canEdit && (
            <p className="muted reader-readonly">
              Read only · your position is personal.
            </p>
          )}
          {removed && (
            <div className="notice">
              Note removed.{" "}
              <button
                onClick={async () => {
                  try {
                    const a = await api<Note>(
                      `${base}/annotations/${removed.id}`,
                      { deleted: false, revision: removed.revision },
                      "PATCH",
                    );
                    setLocal((old) => ({ ...old, [a.id]: a }));
                    setRemoved(null);
                    reload();
                  } catch (e) {
                    setError(e);
                  }
                }}
              >
                Undo removal
              </button>
            </div>
          )}
          <div className="annotation-list">
            {visibleNotes.map((a) => (
              <AnnotationCard
                key={a.id}
                annotation={a}
                active={active === a.id}
                author={
                  a.authorId === userId
                    ? "You"
                    : (members.data?.members.find(
                        (m) => m.userId === a.authorId,
                      )?.name ?? "Project member")
                }
                canEdit={
                  canEdit &&
                  (a.authorId === userId ||
                    ["owner", "admin"].includes(detail.role))
                }
                jump={() => {
                  navigate(
                    a.page,
                    a,
                    Math.max(0, (a.rects[0]?.[1] ?? 0) - 0.15),
                  );
                  setSheet(false);
                }}
                connected={
                  <ResearchActions
                    compact
                    w={w}
                    p={p}
                    id={a.id}
                    origin={{
                      sourceId: detail.source.id,
                      versionId: version.id,
                      annotationId: a.id,
                    }}
                    canEdit={canEdit}
                  />
                }
                update={async (input) => {
                  const result = await api<Note>(
                    `${base}/annotations/${a.id}`,
                    input,
                    "PATCH",
                  );
                  setLocal((old) => ({ ...old, [a.id]: result }));
                  if (result.deletedAt) setRemoved(result);
                  reload();
                  return result;
                }}
              />
            ))}
            {!visibleNotes.length && (
              <p className="muted">
                {noteQuery || noteScope === "page"
                  ? "No matching notes."
                  : "Select a passage or add a page note."}
              </p>
            )}
          </div>
        </>
      ) : panel === "outline" ? (
        <div className="reader-outline">
          {outlineBusy ? (
            <p>Reading PDF outline…</p>
          ) : outline.length ? (
            <OutlineItems
              items={outline}
              go={(n) => {
                navigate(n);
                setSheet(false);
              }}
            />
          ) : (
            <p className="muted">
              This PDF has no bookmarks. Use page navigation or text search.
            </p>
          )}
        </div>
      ) : (
        <div className="reader-source-info">
          <h2>{detail.source.title}</h2>
          <p>
            {[
              detail.source.authors.join(", "),
              detail.source.venue,
              detail.source.year,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p>
            PDF version {version.ordinal} ·{" "}
            {pdf?.numPages ?? version.pageCount ?? "—"} pages
          </p>
          <p className="muted">
            {version.extractionStatus === "ready"
              ? "Text preparation is ready."
              : "Text preparation is separate from viewing this PDF. You can keep reading and add page notes."}
          </p>
          <Link href={sourceUrl}>Source details & PDF versions</Link>
          <ResearchActions
            compact
            w={w}
            p={p}
            id={detail.source.id}
            origin={{ sourceId: detail.source.id, versionId: version.id }}
            canEdit={canEdit}
          />
        </div>
      )}
    </>
  );
  return (
    <section
      ref={reader}
      data-version={version.id}
      className="pdf-reader reader-experience"
    >
      <h1 className="sr-only">{detail.source.title}</h1>
      <fieldset
        className="reader-controls"
        aria-label="PDF controls"
        disabled={switching}
        aria-busy={switching}
      >
        <Link
          className="icon-button reader-library"
          href={libraryUrl}
          aria-label="Back to Library"
          onClick={() => void saveReading()}
        >
          <Icon name="arrow" />
        </Link>
        <form
          className="reader-pages"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(pageDraft);
            if (!Number.isInteger(n) || n < 1 || n > (pdf?.numPages ?? 0)) {
              setPageError(`Enter a page from 1 to ${pdf?.numPages ?? "…"}.`);
              return;
            }
            setPageError("");
            navigate(n);
          }}
        >
          <button
            type="button"
            className="icon-button"
            aria-label="Previous page"
            disabled={!pdf || page <= 1}
            onClick={() => navigate(page - 1)}
          >
            <Icon name="chevron" />
          </button>
          <label>
            <span className="sr-only">Physical PDF page</span>
            <input
              aria-label="PDF page"
              inputMode="numeric"
              value={pageDraft}
              onChange={(e) => setPageDraft(e.target.value)}
              onBlur={() => {
                if (!/^\d+$/.test(pageDraft)) setPageDraft(String(page));
              }}
              disabled={!pdf}
            />
          </label>
          <span>of {pdf?.numPages ?? "—"}</span>
          <button type="submit" className="sr-only">
            Go to page
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Next page"
            disabled={!pdf || page >= pdf.numPages}
            onClick={() => navigate(page + 1)}
          >
            <Icon name="chevron" />
          </button>
        </form>
        {pageLabels?.[page - 1] && pageLabels[page - 1] !== String(page) && (
          <span className="pdf-page-label" title="Printed page label">
            Label {pageLabels[page - 1]}
          </span>
        )}
        <div className="reader-zoom-controls">
          <button
            className="icon-button"
            aria-label="Zoom out"
            disabled={!pdf || zoom <= 0.5}
            onClick={() => {
              setMode("manual");
              setZoom((z) => Math.max(0.5, z - 0.25));
            }}
          >
            <Icon name="zoomOut" />
          </button>
          <select
            disabled={!pdf}
            aria-label="PDF zoom"
            value={mode === "manual" ? String(zoom) : mode}
            onChange={(e) => {
              if (["width", "page"].includes(e.target.value))
                setMode(e.target.value);
              else {
                setMode("manual");
                setZoom(Number(e.target.value));
              }
            }}
          >
            <option value="width">Fit width</option>
            <option value="page">Fit page</option>
            {[0.5, 0.75, 1, 1.25, 1.5, 2, 2.5].map((z) => (
              <option key={z} value={String(z)}>
                {z * 100}%
              </option>
            ))}
          </select>
          <button
            className="icon-button"
            aria-label="Zoom in"
            disabled={!pdf || zoom >= 2.5}
            onClick={() => {
              setMode("manual");
              setZoom((z) => Math.min(2.5, z + 0.25));
            }}
          >
            <Icon name="zoomIn" />
          </button>
        </div>
        <div className="reader-control-spacer" />
        <button
          className="icon-button"
          aria-label="Search in PDF"
          aria-pressed={searchOpen}
          disabled={!pdf}
          onClick={() => {
            setSearchOpen((v) => !v);
            requestAnimationFrame(() =>
              document.getElementById("reader-search")?.focus(),
            );
          }}
        >
          <Icon name="search" />
        </button>
        <button
          className="icon-button"
          aria-label={`Notes (${annotations.length})`}
          aria-pressed={narrow ? sheet : panelOpen}
          onClick={() => {
            if (!(narrow ? sheet : panelOpen))
              window.dispatchEvent(new Event("atlas-document-tools-open"));
            if (narrow) setSheet((v) => !v);
            else setPanelOpen((v) => !v);
          }}
        >
          <Icon name="panel" />
        </button>
        <PopoverMenu className="reader-file-menu">
          <summary className="icon-button" aria-label="PDF options">
            <Icon name="options" />
          </summary>
          <div>
            <label>
              PDF version
              <select
                aria-label="PDF version"
                disabled={busy || switching || !pdf}
                value={version.id}
                onChange={async (e) => {
                  const next = e.target.value;
                  setSwitching(true);
                  try {
                    if ((await saveReading()) !== false) onVersion(next);
                  } finally {
                    setSwitching(false);
                  }
                }}
              >
                {detail.versions
                  .filter((v) => v.fileId)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      Version {v.ordinal} ·{" "}
                      {new Date(v.createdAt).toLocaleDateString("en-GB", {
                        dateStyle: "medium",
                      })}
                    </option>
                  ))}
              </select>
            </label>
            <button onClick={() => showPanel("outline")}>PDF outline</button>
            <button onClick={() => showPanel("source")}>
              Source information
            </button>
            {canEdit && <button onClick={beginNote}>Add page note</button>}
            <a href={fileUrl} download>
              Download original PDF
            </a>
            <span className="muted">
              Atlas notes are stored separately; this download contains the
              original file.
            </span>
            <Link href={sourceUrl}>Source details</Link>
          </div>
        </PopoverMenu>
      </fieldset>
      {searchOpen && (
        <form
          className="reader-search-bar"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch();
          }}
        >
          <Icon name="search" />
          <input
            id="reader-search"
            aria-label="Search PDF text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={200}
            placeholder="Search in this PDF"
            required
          />
          <button
            className="toolbar-button"
            disabled={searching || !query.trim()}
          >
            {searching ? "Searching…" : "Search"}
          </button>
          <span role="status">
            {searchError ||
              (!searched
                ? ""
                : searching
                  ? "Searching all pages…"
                  : matches.length
                    ? `${matchIndex + 1} of ${matches.length}`
                    : "No matches")}
          </span>
          <button
            className="icon-button"
            type="button"
            aria-label="Previous search result"
            disabled={!matches.length}
            onClick={() => stepMatch(-1)}
          >
            <Icon name="chevron" />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Next search result"
            disabled={!matches.length}
            onClick={() => stepMatch(1)}
          >
            <Icon name="chevron" />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Close PDF search"
            onClick={() => {
              searchSequence.current++;
              setSearchOpen(false);
              setMatches([]);
              setMatchIndex(-1);
              setSearching(false);
              setSearched("");
            }}
          >
            <Icon name="close" />
          </button>
        </form>
      )}
      {(!!error ||
        !!readError ||
        pageError ||
        message ||
        saved === "Reading position was not saved") && (
        <div className="reader-notice">
          <InlineError error={error ?? readError} />
          {!!readError && <button onClick={reload}>Retry notes</button>}
          {pageError && <span role="alert">{pageError}</span>}
          {message && <span role="status">{message}</span>}
          {saved === "Reading position was not saved" && (
            <button onClick={() => void saveReading(true)}>
              Retry position save
            </button>
          )}
        </div>
      )}
      <span className="sr-only" role="status">
        {saved}
      </span>
      <div
        className={`reader-workspace ${panelOpen && !narrow ? "" : "notes-hidden"}`}
      >
        <div className="pdf-document">
          <div
            className="pdf-scroll"
            ref={scroll}
            tabIndex={0}
            aria-label="PDF document"
            onScroll={() => {
              if (frame.current) cancelAnimationFrame(frame.current);
              frame.current = requestAnimationFrame(syncScroll);
            }}
          >
            {fileError ? (
              <div className="pdf-error" role="alert">
                <h2>PDF unavailable</h2>
                <p>{fileError}</p>
                <button
                  onClick={() => {
                    setFileError("");
                    setPdf(null);
                    setRetry((n) => n + 1);
                  }}
                >
                  Retry PDF
                </button>
                <Link href={sourceUrl}>Source details</Link>
                <Link href={libraryUrl}>Back to Library</Link>
              </div>
            ) : !pdf ? (
              <p className="pdf-loading" role="status">
                Loading PDF…
              </p>
            ) : (
              <div
                className="pdf-pages"
                style={{ minWidth: Math.max(0, ...geometry.widths) + 48 }}
              >
                {geometry.tops.map((top, i) => (
                  <div
                    key={i}
                    className="pdf-page-slot"
                    data-page={i + 1}
                    style={{
                      width: geometry.widths[i],
                      height: geometry.heights[i],
                    }}
                  >
                    {i + 1 >= range.start - 1 && i + 1 <= range.end + 1 ? (
                      <PdfPage
                        pdf={pdf}
                        page={i + 1}
                        width={geometry.widths[i]}
                        height={geometry.heights[i]}
                        annotations={annotations.filter(
                          (a) => a.page === i + 1,
                        )}
                        active={active}
                        matches={matches.filter((m) => m.page === i + 1)}
                        currentMatch={matchIndex}
                        onSize={onSize}
                        onReady={onReady}
                        onAnnotation={focusAnnotation}
                        selected={selection}
                      />
                    ) : (
                      <div
                        className="pdf-page-placeholder"
                        aria-label={`PDF page ${i + 1}, not rendered`}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          {pdf && pageText[page] === false && (
            <span className="reader-text-notice">
              No selectable text on page {page}.{" "}
              {canEdit ? (
                <button onClick={beginNote}>Add page note</button>
              ) : (
                "Page notes remain readable."
              )}
            </span>
          )}
        </div>
        {!narrow && panelOpen && (
          <aside className="reader-notes" aria-label="Reader panel">
            {panelContent}
          </aside>
        )}
      </div>
      {selection && bubble && (
        <div
          ref={bubbleNode}
          className="pdf-selection-actions"
          role="toolbar"
          aria-label="Selected PDF text"
          style={{ left: bubble.x, top: bubble.y }}
          onPointerDown={(e) => e.preventDefault()}
        >
          <button
            disabled={busy}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(selection.quote);
                setMessage("Selected text copied");
              } catch (e) {
                setMessage(
                  "Clipboard access was blocked. Use your browser’s Copy command on the selected text.",
                );
                void e;
              }
            }}
          >
            Copy
          </button>
          {canEdit && (
            <>
              <button
                disabled={busy}
                onClick={() => actOnSelection("highlight")}
              >
                Highlight
              </button>
              <button disabled={busy} onClick={() => actOnSelection("comment")}>
                Comment
              </button>
              <button
                disabled={busy}
                onClick={() => actOnSelection("document")}
              >
                Write from this
              </button>
              <button disabled={busy} onClick={() => actOnSelection("task")}>
                Create task
              </button>
            </>
          )}
          <button
            aria-label="Dismiss text selection"
            disabled={busy}
            onClick={clearSelection}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {sheet && narrow && (
        <Modal title="Notes & source" onClose={() => setSheet(false)}>
          <div className="mobile-reader-notes">{panelContent}</div>
        </Modal>
      )}
      {draft && (
        <Modal
          title={
            draft.kind === "note"
              ? `Page ${draft.page} note`
              : "Comment on selected text"
          }
          onClose={() => {
            if (!busy) setDraft(null);
          }}
          dismissible={!busy}
        >
          <form
            className="annotation-compose"
            onSubmit={(e) => {
              e.preventDefault();
              void saveAnnotation(draft);
            }}
          >
            {draft.quote && <blockquote>{draft.quote}</blockquote>}
            <label>
              {draft.kind === "note" ? "Page note" : "Comment"}
              <textarea
                aria-label="Annotation note"
                autoFocus
                value={draft.body}
                required={draft.kind === "note"}
                maxLength={10000}
                rows={4}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
            </label>
            <div
              className="reader-colors"
              role="group"
              aria-label="Highlight color"
            >
              {(["yellow", "blue", "green"] as const).map((c) => (
                <button
                  type="button"
                  key={c}
                  className={c}
                  aria-label={`Highlight color ${c}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
            <InlineError error={error} />
            <button
              className="primary"
              disabled={busy || (draft.kind === "note" && !draft.body.trim())}
            >
              {busy
                ? "Saving…"
                : draft.kind === "note"
                  ? "Save page note"
                  : "Save highlight"}
            </button>
          </form>
        </Modal>
      )}
      {artifact && (
        <CreateArtifactDialog
          w={w}
          p={p}
          kind={artifact.kind}
          originId={artifact.annotation.id}
          origin={{
            sourceId: detail.source.id,
            versionId: version.id,
            annotationId: artifact.annotation.id,
          }}
          onClose={() => setArtifact(null)}
        />
      )}
    </section>
  );
}
function OutlineItems({
  items,
  go,
}: {
  items: Outline[];
  go: (n: number) => void;
}) {
  return (
    <ul>
      {items.map((item, i) => (
        <li key={i}>
          {item.page ? (
            <button onClick={() => go(item.page!)}>
              {item.title}
              <small>p. {item.page}</small>
            </button>
          ) : (
            <span>{item.title}</span>
          )}
          {item.children.length > 0 && (
            <OutlineItems items={item.children} go={go} />
          )}
        </li>
      ))}
    </ul>
  );
}
function AnnotationCard({
  annotation: a,
  active,
  author,
  canEdit,
  jump,
  connected,
  update,
}: {
  annotation: ResearchAnnotation;
  active: boolean;
  author: string;
  canEdit: boolean;
  jump: () => void;
  connected: React.ReactNode;
  update: (input: {
    body?: string;
    color?: string;
    deleted?: boolean;
    revision: number;
  }) => Promise<Note>;
}) {
  const [editing, setEditing] = useState(false),
    [body, setBody] = useState(a.body),
    [color, setColor] = useState(a.color),
    [revision, setRevision] = useState(a.revision),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [expanded, setExpanded] = useState(false);
  return (
    <article
      id={"annotation-" + a.id}
      data-color={a.color}
      className={`annotation-card ${active ? "active" : ""}`}
    >
      <div className="annotation-heading">
        <button className="annotation-page" onClick={jump}>
          Page {a.page} ↗
        </button>
        <span>{author}</span>
      </div>
      {a.quote && (
        <>
          <blockquote className={expanded ? "" : "quote-clamped"}>
            {a.quote}
          </blockquote>
          {a.quote.length > 240 && (
            <button
              className="text-button"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Show less" : "Show full quotation"}
            </button>
          )}
        </>
      )}
      {editing ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(undefined);
            try {
              await update({ body, color, revision });
              setEditing(false);
            } catch (e) {
              setError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Edit note
            <textarea
              aria-label="Edit note"
              maxLength={10000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          {a.kind === "highlight" && (
            <label>
              Highlight color
              <select
                aria-label="Highlight color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              >
                <option>yellow</option>
                <option>blue</option>
                <option>green</option>
              </select>
            </label>
          )}
          <InlineError error={error} />
          <div className="actions">
            <button disabled={busy}>Save note</button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : a.body ? (
        <p className="annotation-comment">{a.body}</p>
      ) : null}
      {connected}
      {canEdit && !editing && (
        <PopoverMenu className="action-menu annotation-menu">
          <summary
            className="toolbar-button"
            aria-label={`Edit or remove note on page ${a.page}`}
          >
            <Icon name="options" />
          </summary>
          <div>
            <button
              onClick={() => {
                setRevision(a.revision);
                setBody(a.body);
                setColor(a.color);
                setEditing(true);
              }}
            >
              Edit note
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(undefined);
                try {
                  await update({ deleted: true, revision: a.revision });
                } catch (e) {
                  setError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Remove note
            </button>
          </div>
        </PopoverMenu>
      )}
      {!editing && <InlineError error={error} />}
    </article>
  );
}
