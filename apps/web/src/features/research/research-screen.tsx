'use client';
import { useId, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FilePlus,
  GitCompare,
  History,
  MessageCircle,
  NotebookPen,
  Plus,
  Quote,
  Sparkles,
  Telescope,
  X,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import { Btn, IconBtn } from '@/components/atlas/button';
import { CountBadge } from '@/components/atlas/chips';
import {
  Menu,
  MenuContent,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from '@/components/atlas/overlay';
import { Segmented } from '@/components/atlas/segmented';
import {
  EmptyState,
  ErrorBanner,
  SkeletonLines,
} from '@/components/atlas/states';
import { useToast } from '@/components/atlas/toast';
import { useAtlas } from '@/features/atlas-ai/atlas-provider';
import { AIStatusIndicator } from '@/features/atlas-ai/atlas-surface';
import { CitePill } from '@/features/atlas-ai/citations';
import { moduleHref } from '@/features/shell/navigation';
import { usePreviewStore } from '@/features/shell/preview-store';
import { Crumb, Topbar } from '@/features/shell/topbar';
import {
  bibtexFor,
  comparison,
  comparisonKeys,
  defaultResearchQuestion,
  papers,
  researchModes,
  researchSources,
  type PaperId,
} from '@/lib/preview/research';
type Mode = (typeof researchModes)[number]['key'];
type SourceKey = (typeof researchSources)[number]['key'];
const ranges = ['2020 – 2026', 'Last 2 years', 'Any time'] as const;
/**
 * Research discovery (handoff §6 "Research"): question composer, modes,
 * source filters, collapsible synthesis, compare selection and a sticky
 * action bar. Every result is authored sample data; nothing is searched.
 */
export function ResearchScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const demo = params.get('demo');
  const flash = useToast();
  const atlas = useAtlas();
  const store = usePreviewStore();
  const questionId = useId();
  const [question, setQuestion] = useState(defaultResearchQuestion);
  const [asked, setAsked] = useState(defaultResearchQuestion);
  const [mode, setMode] = useState<Mode>('review');
  const [sources, setSources] = useState<Record<SourceKey, boolean>>(
    () =>
      Object.fromEntries(researchSources.map((s) => [s.key, s.on])) as Record<
        SourceKey,
        boolean
      >,
  );
  const [peer, setPeer] = useState(true);
  const [openAccess, setOpenAccess] = useState(false);
  const [range, setRange] = useState<(typeof ranges)[number]>('2020 – 2026');
  const [synthOpen, setSynthOpen] = useState(true);
  const [selected, setSelected] = useState<PaperId[]>(['p1', 'p4']);
  const [compareOpen, setCompareOpen] = useState(false);
  const noSources = !Object.values(sources).some(Boolean);
  const visible = papers.filter((p) => !openAccess || p.openAccess);
  const selectedPapers = papers.filter((p) => selected.includes(p.id));
  const toggle = (id: PaperId) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
  const showResults =
    !noSources && demo !== 'loading' && demo !== 'errors' && demo !== 'empty';
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar
        actions={
          <>
            <Btn
              variant="ghost"
              onClick={() =>
                flash('Search history arrives with Phase 02 discovery')
              }
            >
              <History aria-hidden="true" />
              <span className="max-sm:hidden">Past searches</span>
            </Btn>
            <Btn
              variant="secondary"
              onClick={() => {
                setQuestion('');
                setSelected([]);
                setCompareOpen(false);
              }}
            >
              <Plus aria-hidden="true" />
              New search
            </Btn>
          </>
        }
      >
        <Crumb title="Research" as="span" />
      </Topbar>
      <div className="relative min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[880px] px-8 pt-[22px] pb-[120px] max-sm:px-4">
          <h1 className="mb-4 font-serif text-[34px] leading-[1.1] font-medium max-sm:text-[28px]">
            What are you researching?
          </h1>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAsked(question.trim() || defaultResearchQuestion);
              setCompareOpen(false);
              flash(
                'Showing sample results — your question was not sent to any source',
              );
            }}
            className="rounded-2xl border border-aiib bg-aiin px-3 pt-3 pb-2.5"
          >
            <label htmlFor={questionId} className="sr-only">
              Research question
            </label>
            <textarea
              id={questionId}
              rows={2}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey))
                  e.currentTarget.form?.requestSubmit();
              }}
              placeholder="Ask a research question, paste a DOI, or describe a method…"
              className="w-full resize-none px-1 text-[15px] leading-normal text-tx"
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Segmented
                label="Search mode"
                size="sm"
                variant="solid"
                value={mode}
                onChange={setMode}
                className="flex-wrap bg-canvas p-[2px]"
                options={researchModes.map((m) => ({
                  value: m.key,
                  label: m.label,
                }))}
              />
              <span className="flex-1" />
              <Btn type="submit" variant="primary" size="lg">
                Search
                <ArrowRight aria-hidden="true" />
              </Btn>
            </div>
          </form>
          <div
            className="mt-3 mb-1.5 flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Source filters"
          >
            <span className="mr-0.5 text-[11.5px] text-tx3">Sources</span>
            {researchSources.map((s) => (
              <FilterChip
                key={s.key}
                on={sources[s.key]}
                onClick={() =>
                  setSources((v) => ({ ...v, [s.key]: !v[s.key] }))
                }
              >
                {s.label}
              </FilterChip>
            ))}
            <span aria-hidden="true" className="mx-1 h-4 w-px bg-bd" />
            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-6 items-center gap-[5px] rounded-sm border border-bd px-2 text-xs text-tx2 hover:bg-hov"
                >
                  {range}
                  <ChevronDown aria-hidden="true" className="size-[11px]" />
                </button>
              </MenuTrigger>
              <MenuContent width={180} align="start">
                <MenuRadioGroup
                  value={range}
                  onValueChange={(v) => setRange(v as (typeof ranges)[number])}
                >
                  {ranges.map((r) => (
                    <MenuRadioItem key={r} value={r}>
                      {r}
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
              </MenuContent>
            </Menu>
            <FilterChip on={peer} onClick={() => setPeer((v) => !v)}>
              Peer-reviewed only
            </FilterChip>
            <FilterChip
              on={openAccess}
              onClick={() => setOpenAccess((v) => !v)}
            >
              Open access
            </FilterChip>
          </div>
          <p className="mb-[22px] text-[11.5px] text-tx3">
            Sample results — live scholarly search isn’t connected in this
            preview.
          </p>
          {demo === 'loading' ? (
            <div className="mb-6 flex flex-col gap-2.5">
              <AIStatusIndicator>
                Searching 3 sources · reading abstracts… (loading-state preview)
              </AIStatusIndicator>
              <SkeletonLines />
            </div>
          ) : null}
          {demo === 'errors' ? (
            <div className="mb-6">
              <ErrorBanner
                title="Sources didn’t respond (sample error state)"
                action={
                  <Btn
                    variant="outline"
                    size="md"
                    onClick={() => router.push(moduleHref('research'))}
                  >
                    Retry
                  </Btn>
                }
              >
                No request was made. This shows how a failed search recovers.
              </ErrorBanner>
            </div>
          ) : null}
          {noSources || demo === 'empty' ? (
            <EmptyState
              dashed
              icon={Telescope}
              title={
                noSources ? 'Choose at least one source' : 'No papers match yet'
              }
              description={
                noSources
                  ? 'Turn on Semantic Scholar, arXiv, PubMed or OpenAlex to see sample results.'
                  : 'Try a broader question or fewer filters.'
              }
            />
          ) : null}
          {showResults ? (
            <>
              <section
                aria-label="Atlas synthesis"
                className="mb-7 rounded-2xl border border-bd2 bg-card"
              >
                <button
                  type="button"
                  aria-expanded={synthOpen}
                  onClick={() => setSynthOpen((o) => !o)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-ctl"
                >
                  <Sparkles
                    aria-hidden="true"
                    className="size-[14px] text-actx"
                  />
                  <span className="font-semibold">Atlas synthesis</span>
                  <span className="truncate text-tx3">
                    from 5 sample sources ·{' '}
                    {researchModes.find((m) => m.key === mode)?.label}
                  </span>
                  <span className="flex-1" />
                  {synthOpen ? (
                    <ChevronUp
                      aria-hidden="true"
                      className="size-[14px] text-tx3"
                    />
                  ) : (
                    <ChevronDown
                      aria-hidden="true"
                      className="size-[14px] text-tx3"
                    />
                  )}
                </button>
                {synthOpen ? (
                  <>
                    <div className="px-[18px] pb-3.5 font-read text-[15px] leading-[1.72]">
                      <p className="mb-2.5">
                        Two strategies dominate.{' '}
                        <b className="font-semibold">Low-rank factorization</b>{' '}
                        compresses the pair grid and scales near-linearly, but
                        loses about 1.2 lDDT on long targets
                        <CitePill paper="p2" n={2} />.{' '}
                        <b className="font-semibold">Structured sparsity</b>{' '}
                        keeps exact values for retained pairs and saves 2.8×
                        memory above 1,024 residues
                        <CitePill paper="p1" n={1} />.
                      </p>
                      <p className="mb-2.5">
                        Learned routing is the newest direction: it matches
                        dense accuracy on 87% of targets at 41% of the memory,
                        though it is not yet peer-reviewed
                        <CitePill paper="p4" n={4} />. Linear attention is a
                        weak baseline for long-range couplings
                        <CitePill paper="p5" n={5} />.
                      </p>
                      <div className="mt-3 mb-1.5 font-sans text-xs text-tx3">
                        Open question
                      </div>
                      <p>
                        No study reports memory at batch sizes above 1 for both
                        approaches under matched compute.
                      </p>
                      <p className="mt-3 font-sans text-[11px] text-tx3">
                        Sample synthesis for “
                        {asked.length > 80 ? `${asked.slice(0, 80)}…` : asked}”
                        · not generated
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 px-4 pb-3.5">
                      <Btn
                        variant="subtle"
                        size="md"
                        onClick={() =>
                          flash(
                            'Insert is a preview — the document was not changed',
                          )
                        }
                      >
                        <FilePlus aria-hidden="true" className="!size-3" />
                        Insert into document
                      </Btn>
                      <Btn
                        variant="subtle"
                        size="md"
                        onClick={() =>
                          flash(
                            'Saving notes arrives in Phase 04 — nothing was saved',
                          )
                        }
                      >
                        <NotebookPen aria-hidden="true" className="!size-3" />
                        Save as note
                      </Btn>
                      <Btn
                        variant="subtle"
                        size="md"
                        onClick={() => {
                          void navigator.clipboard
                            ?.writeText(
                              'Sample synthesis: low-rank vs structured sparsity.',
                            )
                            .catch(() => {});
                          flash('Copied the sample synthesis', 'done');
                        }}
                      >
                        <Copy aria-hidden="true" className="!size-3" />
                        Copy
                      </Btn>
                      <Btn
                        variant="subtle"
                        size="md"
                        onClick={() =>
                          atlas.ask({
                            mode: 'focus',
                            chips: [
                              {
                                id: 'research-q',
                                kind: 'research',
                                title: 'Research: sparse vs low-rank',
                              },
                            ],
                          })
                        }
                      >
                        <MessageCircle aria-hidden="true" className="!size-3" />
                        Ask a follow-up
                      </Btn>
                    </div>
                  </>
                ) : null}
              </section>
              {compareOpen && selectedPapers.length >= 2 ? (
                <section
                  aria-label="Comparison"
                  className="mb-7 overflow-hidden rounded-2xl border border-bd"
                >
                  <div className="flex items-center gap-2 border-b border-bd2 px-3.5 py-2.5 text-ctl">
                    <GitCompare
                      aria-hidden="true"
                      className="size-[14px] text-tx2"
                    />
                    <h2 className="font-semibold">Comparison</h2>
                    <span className="text-tx3">
                      {selectedPapers.length} papers · extracted from abstracts
                      (sample)
                    </span>
                    <span className="flex-1" />
                    <IconBtn
                      label="Close comparison"
                      size="md"
                      tone="muted"
                      onClick={() => setCompareOpen(false)}
                    >
                      <X aria-hidden="true" className="size-[13px]" />
                    </IconBtn>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] border-collapse text-ctl">
                      <thead>
                        <tr>
                          <th
                            scope="col"
                            className="w-[140px] border-b border-bd2 px-3.5 py-[9px] text-left font-normal text-tx3"
                          >
                            <span className="sr-only">Attribute</span>
                          </th>
                          {selectedPapers.map((p) => (
                            <th
                              key={p.id}
                              scope="col"
                              className="border-b border-l border-bd2 px-3.5 py-[9px] text-left font-serif text-[15px] font-normal"
                            >
                              {p.short}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {comparisonKeys.map((k, i) => (
                          <tr key={k}>
                            <th
                              scope="row"
                              className="border-b border-bd2 px-3.5 py-[9px] text-left font-normal text-tx3"
                            >
                              {k}
                            </th>
                            {selectedPapers.map((p) => (
                              <td
                                key={p.id}
                                className="border-b border-l border-bd2 px-3.5 py-[9px] text-tx2"
                              >
                                {comparison[p.id][i]}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}
              <div className="mb-1.5 flex items-center gap-2">
                <h2 className="font-serif text-[22px] font-medium">Papers</h2>
                <CountBadge>{visible.length}</CountBadge>
                <span className="flex-1" />
                <span className="text-xs text-tx3">Sort</span>
                <span className="text-xs">Relevance</span>
              </div>
              <ol className="border-t border-bd2">
                {visible.map((p) => {
                  const n = papers.indexOf(p) + 1;
                  const on = selected.includes(p.id);
                  const saved = store.saved.includes(p.id);
                  return (
                    <li
                      key={p.id}
                      className="flex gap-3.5 border-b border-bd2 px-1 py-4 max-sm:flex-wrap"
                    >
                      <label className="mt-1 grid size-4 shrink-0 cursor-pointer place-items-center">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(p.id)}
                          aria-label={`Select ${p.short} to compare`}
                          className="peer sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className={cn(
                            'grid size-4 place-items-center rounded-xs border-[1.5px] text-white peer-focus-visible:outline-2 peer-focus-visible:outline-ac',
                            on ? 'border-ac bg-acb' : 'border-tx3',
                          )}
                        >
                          {on ? <Check className="size-[11px]" /> : null}
                        </span>
                      </label>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-[11px] text-actx">
                            [{n}]
                          </span>
                          <h3 className="font-serif text-[19px] leading-[1.25] font-medium">
                            <Link
                              href={moduleHref('library', `paper=${p.id}`)}
                              className="hover:underline"
                            >
                              {p.title}
                            </Link>
                          </h3>
                        </div>
                        <div className="mt-[3px] mb-1.5 text-xs text-tx2">
                          {p.authors} ·{' '}
                          <span className="text-tx">{p.venue}</span>
                        </div>
                        <p className="mb-2 max-w-[680px] text-ui leading-[1.55] text-tx2">
                          {p.abstract}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                          <span className="rounded-xs bg-acs px-[7px] py-px text-actx">
                            {p.relevance}
                          </span>
                          {p.openAccess ? (
                            <span className="rounded-xs border border-bd px-[7px] py-px text-tx2">
                              Open access · PDF
                            </span>
                          ) : null}
                          <span className="text-tx3">
                            Cited by {p.citedBy} · sample
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-[5px] max-sm:flex-row">
                        <Btn
                          variant={saved ? 'ai' : 'outline'}
                          size="md"
                          className={cn('justify-start', saved && 'border-bd')}
                          aria-pressed={saved}
                          onClick={() => store.toggleSaved(p.id)}
                        >
                          {saved ? (
                            <BookmarkCheck
                              aria-hidden="true"
                              className="!size-3"
                            />
                          ) : (
                            <Bookmark aria-hidden="true" className="!size-3" />
                          )}
                          {saved ? 'Saved' : 'Save'}
                        </Btn>
                        <Btn
                          variant="ghost"
                          size="md"
                          className="justify-start"
                          onClick={() => {
                            void navigator.clipboard
                              ?.writeText(bibtexFor(p))
                              .catch(() => {});
                            flash(
                              `Sample BibTeX for ${p.short} copied`,
                              'done',
                            );
                          }}
                        >
                          <Quote aria-hidden="true" className="!size-3" />
                          Cite
                        </Btn>
                        <Btn
                          variant="ghost"
                          size="md"
                          className="justify-start"
                          onClick={() =>
                            router.push(moduleHref('reader', `paper=${p.id}`))
                          }
                        >
                          <BookOpen aria-hidden="true" className="!size-3" />
                          Read
                        </Btn>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          ) : null}
        </div>
        {showResults && selected.length > 0 ? (
          <div className="pointer-events-none sticky bottom-[18px] flex justify-center px-4">
            <div
              role="toolbar"
              aria-label="Selected papers"
              className="pointer-events-auto flex animate-atlas-rise items-center gap-2.5 rounded-xl border border-bd bg-pop py-1.5 pr-1.5 pl-3.5 text-ctl shadow-pop"
            >
              <span className="tnum whitespace-nowrap">
                {selected.length} selected
              </span>
              <Btn variant="ghost" onClick={() => setSelected([])}>
                Clear
              </Btn>
              <Btn
                variant="outline"
                onClick={() => {
                  store.saveMany(selected);
                  flash(
                    `${selected.length} sample papers saved to your in-memory library`,
                    'done',
                  );
                }}
              >
                Save to Library
              </Btn>
              <Btn
                variant="primary"
                className="px-3"
                onClick={() => {
                  if (selected.length < 2) {
                    flash('Select at least two papers to compare');
                    return;
                  }
                  setCompareOpen(true);
                }}
              >
                <GitCompare aria-hidden="true" />
                Compare
              </Btn>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
function FilterChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'inline-flex h-6 items-center gap-[5px] rounded-sm border px-2 text-xs',
        on ? 'border-aiib bg-acs text-actx' : 'border-bd text-tx2 hover:bg-hov',
      )}
    >
      {on ? <Check aria-hidden="true" className="size-[11px]" /> : null}
      {children}
    </button>
  );
}
