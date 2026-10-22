'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronDown,
  Copy,
  FileText,
  GitCompare,
  Info,
  Quote,
  Sparkles,
  Telescope,
  X,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import {
  providerLabels,
  researchFields,
  type NormalizedPaper,
  type ProjectDto,
  type ScholarlySearchRequest,
  type ScholarlySearchResponse,
} from '@atlas/core';
import { Btn, IconBtn } from '@/components/atlas/button';
import { CountBadge } from '@/components/atlas/chips';
import {
  Menu,
  MenuContent,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from '@/components/atlas/overlay';
import {
  EmptyState,
  ErrorBanner,
  SkeletonLines,
} from '@/components/atlas/states';
import { useToast } from '@/components/atlas/toast';
import { useAtlas } from '@/features/atlas-ai/atlas-provider';
import { AtlasAnchor } from '@/features/atlas-ai/atlas-surface';
import { Crumb, Topbar } from '@/features/shell/topbar';
import {
  ApiError,
  runCommand,
  searchResearch,
} from '@/features/library/client';
import {
  authorSummary,
  providerNames,
  referenceText,
  saveIdentity,
} from '@/features/library/paper-format';

type Provider = 'openalex' | 'semantic-scholar';
/** Query-string parameters; undefined values are omitted from the URL. */
type SearchParams = {
  [K in keyof ScholarlySearchRequest]?: ScholarlySearchRequest[K] | undefined;
};
const yearOptions = [
  { label: 'Any time', from: undefined },
  { label: 'Last 2 years', from: new Date().getFullYear() - 1 },
  { label: 'Last 5 years', from: new Date().getFullYear() - 4 },
  { label: 'Since 2015', from: 2015 },
] as const;
const citationOptions = [
  { label: 'Any citations', min: undefined },
  { label: '10+ citations', min: 10 },
  { label: '100+ citations', min: 100 },
  { label: '1,000+ citations', min: 1000 },
] as const;
const sortLabels = {
  relevance: 'Relevance',
  newest: 'Newest',
  citations: 'Most cited',
} as const;
type Filters = {
  providers: Record<Provider, boolean>;
  year: (typeof yearOptions)[number]['label'];
  openAccess: boolean;
  field: keyof typeof researchFields | 'any';
  author: string;
  citations: (typeof citationOptions)[number]['label'];
  sort: keyof typeof sortLabels;
};
type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string; rateLimited: boolean }
  | { kind: 'done'; result: ScholarlySearchResponse };

/**
 * Live scholarly discovery: real provider metadata through the authorized
 * project search API. Nothing here is generated; missing fields stay missing.
 */
export function LiveResearch({ project }: { project: ProjectDto }) {
  const flash = useToast();
  const atlas = useAtlas();
  const { setContext } = atlas;
  const questionId = useId();
  const canWrite = project.capabilities.includes('project.write');
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState('');
  const [filters, setFilters] = useState<Filters>({
    providers: { openalex: true, 'semantic-scholar': true },
    year: 'Any time',
    openAccess: false,
    field: 'any',
    author: '',
    citations: 'Any citations',
    sort: 'relevance',
  });
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [items, setItems] = useState<NormalizedPaper[]>([]);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [detail, setDetail] = useState<NormalizedPaper | null>(null);
  const controller = useRef<AbortController | null>(null);

  const request = useCallback(
    (q: string, filters: Filters, cursor?: string): SearchParams => {
      const on = (Object.keys(filters.providers) as Provider[]).filter(
        (p) => filters.providers[p],
      );
      return {
        query: q,
        provider: on.length === 2 ? 'all' : on[0],
        yearFrom: yearOptions.find((y) => y.label === filters.year)?.from,
        openAccessOnly: filters.openAccess,
        field: filters.field === 'any' ? undefined : filters.field,
        author: filters.author.trim() || undefined,
        minCitations: citationOptions.find((c) => c.label === filters.citations)
          ?.min,
        sort: filters.sort,
        cursor,
      };
    },
    [],
  );
  const noProviders =
    !filters.providers.openalex && !filters.providers['semantic-scholar'];

  const run = useCallback(
    async (q: string, using: Filters) => {
      controller.current?.abort();
      const next = new AbortController();
      controller.current = next;
      setStatus({ kind: 'loading' });
      setCompareOpen(false);
      try {
        const result = await searchResearch(
          project.id,
          request(q, using),
          next.signal,
        );
        setItems(result.items);
        setSaved(result.saved);
        setSelected([]);
        setStatus({ kind: 'done', result });
      } catch (error) {
        if (next.signal.aborted) return;
        setStatus({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Search failed.',
          rateLimited:
            error instanceof ApiError && error.code === 'RATE_LIMITED',
        });
      }
    },
    [project.id, request],
  );
  /** Filters re-run the current question; the first search needs a submit. */
  function updateFilters(change: (current: Filters) => Filters) {
    const next = change(filters);
    setFilters(next);
    if (
      asked &&
      (next.providers.openalex || next.providers['semantic-scholar'])
    )
      void run(asked, next);
  }
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    setContext(
      detail
        ? [
            {
              id: `candidate:${detail.candidateId}`,
              kind: 'paper',
              title: detail.title,
              research: {
                kind: 'search-result',
                projectId: project.id,
                candidateId: detail.candidateId,
              },
            },
          ]
        : [
            {
              id: `project:${project.id}`,
              kind: 'research',
              title: `Research · ${project.name}`,
              research: { kind: 'project', projectId: project.id },
            },
          ],
    );
  }, [detail, project.id, project.name, setContext]);

  async function more() {
    if (status.kind !== 'done' || !status.result.nextCursor) return;
    setLoadingMore(true);
    try {
      const result = await searchResearch(
        project.id,
        request(asked, filters, status.result.nextCursor),
      );
      const known = new Set(items.map((i) => i.candidateId));
      setItems((current) => [
        ...current,
        ...result.items.filter((i) => !known.has(i.candidateId)),
      ]);
      setSaved((current) => ({ ...current, ...result.saved }));
      setStatus({ kind: 'done', result: { ...result, items: [] } });
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Loading more failed.');
    } finally {
      setLoadingMore(false);
    }
  }

  async function save(paper: NormalizedPaper) {
    if (saving[paper.candidateId] || saved[paper.candidateId]) return;
    setSaving((s) => ({ ...s, [paper.candidateId]: true }));
    try {
      const result = await runCommand({
        command: 'paper.save',
        projectId: project.id,
        ...saveIdentity(paper),
        idempotencyKey: crypto.randomUUID(),
      });
      // Shown as saved only after the server confirmed the transaction.
      setSaved((s) => ({ ...s, [paper.candidateId]: result.id }));
      flash(
        result.existing
          ? 'Already in this project’s library'
          : 'Saved to the library',
        'done',
      );
    } catch (error) {
      flash(
        error instanceof Error ? error.message : 'The paper was not saved.',
      );
    } finally {
      setSaving((s) => ({ ...s, [paper.candidateId]: false }));
    }
  }
  async function saveSelected() {
    for (const id of selected) {
      const paper = items.find((p) => p.candidateId === id);
      if (paper) await save(paper);
    }
  }
  function copy(text: string, message: string) {
    void navigator.clipboard
      ?.writeText(text)
      .then(() => flash(message, 'done'))
      .catch(() => flash('Copying is not available in this browser.'));
  }

  const selectedPapers = items.filter((p) => selected.includes(p.candidateId));
  const done = status.kind === 'done' ? status.result : null;
  const libraryHref = (id?: string) =>
    `/app/projects/${project.id}/library${id ? `?paper=${id}` : ''}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar
        actions={
          <Btn
            variant="secondary"
            onClick={() => (window.location.href = libraryHref())}
          >
            Open library
          </Btn>
        }
      >
        <Crumb parent={project.name} title="Research" as="span" />
      </Topbar>
      <AtlasAnchor placement="canvas" />
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-h-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-[880px] px-8 pt-[calc(22px+var(--aic))] pb-[120px] max-sm:px-4">
            <h1 className="mb-4 font-serif text-[34px] leading-[1.1] font-medium max-sm:text-[28px]">
              What are you researching?
            </h1>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const q = question.trim();
                if (q.length < 2) {
                  setStatus({
                    kind: 'error',
                    message: 'Enter at least two characters to search.',
                    rateLimited: false,
                  });
                  return;
                }
                setAsked(q);
                void run(q, filters);
              }}
              className="rounded-2xl border border-aiib bg-aiin px-3 pt-3 pb-2.5"
            >
              <label htmlFor={questionId} className="sr-only">
                Research query
              </label>
              <textarea
                id={questionId}
                rows={2}
                maxLength={300}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Search published research by topic, title or keywords…"
                className="w-full resize-none px-1 text-[15px] leading-normal text-tx"
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[11.5px] text-tx3">
                  Enter to search · Shift+Enter for a new line
                </span>
                <span className="flex-1" />
                {status.kind === 'loading' ? (
                  <Btn
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => {
                      controller.current?.abort();
                      setStatus({ kind: 'idle' });
                    }}
                  >
                    Cancel
                  </Btn>
                ) : null}
                <Btn
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={noProviders}
                >
                  Search
                  <ArrowRight aria-hidden="true" />
                </Btn>
              </div>
            </form>
            <div
              className="mt-3 mb-1.5 flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="Search filters"
            >
              <span className="mr-0.5 text-[11.5px] text-tx3">Sources</span>
              {(Object.keys(providerLabels) as Provider[]).map((p) => (
                <FilterChip
                  key={p}
                  on={filters.providers[p]}
                  onClick={() =>
                    updateFilters((f) => ({
                      ...f,
                      providers: { ...f.providers, [p]: !f.providers[p] },
                    }))
                  }
                >
                  {providerLabels[p]}
                </FilterChip>
              ))}
              <span aria-hidden="true" className="mx-1 h-4 w-px bg-bd" />
              <FilterMenu
                label="Publication years"
                value={filters.year}
                options={yearOptions.map((y) => y.label)}
                onChange={(year) =>
                  updateFilters((f) => ({
                    ...f,
                    year: year as Filters['year'],
                  }))
                }
              />
              <FilterMenu
                label="Research field"
                value={filters.field === 'any' ? 'Any field' : filters.field}
                options={['Any field', ...Object.keys(researchFields)]}
                onChange={(field) =>
                  updateFilters((f) => ({
                    ...f,
                    field:
                      field === 'Any field'
                        ? 'any'
                        : (field as Filters['field']),
                  }))
                }
              />
              <FilterMenu
                label="Minimum citations"
                value={filters.citations}
                options={citationOptions.map((c) => c.label)}
                onChange={(citations) =>
                  updateFilters((f) => ({
                    ...f,
                    citations: citations as Filters['citations'],
                  }))
                }
              />
              <FilterChip
                on={filters.openAccess}
                onClick={() =>
                  updateFilters((f) => ({ ...f, openAccess: !f.openAccess }))
                }
              >
                Open access
              </FilterChip>
              <form
                className="contents"
                onSubmit={(e) => {
                  e.preventDefault();
                  const value = new FormData(e.currentTarget).get('author');
                  updateFilters((f) => ({
                    ...f,
                    author: typeof value === 'string' ? value : '',
                  }));
                }}
              >
                <label className="inline-flex h-6 items-center gap-1 rounded-sm border border-bd px-2 text-xs text-tx2">
                  <span className="sr-only">Author filter</span>
                  <input
                    name="author"
                    maxLength={120}
                    defaultValue={filters.author}
                    placeholder="Author"
                    className="w-[96px] min-w-0 text-xs"
                  />
                </label>
              </form>
            </div>
            <p className="mb-[22px] text-[11.5px] text-tx3">
              Metadata comes directly from the selected providers. Filters a
              provider can’t apply are listed below the results, not silently
              ignored.
            </p>

            {noProviders ? (
              <EmptyState
                dashed
                icon={Telescope}
                title="Choose at least one source"
                description="Turn on OpenAlex or Semantic Scholar to search."
              />
            ) : status.kind === 'idle' ? (
              <EmptyState
                dashed
                icon={Telescope}
                title="Search published research"
                description="Results come from OpenAlex and Semantic Scholar. Save papers to build this project’s library."
              />
            ) : null}
            {status.kind === 'loading' ? (
              <div className="mb-6 flex flex-col gap-2.5">
                <p role="status" className="text-ctl text-tx2">
                  Searching {providerList(filters)}…
                </p>
                <SkeletonLines />
              </div>
            ) : null}
            {status.kind === 'error' ? (
              <div className="mb-6">
                <ErrorBanner
                  title={
                    status.rateLimited
                      ? 'Search limit reached'
                      : 'Search failed'
                  }
                  action={
                    asked ? (
                      <Btn
                        variant="outline"
                        size="md"
                        onClick={() => void run(asked, filters)}
                      >
                        Retry
                      </Btn>
                    ) : undefined
                  }
                >
                  {status.message}
                </ErrorBanner>
              </div>
            ) : null}
            {done ? (
              <>
                <ProviderReports
                  result={done}
                  onRetry={() => void run(asked, filters)}
                />
                {done.state === 'no_results' && !items.length ? (
                  <EmptyState
                    icon={Telescope}
                    title="No published papers matched"
                    description="Try broader keywords or fewer filters."
                  />
                ) : null}
                {compareOpen && selectedPapers.length >= 2 ? (
                  <Comparison
                    papers={selectedPapers}
                    onClose={() => setCompareOpen(false)}
                  />
                ) : null}
                {items.length ? (
                  <>
                    <div className="mb-1.5 flex items-center gap-2">
                      <h2 className="font-serif text-[22px] font-medium">
                        Papers
                      </h2>
                      <CountBadge>{items.length}</CountBadge>
                      <span className="flex-1" />
                      <FilterMenu
                        label="Sort results"
                        value={sortLabels[filters.sort]}
                        options={Object.values(sortLabels)}
                        onChange={(label) =>
                          updateFilters((f) => ({
                            ...f,
                            sort: (
                              Object.keys(sortLabels) as Filters['sort'][]
                            ).find((k) => sortLabels[k] === label)!,
                          }))
                        }
                      />
                    </div>
                    <ol
                      className="border-t border-bd2"
                      aria-label="Search results"
                    >
                      {items.map((p, index) => {
                        const on = selected.includes(p.candidateId);
                        const savedId = saved[p.candidateId];
                        return (
                          <li
                            key={p.candidateId}
                            className="flex gap-3.5 border-b border-bd2 px-1 py-4 max-sm:flex-wrap"
                          >
                            <label className="mt-1 grid size-4 shrink-0 cursor-pointer place-items-center">
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() =>
                                  setSelected((s) =>
                                    s.includes(p.candidateId)
                                      ? s.filter((x) => x !== p.candidateId)
                                      : [...s, p.candidateId],
                                  )
                                }
                                aria-label={`Select “${p.title}” to compare`}
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
                                  [{index + 1}]
                                </span>
                                <h3 className="font-serif text-[19px] leading-[1.25] font-medium">
                                  <button
                                    type="button"
                                    className="text-left hover:underline"
                                    onClick={() => setDetail(p)}
                                  >
                                    {p.title}
                                  </button>
                                </h3>
                              </div>
                              <div className="mt-[3px] mb-1.5 text-xs text-tx2">
                                {authorSummary(p)}
                                {p.year !== null ? ` · ${p.year}` : ''}
                                {p.venue ? (
                                  <>
                                    {' '}
                                    · <span className="text-tx">{p.venue}</span>
                                  </>
                                ) : null}
                              </div>
                              <p className="mb-2 line-clamp-3 max-w-[680px] text-ui leading-[1.55] text-tx2">
                                {p.abstract ?? (
                                  <span className="text-tx3 italic">
                                    No abstract provided by the source.
                                  </span>
                                )}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                                <span className="rounded-xs bg-acs px-[7px] py-px text-actx">
                                  {providerNames(p)}
                                </span>
                                {p.openAccess.isOpenAccess ? (
                                  <span className="rounded-xs border border-bd px-[7px] py-px text-tx2">
                                    Open access
                                  </span>
                                ) : null}
                                <span className="text-tx3">
                                  {p.citationCount === null
                                    ? 'Citation count unavailable'
                                    : `Cited by ${p.citationCount.toLocaleString()}`}
                                </span>
                                {p.doi ? (
                                  <a
                                    className="text-tx3 hover:text-tx hover:underline"
                                    href={`https://doi.org/${p.doi}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    doi:{p.doi}
                                  </a>
                                ) : p.landingPageUrl ? (
                                  <a
                                    className="text-tx3 hover:text-tx hover:underline"
                                    href={p.landingPageUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Source page
                                  </a>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col gap-[5px] max-sm:flex-row">
                              {savedId ? (
                                <Link
                                  href={libraryHref(savedId)}
                                  className="inline-flex h-[26px] items-center justify-start gap-1.5 rounded-md border border-bd bg-acs px-2.5 text-xs text-actx hover:bg-aiin"
                                >
                                  <BookmarkCheck
                                    aria-hidden="true"
                                    className="size-3"
                                  />
                                  Saved
                                </Link>
                              ) : (
                                <Btn
                                  variant="outline"
                                  size="md"
                                  className="justify-start"
                                  disabled={!canWrite || saving[p.candidateId]}
                                  title={
                                    canWrite
                                      ? undefined
                                      : 'Viewers cannot add papers'
                                  }
                                  onClick={() => void save(p)}
                                >
                                  <Bookmark
                                    aria-hidden="true"
                                    className="!size-3"
                                  />
                                  {saving[p.candidateId] ? 'Saving…' : 'Save'}
                                </Btn>
                              )}
                              <Btn
                                variant="ghost"
                                size="md"
                                className="justify-start"
                                onClick={() => setDetail(p)}
                              >
                                <FileText
                                  aria-hidden="true"
                                  className="!size-3"
                                />
                                Details
                              </Btn>
                              <Btn
                                variant="ghost"
                                size="md"
                                className="justify-start"
                                onClick={() =>
                                  copy(
                                    referenceText(p, p.title),
                                    'Reference copied',
                                  )
                                }
                              >
                                <Quote aria-hidden="true" className="!size-3" />
                                Cite
                              </Btn>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                    {done.nextCursor ? (
                      <div className="mt-4 flex justify-center">
                        <Btn
                          variant="outline"
                          disabled={loadingMore}
                          onClick={() => void more()}
                        >
                          {loadingMore ? 'Loading…' : 'Load more results'}
                        </Btn>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
          </div>
          {selected.length > 0 ? (
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
                {canWrite ? (
                  <Btn variant="outline" onClick={() => void saveSelected()}>
                    Save to Library
                  </Btn>
                ) : null}
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
        {detail ? (
          <PaperDetail
            paper={detail}
            savedId={saved[detail.candidateId]}
            saving={!!saving[detail.candidateId]}
            canWrite={canWrite}
            libraryHref={libraryHref}
            onSave={() => void save(detail)}
            onCopy={copy}
            onAsk={() =>
              atlas.ask({
                mode: 'open',
                chips: [
                  {
                    id: `candidate:${detail.candidateId}`,
                    kind: 'paper',
                    title: detail.title,
                    research: {
                      kind: 'search-result',
                      projectId: project.id,
                      candidateId: detail.candidateId,
                    },
                  },
                ],
              })
            }
            onClose={() => setDetail(null)}
          />
        ) : null}
      </div>
    </div>
  );
}

function providerList(filters: Filters) {
  return (Object.keys(filters.providers) as Provider[])
    .filter((p) => filters.providers[p])
    .map((p) => providerLabels[p])
    .join(' and ');
}

function ProviderReports({
  result,
  onRetry,
}: {
  result: ScholarlySearchResponse;
  onRetry: () => void;
}) {
  const failed = result.providers.filter((p) =>
    ['rate_limited', 'unavailable', 'not_configured'].includes(p.status),
  );
  const notes = result.providers.flatMap((p) =>
    p.unsupported.map((u) => `${providerLabels[p.provider]}: ${u}`),
  );
  return (
    <div className="mb-5 flex flex-col gap-2">
      {failed.length ? (
        <ErrorBanner
          title={
            result.state === 'partial'
              ? 'Some sources did not respond'
              : result.state === 'rate_limited'
                ? 'Sources are rate limiting searches'
                : 'Sources are unavailable'
          }
          action={
            <Btn variant="outline" size="md" onClick={onRetry}>
              Retry
            </Btn>
          }
        >
          {failed
            .map(
              (p) =>
                `${providerLabels[p.provider]} ${
                  p.status === 'rate_limited'
                    ? `is rate limited${p.retryAfterSeconds ? ` (retry in about ${p.retryAfterSeconds}s)` : ''}`
                    : p.status === 'not_configured'
                      ? 'is not configured'
                      : 'is unavailable'
                }`,
            )
            .join('; ')}
          .{' '}
          {result.state === 'partial'
            ? 'Showing results from the other source.'
            : 'No results are shown instead.'}
        </ErrorBanner>
      ) : null}
      <p role="status" className="text-[11.5px] text-tx3">
        {result.providers
          .filter((p) => p.status === 'ok' || p.status === 'no_results')
          .map(
            (p) =>
              `${providerLabels[p.provider]}: ${
                p.total === null
                  ? 'results'
                  : `${p.total.toLocaleString()} results`
              }`,
          )
          .join(' · ')}
      </p>
      {notes.length ? (
        <ul className="flex flex-col gap-0.5 text-[11.5px] text-tx3">
          {notes.map((n) => (
            <li key={n} className="flex items-center gap-1.5">
              <Info aria-hidden="true" className="size-3" />
              {n}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Comparison({
  papers,
  onClose,
}: {
  papers: NormalizedPaper[];
  onClose: () => void;
}) {
  const rows: [string, (p: NormalizedPaper) => string][] = [
    ['Year', (p) => (p.year === null ? 'Not listed' : String(p.year))],
    ['Authors', (p) => authorSummary(p)],
    ['Venue', (p) => p.venue ?? 'Not listed'],
    [
      'Citations',
      (p) =>
        p.citationCount === null
          ? 'Unavailable'
          : p.citationCount.toLocaleString(),
    ],
    ['Fields', (p) => (p.fields.length ? p.fields.join(', ') : 'Not listed')],
    [
      'Abstract',
      (p) =>
        p.abstract
          ? p.abstract.length > 320
            ? `${p.abstract.slice(0, 320)}…`
            : p.abstract
          : 'No abstract provided',
    ],
  ];
  return (
    <section
      aria-label="Comparison"
      className="mb-7 overflow-hidden rounded-2xl border border-bd"
    >
      <div className="flex items-center gap-2 border-b border-bd2 px-3.5 py-2.5 text-ctl">
        <GitCompare aria-hidden="true" className="size-[14px] text-tx2" />
        <h2 className="font-semibold">Comparison</h2>
        <span className="text-tx3">
          {papers.length} papers · provider metadata only
        </span>
        <span className="flex-1" />
        <IconBtn
          label="Close comparison"
          size="md"
          tone="muted"
          onClick={onClose}
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
                className="w-[120px] border-b border-bd2 px-3.5 py-[9px] text-left font-normal text-tx3"
              >
                <span className="sr-only">Attribute</span>
              </th>
              {papers.map((p) => (
                <th
                  key={p.candidateId}
                  scope="col"
                  className="border-b border-l border-bd2 px-3.5 py-[9px] text-left font-serif text-[15px] font-normal"
                >
                  {p.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th
                  scope="row"
                  className="border-b border-bd2 px-3.5 py-[9px] text-left align-top font-normal text-tx3"
                >
                  {label}
                </th>
                {papers.map((p) => (
                  <td
                    key={p.candidateId}
                    className="border-b border-l border-bd2 px-3.5 py-[9px] align-top text-tx2"
                  >
                    {value(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-3.5 py-2 text-[11.5px] text-tx3">
        Methodology comparison with Atlas AI arrives in Phase 03; nothing here
        is generated.
      </p>
    </section>
  );
}

function PaperDetail({
  paper,
  savedId,
  saving,
  canWrite,
  libraryHref,
  onSave,
  onCopy,
  onAsk,
  onClose,
}: {
  paper: NormalizedPaper;
  savedId: string | undefined;
  saving: boolean;
  canWrite: boolean;
  libraryHref: (id?: string) => string;
  onSave: () => void;
  onCopy: (text: string, message: string) => void;
  onAsk: () => void;
  onClose: () => void;
}) {
  return (
    <aside
      aria-label={`Paper details: ${paper.title}`}
      className="flex w-[min(420px,44%)] shrink-0 flex-col border-l border-bd2 bg-canvas max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-40 max-md:w-[min(420px,100%)] max-md:shadow-pop"
    >
      <div className="flex items-center gap-1.5 border-b border-bd2 px-3 py-2.5">
        <span className="flex-1 truncate text-xs text-tx3">
          {paper.venue ?? providerNames(paper)}
        </span>
        <IconBtn label="Close details" size="base" onClick={onClose}>
          <X aria-hidden="true" className="size-[14px]" />
        </IconBtn>
      </div>
      <div className="flex-1 overflow-auto px-[18px] pt-4 pb-6">
        <h2 className="mb-1.5 font-serif text-2xl leading-[1.15] font-medium">
          {paper.title}
        </h2>
        <p className="mb-3.5 text-ctl text-tx2">
          {paper.authors.length
            ? paper.authors.map((a) => a.name).join(', ')
            : 'Authors not listed by the provider'}
          {paper.authorCount > paper.authors.length
            ? ` and ${paper.authorCount - paper.authors.length} more`
            : ''}
        </p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {savedId ? (
            <Link
              href={libraryHref(savedId)}
              className="inline-flex h-[30px] items-center gap-1.5 rounded-[7px] bg-acb px-3 text-ctl font-medium text-white hover:bg-acbh"
            >
              <BookmarkCheck aria-hidden="true" className="size-[13px]" />
              Open in library
            </Link>
          ) : (
            <Btn
              variant="primary"
              size="lg"
              disabled={!canWrite || saving}
              onClick={onSave}
            >
              <Bookmark aria-hidden="true" />
              {saving ? 'Saving…' : 'Save to library'}
            </Btn>
          )}
          <Btn
            variant="outline"
            size="lg"
            onClick={() =>
              onCopy(referenceText(paper, paper.title), 'Reference copied')
            }
          >
            <Quote aria-hidden="true" />
            Copy reference
          </Btn>
          {paper.doi ? (
            <Btn
              variant="outline"
              size="lg"
              onClick={() => onCopy(paper.doi!, 'DOI copied')}
            >
              <Copy aria-hidden="true" />
              Copy DOI
            </Btn>
          ) : null}
          <Btn variant="ai" size="lg" onClick={onAsk}>
            <Sparkles aria-hidden="true" />
            Ask Atlas
          </Btn>
        </div>
        <h3 className="mb-1.5 text-[11.5px] text-tx3">Abstract</h3>
        <p className="mb-4 font-read text-sm leading-[1.7]">
          {paper.abstract ?? (
            <span className="text-tx3 italic">
              No abstract provided by the source.
            </span>
          )}
        </p>
        <dl className="mb-[18px] grid grid-cols-[110px_1fr] gap-x-2.5 gap-y-[7px] text-ctl">
          <dt className="text-tx3">Published</dt>
          <dd>{paper.publicationDate ?? paper.year ?? 'Not listed'}</dd>
          <dt className="text-tx3">Venue</dt>
          <dd>{paper.venue ?? 'Not listed'}</dd>
          <dt className="text-tx3">Type</dt>
          <dd>{paper.publicationType ?? 'Not listed'}</dd>
          <dt className="text-tx3">Cited by</dt>
          <dd>
            {paper.citationCount === null
              ? 'Unavailable'
              : paper.citationCount.toLocaleString()}
          </dd>
          <dt className="text-tx3">Fields</dt>
          <dd>
            {paper.fields.length ? paper.fields.join(', ') : 'Not listed'}
          </dd>
          <dt className="text-tx3">Language</dt>
          <dd>{paper.language ?? 'Not listed'}</dd>
          <dt className="text-tx3">DOI</dt>
          <dd className="break-all">{paper.doi ?? 'None recorded'}</dd>
          <dt className="text-tx3">OpenAlex ID</dt>
          <dd>{paper.openAlexId ?? '—'}</dd>
          <dt className="text-tx3">Semantic Scholar</dt>
          <dd className="break-all">{paper.semanticScholarId ?? '—'}</dd>
        </dl>
        <h3 className="mb-1.5 text-[11.5px] text-tx3">Access</h3>
        <div className="mb-4 rounded-lg border border-bd2 p-2.5 text-ctl text-tx2">
          <p className="mb-1.5">
            {paper.openAccess.isOpenAccess === null
              ? 'Open-access status not reported.'
              : paper.openAccess.isOpenAccess
                ? `Open access${paper.openAccess.status ? ` (${paper.openAccess.status})` : ''}${paper.openAccess.license ? ` · ${paper.openAccess.license}` : ''}.`
                : 'Not reported as open access.'}{' '}
            Atlas never downloads publisher PDFs; upload a copy you are
            permitted to use from the library.
          </p>
          <ul className="flex flex-col gap-1">
            {paper.landingPageUrl ? (
              <li>
                <a
                  className="inline-flex items-center gap-1 text-actx hover:underline"
                  href={paper.landingPageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Landing page{' '}
                  <ArrowUpRight aria-hidden="true" className="size-3" />
                </a>
              </li>
            ) : null}
            {paper.pdfLocations.map((l) => (
              <li key={l.url}>
                <a
                  className="inline-flex items-center gap-1 text-actx hover:underline"
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  External PDF via {providerLabels[l.provider]}{' '}
                  <ArrowUpRight aria-hidden="true" className="size-3" />
                </a>
              </li>
            ))}
          </ul>
        </div>
        <h3 className="mb-1.5 text-[11.5px] text-tx3">Source provenance</h3>
        <ul className="flex flex-col gap-1 text-ctl text-tx2">
          {paper.provenance.map((p) => (
            <li key={`${p.provider}:${p.externalId}`}>
              {providerLabels[p.provider]} · {p.externalId} · retrieved{' '}
              {new Date(p.retrievedAt).toLocaleString()}
            </li>
          ))}
        </ul>
      </div>
    </aside>
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

function FilterMenu({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${value}`}
          className="inline-flex h-6 items-center gap-[5px] rounded-sm border border-bd px-2 text-xs text-tx2 hover:bg-hov"
        >
          {value}
          <ChevronDown aria-hidden="true" className="size-[11px]" />
        </button>
      </MenuTrigger>
      <MenuContent width={200} align="start">
        <MenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((o) => (
            <MenuRadioItem key={o} value={o}>
              {o}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
