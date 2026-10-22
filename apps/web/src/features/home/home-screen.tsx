'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDownUp,
  Bell,
  BookOpen,
  ChevronDown,
  FileCode,
  FileText,
  FlaskConical,
  FolderKanban,
  LayoutGrid,
  List,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import { AvatarStack, CountBadge, StatusTag } from '@/components/atlas/chips';
import {
  Menu,
  MenuContent,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from '@/components/atlas/overlay';
import { Segmented } from '@/components/atlas/segmented';
import { AtlasAnchor } from '@/features/atlas-ai/atlas-surface';
import { InboxPopover } from '@/features/inbox/inbox-popover';
import { ResourceMenu } from '@/features/overlays/resource-menus';
import { moduleHref } from '@/features/shell/navigation';
import { usePreviewStore } from '@/features/shell/preview-store';
import { Topbar } from '@/features/shell/topbar';
import { TaskStatusIcon, PriorityIcon } from '@/features/tasks/task-icons';
import { currentUser, people } from '@/lib/preview/people';
import { papers } from '@/lib/preview/research';
import { documents, manuscripts, projects } from '@/lib/preview/workspace';
type Filter = 'all' | 'shared' | 'owned';
const sorts = [
  'Last edited',
  'Oldest first',
  'Name A–Z',
  'Date created',
] as const;
const continueItems: {
  icon: LucideIcon;
  title: string;
  meta: string;
  href: string;
}[] = [
  {
    icon: FileText,
    title: 'Related work — sparse attention',
    meta: 'Document · edited 12 min ago',
    href: moduleHref('documents', 'doc=d1'),
  },
  {
    icon: FileCode,
    title: 'Sparse Evoformer · main.tex',
    meta: 'Manuscript · 1 sample error',
    href: moduleHref('manuscripts'),
  },
  {
    icon: BookOpen,
    title: 'Chen & Duarte, 2023',
    meta: 'Reading · page 3 of 14',
    href: moduleHref('reader', 'paper=p2'),
  },
  {
    icon: FlaskConical,
    title: 'run_14_block_sparsity',
    meta: 'Notebook · sample outputs',
    href: moduleHref('experiments'),
  },
];
export { continueItems };
function SectionHeading({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h2 className="font-serif text-2xl font-medium">{title}</h2>
      {count !== undefined ? <CountBadge>{count}</CountBadge> : null}
      {action ? (
        <>
          <span className="flex-1" />
          {action}
        </>
      ) : null}
    </div>
  );
}
/** Stretched-link card: whole card opens, nested menu stays interactive. */
const stretched =
  "after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-[inherit] focus-visible:after:outline-2 focus-visible:after:outline-ac";
export function HomeScreen() {
  const router = useRouter();
  const store = usePreviewStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [sort, setSort] = useState<(typeof sorts)[number]>('Last edited');
  const matches = (owned: boolean, shared = false) =>
    filter === 'all' || (filter === 'owned' ? owned : !owned || shared);
  const visibleProjects = projects.filter((p) => matches(p.owned));
  const visibleDocs = documents.filter((d) =>
    matches(d.owner === 'taha', d.shared),
  );
  const sortByName = <T extends { title: string }>(list: T[]) =>
    sort === 'Name A–Z'
      ? [...list].sort((a, b) => a.title.localeCompare(b.title))
      : sort === 'Oldest first'
        ? [...list].reverse()
        : list;
  const myTasks = store.tasks.filter(
    (t) => t.assignee === 'taha' && t.status !== 'done',
  );
  const allRows = [
    ...sortByName(visibleProjects).map((p) => ({
      icon: FolderKanban,
      title: p.title,
      type: 'Project',
      owner: people[p.people[0] ?? 'taha'].name,
      edited: p.edited.replace('Edited ', ''),
      href: moduleHref('overview'),
    })),
    ...sortByName(visibleDocs).map((d) => ({
      icon: FileText,
      title: d.title,
      type: d.kind,
      owner: people[d.owner].name,
      edited: d.edited,
      href: moduleHref('documents', `doc=${d.id}`),
    })),
    {
      icon: FileCode,
      title: 'Sparse Evoformer',
      type: 'Manuscript',
      owner: currentUser.name,
      edited: '1 h ago',
      href: moduleHref('manuscripts'),
    },
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar
        actions={
          <InboxPopover
            side="bottom"
            trigger={
              <button
                type="button"
                aria-label="Notifications"
                className="grid size-7 place-items-center rounded-md text-tx2 hover:bg-hov hover:text-tx"
              >
                <Bell aria-hidden="true" className="size-[15px]" />
              </button>
            }
          />
        }
      />
      <AtlasAnchor placement="canvas" />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="max-w-[1440px] px-8 pt-[calc(52px+var(--aic))] pb-[72px] max-sm:px-4">
          <h1 className="mb-[18px] font-serif text-4xl leading-[1.1] font-medium tracking-[-0.01em]">
            Good afternoon, {currentUser.short}
          </h1>
          <div className="mb-[26px] flex flex-wrap items-center gap-3">
            <Segmented
              label="Filter resources"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'shared', label: 'Shared with you' },
                { value: 'owned', label: 'Owned by you' },
              ]}
            />
            <div className="flex-1" />
            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-ctl text-tx2 hover:bg-hov"
                >
                  <span className="text-tx3">Sort</span>
                  <span className="text-tx">{sort}</span>
                  <ChevronDown aria-hidden="true" className="size-3" />
                </button>
              </MenuTrigger>
              <MenuContent width={220} align="end">
                <MenuRadioGroup
                  value={sort}
                  onValueChange={(v) => setSort(v as (typeof sorts)[number])}
                >
                  {sorts.map((s) => (
                    <MenuRadioItem key={s} value={s} icon={<ArrowDownUp />}>
                      {s}
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
              </MenuContent>
            </Menu>
            <Segmented
              label="Layout"
              value={view}
              onChange={setView}
              options={[
                {
                  value: 'grid',
                  label: 'Grid',
                  icon: <LayoutGrid aria-hidden="true" />,
                },
                {
                  value: 'list',
                  label: 'List',
                  icon: <List aria-hidden="true" />,
                },
              ]}
            />
          </div>
          <h2 className="mb-2.5 text-xs text-tx3">Continue working</h2>
          <div className="mb-9 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5">
            {continueItems.map((c) => (
              <Link
                key={c.title}
                href={c.href}
                className="flex min-w-0 items-center gap-3 rounded-lg border border-bd2 bg-card px-3 py-2.5 hover:border-bd hover:bg-el"
              >
                <span className="grid size-[30px] shrink-0 place-items-center rounded-[7px] border border-bd2 bg-el text-tx2">
                  <c.icon aria-hidden="true" className="size-[15px]" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{c.title}</span>
                  <span className="truncate text-[11.5px] text-tx3">
                    {c.meta}
                  </span>
                </span>
              </Link>
            ))}
          </div>
          {view === 'grid' ? (
            <>
              <section aria-label="Projects">
                <SectionHeading
                  title="Projects"
                  count={visibleProjects.length}
                />
                <div className="mb-10 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
                  <button
                    type="button"
                    aria-label="New project"
                    onClick={() => router.push('/onboarding?step=5')}
                    className="grid min-h-[220px] place-items-center rounded-2xl border-[1.5px] border-dashed border-bd text-tx3 hover:border-tx3 hover:bg-card hover:text-tx2 max-sm:min-h-[96px]"
                  >
                    <Plus
                      aria-hidden="true"
                      className="size-[30px] stroke-[1.25]"
                    />
                  </button>
                  {sortByName(visibleProjects).map((p) => (
                    <article
                      key={p.id}
                      className="relative flex flex-col gap-3 rounded-2xl border border-transparent bg-card p-3 hover:border-bd2"
                    >
                      <div className="flex h-[132px] flex-col gap-[7px] overflow-hidden rounded-lg bg-el px-4 py-3.5">
                        <span className="text-[10.5px] tracking-[0.02em] text-tx3">
                          {p.counts}
                        </span>
                        <span className="font-serif text-[17px] leading-[1.2] text-tx2">
                          {p.description}
                        </span>
                        <span className="text-[11px] leading-normal text-tx3">
                          {p.next}
                        </span>
                      </div>
                      <div className="flex items-start gap-2 px-1 pb-0.5">
                        <div className="min-w-0 flex-1">
                          <h3 className="mb-1 text-[15px] font-medium">
                            <Link
                              href={moduleHref('overview')}
                              className={stretched}
                            >
                              {p.title}
                            </Link>
                          </h3>
                          <div className="text-xs text-tx3">{p.edited}</div>
                        </div>
                        <div className="relative z-10 flex flex-col items-end gap-1.5">
                          <ResourceMenu
                            title={p.title}
                            href={moduleHref('overview')}
                          />
                          <AvatarStack
                            people={p.people.map((id) => people[id])}
                          />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
              <section aria-label="Documents and notes">
                <SectionHeading
                  title="Documents & notes"
                  count={visibleDocs.length}
                />
                <div className="mb-10 grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3">
                  <button
                    type="button"
                    aria-label="New document"
                    onClick={() =>
                      router.push(moduleHref('documents', 'doc=new'))
                    }
                    className="grid h-[104px] place-items-center rounded-xl border-[1.5px] border-dashed border-bd text-tx3 hover:border-tx3 hover:text-tx2"
                  >
                    <Plus aria-hidden="true" className="size-[22px]" />
                  </button>
                  {sortByName(visibleDocs).map((d) => (
                    <article
                      key={d.id}
                      className="relative flex h-[104px] flex-col rounded-xl border border-transparent bg-card px-3 pt-3 pb-2.5 hover:border-bd2"
                    >
                      <span className="grid size-6 place-items-center rounded-md bg-el text-tx2">
                        <FileText aria-hidden="true" className="size-[13px]" />
                      </span>
                      <span className="flex-1" />
                      <h3 className="truncate text-[13.5px] font-medium">
                        <Link
                          href={moduleHref('documents', `doc=${d.id}`)}
                          className={stretched}
                        >
                          {d.title}
                        </Link>
                      </h3>
                      <span className="text-[11.5px] text-tx3">
                        {d.kind} · {d.edited}
                      </span>
                      <ResourceMenu
                        title={d.title}
                        href={moduleHref('documents', `doc=${d.id}`)}
                        className="absolute top-2 right-2 z-10 text-tx3"
                      />
                    </article>
                  ))}
                </div>
              </section>
              <section aria-label="Manuscripts">
                <SectionHeading
                  title="Manuscripts"
                  count={manuscripts.length}
                />
                <div className="mb-10 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
                  {manuscripts.map((m) => (
                    <article
                      key={m.title}
                      className="relative flex gap-3.5 rounded-2xl border border-transparent bg-card p-3 hover:border-bd2"
                    >
                      <PaperThumb />
                      <div className="flex min-w-0 flex-1 flex-col pt-0.5 pr-0.5">
                        <h3 className="text-[15px] font-medium">
                          <Link
                            href={moduleHref('manuscripts')}
                            className={stretched}
                          >
                            {m.title}
                          </Link>
                        </h3>
                        <span className="mt-0.5 text-xs text-tx2">
                          {m.subtitle}
                        </span>
                        <span className="flex-1" />
                        <span className="font-mono text-[11.5px] text-tx3">
                          {m.files}
                        </span>
                        <span className="mt-1 text-xs text-tx3">
                          {m.edited}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] gap-7">
                <section aria-label="Saved papers">
                  <SectionHeading
                    title="Saved papers"
                    action={
                      <Link
                        href={moduleHref('library')}
                        className="text-xs text-tx2 hover:text-tx"
                      >
                        Open library
                      </Link>
                    }
                  />
                  <ul className="border-t border-bd2">
                    {papers.slice(0, 4).map((p) => (
                      <li key={p.id}>
                        <Link
                          href={moduleHref('library', `paper=${p.id}`)}
                          className="flex items-center gap-3 border-b border-bd2 px-1 py-2.5 hover:bg-card"
                        >
                          <BookOpen
                            aria-hidden="true"
                            className="size-[14px] shrink-0 text-tx3"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-serif text-base leading-[1.25]">
                              {p.title}
                            </span>
                            <span className="text-[11.5px] text-tx3">
                              {p.short} · {p.venue}
                            </span>
                          </span>
                          <StatusTag>{p.status}</StatusTag>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
                <section aria-label="Assigned to you">
                  <SectionHeading
                    title="Assigned to you"
                    action={
                      <Link
                        href={moduleHref('tasks')}
                        className="text-xs text-tx2 hover:text-tx"
                      >
                        All tasks
                      </Link>
                    }
                  />
                  <ul className="border-t border-bd2">
                    {myTasks.map((t) => (
                      <li key={t.id}>
                        <Link
                          href={moduleHref('tasks', `task=${t.id}`)}
                          className="flex items-center gap-2.5 border-b border-bd2 px-1 py-2.5 hover:bg-card"
                        >
                          <TaskStatusIcon status={t.status} />
                          <span className="font-mono text-[11px] text-tx3">
                            {t.id}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {t.title}
                          </span>
                          <PriorityIcon priority={t.priority} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </>
          ) : (
            <div
              role="table"
              aria-label="All resources"
              className="border-t border-bd2"
            >
              <div
                role="row"
                className="grid grid-cols-[minmax(0,1fr)_120px_140px_120px_32px] gap-3 border-b border-bd2 px-2 py-2 text-[11.5px] text-tx3 max-md:grid-cols-[minmax(0,1fr)_100px_32px]"
              >
                <span role="columnheader">Name</span>
                <span role="columnheader">Type</span>
                <span role="columnheader" className="max-md:hidden">
                  Owner
                </span>
                <span role="columnheader" className="max-md:hidden">
                  Last edited
                </span>
                <span role="columnheader">
                  <span className="sr-only">Actions</span>
                </span>
              </div>
              {allRows.map((r) => (
                <div
                  key={r.title + r.type}
                  role="row"
                  className="relative grid h-10 grid-cols-[minmax(0,1fr)_120px_140px_120px_32px] items-center gap-3 border-b border-bd2 px-2 hover:bg-card max-md:grid-cols-[minmax(0,1fr)_100px_32px]"
                >
                  <span
                    role="cell"
                    className="flex min-w-0 items-center gap-2.5"
                  >
                    <r.icon
                      aria-hidden="true"
                      className="size-[14px] shrink-0 text-tx3"
                    />
                    <Link
                      href={r.href}
                      className={cn('truncate font-medium', stretched)}
                    >
                      {r.title}
                    </Link>
                  </span>
                  <span role="cell" className="text-ctl text-tx2">
                    {r.type}
                  </span>
                  <span role="cell" className="text-ctl text-tx2 max-md:hidden">
                    {r.owner}
                  </span>
                  <span role="cell" className="text-ctl text-tx3 max-md:hidden">
                    {r.edited}
                  </span>
                  <span role="cell" className="relative z-10">
                    <ResourceMenu
                      title={r.title}
                      href={r.href}
                      className="text-tx3"
                    />
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
/** Miniature manuscript page (prototype thumbnail). */
export function PaperThumb() {
  return (
    <div
      aria-hidden="true"
      className="flex h-[110px] w-[86px] shrink-0 flex-col items-center gap-1 rounded-xs bg-paper px-[9px] py-2.5 opacity-[0.92]"
    >
      <span className="h-1 w-4/5 rounded-[2px] bg-[#2b2b28]" />
      <span className="mb-[5px] h-[3px] w-[55%] rounded-[2px] bg-[#8b8b85]" />
      {[100, 100, 100, 70, 100, 100, 85].map((w, i) => (
        <span
          key={i}
          className={cn(
            'h-0.5 bg-[#c9c8c1]',
            w < 100 && 'self-start',
            i === 3 && 'mb-1',
          )}
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  );
}
