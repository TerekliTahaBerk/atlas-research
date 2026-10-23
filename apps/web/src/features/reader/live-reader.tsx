'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Highlighter,
  Lock,
  MoveHorizontal,
  PanelLeft,
  PanelRight,
  Quote,
  Search,
  ShieldAlert,
  Sparkles,
  StickyNote,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import {
  providerLabels,
  type AnnotationAnchor,
  type AnnotationDto,
  type ProjectDto,
  type ProjectPaperDto,
} from '@atlas/core';
import { Btn, IconBtn } from '@/components/atlas/button';
import { StatusTag } from '@/components/atlas/chips';
import { Segmented } from '@/components/atlas/segmented';
import {
  EmptyState,
  ErrorBanner,
  SkeletonLines,
} from '@/components/atlas/states';
import { useToast } from '@/components/atlas/toast';
import { useAtlas } from '@/features/atlas-ai/atlas-provider';
import { AtlasAnchor } from '@/features/atlas-ai/atlas-surface';
import { SidebarToggle } from '@/features/shell/topbar';
import { useMediaQuery } from '@/features/shell/use-media';
import {
  ApiError,
  fetchAnnotations,
  fetchPaper,
  fetchSourceAccess,
  runCommand,
} from '@/features/library/client';
import {
  authorSummary,
  referenceText,
  sourceStateLabels,
} from '@/features/library/paper-format';
import {
  layerText,
  locateAnchor,
  normalizeRects,
  quoteContext,
  textPosition,
} from './anchors';
import { loadPdfEngine, openPdf, type PdfDocument } from './pdf-engine';

type PaperState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; paper: ProjectPaperDto };
type DocState =
  | { kind: 'idle' }
  | { kind: 'loading'; step: string }
  | {
      kind: 'error';
      reason:
        | 'expired'
        | 'unauthorized'
        | 'invalid'
        | 'password'
        | 'network'
        | 'integrity'
        | 'conflict';
    }
  | { kind: 'ready'; pdf: PdfDocument; destroy: () => Promise<void> };
type Pending = {
  quote: string;
  anchor: AnnotationAnchor;
  top: number;
  left: number;
};
const docErrors = {
  expired: [
    'Access expired',
    'The short-lived access link expired before the file loaded. Retry to request a new one.',
  ],
  unauthorized: [
    'Access denied',
    'You no longer have access to this source, or it no longer exists.',
  ],
  invalid: ['Invalid PDF', 'The stored file could not be read as a PDF.'],
  password: [
    'Password-protected PDF',
    'Encrypted PDFs are not supported by the Atlas reader.',
  ],
  network: [
    'Network error',
    'The file could not be downloaded. Check your connection and retry.',
  ],
  integrity: [
    'Integrity check failed',
    'The downloaded bytes did not match the stored checksum, so they were not displayed.',
  ],
  conflict: ['Source not ready', 'This version has not passed validation.'],
} as const;

async function sha256Hex(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function LiveReader({ project }: { project: ProjectDto }) {
  const params = useSearchParams();
  const router = useRouter();
  const flash = useToast();
  const atlas = useAtlas();
  const { setContext } = atlas;
  const wide = useMediaQuery('(min-width: 900px)');
  const paperId = params.get('paper');
  const canWrite = project.capabilities.includes('project.write');
  const [paperResult, setPaperResult] = useState<{
    id: string;
    state: PaperState;
  } | null>(null);
  const [chosenVersion, setChosenVersion] = useState<{
    paperId: string;
    id: string;
  } | null>(null);
  const [docAttempt, setDocAttempt] = useState(0);
  const [docResult, setDocResult] = useState<{
    key: string;
    doc: DocState;
  } | null>(null);
  const requestedPage = Number(params.get('page') ?? 1);
  const [page, setPage] = useState(
    Number.isInteger(requestedPage) && requestedPage > 0 && requestedPage <= 500
      ? requestedPage
      : 1,
  );
  const [zoom, setZoom] = useState(100);
  const [fit, setFit] = useState(true);
  const [annotationRefresh, setAnnotationRefresh] = useState(0);
  const [annotationResult, setAnnotationResult] = useState<{
    versionId: string;
    list: AnnotationDto[];
    error: string;
  } | null>(null);
  const [activeAnnotation, setActiveAnnotation] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [noteFor, setNoteFor] = useState<Pending | 'page' | null>(null);
  const [noteBody, setNoteBody] = useState('');
  const [privateNote, setPrivateNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(false);
  const [tab, setTab] = useState<'notes' | 'outline' | 'details'>('notes');
  const [search, setSearch] = useState('');
  const [outline, setOutline] = useState<{ title: string; page: number }[]>([]);
  const [pageText, setPageText] = useState('');
  const notesTrigger = useRef<HTMLButtonElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const pageBox = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const textCache = useRef(new Map<number, string>());
  const [scale, setScale] = useState(1);
  const [columnWidth, setColumnWidth] = useState(0);

  // ---- paper and version selection (state derived from the request key)
  useEffect(() => {
    if (!paperId) return;
    let active = true;
    fetchPaper(paperId)
      .then((paper) => {
        if (active)
          setPaperResult({ id: paperId, state: { kind: 'ready', paper } });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setPaperResult({
          id: paperId,
          state:
            error instanceof ApiError && error.code === 'NOT_FOUND'
              ? { kind: 'unavailable' }
              : {
                  kind: 'error',
                  message:
                    error instanceof Error ? error.message : 'Loading failed.',
                },
        });
      });
    return () => {
      active = false;
    };
  }, [paperId]);
  const state: PaperState =
    paperResult && paperResult.id === paperId
      ? paperResult.state
      : { kind: 'loading' };
  const paper = state.kind === 'ready' ? state.paper : null;
  // Default to the newest accepted version unless the reader picked another.
  const versionId =
    chosenVersion && chosenVersion.paperId === paper?.id
      ? chosenVersion.id
      : (paper?.sources.find(
          (s) => s.id === params.get('source') && s.state === 'READY',
        )?.id ??
        paper?.sources.find((s) => s.state === 'READY')?.id ??
        null);
  const version = paper?.sources.find((s) => s.id === versionId) ?? null;
  const docKey = version ? `${version.id}:${docAttempt}` : '';
  const doc: DocState = !version
    ? { kind: 'idle' }
    : docResult?.key === docKey
      ? docResult.doc
      : { kind: 'loading', step: 'Requesting access…' };
  const pdf = doc.kind === 'ready' ? doc.pdf : null;
  const pageCount = pdf?.numPages ?? 0;
  const annotations = useMemo(
    () =>
      version && annotationResult?.versionId === version.id
        ? annotationResult.list
        : [],
    [version, annotationResult],
  );
  const annotationError =
    version && annotationResult?.versionId === version.id
      ? annotationResult.error
      : '';

  useEffect(() => {
    setContext(
      paper
        ? [
            {
              id: `project-paper:${paper.id}`,
              kind: 'paper',
              title: paper.title,
              research: {
                kind: 'paper',
                projectId: project.id,
                projectPaperId: paper.id,
              },
            },
            ...(version
              ? [
                  {
                    id: `source-version:${version.id}`,
                    kind: 'paper' as const,
                    title: `Version ${version.ordinal}`,
                    research: {
                      kind: 'source-version' as const,
                      projectId: project.id,
                      projectPaperId: paper.id,
                      sourceVersionId: version.id,
                    },
                  },
                ]
              : []),
          ]
        : [],
    );
  }, [paper, version, project.id, setContext]);

  // ---- authorized download (re-signs once when a grant has expired)
  const versionKey = version?.id ?? null;
  useEffect(() => {
    if (!versionKey) return;
    let active = true;
    const set = (next: DocState) => {
      if (active) setDocResult({ key: docKey, doc: next });
    };
    void (async () => {
      let bytes: ArrayBuffer | null = null;
      let expected = '';
      for (let attempt = 0; attempt < 2 && !bytes; attempt++) {
        try {
          const access = await fetchSourceAccess(versionKey);
          expected = access.sha256;
          set({ kind: 'loading', step: 'Downloading the PDF…' });
          const response = await fetch(access.url, {
            cache: 'no-store',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
          });
          if (response.ok) bytes = await response.arrayBuffer();
          else if (attempt === 1)
            return set({ kind: 'error', reason: 'expired' });
        } catch (error) {
          if (error instanceof ApiError)
            return set({
              kind: 'error',
              reason: error.code === 'CONFLICT' ? 'conflict' : 'unauthorized',
            });
          if (attempt === 1) return set({ kind: 'error', reason: 'network' });
        }
      }
      if (!bytes) return set({ kind: 'error', reason: 'expired' });
      if ((await sha256Hex(bytes)) !== expected)
        return set({ kind: 'error', reason: 'integrity' });
      set({ kind: 'loading', step: 'Opening the document…' });
      try {
        const opened = await openPdf(bytes);
        if (!active) return void opened.destroy();
        textCache.current.clear();
        const targetPage = Number(requestedPage ?? 1);
        setPage(
          Number.isInteger(targetPage)
            ? Math.min(opened.pdf.numPages, Math.max(1, targetPage))
            : 1,
        );
        set({ kind: 'ready', ...opened });
      } catch (error) {
        const name = error instanceof Error ? error.name : '';
        set({
          kind: 'error',
          reason: name === 'PasswordException' ? 'password' : 'invalid',
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [versionKey, docKey, requestedPage]);
  const retryDocument = () => setDocAttempt((n) => n + 1);
  const destroy = doc.kind === 'ready' ? doc.destroy : null;
  useEffect(() => () => void destroy?.(), [destroy]);

  const readyVersion = version?.state === 'READY' ? version.id : null;
  useEffect(() => {
    if (!readyVersion) return;
    let active = true;
    fetchAnnotations(readyVersion)
      .then((list) => {
        if (active)
          setAnnotationResult({ versionId: readyVersion, list, error: '' });
      })
      .catch((error: unknown) => {
        if (active)
          setAnnotationResult((previous) => ({
            versionId: readyVersion,
            list: previous?.versionId === readyVersion ? previous.list : [],
            error:
              error instanceof Error
                ? error.message
                : 'Annotations could not be loaded.',
          }));
      });
    return () => {
      active = false;
    };
  }, [readyVersion, annotationRefresh]);
  const reloadAnnotations = () => setAnnotationRefresh((n) => n + 1);

  // ---- outline
  useEffect(() => {
    if (!pdf) return;
    let active = true;
    void (async () => {
      const items = (await pdf.getOutline()) ?? [];
      const resolved: { title: string; page: number }[] = [];
      for (const item of items.slice(0, 100)) {
        try {
          const dest =
            typeof item.dest === 'string'
              ? await pdf.getDestination(item.dest)
              : item.dest;
          const ref = dest?.[0];
          if (ref && typeof ref === 'object')
            resolved.push({
              title: item.title,
              page: (await pdf.getPageIndex(ref)) + 1,
            });
        } catch {
          // Unresolvable outline entries are skipped, not guessed.
        }
      }
      if (active) setOutline(resolved);
    })();
    return () => {
      active = false;
    };
  }, [pdf]);

  // ---- rendering
  const fitWidth = fit ? columnWidth : 0;
  useEffect(() => {
    if (!pdf || !canvasRef.current || !textRef.current || !viewport.current)
      return;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null =
      null;
    let textLayer: { cancel: () => void } | null = null;
    void (async () => {
      const [pdfjs, pdfPage] = await Promise.all([
        loadPdfEngine(),
        pdf.getPage(page),
      ]);
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const available = Math.max(
        240,
        (viewport.current?.clientWidth ?? 800) - 48,
      );
      const nextScale = fit ? available / base.width : zoom / 100;
      setScale(nextScale);
      const view = pdfPage.getViewport({ scale: nextScale });
      const ratio = window.devicePixelRatio || 1;
      const canvas = canvasRef.current!;
      canvas.width = Math.floor(view.width * ratio);
      canvas.height = Math.floor(view.height * ratio);
      canvas.style.width = `${Math.floor(view.width)}px`;
      canvas.style.height = `${Math.floor(view.height)}px`;
      pageBox.current!.style.width = `${Math.floor(view.width)}px`;
      pageBox.current!.style.height = `${Math.floor(view.height)}px`;
      pageBox.current!.style.setProperty(
        '--total-scale-factor',
        String(nextScale),
      );
      renderTask = pdfPage.render({
        canvas,
        viewport: view,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      const text = textRef.current!;
      text.replaceChildren();
      const layer = new pdfjs.TextLayer({
        textContentSource: pdfPage.streamTextContent(),
        container: text,
        viewport: view,
      });
      textLayer = layer;
      try {
        await Promise.all([renderTask.promise, layer.render()]);
        if (cancelled) return;
        const content = layerText(text);
        textCache.current.set(page, content);
        setPageText(content);
      } catch (error) {
        if (
          !cancelled &&
          !(
            error instanceof Error &&
            error.name === 'RenderingCancelledException'
          )
        )
          setDocResult((previous) =>
            previous
              ? { ...previous, doc: { kind: 'error', reason: 'invalid' } }
              : previous,
          );
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [pdf, page, zoom, fit, fitWidth]);
  // Fit-width re-renders when the reading column changes size meaningfully.
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setColumnWidth((w) =>
        Math.abs(node.clientWidth - w) > 24 ? node.clientWidth : w,
      ),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [doc.kind]);

  const go = useCallback(
    (next: number) => {
      if (!pageCount) return;
      setPending(null);
      setPage(Math.min(pageCount, Math.max(1, next)));
    },
    [pageCount],
  );

  // ---- selection → anchor
  function captureSelection() {
    const selection = window.getSelection();
    if (
      !selection ||
      selection.isCollapsed ||
      !textRef.current ||
      !pageBox.current
    )
      return setPending(null);
    const range = selection.getRangeAt(0);
    if (!textRef.current.contains(range.commonAncestorContainer))
      return setPending(null);
    const quote = selection
      .toString()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000);
    if (!quote) return setPending(null);
    const box = pageBox.current.getBoundingClientRect();
    const rects = normalizeRects([...range.getClientRects()], box);
    const text = layerText(textRef.current);
    const position = textPosition(textRef.current, range);
    const context = position
      ? quoteContext(text, position.start, position.end)
      : { prefix: null, suffix: null };
    const last = rects.at(-1);
    setPending({
      quote,
      anchor: {
        pageNumber: page,
        quote,
        prefix: context.prefix?.slice(-64) ?? null,
        suffix: context.suffix?.slice(0, 64) ?? null,
        startOffset: position?.start ?? null,
        endOffset: position?.end ?? null,
        rects,
      },
      top: last ? (last.y + last.height) * box.height + 6 : 8,
      left: last
        ? Math.min(box.width - 260, Math.max(0, last.x * box.width))
        : 8,
    });
  }

  async function createAnnotation(
    kind: 'HIGHLIGHT' | 'NOTE' | 'PAGE_NOTE',
    target: Pending | 'page',
    body?: string,
  ) {
    if (!version) return;
    setSaving(true);
    try {
      await runCommand({
        command: 'annotation.create',
        sourceVersionId: version.id,
        kind,
        visibility: privateNote ? 'PRIVATE' : 'PROJECT',
        ...(body ? { body } : {}),
        anchor:
          target === 'page'
            ? {
                pageNumber: page,
                quote: null,
                prefix: null,
                suffix: null,
                startOffset: null,
                endOffset: null,
                rects: [],
              }
            : target.anchor,
        idempotencyKey: crypto.randomUUID(),
      });
      window.getSelection()?.removeAllRanges();
      setPending(null);
      setNoteFor(null);
      setNoteBody('');
      flash(kind === 'HIGHLIGHT' ? 'Highlight saved' : 'Note saved', 'done');
      reloadAnnotations();
    } catch (error) {
      flash(
        error instanceof Error
          ? error.message
          : 'The annotation was not saved.',
      );
    } finally {
      setSaving(false);
    }
  }
  async function changeAnnotation(
    a: AnnotationDto,
    action: 'update' | 'delete',
    body?: string,
  ) {
    try {
      await runCommand(
        action === 'update'
          ? {
              command: 'annotation.update',
              id: a.id,
              expectedVersion: a.version,
              body: body ?? '',
            }
          : {
              command: 'annotation.delete',
              id: a.id,
              expectedVersion: a.version,
            },
      );
      flash(
        action === 'update' ? 'Note updated' : 'Annotation deleted',
        'done',
      );
    } catch (error) {
      flash(
        error instanceof Error ? error.message : 'The change was not saved.',
      );
    } finally {
      reloadAnnotations();
    }
  }

  async function find(term: string) {
    if (!pdf || !term.trim()) return;
    const needle = term.trim().toLowerCase();
    for (let offset = 1; offset <= pageCount; offset++) {
      const n = ((page - 1 + offset) % pageCount) + 1;
      let text = textCache.current.get(n);
      if (text === undefined) {
        const content = await (await pdf.getPage(n)).getTextContent();
        text = content.items.map((i) => ('str' in i ? i.str : '')).join('');
        textCache.current.set(n, text);
      }
      if (text.toLowerCase().includes(needle)) {
        go(n);
        flash(`Found on page ${n}`, 'done');
        return;
      }
    }
    flash(`No matches for “${term.trim()}”`);
  }

  const pageAnnotations = useMemo(
    () =>
      annotations
        .filter((a) => a.anchor.pageNumber === page)
        .map((a) => ({ ...a, located: locateAnchor(a.anchor, pageText) })),
    [annotations, page, pageText],
  );

  const panel = panelOpen && wide;
  const notesPanel = (
    <aside
      aria-label="Reading panel"
      className={cn(
        'flex min-h-0 shrink-0 flex-col border-l border-bd2 bg-canvas',
        wide
          ? 'w-80'
          : 'fixed inset-y-2 right-2 z-[81] w-[min(380px,calc(100vw-16px))] rounded-xl border shadow-pop',
      )}
    >
      {!wide ? (
        <div className="flex items-center justify-between px-3 pt-3">
          <DialogPrimitive.Title className="text-ui font-medium">
            Reader notes
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Annotations, outline and details for this paper.
          </DialogPrimitive.Description>
          <IconBtn
            label="Close reader notes"
            onClick={() => setMobilePanel(false)}
          >
            <X aria-hidden="true" />
          </IconBtn>
        </div>
      ) : null}
      <div className="border-b border-bd2 px-2.5 py-2">
        <Segmented
          label="Reading panel view"
          variant="plain"
          value={tab}
          onChange={setTab}
          options={[
            {
              value: 'notes',
              label: `Notes${annotations.length ? ` (${annotations.length})` : ''}`,
            },
            { value: 'outline', label: 'Outline' },
            { value: 'details', label: 'Details' },
          ]}
        />
      </div>
      <div className="flex-1 overflow-auto p-3">
        {tab === 'notes' ? (
          <>
            {annotationError ? (
              <p role="alert" className="mb-2 text-ctl text-danger">
                {annotationError}
              </p>
            ) : null}
            {noteFor ? (
              <form
                className="mb-3 rounded-lg border border-aiib bg-acs/40 p-2.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void createAnnotation(
                    noteFor === 'page' ? 'PAGE_NOTE' : 'NOTE',
                    noteFor,
                    noteBody.trim(),
                  );
                }}
              >
                <p className="mb-1.5 text-[11.5px] text-tx3">
                  {noteFor === 'page'
                    ? `Note on page ${page}`
                    : `Note on “${noteFor.quote.slice(0, 80)}${noteFor.quote.length > 80 ? '…' : ''}”`}
                </p>
                <label className="sr-only" htmlFor="reader-note">
                  Note
                </label>
                <textarea
                  id="reader-note"
                  required
                  rows={3}
                  maxLength={10000}
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  className="mb-2 w-full resize-none rounded-md border border-bd bg-canvas px-2 py-1.5 text-ctl"
                />
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-tx2">
                    <input
                      type="checkbox"
                      checked={privateNote}
                      onChange={(e) => setPrivateNote(e.target.checked)}
                    />
                    Only visible to me
                  </label>
                  <span className="flex-1" />
                  <Btn
                    type="button"
                    variant="ghost"
                    size="md"
                    onClick={() => setNoteFor(null)}
                  >
                    Cancel
                  </Btn>
                  <Btn
                    type="submit"
                    variant="primary"
                    size="md"
                    disabled={saving}
                  >
                    {saving ? 'Saving…' : 'Save note'}
                  </Btn>
                </div>
              </form>
            ) : canWrite && pdf ? (
              <Btn
                variant="outline"
                size="md"
                className="mb-3"
                onClick={() => setNoteFor('page')}
              >
                <StickyNote aria-hidden="true" className="!size-3" />
                Add a note to page {page}
              </Btn>
            ) : null}
            {annotations.length ? (
              annotations.map((a) => (
                <AnnotationCard
                  key={a.id}
                  annotation={a}
                  active={activeAnnotation === a.id}
                  onOpen={() => {
                    setActiveAnnotation(a.id);
                    go(a.anchor.pageNumber);
                    setMobilePanel(false);
                  }}
                  onChange={changeAnnotation}
                />
              ))
            ) : (
              <p className="text-ctl text-tx3">
                No annotations on this version yet. Select text in the PDF to
                highlight it or add a note.
              </p>
            )}
          </>
        ) : null}
        {tab === 'outline' ? (
          outline.length ? (
            outline.map((o) => (
              <button
                key={`${o.title}-${o.page}`}
                type="button"
                aria-current={o.page === page ? 'true' : undefined}
                onClick={() => go(o.page)}
                className={cn(
                  'flex h-[30px] w-full items-center gap-2 rounded-md px-3 text-ctl hover:bg-hov',
                  o.page === page && 'bg-hov',
                )}
              >
                <span className="flex-1 truncate text-left">{o.title}</span>
                <span className="text-[11px] text-tx3">{o.page}</span>
              </button>
            ))
          ) : (
            <p className="text-ctl text-tx3">
              {pdf
                ? 'This PDF has no outline.'
                : 'Open a ready PDF to see its outline.'}
            </p>
          )
        ) : null}
        {tab === 'details' && paper ? (
          <div className="text-ctl">
            <p className="mb-1 font-serif text-[17px] leading-[1.25]">
              {paper.title}
            </p>
            <p className="mb-3 text-tx2">
              {paper.paper
                ? authorSummary(paper.paper)
                : 'Private project document'}
            </p>
            <dl className="mb-3 grid grid-cols-[84px_1fr] gap-x-2 gap-y-1.5">
              <dt className="text-tx3">Year</dt>
              <dd>{paper.paper?.year ?? 'Not listed'}</dd>
              <dt className="text-tx3">Venue</dt>
              <dd>{paper.paper?.venue ?? 'Not listed'}</dd>
              <dt className="text-tx3">DOI</dt>
              <dd className="break-all">
                {paper.paper?.doi ?? 'None recorded'}
              </dd>
              <dt className="text-tx3">Version</dt>
              <dd>
                {version
                  ? `v${version.ordinal} · ${version.fileName}`
                  : 'No readable version'}
              </dd>
              <dt className="text-tx3">Checksum</dt>
              <dd className="font-mono text-[11px] break-all">
                {version?.sha256 ?? '—'}
              </dd>
              <dt className="text-tx3">Rights</dt>
              <dd>Uploaded by a project member</dd>
            </dl>
            <Btn
              variant="outline"
              size="md"
              onClick={() =>
                void navigator.clipboard
                  ?.writeText(referenceText(paper.paper, paper.title))
                  .then(() => flash('Reference copied', 'done'))
              }
            >
              <Quote aria-hidden="true" className="!size-3" />
              Copy reference
            </Btn>
            <p className="mt-3 text-[11.5px] text-tx3">
              <Sparkles
                aria-hidden="true"
                className="mr-1 inline size-3 text-actx"
              />
              Atlas AI analysis of this paper arrives in Phase 03. No summary is
              generated here.
            </p>
          </div>
        ) : null}
      </div>
    </aside>
  );

  if (!paperId)
    return (
      <ReaderFrame project={project} title="PDF reader">
        <div className="p-8 max-sm:p-4">
          <EmptyState
            dashed
            icon={BookOpen}
            title="Choose a paper to read"
            description="Open a saved paper from the library to read its PDF and annotations."
          >
            <Btn
              variant="primary"
              size="lg"
              onClick={() => router.push(`/app/projects/${project.id}/library`)}
            >
              Open library
            </Btn>
          </EmptyState>
        </div>
      </ReaderFrame>
    );
  if (state.kind !== 'ready')
    return (
      <ReaderFrame project={project} title="PDF reader">
        <div className="p-8 max-sm:p-4">
          {state.kind === 'loading' ? <SkeletonLines /> : null}
          {state.kind === 'unavailable' ? (
            <EmptyState
              icon={ShieldAlert}
              title="This paper is unavailable"
              description="It does not exist in this project or you no longer have access."
            />
          ) : null}
          {state.kind === 'error' ? (
            <ErrorBanner title="The paper could not be loaded">
              {state.message}
            </ErrorBanner>
          ) : null}
        </div>
      </ReaderFrame>
    );
  const readyVersions = state.paper.sources.filter((s) => s.state === 'READY');
  const latest = state.paper.sources[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-bd2 px-3">
        <SidebarToggle />
        <IconBtn
          label="Back to library"
          onClick={() =>
            router.push(
              `/app/projects/${project.id}/library?paper=${state.paper.id}`,
            )
          }
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
        </IconBtn>
        <h1 className="max-w-[260px] truncate font-serif text-base">
          {state.paper.title}
        </h1>
        {readyVersions.length > 1 ? (
          <label className="text-xs text-tx3">
            <span className="sr-only">Source version</span>
            <select
              className="h-7 rounded-md border border-bd bg-canvas px-1.5 text-xs text-tx"
              value={versionId ?? ''}
              onChange={(e) =>
                setChosenVersion({
                  paperId: state.paper.id,
                  id: e.target.value,
                })
              }
            >
              {readyVersions.map((s) => (
                <option key={s.id} value={s.id}>
                  v{s.ordinal} · {s.fileName}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <span className="flex-1" />
        <form
          className="flex h-7 w-[170px] items-center gap-1.5 rounded-md border border-bd px-[9px] max-md:hidden"
          onSubmit={(e) => {
            e.preventDefault();
            void find(search);
          }}
        >
          <Search aria-hidden="true" className="size-3 text-tx3" />
          <label className="sr-only" htmlFor="reader-search">
            Search in PDF
          </label>
          <input
            id="reader-search"
            value={search}
            disabled={!pdf}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search in PDF"
            className="min-w-0 flex-1 text-xs"
          />
        </form>
        <IconBtn
          label="Zoom out"
          size="base"
          disabled={!pdf}
          onClick={() => {
            setFit(false);
            setZoom(Math.max(50, Math.round(scale * 100) - 10));
          }}
        >
          <ZoomOut aria-hidden="true" className="size-[14px]" />
        </IconBtn>
        <span className="tnum w-[38px] text-center text-xs text-tx2">
          {Math.round(scale * 100)}%
        </span>
        <IconBtn
          label="Zoom in"
          size="base"
          disabled={!pdf}
          onClick={() => {
            setFit(false);
            setZoom(Math.min(300, Math.round(scale * 100) + 10));
          }}
        >
          <ZoomIn aria-hidden="true" className="size-[14px]" />
        </IconBtn>
        <IconBtn
          label="Fit width"
          size="base"
          tone={fit ? 'active' : 'default'}
          disabled={!pdf}
          onClick={() => setFit(true)}
        >
          <MoveHorizontal aria-hidden="true" className="size-[14px]" />
        </IconBtn>
        <IconBtn
          label="Page list"
          tone={pagesOpen ? 'active' : 'default'}
          disabled={!pdf}
          onClick={() => setPagesOpen((o) => !o)}
        >
          <PanelLeft aria-hidden="true" className="size-[15px]" />
        </IconBtn>
        <IconBtn
          ref={notesTrigger}
          label="Notes panel"
          tone={panel ? 'active' : 'default'}
          onClick={() =>
            wide ? setPanelOpen((o) => !o) : setMobilePanel((o) => !o)
          }
        >
          <PanelRight aria-hidden="true" className="size-[15px]" />
        </IconBtn>
      </header>
      <div className="relative flex min-h-0 flex-1">
        {pagesOpen && pdf ? (
          <nav
            aria-label="Pages"
            className="w-[88px] shrink-0 overflow-auto border-r border-bd2 bg-canvas p-2"
          >
            {Array.from(
              { length: Math.min(pageCount, 2000) },
              (_, i) => i + 1,
            ).map((n) => (
              <button
                key={n}
                type="button"
                aria-current={n === page ? 'page' : undefined}
                onClick={() => go(n)}
                className={cn(
                  'mb-1 flex h-[30px] w-full items-center justify-center rounded-md text-ctl hover:bg-hov',
                  n === page && 'bg-hov font-medium',
                )}
              >
                {n}
                {annotations.some((a) => a.anchor.pageNumber === n) ? (
                  <span
                    aria-label="has annotations"
                    className="ml-1 size-1.5 rounded-full bg-ac"
                  />
                ) : null}
              </button>
            ))}
          </nav>
        ) : null}
        <div className="relative flex min-w-0 flex-1 flex-col bg-pdfbg">
          <AtlasAnchor placement="canvas" />
          <div
            ref={viewport}
            tabIndex={0}
            role="region"
            aria-label="PDF page"
            className="min-h-0 flex-1 overflow-auto px-6 pt-[calc(58px+var(--aic))] pb-[60px] outline-none focus-visible:ring-2 focus-visible:ring-ac max-sm:px-3"
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (['ArrowRight', 'PageDown'].includes(e.key)) {
                e.preventDefault();
                go(page + 1);
              }
              if (['ArrowLeft', 'PageUp'].includes(e.key)) {
                e.preventDefault();
                go(page - 1);
              }
              if (e.key === 'Home') go(1);
              if (e.key === 'End') go(pageCount);
            }}
          >
            {doc.kind === 'ready' ? (
              <div
                ref={pageBox}
                className="atlas-pdf-page"
                onMouseUp={captureSelection}
                onKeyUp={captureSelection}
              >
                <canvas ref={canvasRef} aria-hidden="true" />
                <div
                  ref={textRef}
                  className="textLayer"
                  aria-label={`Text of page ${page}`}
                />
                {pageAnnotations.map((a) =>
                  a.located.status === 'LOST'
                    ? null
                    : a.anchor.rects.map((r, i) => (
                        <button
                          key={`${a.id}-${i}`}
                          type="button"
                          aria-label={`${a.kind === 'HIGHLIGHT' ? 'Highlight' : 'Note'}: ${a.anchor.quote ?? ''}`}
                          tabIndex={i === 0 ? 0 : -1}
                          onClick={() => {
                            setActiveAnnotation(a.id);
                            setTab('notes');
                            if (!wide) setMobilePanel(true);
                          }}
                          className={cn(
                            'absolute z-[3] rounded-[2px] mix-blend-multiply',
                            activeAnnotation === a.id
                              ? 'outline-2 outline-ac outline-solid'
                              : '',
                          )}
                          style={{
                            left: `${r.x * 100}%`,
                            top: `${r.y * 100}%`,
                            width: `${r.width * 100}%`,
                            height: `${r.height * 100}%`,
                            background:
                              a.kind === 'HIGHLIGHT'
                                ? 'rgb(240 200 60 / 0.42)'
                                : 'rgb(80 160 255 / 0.3)',
                          }}
                        />
                      )),
                )}
                {pending && canWrite ? (
                  <span
                    role="toolbar"
                    aria-label="Selection actions"
                    className="absolute z-[4] flex flex-wrap items-center gap-0.5 rounded-lg border border-bd bg-pop p-1 font-sans text-xs whitespace-nowrap text-tx shadow-pop"
                    style={{ top: pending.top, left: pending.left }}
                  >
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        void createAnnotation('HIGHLIGHT', pending)
                      }
                      className="flex h-[26px] items-center gap-[5px] rounded-[5px] px-2 hover:bg-hov"
                    >
                      <Highlighter aria-hidden="true" className="size-3" />
                      Highlight
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNoteFor(pending);
                        setTab('notes');
                        setPanelOpen(true);
                        if (!wide) setMobilePanel(true);
                      }}
                      className="flex h-[26px] items-center gap-[5px] rounded-[5px] px-2 hover:bg-hov"
                    >
                      <StickyNote aria-hidden="true" className="size-3" />
                      Add note
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void navigator.clipboard
                          ?.writeText(
                            `“${pending.quote}” (${state.paper.title}, p. ${page})`,
                          )
                          .then(() =>
                            flash('Quote copied with its page', 'done'),
                          )
                      }
                      className="flex h-[26px] items-center gap-[5px] rounded-[5px] px-2 hover:bg-hov"
                    >
                      <Quote aria-hidden="true" className="size-3" />
                      Copy quote
                    </button>
                    <span aria-hidden="true" className="h-4 w-px bg-bd" />
                    <button
                      type="button"
                      onClick={() =>
                        atlas.ask({
                          mode: 'open',
                          chips: [
                            {
                              id: `project-paper:${state.paper.id}`,
                              kind: 'paper',
                              title: state.paper.title,
                            },
                            {
                              id: `selection:${versionId}:${page}`,
                              kind: 'selection',
                              title: `p.${page}: “${pending.quote.slice(0, 60)}”`,
                              ...(versionId
                                ? {
                                    research: {
                                      kind: 'selection' as const,
                                      projectId: project.id,
                                      projectPaperId: state.paper.id,
                                      sourceVersionId: versionId,
                                      pageNumber: page,
                                      quote: pending.quote,
                                    },
                                  }
                                : {}),
                            },
                          ],
                        })
                      }
                      className="flex h-[26px] items-center gap-[5px] rounded-[5px] px-2 font-medium text-actx hover:bg-acs"
                    >
                      <Sparkles aria-hidden="true" className="size-3" />
                      Ask Atlas
                    </button>
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="mx-auto max-w-[620px] rounded-2xl border border-bd2 bg-canvas p-6">
                {doc.kind === 'loading' ? (
                  <>
                    <p role="status" className="mb-3 text-ctl text-tx2">
                      {doc.step}
                    </p>
                    <SkeletonLines />
                  </>
                ) : doc.kind === 'error' ? (
                  <ErrorBanner
                    title={docErrors[doc.reason][0]}
                    action={
                      ['expired', 'network', 'unauthorized'].includes(
                        doc.reason,
                      ) ? (
                        <Btn
                          variant="outline"
                          size="md"
                          onClick={retryDocument}
                        >
                          Retry
                        </Btn>
                      ) : undefined
                    }
                  >
                    {docErrors[doc.reason][1]}
                  </ErrorBanner>
                ) : latest ? (
                  <EmptyState
                    icon={Lock}
                    title={sourceStateLabels[latest.state]}
                    description={
                      latest.state === 'REJECTED' || latest.state === 'FAILED'
                        ? `${latest.failure ?? 'The file did not pass validation.'} Upload another copy from the library.`
                        : 'Uploaded files stay quarantined until isolated validation accepts them. They cannot be opened before then.'
                    }
                  />
                ) : (
                  <EmptyState
                    icon={BookOpen}
                    title={
                      state.paper.paper?.pdfLocations.length
                        ? 'External PDF link only'
                        : 'No PDF available'
                    }
                    description={
                      state.paper.paper?.pdfLocations.length
                        ? 'The provider lists an external open-access copy. Atlas does not fetch or store it; open it on the source site, or upload a copy you may use.'
                        : 'No PDF is stored for this paper. Metadata and citations still work; upload a copy you have the right to use from the library.'
                    }
                  >
                    {state.paper.paper?.pdfLocations.map((l) => (
                      <a
                        key={l.url}
                        className="inline-flex h-[30px] items-center gap-1.5 rounded-[7px] border border-bd px-3 text-ctl hover:bg-hov"
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        External PDF via {providerLabels[l.provider]}
                        <ArrowUpRight aria-hidden="true" className="size-3" />
                      </a>
                    ))}
                    <Link
                      className="inline-flex h-[30px] items-center rounded-[7px] bg-acb px-3 text-ctl font-medium text-white hover:bg-acbh"
                      href={`/app/projects/${project.id}/library?paper=${state.paper.id}`}
                    >
                      Open in library
                    </Link>
                  </EmptyState>
                )}
              </div>
            )}
          </div>
          <div className="flex h-[38px] shrink-0 items-center justify-center gap-2 border-t border-bd2 bg-canvas text-xs text-tx2">
            <IconBtn
              label="Previous page"
              size="base"
              disabled={!pdf || page <= 1}
              onClick={() => go(page - 1)}
            >
              <ChevronLeft aria-hidden="true" className="size-[14px]" />
            </IconBtn>
            <span className="tnum" aria-live="polite">
              {pdf ? `Page ${page} of ${pageCount}` : 'No page loaded'}
            </span>
            <IconBtn
              label="Next page"
              size="base"
              disabled={!pdf || page >= pageCount}
              onClick={() => go(page + 1)}
            >
              <ChevronRight aria-hidden="true" className="size-[14px]" />
            </IconBtn>
          </div>
        </div>
        {panel ? notesPanel : null}
        <DialogPrimitive.Root
          open={!wide && mobilePanel}
          onOpenChange={setMobilePanel}
        >
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-dim" />
            <DialogPrimitive.Content
              asChild
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                notesTrigger.current?.focus();
              }}
            >
              {notesPanel}
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </div>
    </div>
  );
}

function AnnotationCard({
  annotation: a,
  active,
  onOpen,
  onChange,
}: {
  annotation: AnnotationDto;
  active: boolean;
  onOpen: () => void;
  onChange: (
    a: AnnotationDto,
    action: 'update' | 'delete',
    body?: string,
  ) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(a.body ?? '');
  return (
    <div
      className={cn(
        'mb-2 rounded-lg border p-2.5',
        active ? 'border-aiib bg-card' : 'border-bd2',
      )}
    >
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <span className="mb-1.5 flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 rounded-[2px]"
            style={{
              background:
                a.kind === 'HIGHLIGHT' ? 'rgb(240 200 60)' : 'rgb(80 160 255)',
            }}
          />
          <span className="font-mono text-[11px] text-tx2">
            p.{a.anchor.pageNumber}
          </span>
          <span className="text-[11px] text-tx3">
            {a.kind === 'HIGHLIGHT'
              ? 'Highlight'
              : a.kind === 'PAGE_NOTE'
                ? 'Page note'
                : 'Note'}
          </span>
          <span className="flex-1" />
          {a.visibility === 'PRIVATE' ? <StatusTag>Private</StatusTag> : null}
          {a.anchorStatus === 'RECOVERED' ? (
            <StatusTag>Recovered anchor</StatusTag>
          ) : null}
        </span>
        {a.anchor.quote ? (
          <span className="mb-[5px] block font-read text-ui leading-normal text-tx2 italic">
            “{a.anchor.quote}”
          </span>
        ) : null}
      </button>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onChange(a, 'update', body.trim()).then(() =>
              setEditing(false),
            );
          }}
        >
          <label className="sr-only" htmlFor={`edit-${a.id}`}>
            Edit note
          </label>
          <textarea
            id={`edit-${a.id}`}
            rows={3}
            maxLength={10000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="mb-1.5 w-full resize-none rounded-md border border-bd bg-canvas px-2 py-1.5 text-ctl"
          />
          <div className="flex justify-end gap-1.5">
            <Btn
              type="button"
              variant="ghost"
              size="md"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Btn>
            <Btn type="submit" variant="primary" size="md">
              Save
            </Btn>
          </div>
        </form>
      ) : a.body ? (
        <p className="text-ctl whitespace-pre-wrap">{a.body}</p>
      ) : null}
      {a.editable && !editing ? (
        <div className="mt-1.5 flex gap-1">
          <Btn variant="ghost" size="xs" onClick={() => setEditing(true)}>
            Edit
          </Btn>
          <Btn
            variant="ghost"
            size="xs"
            onClick={() => {
              if (window.confirm('Delete this annotation?'))
                void onChange(a, 'delete');
            }}
          >
            Delete
          </Btn>
        </div>
      ) : null}
    </div>
  );
}

function ReaderFrame({
  project,
  title,
  children,
}: {
  project: ProjectDto;
  title: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-bd2 px-3">
        <SidebarToggle />
        <IconBtn
          label="Back to library"
          onClick={() => router.push(`/app/projects/${project.id}/library`)}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
        </IconBtn>
        <h1 className="truncate font-serif text-base">{title}</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
