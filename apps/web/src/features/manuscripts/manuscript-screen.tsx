'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Group, Panel, Separator } from 'react-resizable-panels';
import {
  BookMarked,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleX,
  Code,
  Columns2,
  Cpu,
  Download,
  FileCode,
  FileCog,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  History,
  Image,
  LocateFixed,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Terminal,
  TriangleAlert,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import { Btn, IconBtn } from '@/components/atlas/button';
import { SampleTag } from '@/components/atlas/chips';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/atlas/overlay';
import { Segmented } from '@/components/atlas/segmented';
import { ErrorBanner } from '@/components/atlas/states';
import { useToast } from '@/components/atlas/toast';
import { useAtlas } from '@/features/atlas-ai/atlas-provider';
import { AtlasAnchor } from '@/features/atlas-ai/atlas-surface';
import { SharePopover } from '@/features/overlays/share-popover';
import { VersionHistoryDialog } from '@/features/overlays/version-history-dialog';
import { useShell } from '@/features/shell/shell-context';
import { Crumb, Topbar } from '@/features/shell/topbar';
import { useMediaQuery } from '@/features/shell/use-media';
import {
  fileTree,
  presenceLine,
  problems,
  syncBlocks,
  texFiles,
  texSources,
  type PdfBlock,
  type TexFile,
} from '@/lib/preview/manuscript';
import { LatexEditor } from './latex-editor';
import { PdfPreview } from './pdf-preview';
type Layout = 'editor' | 'split' | 'pdf';
const treeIcons = {
  tex: FileCode,
  dir: Folder,
  image: Image,
  bib: BookMarked,
  cls: FileCog,
} as const;
/**
 * Manuscript workspace (handoff §6 "Manuscript"): file tree 200 / editor /
 * 7px splitter / PDF. The PDF is an illustration and the compile control
 * never runs a compiler in this phase.
 */
export function ManuscriptScreen() {
  const flash = useToast();
  const atlas = useAtlas();
  const shell = useShell();
  const params = useSearchParams();
  const failedDemo = params.get('demo') === 'errors';
  const wide = useMediaQuery('(min-width: 1280px)');
  const showTree = useMediaQuery('(min-width: 1100px)');
  const workspace = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = workspace.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setCanvasWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const treeVisible = showTree && (canvasWidth === null || canvasWidth >= 884);
  const splitFits =
    !shell.narrow && (canvasWidth === null || canvasWidth >= 680);
  const [layoutPref, setLayout] = useState<Layout>('split');
  const layout: Layout =
    !splitFits && layoutPref === 'split' ? 'editor' : layoutPref;
  const [file, setFile] = useState<TexFile>('main.tex');
  const { setContext } = atlas;
  useEffect(() => {
    setContext([{ id: `ms-${file}`, kind: 'manuscript', title: file }]);
  }, [file, setContext]);
  const [docs, setDocs] = useState<Record<TexFile, string>>(texSources);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [range, setRange] = useState<[TexFile, number, number] | null>(null);
  const [highlight, setHighlight] = useState<PdfBlock | null>(null);
  const [problemsOpen, setProblemsOpen] = useState(true);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [history, setHistory] = useState(false);
  const showComposer = atlas.editorComposer && layout !== 'pdf';
  const goBlock = useCallback((block: PdfBlock) => {
    const b = syncBlocks.find((x) => x.block === block);
    if (!b) return;
    setFile(b.file);
    setActiveLine(b.from);
    setRange([b.file, b.from, b.to]);
    setHighlight(block);
    setLayout((l) => (l === 'pdf' ? 'split' : l));
  }, []);
  const onLine = useCallback(
    (line: number) => {
      const b = syncBlocks.find(
        (x) => x.file === file && line >= x.from && line <= x.to,
      );
      setActiveLine(line);
      setRange(b ? [b.file, b.from, b.to] : null);
      setHighlight(b?.block ?? null);
      if (b) setPage(1);
    },
    [file],
  );
  const onChange = useCallback(
    (f: TexFile, text: string) => setDocs((d) => ({ ...d, [f]: text })),
    [],
  );
  const fixWithAtlas = () => {
    atlas.setEditorComposer(true);
    atlas.ask({
      mode: 'open',
      chips: [
        { id: 'ms-main', kind: 'manuscript', title: 'main.tex' },
        { id: 'problems', kind: 'problems', title: 'Problems (3)' },
      ],
      prompt: '/latex fix the undefined \\methodname and define M before Eq. 1',
    });
  };
  const compile = () =>
    flash(
      'Compilation isn’t available in this preview — the PDF pane shows a sample illustration',
    );
  const fileProblems = problems.filter((p) => p.file === file);
  const errors = problems.filter((p) => p.severity === 'error').length;
  const warnings = problems.length - errors;
  const editorPane = (
    <div className="flex h-full min-w-0 flex-col bg-code">
      <div
        role="tablist"
        aria-label="Open files"
        className="flex h-[34px] shrink-0 items-end gap-px border-b border-bd2 bg-canvas px-1.5"
      >
        {texFiles.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={f === file}
            onClick={() => {
              setFile(f);
              setActiveLine(null);
            }}
            className={cn(
              'flex h-[30px] items-center gap-1.5 rounded-t-md border border-b-0 px-2.5 font-mono text-xs',
              f === file
                ? 'border-bd2 bg-code text-tx'
                : 'border-transparent text-tx3 hover:text-tx2',
            )}
          >
            <FileCode aria-hidden="true" className="size-3 text-tx3" />
            {f}
            {problems.some((p) => p.file === f && p.severity === 'error') ? (
              <span className="size-1.5 rounded-full bg-danger">
                <span className="sr-only">has errors</span>
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="relative min-h-0 flex-1">
        {showComposer ? <AtlasAnchor placement="editor" /> : null}
        <LatexEditor
          file={file}
          docs={docs}
          problems={fileProblems}
          range={range && range[0] === file ? [range[1], range[2]] : null}
          activeLine={activeLine}
          presenceLine={file === 'main.tex' ? presenceLine : null}
          topInset={
            showComposer && atlas.mode !== 'panel' && atlas.mode !== 'focus'
              ? 64
              : 12
          }
          onLineClick={onLine}
          onChange={onChange}
        />
      </div>
      <div className="shrink-0 border-t border-bd2 bg-canvas">
        <div className="flex h-[30px] items-center gap-2.5 pr-1.5 pl-3 text-xs whitespace-nowrap text-tx2">
          <button
            type="button"
            aria-expanded={problemsOpen}
            onClick={() => setProblemsOpen((o) => !o)}
            className="flex h-[30px] min-w-0 flex-1 items-center gap-2.5"
          >
            <span className="font-medium text-tx">Problems</span>
            <span className="flex items-center gap-1 text-danger">
              <CircleX aria-hidden="true" className="size-3" />
              {errors}
              <span className="sr-only">errors</span>
            </span>
            <span className="flex items-center gap-1 text-warn">
              <TriangleAlert aria-hidden="true" className="size-3" />
              {warnings}
              <span className="sr-only">warnings</span>
            </span>
            <SampleTag className="max-sm:hidden">Sample diagnostics</SampleTag>
          </button>
          <Btn
            variant="aiGhost"
            size="xs"
            className="font-normal"
            onClick={fixWithAtlas}
          >
            <Sparkles aria-hidden="true" className="!size-[11px]" />
            Fix with Atlas
          </Btn>
          <IconBtn
            label={problemsOpen ? 'Hide problems' : 'Show problems'}
            size="md"
            onClick={() => setProblemsOpen((o) => !o)}
          >
            {problemsOpen ? (
              <ChevronDown aria-hidden="true" className="size-[13px]" />
            ) : (
              <ChevronUp aria-hidden="true" className="size-[13px]" />
            )}
          </IconBtn>
        </div>
        {problemsOpen ? (
          <ul aria-label="Problems" className="px-1.5 pb-1.5">
            {problems.map((p) => (
              <li key={p.file + p.line}>
                <button
                  type="button"
                  onClick={() => {
                    setFile(p.file);
                    setActiveLine(p.line);
                  }}
                  className="flex h-[26px] w-full items-center gap-2.5 rounded-sm px-2 text-xs hover:bg-hov"
                >
                  {p.severity === 'error' ? (
                    <CircleX
                      aria-label="Error"
                      className="size-3 text-danger"
                    />
                  ) : (
                    <TriangleAlert
                      aria-label="Warning"
                      className="size-3 text-warn"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate text-left font-mono text-[11.5px]">
                    {p.message}
                  </span>
                  <span className="font-mono text-[11px] text-tx3">
                    {p.file}:{p.line}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
  const pdfPane = (
    <div className="flex h-full min-w-0 flex-col bg-pdfbg">
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-bd2 bg-canvas px-2.5">
        <IconBtn
          label="Previous page"
          size="base"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          <ChevronLeft aria-hidden="true" className="size-[14px]" />
        </IconBtn>
        <span className="tnum text-ctl text-tx2" aria-live="polite">
          {page} / 7
        </span>
        <IconBtn
          label="Next page"
          size="base"
          disabled={page >= 7}
          onClick={() => setPage((p) => Math.min(7, p + 1))}
        >
          <ChevronRight aria-hidden="true" className="size-[14px]" />
        </IconBtn>
        <span className="ml-1.5 inline-flex min-w-0 items-center gap-[5px] truncate text-[11.5px] text-tx3">
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full bg-danger"
          />
          {failedDemo
            ? 'Sample failed log · showing sample PDF'
            : 'Sample PDF · not compiled · 1 error'}
        </span>
        <span className="flex-1" />
        <IconBtn
          label="Jump to source"
          size="base"
          onClick={() => goBlock('intro2')}
        >
          <LocateFixed aria-hidden="true" className="size-[14px]" />
        </IconBtn>
        <IconBtn
          label="Zoom out"
          size="base"
          onClick={() => setZoom((z) => Math.max(50, z - 10))}
        >
          <ZoomOut aria-hidden="true" className="size-[14px]" />
        </IconBtn>
        <span className="tnum w-10 text-center text-xs text-tx2">{zoom}%</span>
        <IconBtn
          label="Zoom in"
          size="base"
          onClick={() => setZoom((z) => Math.min(200, z + 10))}
        >
          <ZoomIn aria-hidden="true" className="size-[14px]" />
        </IconBtn>
      </div>
      {failedDemo ? (
        <div className="mx-[18px] mt-3.5">
          <ErrorBanner
            title="Compilation failed (sample log)"
            action={
              <div className="flex gap-1.5">
                <Btn variant="primary" size="md" onClick={fixWithAtlas}>
                  <Sparkles aria-hidden="true" className="!size-3" />
                  Fix
                </Btn>
                <Btn
                  variant="outline"
                  size="md"
                  onClick={() => setProblemsOpen(true)}
                >
                  View log
                </Btn>
              </div>
            }
          >
            <span className="font-mono text-[11.5px]">
              ! Undefined control sequence. l.40 As shown by \methodname
            </span>
          </ErrorBanner>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto px-[18px] pt-5 pb-10">
        <PdfPreview
          page={page}
          widthPct={Math.round(Math.min(100, zoom * 0.92))}
          highlight={highlight}
          onBlock={goBlock}
        />
      </div>
    </div>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar
        bordered
        className="pr-2.5"
        actions={
          <>
            <Segmented
              label="Layout"
              size="sm"
              value={layout}
              onChange={(l) => {
                setLayout(l);
                if (l === 'pdf' && atlas.mode === 'open') atlas.collapse();
              }}
              options={[
                {
                  value: 'editor',
                  label: '',
                  ariaLabel: 'Editor only',
                  icon: <Code aria-hidden="true" className="!size-[14px]" />,
                },
                {
                  value: 'split',
                  label: '',
                  ariaLabel: 'Split',
                  icon: (
                    <Columns2 aria-hidden="true" className="!size-[14px]" />
                  ),
                },
                {
                  value: 'pdf',
                  label: '',
                  ariaLabel: 'PDF only',
                  icon: (
                    <FileText aria-hidden="true" className="!size-[14px]" />
                  ),
                },
              ]}
            />
            <div className="flex overflow-hidden rounded-md border border-bd bg-el">
              <button
                type="button"
                onClick={compile}
                aria-label="Compile"
                className="inline-flex h-7 items-center gap-1.5 px-2.5 text-ctl font-medium whitespace-nowrap hover:bg-hov"
              >
                <Play aria-hidden="true" className="size-[13px]" />
                <span className="max-sm:hidden">Compile</span>
              </button>
              <Menu>
                <MenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Compile options"
                    className="grid h-7 w-6 place-items-center border-l border-bd text-tx2 hover:bg-hov"
                  >
                    <ChevronDown aria-hidden="true" className="size-3" />
                  </button>
                </MenuTrigger>
                <MenuContent width={240} align="end">
                  <MenuItem
                    icon={<RefreshCw />}
                    sub="Needs the Phase 07 sandbox"
                    disabled
                  >
                    Auto-compile on save
                  </MenuItem>
                  <MenuItem
                    icon={<Cpu />}
                    sub="pdfLaTeX · TeX Live 2025"
                    onSelect={() =>
                      flash('Compiler selection is UI-only in this preview')
                    }
                  >
                    Compiler
                  </MenuItem>
                  <MenuItem icon={<RotateCcw />} onSelect={compile}>
                    Recompile from scratch
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem
                    icon={<Terminal />}
                    onSelect={() => setProblemsOpen(true)}
                  >
                    Show sample log
                  </MenuItem>
                </MenuContent>
              </Menu>
            </div>
            <Btn
              variant="secondary"
              className="max-sm:hidden"
              onClick={() =>
                flash('Download isn’t available — no PDF has been compiled')
              }
              aria-label="Download PDF"
            >
              <Download aria-hidden="true" />
              {wide ? 'Download' : null}
            </Btn>
            <Btn
              variant="secondary"
              className="max-sm:hidden"
              onClick={() => setHistory(true)}
              aria-label="Version history"
            >
              <History aria-hidden="true" />
              {wide ? 'History' : null}
            </Btn>
            <SharePopover resource="Sparse Evoformer" />
          </>
        }
      >
        <Btn
          variant={atlas.editorComposer ? 'primary' : 'secondary'}
          className="shrink-0 max-sm:px-2"
          aria-label={atlas.editorComposer ? 'Hide Atlas' : 'Ask Atlas'}
          onClick={() => {
            if (atlas.editorComposer && atlas.mode === 'open') atlas.collapse();
            atlas.setEditorComposer(!atlas.editorComposer);
          }}
        >
          {atlas.editorComposer ? (
            <X aria-hidden="true" />
          ) : (
            <Sparkles aria-hidden="true" />
          )}
          <span className="max-sm:hidden">
            {atlas.editorComposer ? 'Hide Atlas' : 'Ask Atlas'}
          </span>
        </Btn>
        <span className="ml-1 hidden md:block">
          <Crumb parent="Manuscripts" title="Sparse Evoformer" />
        </span>
        <h1 className="sr-only md:hidden">Sparse Evoformer manuscript</h1>
      </Topbar>
      <div ref={workspace} className="flex min-h-0 flex-1">
        {treeVisible ? (
          <nav
            aria-label="Manuscript files"
            className="flex w-[200px] shrink-0 flex-col border-r border-bd2 bg-canvas"
          >
            <div className="flex items-center pt-2.5 pr-2.5 pb-1.5 pl-3 text-[11.5px] font-medium text-tx3">
              <span className="flex-1">Files</span>
              <IconBtn
                label="New file"
                size="sm"
                onClick={() =>
                  flash('File creation is UI-only in this preview')
                }
              >
                <FilePlus aria-hidden="true" className="size-[13px]" />
              </IconBtn>
              <IconBtn
                label="New folder"
                size="sm"
                onClick={() =>
                  flash('Folder creation is UI-only in this preview')
                }
              >
                <FolderPlus aria-hidden="true" className="size-[13px]" />
              </IconBtn>
            </div>
            <ul className="flex-1 overflow-auto px-1.5 pb-2.5">
              {fileTree.map((f) => {
                const Icon =
                  f.kind === 'dir' && f.open ? FolderOpen : treeIcons[f.kind];
                const active = f.file === file;
                return (
                  <li key={f.name}>
                    <button
                      type="button"
                      aria-current={active ? 'true' : undefined}
                      onClick={() => {
                        if (f.file) {
                          setFile(f.file);
                          setActiveLine(null);
                        } else if (f.kind !== 'dir')
                          flash(
                            `${f.name} is a sample file without content in this preview`,
                          );
                      }}
                      className={cn(
                        'flex h-7 w-full items-center gap-[7px] rounded-md pr-2 text-ctl hover:bg-hov',
                        f.kind === 'dir' ? 'font-sans' : 'font-mono text-xs',
                        active ? 'bg-hov text-tx' : 'text-tx2',
                      )}
                      style={{ paddingLeft: f.depth ? 26 : 8 }}
                    >
                      <Icon
                        aria-hidden="true"
                        className="size-[13px] shrink-0 text-tx3"
                      />
                      <span className="min-w-0 flex-1 truncate text-left">
                        {f.name}
                      </span>
                      {f.error ? (
                        <span className="size-1.5 rounded-full bg-danger">
                          <span className="sr-only">has errors</span>
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-col gap-1 border-t border-bd2 px-3 py-2.5 text-[11.5px] text-tx3">
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-ac"
                />
                Ayşe is viewing intro.tex · sample
              </span>
              <span>Local edits · not saved · pdfLaTeX</span>
            </div>
          </nav>
        ) : null}
        <div className="flex min-w-0 flex-1">
          {layout === 'split' ? (
            <Group orientation="horizontal" className="min-w-0 flex-1">
              <Panel
                id="editor"
                defaultSize="50%"
                minSize="320px"
                className="min-w-0"
              >
                {editorPane}
              </Panel>
              <Separator
                aria-label="Resize editor and PDF"
                className="group relative flex w-[7px] shrink-0 justify-center bg-canvas outline-none hover:bg-hov focus-visible:bg-hov data-[separator=active]:bg-hov"
              >
                <span
                  aria-hidden="true"
                  className="h-full w-px bg-bd2 group-focus-visible:bg-ac"
                />
              </Separator>
              <Panel
                id="pdf"
                defaultSize="50%"
                minSize="280px"
                className="min-w-0"
              >
                {pdfPane}
              </Panel>
            </Group>
          ) : layout === 'editor' ? (
            <div className="min-w-0 flex-1">{editorPane}</div>
          ) : (
            <div className="min-w-0 flex-1">{pdfPane}</div>
          )}
        </div>
      </div>
      <VersionHistoryDialog
        open={history}
        onOpenChange={setHistory}
        title="Sparse Evoformer · main.tex"
        kind="code"
      />
    </div>
  );
}
