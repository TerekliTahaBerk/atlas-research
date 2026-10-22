'use client';
import { useEffect, useRef, useState } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Highlighter,
  PanelRight,
  Quote,
  Search,
  Sparkles,
  StickyNote,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import { Btn, IconBtn } from '@/components/atlas/button';
import { SampleTag } from '@/components/atlas/chips';
import { Segmented } from '@/components/atlas/segmented';
import { useToast } from '@/components/atlas/toast';
import { useAtlas } from '@/features/atlas-ai/atlas-provider';
import { AtlasAnchor } from '@/features/atlas-ai/atlas-surface';
import { moduleHref } from '@/features/shell/navigation';
import { SidebarToggle } from '@/features/shell/topbar';
import { useMediaQuery } from '@/features/shell/use-media';
import {
  highlightColors,
  isPaperId,
  paperById,
  readerNotes,
  readerOutline,
  readerQuestions,
} from '@/lib/preview/research';
/**
 * PDF reader (handoff §6 "PDF Reader"). The page is a reflowed sample
 * illustration, not an ingested PDF; highlights and notes are local.
 */
export function ReaderScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const flash = useToast();
  const atlas = useAtlas();
  const wide = useMediaQuery('(min-width: 900px)');
  const paperParam = params.get('paper');
  const paper = paperById(isPaperId(paperParam) ? paperParam : 'p2');
  const { setContext } = atlas;
  useEffect(() => {
    setContext([{ id: paper.id, kind: 'paper', title: paper.short }]);
  }, [paper.id, paper.short, setContext]);
  const cited = params.get('cite') === '1';
  const [page, setPage] = useState(3);
  const [zoom, setZoom] = useState(100);
  const [color, setColor] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);
  const [mobilePanel, setMobilePanel] = useState(false);
  const notesTrigger = useRef<HTMLButtonElement>(null);
  const [tab, setTab] = useState<'notes' | 'outline' | 'ask'>('notes');
  const [selectionBar, setSelectionBar] = useState(!cited);
  const [highlighted, setHighlighted] = useState(false);
  const [search, setSearch] = useState('');
  const panel = panelOpen && wide;
  const askPassage = () => {
    setSelectionBar(false);
    atlas.ask({
      mode: 'open',
      chips: [
        { id: paper.id, kind: 'paper', title: paper.short },
        {
          id: 'sel-p3',
          kind: 'selection',
          title: 'p.3: “peak memory … falls from 61 GB to 19 GB”',
        },
      ],
      prompt: 'Is this memory claim comparable to ours?',
    });
  };
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
            Sample notes, outline and Atlas questions for this paper.
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
            { value: 'notes', label: 'Notes' },
            { value: 'outline', label: 'Outline' },
            { value: 'ask', label: 'Ask' },
          ]}
        />
      </div>
      <div className="flex-1 overflow-auto p-3">
        {tab === 'notes'
          ? readerNotes.map((n) => (
              <button
                key={n.quote}
                type="button"
                onClick={() => setPage(n.page)}
                className="mb-2 block w-full rounded-lg border border-bd2 p-2.5 text-left hover:bg-card"
              >
                <span className="mb-1.5 flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-[2px]"
                    style={{
                      background: highlightColors[n.color]?.value,
                    }}
                  />
                  <span className="font-mono text-[11px] text-tx2">
                    {n.location}
                  </span>
                  <span className="flex-1" />
                  <span className="text-[11px] text-tx3">{n.who}</span>
                </span>
                <span className="mb-[5px] block font-read text-ui leading-normal text-tx2 italic">
                  “{n.quote}”
                </span>
                {n.note ? (
                  <span className="block text-ctl">{n.note}</span>
                ) : null}
              </button>
            ))
          : null}
        {tab === 'outline'
          ? readerOutline.map((o) => (
              <button
                key={o.label}
                type="button"
                aria-current={
                  o.page === page && o.label.startsWith('3 ')
                    ? 'true'
                    : undefined
                }
                onClick={() => setPage(o.page)}
                className={cn(
                  'flex h-[30px] w-full items-center gap-2 rounded-md pr-2 text-ctl hover:bg-hov',
                  o.page === page && o.label.startsWith('3 ') && 'bg-hov',
                )}
                style={{ paddingLeft: o.depth ? 26 : 12 }}
              >
                <span className="flex-1 truncate text-left">{o.label}</span>
                <span className="text-[11px] text-tx3">{o.page}</span>
              </button>
            ))
          : null}
        {tab === 'ask' ? (
          <>
            <p className="mb-2.5 text-ctl text-tx2">
              Atlas answers from this paper and cites page locations.{' '}
              <SampleTag>Sample answers</SampleTag>
            </p>
            {readerQuestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  setMobilePanel(false);
                  atlas.ask({
                    mode: 'open',
                    prompt: q,
                    chips: [
                      { id: paper.id, kind: 'paper', title: paper.short },
                    ],
                  });
                }}
                className="mb-1.5 flex w-full items-center gap-2 rounded-[7px] border border-bd2 px-2.5 py-2 text-left text-ctl hover:bg-hov"
              >
                <Sparkles
                  aria-hidden="true"
                  className="size-3 shrink-0 text-actx"
                />
                {q}
              </button>
            ))}
          </>
        ) : null}
      </div>
    </aside>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-bd2 px-3">
        <SidebarToggle />
        <IconBtn
          label="Back to library"
          onClick={() =>
            router.push(moduleHref('library', `paper=${paper.id}`))
          }
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
        </IconBtn>
        <h1 className="max-w-[220px] truncate font-serif text-base">
          {paper.short}
        </h1>
        <span className="flex-1" />
        <label className="flex h-7 w-[170px] items-center gap-1.5 rounded-md border border-bd px-[9px] max-md:hidden">
          <Search aria-hidden="true" className="size-3 text-tx3" />
          <span className="sr-only">Search in PDF</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter')
                flash(
                  search
                    ? `Highlighting “${search}” on this sample page only`
                    : 'Type a term to search',
                );
            }}
            placeholder="Search in PDF"
            className="min-w-0 flex-1 text-xs"
          />
        </label>
        <div
          role="radiogroup"
          aria-label="Highlight color"
          className="flex gap-1 px-1.5 max-sm:hidden"
        >
          {highlightColors.map((c, i) => (
            <button
              key={c.name}
              type="button"
              role="radio"
              aria-checked={color === i}
              aria-label={`${c.name} highlight`}
              onClick={() => setColor(i)}
              className={cn(
                'size-4 rounded-full outline-offset-2',
                color === i && 'outline-[1.5px] outline-tx2 outline-solid',
              )}
              style={{ background: c.value }}
            />
          ))}
        </div>
        <IconBtn
          label="Zoom out"
          size="base"
          onClick={() => setZoom((z) => Math.max(60, z - 10))}
        >
          <ZoomOut aria-hidden="true" className="size-[14px]" />
        </IconBtn>
        <span className="tnum w-[38px] text-center text-xs text-tx2">
          {zoom}%
        </span>
        <IconBtn
          label="Zoom in"
          size="base"
          onClick={() => setZoom((z) => Math.min(160, z + 10))}
        >
          <ZoomIn aria-hidden="true" className="size-[14px]" />
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
        <div className="relative flex min-w-0 flex-1 flex-col bg-pdfbg">
          <AtlasAnchor placement="canvas" />
          {cited ? (
            <div className="mx-6 mt-3 flex animate-atlas-rise items-center gap-2.5 rounded-[9px] border border-aiib bg-acs px-3 py-[9px] text-ctl max-sm:mx-3">
              <BadgeCheck
                aria-hidden="true"
                className="size-[15px] shrink-0 text-actx"
              />
              <span className="min-w-0 flex-1">
                <span className="font-medium">Cited passage</span>{' '}
                <span className="text-tx2">
                  · Atlas’s sample answer points to p.3 ¶2 of {paper.short}. The
                  passage is highlighted below; provenance is not verified in
                  this preview.
                </span>
              </span>
              <Btn
                variant="outline"
                size="md"
                className="border-aiib"
                onClick={() => atlas.setMode('open')}
              >
                <ArrowLeft aria-hidden="true" className="!size-3" />
                Back to answer
              </Btn>
              <IconBtn
                label="Dismiss"
                size="md"
                tone="muted"
                onClick={() =>
                  router.replace(moduleHref('reader', `paper=${paper.id}`))
                }
              >
                <X aria-hidden="true" className="size-3" />
              </IconBtn>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto px-6 pt-[calc(58px+var(--aic))] pb-[60px] max-sm:px-3">
            <div
              role="document"
              aria-label={`Sample page ${page} of ${paper.short}`}
              className="pdf-page relative mx-auto max-w-full"
              style={{ width: `${Math.round(Math.min(100, zoom * 0.78))}%` }}
            >
              <div className="px-[9cqw] py-[8cqw]">
                <div className="mb-[3cqw] flex justify-between text-[1.5cqw] text-[#5e5e5e]">
                  <span>{paper.title}</span>
                  <span>{page}</span>
                </div>
                {page === 3 ? (
                  <>
                    <div className="mb-[1.4cqw] text-[2.2cqw] font-semibold">
                      3&nbsp;&nbsp;&nbsp;Low-rank pair updates
                    </div>
                    <p className="mb-[1.6cqw] text-justify text-[1.85cqw] leading-[1.55] hyphens-auto">
                      The pair representation <i>z</i> ∈ ℝ<sup>L×L×c</sup> is
                      the largest activation in the network. We replace each
                      triangular update with a rank-<i>r</i> factorization, so
                      that memory scales as 𝒪(<i>Lrc</i>) rather than 𝒪(<i>L</i>
                      ²<i>c</i>).
                    </p>
                    <p className="relative mb-[1.6cqw] text-justify text-[1.85cqw] leading-[1.55] hyphens-auto">
                      <mark
                        className={cn(
                          'rounded-[0.3cqw] text-inherit transition-colors duration-300',
                          cited
                            ? 'animate-atlas-ring bg-[rgb(50_154_83/0.32)] outline-[0.3cqw] outline-[rgb(50_154_83/0.7)] outline-solid'
                            : '',
                        )}
                        style={
                          cited
                            ? undefined
                            : {
                                background: highlighted
                                  ? highlightColors[color]?.value
                                  : 'rgb(214 168 60 / 0.35)',
                              }
                        }
                      >
                        With r = 32, peak memory on a 1,400-residue target falls
                        from 61 GB to 19 GB
                      </mark>
                      , while lDDT drops by 1.2 points on average across long
                      CASP14 targets.{' '}
                      <mark className="bg-[rgb(50_154_83/0.25)] text-inherit">
                        All measurements use batch size 1 and bfloat16
                        activations.
                      </mark>
                      {selectionBar ? (
                        <span
                          role="toolbar"
                          aria-label="Selection actions"
                          className="absolute top-[-5.2cqw] right-0 z-[2] flex max-w-[calc(100vw-40px)] flex-wrap items-center gap-0.5 rounded-lg border border-bd bg-pop p-1 font-sans text-xs whitespace-nowrap text-tx shadow-pop"
                        >
                          <button
                            type="button"
                            onClick={askPassage}
                            className="flex h-[26px] items-center gap-[5px] rounded-[5px] px-2 font-medium text-actx hover:bg-acs"
                          >
                            <Sparkles aria-hidden="true" className="size-3" />
                            Ask Atlas
                          </button>
                          <span aria-hidden="true" className="h-4 w-px bg-bd" />
                          <button
                            type="button"
                            onClick={() => {
                              setSelectionBar(false);
                              setHighlighted(true);
                              flash(
                                'Highlighted p.3 ¶2 in this tab only',
                                'done',
                              );
                            }}
                            className="flex h-[26px] items-center gap-[5px] rounded-[5px] px-2 hover:bg-hov"
                          >
                            <Highlighter
                              aria-hidden="true"
                              className="size-3"
                            />
                            Highlight
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectionBar(false);
                              setTab('notes');
                              setPanelOpen(true);
                              if (!wide) setMobilePanel(true);
                            }}
                            className="flex h-[26px] items-center gap-[5px] rounded-[5px] px-2 hover:bg-hov"
                          >
                            <StickyNote aria-hidden="true" className="size-3" />
                            Note
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard
                                ?.writeText(
                                  `“With r = 32, peak memory on a 1,400-residue target falls from 61 GB to 19 GB” (${paper.short}, p. 3)`,
                                )
                                .catch(() => {});
                              flash(
                                'Quote with sample citation copied (p.3)',
                                'done',
                              );
                            }}
                            className="flex h-[26px] items-center gap-[5px] rounded-[5px] px-2 hover:bg-hov"
                          >
                            <Quote aria-hidden="true" className="size-3" />
                            Cite
                          </button>
                        </span>
                      ) : null}
                    </p>
                    <div className="my-[2cqw] flex items-center text-[1.95cqw]">
                      <span className="flex-1 text-center italic">
                        z<sub className="text-[1.2cqw]">ij</sub> ≈ Σ
                        <sub className="text-[1.2cqw]">k≤r</sub> a
                        <sub className="text-[1.2cqw]">ik</sub> b
                        <sub className="text-[1.2cqw]">jk</sub>
                        <sup className="text-[1.2cqw]">⊤</sup>
                      </span>
                      <span className="text-[1.8cqw]">(4)</span>
                    </div>
                    <p className="mb-[1.6cqw] text-justify text-[1.85cqw] leading-[1.55] hyphens-auto">
                      Table 2 reports results across rank. Below r = 16 the
                      long-range contact precision degrades sharply, consistent
                      with the intuition that distant couplings are not low-rank
                      in general.
                    </p>
                    <table className="mt-[2cqw] mb-[1cqw] w-full border-y-[0.2cqw] border-[#222] text-left text-[1.6cqw]">
                      <thead>
                        <tr className="border-b-[0.1cqw] border-[#999]">
                          {['Rank r', 'Memory (GB)', 'lDDT', 'P@L (long)'].map(
                            (h) => (
                              <th key={h} className="py-[0.8cqw] font-semibold">
                                {h}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ['8', '11.2', '0.761', '0.52'],
                          ['16', '14.0', '0.788', '0.61'],
                          ['32', '19.1', '0.801', '0.66'],
                        ].map((r) => (
                          <tr key={r[0]}>
                            {r.map((c, i) => (
                              <td key={i} className="py-[0.5cqw]">
                                {c}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="text-center text-[1.55cqw] text-[#444]">
                      Table 2: Effect of rank on memory and accuracy (sample
                      data).
                    </div>
                  </>
                ) : (
                  <p className="pt-[30cqw] text-center font-sans text-[1.9cqw] text-[#5c5b55]">
                    Page {page} isn’t part of this sample. The reader
                    illustrates page 3 only; no PDF was ingested.
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="flex h-[38px] shrink-0 items-center justify-center gap-2 border-t border-bd2 bg-canvas text-xs text-tx2">
            <IconBtn
              label="Previous page"
              size="base"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft aria-hidden="true" className="size-[14px]" />
            </IconBtn>
            <span className="tnum" aria-live="polite">
              Page {page} of 14
            </span>
            <IconBtn
              label="Next page"
              size="base"
              disabled={page >= 14}
              onClick={() => setPage((p) => Math.min(14, p + 1))}
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
