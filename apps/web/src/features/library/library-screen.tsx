'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlignLeft,
  ArrowUpRight,
  BookOpen,
  Bookmark,
  Copy,
  FileUp,
  Folder,
  GitCompare,
  Library,
  ListFilter,
  Plus,
  Quote,
  Search,
  Share2,
  Sparkles,
  StickyNote,
  Table,
  Tag,
  Telescope,
  X,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import { Btn, IconBtn } from '@/components/atlas/button';
import { SampleTag, StatusTag } from '@/components/atlas/chips';
import { Segmented } from '@/components/atlas/segmented';
import { EmptyState } from '@/components/atlas/states';
import { useToast } from '@/components/atlas/toast';
import { useAtlas } from '@/features/atlas-ai/atlas-provider';
import { AtlasAnchor } from '@/features/atlas-ai/atlas-surface';
import { SharePopover } from '@/features/overlays/share-popover';
import { moduleHref } from '@/features/shell/navigation';
import { Crumb, Topbar } from '@/features/shell/topbar';
import { useMediaQuery } from '@/features/shell/use-media';
import {
  bibtexFor,
  isPaperId,
  libraryCollections,
  libraryNotes,
  paperById,
  papers,
  type Paper,
} from '@/lib/preview/research';
const collectionIcons = {
  library: Library,
  book: BookOpen,
  bookmark: Bookmark,
  folder: Folder,
  tag: Tag,
} as const;
type Status = 'all' | 'toread' | 'reading' | 'read';
const statusOf: Record<Status, Paper['status'] | null> = {
  all: null,
  toread: 'To read',
  reading: 'Reading',
  read: 'Read',
};
/**
 * Library (handoff §6 "Library"): collections, filter row, paper list and
 * an inline detail drawer with Overview, Notes and Citation tabs.
 */
export function LibraryScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const flash = useToast();
  const atlas = useAtlas();
  const showCols = useMediaQuery('(min-width: 1100px)');
  const empty = params.get('demo') === 'empty';
  const paperParam = params.get('paper');
  const [collection, setCollection] = useState('all');
  const [status, setStatus] = useState<Status>('all');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'overview' | 'notes' | 'cite'>('overview');
  const [note, setNote] = useState('');
  const selectedId = isPaperId(paperParam) ? paperParam : null;
  const current = selectedId ? paperById(selectedId) : null;
  const stf = statusOf[status];
  const list = empty
    ? []
    : papers
        .filter((p) => !stf || p.status === stf)
        .filter((p) => collection !== 'reading' || p.status === 'Reading')
        .filter((p) => collection !== 'toread' || p.status === 'To read')
        .filter((p) => {
          const q = query.trim().toLowerCase();
          return (
            !q ||
            `${p.title} ${p.authors} ${p.tags.join(' ')}`
              .toLowerCase()
              .includes(q)
          );
        });
  const title =
    libraryCollections.find((c) => c.key === collection)?.label ?? 'All papers';
  const select = (id: string | null) =>
    router.replace(
      id ? moduleHref('library', `paper=${id}`) : moduleHref('library'),
      { scroll: false },
    );
  const ask = (prefix?: string) => {
    if (!current) return;
    atlas.ask({
      mode: 'open',
      chips: [{ id: current.id, kind: 'paper', title: current.short }],
      ...(prefix ? { prompt: `${prefix}${current.short}` } : {}),
    });
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar
        actions={
          <>
            <Btn
              variant="ghost"
              onClick={() =>
                flash(
                  'PDF import is UI-only in this preview — nothing was uploaded',
                )
              }
            >
              <FileUp aria-hidden="true" />
              <span className="max-sm:hidden">Import PDF</span>
            </Btn>
            <Btn
              variant="secondary"
              onClick={() => router.push(moduleHref('research'))}
            >
              <Plus aria-hidden="true" />
              Add paper
            </Btn>
          </>
        }
      >
        <Crumb title="Library" as="span" />
      </Topbar>
      <AtlasAnchor placement="canvas" />
      <div className="relative flex min-h-0 flex-1">
        {showCols ? (
          <nav
            aria-label="Collections"
            className="flex w-[196px] shrink-0 flex-col gap-px overflow-auto pt-1 pr-2 pb-3 pl-2.5"
          >
            {libraryCollections.map((c) =>
              c.kind === 'header' ? (
                <div
                  key={c.key}
                  className="px-2 pt-3.5 pb-1 text-[11.5px] font-medium text-tx3"
                >
                  {c.label}
                </div>
              ) : (
                (() => {
                  const Icon = collectionIcons[c.icon];
                  return (
                    <button
                      key={c.key}
                      type="button"
                      aria-current={collection === c.key ? 'true' : undefined}
                      onClick={() => setCollection(c.key)}
                      className={cn(
                        'flex h-[30px] w-full items-center gap-[9px] rounded-md px-2 hover:bg-hov hover:text-tx',
                        collection === c.key ? 'bg-hov text-tx' : 'text-tx2',
                      )}
                    >
                      <Icon
                        aria-hidden="true"
                        className="size-[14px] text-tx3"
                      />
                      <span className="flex-1 truncate text-left">
                        {c.label}
                      </span>
                      <span className="text-[11px] text-tx3">{c.count}</span>
                    </button>
                  );
                })()
              ),
            )}
          </nav>
        ) : null}
        <div className="min-w-0 flex-1 overflow-auto pt-[calc(68px+var(--aic))] pr-7 pb-[60px] pl-5 max-sm:px-4">
          <div className="mb-3.5 flex items-baseline gap-2.5">
            <h1 className="font-serif text-[32px] leading-[1.1] font-medium">
              {title}
            </h1>
            <span className="text-xs text-tx3">
              {list.length} papers · sample library
            </span>
          </div>
          <div className="mb-3.5 flex flex-wrap items-center gap-2">
            <label className="flex h-[30px] w-60 items-center gap-[7px] rounded-[7px] border border-bd bg-canvas px-2.5 max-sm:w-full">
              <Search aria-hidden="true" className="size-[13px] text-tx3" />
              <span className="sr-only">Filter by title, author or tag</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by title, author, tag"
                className="min-w-0 flex-1 text-ctl"
              />
            </label>
            <Segmented
              label="Reading status"
              size="sm"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: 'All' },
                { value: 'toread', label: 'To read' },
                { value: 'reading', label: 'Reading' },
                { value: 'read', label: 'Read' },
              ]}
            />
            <span className="flex-1" />
            <Btn
              variant="ghost"
              size="base"
              className="text-xs"
              onClick={() => flash('More filters are UI-only in this preview')}
            >
              <ListFilter aria-hidden="true" />
              Filters
            </Btn>
          </div>
          {empty ? (
            <EmptyState
              dashed
              icon={Library}
              title="Your library is empty"
              description="Drop PDFs here, import from Zotero or a .bib file, or save papers from Research."
            >
              <Btn
                variant="primary"
                size="lg"
                onClick={() => flash('PDF import is UI-only in this preview')}
              >
                <FileUp aria-hidden="true" />
                Import PDFs
              </Btn>
              <Btn
                variant="outline"
                size="lg"
                onClick={() => flash('.bib import is UI-only in this preview')}
              >
                Import .bib
              </Btn>
              <Btn
                variant="ghost"
                size="lg"
                onClick={() => router.push(moduleHref('research'))}
              >
                <Telescope aria-hidden="true" />
                Search literature
              </Btn>
            </EmptyState>
          ) : list.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No sample papers match"
              description="Try another title, author or tag, or clear the status filter."
            >
              <Btn
                variant="outline"
                onClick={() => {
                  setQuery('');
                  setStatus('all');
                  setCollection('all');
                }}
              >
                Clear filters
              </Btn>
            </EmptyState>
          ) : (
            <ul className="border-t border-bd2">
              {list.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={selectedId === p.id}
                    onClick={() => select(p.id)}
                    className={cn(
                      'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3.5 rounded-md border-b border-bd2 px-2.5 py-3 text-left hover:bg-card',
                      selectedId === p.id && 'bg-card',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="mb-[3px] block font-serif text-[17px] leading-[1.25]">
                        {p.title}
                      </span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-tx3">
                        <span>{p.authors}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-tx2">{p.venue}</span>
                        {p.tags.map((g) => (
                          <span
                            key={g}
                            className="rounded-xs bg-el px-1.5 text-[11px] text-tx2"
                          >
                            #{g}
                          </span>
                        ))}
                      </span>
                    </span>
                    <span className="flex items-center gap-2.5">
                      {p.notes ? (
                        <span className="flex items-center gap-1 text-[11.5px] text-tx3">
                          <StickyNote aria-hidden="true" className="size-3" />
                          {p.notes}
                          <span className="sr-only">notes</span>
                        </span>
                      ) : null}
                      <StatusTag
                        tone={p.status === 'Reading' ? 'accent' : 'default'}
                      >
                        {p.status}
                      </StatusTag>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {current ? (
          <aside
            aria-label={`Paper details: ${current.short}`}
            className="flex w-[min(400px,44%)] shrink-0 flex-col border-l border-bd2 bg-canvas max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-40 max-md:w-[min(400px,100%)] max-md:shadow-pop"
          >
            <div className="flex items-center gap-1.5 border-b border-bd2 px-3 py-2.5">
              <span className="flex-1 text-xs text-tx3">{current.venue}</span>
              <SharePopover
                resource={current.short}
                trigger={
                  <button
                    type="button"
                    aria-label="Share paper"
                    className="grid size-[26px] place-items-center rounded-md text-tx2 hover:bg-hov"
                  >
                    <Share2 aria-hidden="true" className="size-[14px]" />
                  </button>
                }
              />
              <IconBtn
                label="Close details"
                size="base"
                onClick={() => select(null)}
              >
                <X aria-hidden="true" className="size-[14px]" />
              </IconBtn>
            </div>
            <div className="flex-1 overflow-auto px-[18px] pt-4 pb-6">
              <h2 className="mb-1.5 font-serif text-2xl leading-[1.15] font-medium">
                {current.title}
              </h2>
              <p className="mb-3.5 text-ctl text-tx2">{current.authors}</p>
              <div className="mb-4 flex flex-wrap gap-1.5">
                <Btn
                  variant="primary"
                  size="lg"
                  onClick={() =>
                    router.push(moduleHref('reader', `paper=${current.id}`))
                  }
                >
                  <BookOpen aria-hidden="true" />
                  Open PDF
                </Btn>
                <Btn
                  variant="outline"
                  size="lg"
                  onClick={() => {
                    void navigator.clipboard
                      ?.writeText(bibtexFor(current))
                      .catch(() => {});
                    flash('Sample BibTeX copied', 'done');
                  }}
                >
                  <Quote aria-hidden="true" />
                  Cite
                </Btn>
                <Btn variant="ai" size="lg" onClick={() => ask()}>
                  <Sparkles aria-hidden="true" />
                  Ask Atlas
                </Btn>
              </div>
              <div
                role="tablist"
                aria-label="Paper detail"
                className="mb-3.5 flex gap-0.5 border-b border-bd2"
              >
                {(
                  [
                    ['overview', 'Overview'],
                    ['notes', 'Notes'],
                    ['cite', 'Citation'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={tab === k}
                    onClick={() => setTab(k)}
                    className={cn(
                      '-mb-px h-[30px] border-b-[1.5px] px-2.5 text-ctl',
                      tab === k
                        ? 'border-tx text-tx'
                        : 'border-transparent text-tx3 hover:text-tx2',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {tab === 'overview' ? (
                <div role="tabpanel" aria-label="Overview">
                  <h3 className="mb-1.5 text-[11.5px] text-tx3">Abstract</h3>
                  <p className="mb-4 text-justify font-read text-sm leading-[1.7] hyphens-auto">
                    {current.abstract}
                  </p>
                  <dl className="mb-[18px] grid grid-cols-[96px_1fr] gap-x-2.5 gap-y-[7px] text-ctl">
                    <dt className="text-tx3">Status</dt>
                    <dd>{current.status}</dd>
                    <dt className="text-tx3">Cited by</dt>
                    <dd>{current.citedBy} (sample)</dd>
                    <dt className="text-tx3">Collections</dt>
                    <dd>Sparse attention</dd>
                    <dt className="text-tx3">Linked</dt>
                    <dd>
                      <button
                        type="button"
                        className="text-actx hover:underline"
                        onClick={() =>
                          router.push(moduleHref('documents', 'doc=d1'))
                        }
                      >
                        Related work — sparse attention
                      </button>
                    </dd>
                  </dl>
                  <h3 className="mb-1.5 flex items-center gap-2 text-[11.5px] text-tx3">
                    Atlas actions <SampleTag>Sample answers</SampleTag>
                  </h3>
                  <div className="flex flex-col gap-1">
                    {(
                      [
                        [
                          'Summarize methodology',
                          AlignLeft,
                          '/summarize methodology of ',
                        ],
                        [
                          'Extract datasets and metrics',
                          Table,
                          '/summarize datasets and metrics in ',
                        ],
                        [
                          'Find related work',
                          Telescope,
                          '/search papers related to ',
                        ],
                        [
                          'Compare with my method',
                          GitCompare,
                          '/compare with SparseEvo: ',
                        ],
                      ] as const
                    ).map(([label, Icon, prefix]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => ask(prefix)}
                        className="flex h-8 items-center gap-[9px] rounded-[7px] border border-bd2 px-2.5 text-left text-ctl hover:bg-hov"
                      >
                        <Icon
                          aria-hidden="true"
                          className="size-[13px] text-actx"
                        />
                        <span className="flex-1">{label}</span>
                        <ArrowUpRight
                          aria-hidden="true"
                          className="size-3 text-tx3"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {tab === 'notes' ? (
                <div role="tabpanel" aria-label="Notes">
                  {libraryNotes.map((n) => (
                    <div
                      key={n.quote}
                      className="mb-2 rounded-lg border border-bd2 p-2.5"
                    >
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <span className="rounded-xs bg-el px-1.5 font-mono text-[11px] text-tx2">
                          {n.location}
                        </span>
                        <span className="text-[11px] text-tx3">{n.who}</span>
                      </div>
                      <blockquote className="mb-[5px] font-read text-ui text-tx2 italic">
                        “{n.quote}”
                      </blockquote>
                      <p className="text-ctl">{n.note}</p>
                    </div>
                  ))}
                  <label htmlFor="paper-note" className="sr-only">
                    Add a note
                  </label>
                  <textarea
                    id="paper-note"
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note… (kept only in this tab)"
                    className="w-full resize-none rounded-lg border border-bd px-2.5 py-2 text-ctl"
                  />
                </div>
              ) : null}
              {tab === 'cite' ? (
                <div role="tabpanel" aria-label="Citation">
                  <Segmented
                    label="Citation style"
                    variant="plain"
                    size="sm"
                    value="bibtex"
                    onChange={() =>
                      flash(
                        'APA and Chicago formatting arrive with citation services',
                      )
                    }
                    className="mb-2"
                    options={[
                      { value: 'bibtex', label: 'BibTeX' },
                      { value: 'apa', label: 'APA' },
                      { value: 'chicago', label: 'Chicago' },
                    ]}
                  />
                  <pre className="mb-2.5 rounded-lg border border-bd2 bg-code p-3 font-mono text-[11.5px] leading-[1.6] whitespace-pre-wrap text-[var(--syn-t)]">
                    {bibtexFor(current)}
                  </pre>
                  <Btn
                    variant="outline"
                    className="text-xs"
                    onClick={() => {
                      void navigator.clipboard
                        ?.writeText(bibtexFor(current))
                        .catch(() => {});
                      flash('Sample BibTeX copied', 'done');
                    }}
                  >
                    <Copy aria-hidden="true" className="!size-3" />
                    Copy BibTeX
                  </Btn>
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
