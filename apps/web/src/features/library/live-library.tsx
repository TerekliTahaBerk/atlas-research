'use client';
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Archive,
  BookOpen,
  Copy,
  Download,
  FileUp,
  Folder,
  Library,
  MoreHorizontal,
  Plus,
  Quote,
  Search,
  Sparkles,
  Tag,
  Telescope,
  X,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import {
  normalizeTag,
  readingStatuses,
  type LibraryPage,
  type ProjectDto,
  type ProjectPaperDto,
  type ReadingStatus,
} from '@atlas/core';
import { Btn, IconBtn } from '@/components/atlas/button';
import { StatusTag } from '@/components/atlas/chips';
import {
  Menu,
  MenuContent,
  MenuItem,
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
import { AtlasAnchor } from '@/features/atlas-ai/atlas-surface';
import { Crumb, Topbar } from '@/features/shell/topbar';
import { useMediaQuery } from '@/features/shell/use-media';
import {
  exportHref,
  fetchExport,
  fetchLibrary,
  runCommand,
  uploadPdf,
  type UploadPhase,
} from './client';
import {
  authorSummary,
  formatBytes,
  providerNames,
  readySource,
  referenceText,
  sourceStateLabels,
  statusLabels,
} from './paper-format';

type StatusFilter = 'all' | 'TO_READ' | 'READING' | 'READ';
type View =
  | { kind: 'all' }
  | { kind: 'archived' }
  | { kind: 'collection'; id: string }
  | { kind: 'tag'; id: string };
const uploadLabels: Record<UploadPhase, string> = {
  hashing: 'Computing checksum…',
  requesting: 'Requesting a private upload grant…',
  uploading: 'Uploading to private storage…',
  verifying: 'Verifying the stored file…',
  quarantined: 'Uploaded. Quarantined until validation finishes.',
  rejected: 'The file was rejected.',
};

export function LiveLibrary({ project }: { project: ProjectDto }) {
  const router = useRouter();
  const params = useSearchParams();
  const flash = useToast();
  const atlas = useAtlas();
  const { setContext } = atlas;
  const showCols = useMediaQuery('(min-width: 1100px)');
  const canWrite = project.capabilities.includes('project.write');
  const selectedId = params.get('paper');
  const [view, setView] = useState<View>({ kind: 'all' });
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState<'recent' | 'title' | 'year' | 'citations'>(
    'recent',
  );
  const [busy, setBusy] = useState(false);
  const [newCollection, setNewCollection] = useState('');
  const privateInput = useRef<HTMLInputElement>(null);
  const [privateUpload, setPrivateUpload] = useState<UploadPhase | null>(null);
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh((n) => n + 1), []);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const filters = useMemo(
    () => ({
      q: debounced || undefined,
      status:
        view.kind === 'archived'
          ? ('ARCHIVED' as const)
          : status === 'all'
            ? undefined
            : status,
      collectionId: view.kind === 'collection' ? view.id : undefined,
      tagId: view.kind === 'tag' ? view.id : undefined,
      sort,
    }),
    [debounced, status, view, sort],
  );
  // Loading is derived: the shown result belongs to an older request key.
  const requestKey = JSON.stringify([filters, refresh]);
  const [result, setResult] = useState<{
    key: string;
    page: LibraryPage | null;
    error: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    fetchLibrary(project.id, filters)
      .then((next) => {
        if (active) setResult({ key: requestKey, page: next, error: '' });
      })
      .catch((e: unknown) => {
        if (active)
          setResult((previous) => ({
            key: requestKey,
            page: previous?.page ?? null,
            error:
              e instanceof Error
                ? e.message
                : 'The library could not be loaded.',
          }));
      });
    return () => {
      active = false;
    };
  }, [project.id, filters, requestKey]);
  const page = result?.page ?? null;
  const loading = result?.key !== requestKey;
  const error = loading ? '' : (result?.error ?? '');

  const items = page?.items ?? [];
  const current = items.find((p) => p.id === selectedId) ?? null;
  useEffect(() => {
    setContext(
      current
        ? [
            {
              id: `project-paper:${current.id}`,
              kind: 'paper',
              title: current.title,
              research: {
                kind: 'paper',
                projectId: project.id,
                projectPaperId: current.id,
              },
            },
          ]
        : [
            {
              id: `project:${project.id}`,
              kind: 'library',
              title: `Library · ${project.name}`,
              research: { kind: 'project', projectId: project.id },
            },
          ],
    );
  }, [current, project.id, project.name, setContext]);

  const select = (id: string | null) =>
    router.replace(
      `/app/projects/${project.id}/library${id ? `?paper=${id}` : ''}`,
      { scroll: false },
    );

  /** Runs a confirmed server mutation, then reloads authoritative state. */
  async function mutate(work: () => Promise<unknown>, success?: string) {
    setBusy(true);
    try {
      await work();
      if (success) flash(success, 'done');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'The change was not saved.');
    } finally {
      setBusy(false);
      reload();
    }
  }

  async function loadMore() {
    if (!page?.nextCursor) return;
    try {
      const next = await fetchLibrary(project.id, {
        ...filters,
        cursor: page.nextCursor,
      });
      setResult({
        key: requestKey,
        page: { ...next, items: [...page.items, ...next.items] },
        error: '',
      });
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Loading more failed.');
    }
  }

  async function addPrivate(file: File) {
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      flash('Only PDF files can be uploaded.');
      return;
    }
    try {
      setPrivateUpload('requesting');
      const created = await runCommand({
        command: 'paper.create',
        projectId: project.id,
        title:
          file.name.replace(/\.pdf$/i, '').slice(0, 1000) ||
          'Untitled document',
        idempotencyKey: crypto.randomUUID(),
      });
      await uploadPdf(project.id, created.id, file, setPrivateUpload);
      select(created.id);
    } catch (e) {
      setPrivateUpload(null);
      flash(e instanceof Error ? e.message : 'The upload failed.');
    } finally {
      reload();
    }
  }

  const title =
    view.kind === 'archived'
      ? 'Archived'
      : view.kind === 'collection'
        ? (page?.collections.find((c) => c.id === view.id)?.name ??
          'Collection')
        : view.kind === 'tag'
          ? `#${page?.tags.find((t) => t.id === view.id)?.name ?? 'tag'}`
          : 'All papers';
  const navButton = (
    active: boolean,
    onClick: () => void,
    icon: React.ReactNode,
    label: string,
    count?: number,
  ) => (
    <button
      type="button"
      aria-current={active ? 'true' : undefined}
      onClick={onClick}
      className={cn(
        'flex h-[30px] w-full items-center gap-[9px] rounded-md px-2 hover:bg-hov hover:text-tx',
        active ? 'bg-hov text-tx' : 'text-tx2',
      )}
    >
      {icon}
      <span className="flex-1 truncate text-left">{label}</span>
      {count !== undefined ? (
        <span className="text-[11px] text-tx3">{count}</span>
      ) : null}
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar
        actions={
          <>
            {canWrite ? (
              <>
                <input
                  ref={privateInput}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void addPrivate(file);
                  }}
                />
                <Btn
                  variant="ghost"
                  onClick={() => privateInput.current?.click()}
                >
                  <FileUp aria-hidden="true" />
                  <span className="max-sm:hidden">Upload PDF</span>
                </Btn>
              </>
            ) : null}
            <Btn
              variant="secondary"
              onClick={() =>
                router.push(`/app/projects/${project.id}/research`)
              }
            >
              <Plus aria-hidden="true" />
              Add paper
            </Btn>
          </>
        }
      >
        <Crumb parent={project.name} title="Library" as="span" />
      </Topbar>
      <AtlasAnchor placement="canvas" />
      <div className="relative flex min-h-0 flex-1">
        {showCols ? (
          <nav
            aria-label="Collections"
            className="flex w-[196px] shrink-0 flex-col gap-px overflow-auto pt-1 pr-2 pb-3 pl-2.5"
          >
            {navButton(
              view.kind === 'all',
              () => setView({ kind: 'all' }),
              <Library aria-hidden="true" className="size-[14px] text-tx3" />,
              'All papers',
            )}
            {navButton(
              view.kind === 'archived',
              () => setView({ kind: 'archived' }),
              <Archive aria-hidden="true" className="size-[14px] text-tx3" />,
              'Archived',
            )}
            <div className="px-2 pt-3.5 pb-1 text-[11.5px] font-medium text-tx3">
              Collections
            </div>
            {page?.collections.map((c) => (
              <div key={c.id} className="group flex items-center">
                {navButton(
                  view.kind === 'collection' && view.id === c.id,
                  () => setView({ kind: 'collection', id: c.id }),
                  <Folder
                    aria-hidden="true"
                    className="size-[14px] text-tx3"
                  />,
                  c.name,
                  c.paperCount,
                )}
                {canWrite ? (
                  <Menu>
                    <MenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Manage collection ${c.name}`}
                        className="grid size-6 shrink-0 place-items-center rounded-sm text-tx3 hover:bg-hov"
                      >
                        <MoreHorizontal
                          aria-hidden="true"
                          className="size-3.5"
                        />
                      </button>
                    </MenuTrigger>
                    <MenuContent width={170} align="start">
                      <MenuItem
                        onSelect={() => {
                          const name = window
                            .prompt('Rename collection', c.name)
                            ?.trim();
                          if (name && name !== c.name)
                            void mutate(
                              () =>
                                runCommand({
                                  command: 'collection.update',
                                  id: c.id,
                                  expectedVersion: c.version,
                                  name,
                                }),
                              'Collection renamed',
                            );
                        }}
                      >
                        Rename
                      </MenuItem>
                      <MenuItem
                        onSelect={() => {
                          if (
                            window.confirm(
                              `Archive “${c.name}”? Papers stay in the library.`,
                            )
                          )
                            void mutate(async () => {
                              await runCommand({
                                command: 'collection.archive',
                                id: c.id,
                                expectedVersion: c.version,
                              });
                              if (
                                view.kind === 'collection' &&
                                view.id === c.id
                              )
                                setView({ kind: 'all' });
                            }, 'Collection archived');
                        }}
                      >
                        Archive
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                ) : null}
              </div>
            ))}
            {canWrite ? (
              <form
                className="mt-1 px-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = newCollection.trim();
                  if (!name) return;
                  void mutate(async () => {
                    await runCommand({
                      command: 'collection.create',
                      projectId: project.id,
                      name,
                      idempotencyKey: crypto.randomUUID(),
                    });
                    setNewCollection('');
                  }, 'Collection created');
                }}
              >
                <label className="flex h-[28px] items-center gap-1.5 rounded-md border border-bd2 px-2 text-ctl">
                  <Plus aria-hidden="true" className="size-3 text-tx3" />
                  <span className="sr-only">New collection name</span>
                  <input
                    value={newCollection}
                    maxLength={120}
                    onChange={(e) => setNewCollection(e.target.value)}
                    placeholder="New collection"
                    className="min-w-0 flex-1 text-xs"
                  />
                </label>
              </form>
            ) : null}
            {page?.tags.length ? (
              <>
                <div className="px-2 pt-3.5 pb-1 text-[11.5px] font-medium text-tx3">
                  Tags
                </div>
                {page.tags.map((t) => (
                  <Fragment key={t.id}>
                    {navButton(
                      view.kind === 'tag' && view.id === t.id,
                      () => setView({ kind: 'tag', id: t.id }),
                      <Tag
                        aria-hidden="true"
                        className="size-[14px] text-tx3"
                      />,
                      t.name,
                    )}
                  </Fragment>
                ))}
              </>
            ) : null}
          </nav>
        ) : null}
        <div className="min-w-0 flex-1 overflow-auto pt-[calc(68px+var(--aic))] pr-7 pb-[60px] pl-5 max-sm:px-4">
          <div className="mb-3.5 flex items-baseline gap-2.5">
            <h1 className="font-serif text-[32px] leading-[1.1] font-medium">
              {title}
            </h1>
            <span className="text-xs text-tx3" role="status">
              {loading
                ? 'Loading…'
                : `${items.length}${page?.nextCursor ? '+' : ''} papers`}
            </span>
          </div>
          {privateUpload ? (
            <p role="status" className="mb-3 text-ctl text-tx2">
              {uploadLabels[privateUpload]}
            </p>
          ) : null}
          <div className="mb-3.5 flex flex-wrap items-center gap-2">
            <label className="flex h-[30px] w-60 items-center gap-[7px] rounded-[7px] border border-bd bg-canvas px-2.5 max-sm:w-full">
              <Search aria-hidden="true" className="size-[13px] text-tx3" />
              <span className="sr-only">Search saved papers</span>
              <input
                value={query}
                maxLength={200}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title, author, DOI"
                className="min-w-0 flex-1 text-ctl"
              />
            </label>
            {view.kind !== 'archived' ? (
              <Segmented
                label="Reading status"
                size="sm"
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'TO_READ', label: 'To read' },
                  { value: 'READING', label: 'Reading' },
                  { value: 'READ', label: 'Read' },
                ]}
              />
            ) : null}
            {!showCols ? (
              <label className="text-xs text-tx2">
                <span className="sr-only">Collection</span>
                <select
                  className="h-[30px] rounded-[7px] border border-bd bg-canvas px-2 text-ctl"
                  value={view.kind === 'collection' ? view.id : view.kind}
                  onChange={(e) => {
                    const v = e.target.value;
                    setView(
                      v === 'all' || v === 'archived'
                        ? { kind: v }
                        : { kind: 'collection', id: v },
                    );
                  }}
                >
                  <option value="all">All papers</option>
                  <option value="archived">Archived</option>
                  {page?.collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <span className="flex-1" />
            <label className="text-xs text-tx3">
              Sort{' '}
              <select
                className="h-[26px] rounded-md border border-bd bg-canvas px-1.5 text-xs text-tx"
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
              >
                <option value="recent">Recently added</option>
                <option value="title">Title</option>
                <option value="year">Year</option>
                <option value="citations">Citations</option>
              </select>
            </label>
            <Menu>
              <MenuTrigger asChild>
                <Btn variant="ghost" size="base" className="text-xs">
                  <Download aria-hidden="true" />
                  Export
                </Btn>
              </MenuTrigger>
              <MenuContent width={190} align="end">
                {(['bibtex', 'ris'] as const).map((format) => (
                  <MenuItem
                    key={format}
                    onSelect={() =>
                      // An attachment response downloads without leaving the page.
                      window.location.assign(
                        exportHref(
                          {
                            projectId: project.id,
                            ...(view.kind === 'collection'
                              ? { collectionId: view.id }
                              : {}),
                          },
                          format,
                        ),
                      )
                    }
                  >
                    {format === 'bibtex' ? 'BibTeX (.bib)' : 'RIS (.ris)'}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          </div>
          {error ? (
            <ErrorBanner
              title="The library could not be loaded"
              action={
                <Btn variant="outline" size="md" onClick={reload}>
                  Retry
                </Btn>
              }
            >
              {error}
            </ErrorBanner>
          ) : loading && !page ? (
            <SkeletonLines />
          ) : !items.length &&
            !debounced &&
            view.kind === 'all' &&
            status === 'all' ? (
            <EmptyState
              dashed
              icon={Library}
              title="This library is empty"
              description="Save papers from Research, or upload a PDF you have the right to use."
            >
              <Btn
                variant="primary"
                size="lg"
                onClick={() =>
                  router.push(`/app/projects/${project.id}/research`)
                }
              >
                <Telescope aria-hidden="true" />
                Search literature
              </Btn>
              {canWrite ? (
                <Btn
                  variant="outline"
                  size="lg"
                  onClick={() => privateInput.current?.click()}
                >
                  <FileUp aria-hidden="true" />
                  Upload PDF
                </Btn>
              ) : null}
            </EmptyState>
          ) : !items.length ? (
            <EmptyState
              icon={Search}
              title="No saved papers match"
              description="Try another search or clear the filters."
            >
              <Btn
                variant="outline"
                onClick={() => {
                  setQuery('');
                  setStatus('all');
                  setView({ kind: 'all' });
                }}
              >
                Clear filters
              </Btn>
            </EmptyState>
          ) : (
            <>
              <ul className="border-t border-bd2" aria-label="Saved papers">
                {items.map((p) => (
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
                          <span>
                            {p.paper
                              ? authorSummary(p.paper)
                              : 'Private document'}
                          </span>
                          {p.paper?.venue ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-tx2">{p.paper.venue}</span>
                            </>
                          ) : null}
                          {p.paper?.year ? <span>{p.paper.year}</span> : null}
                          {p.tagIds.map((id) => {
                            const tag = page?.tags.find((t) => t.id === id);
                            return tag ? (
                              <span
                                key={id}
                                className="rounded-xs bg-el px-1.5 text-[11px] text-tx2"
                              >
                                #{tag.name}
                              </span>
                            ) : null;
                          })}
                        </span>
                      </span>
                      <span className="flex items-center gap-2.5">
                        {readySource(p) ? (
                          <span className="text-[11.5px] text-tx3">PDF</span>
                        ) : null}
                        <StatusTag
                          tone={
                            p.readingStatus === 'READING' ? 'accent' : 'default'
                          }
                        >
                          {statusLabels[p.readingStatus]}
                        </StatusTag>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {page?.nextCursor ? (
                <div className="mt-4 flex justify-center">
                  <Btn variant="outline" onClick={() => void loadMore()}>
                    Load more
                  </Btn>
                </div>
              ) : null}
            </>
          )}
        </div>
        {current && page ? (
          <PaperPanel
            key={current.id}
            project={project}
            paper={current}
            page={page}
            canWrite={canWrite}
            busy={busy}
            mutate={mutate}
            onClose={() => select(null)}
            onAsk={() =>
              atlas.ask({
                mode: 'open',
                chips: [
                  {
                    id: `project-paper:${current.id}`,
                    kind: 'paper',
                    title: current.title,
                    research: {
                      kind: 'paper',
                      projectId: project.id,
                      projectPaperId: current.id,
                    },
                  },
                ],
              })
            }
            reload={reload}
          />
        ) : null}
      </div>
    </div>
  );
}

function PaperPanel({
  project,
  paper,
  page,
  canWrite,
  busy,
  mutate,
  onClose,
  onAsk,
  reload,
}: {
  project: ProjectDto;
  paper: ProjectPaperDto;
  page: LibraryPage;
  canWrite: boolean;
  busy: boolean;
  mutate: (work: () => Promise<unknown>, success?: string) => Promise<void>;
  onClose: () => void;
  onAsk: () => void;
  reload: () => void;
}) {
  const flash = useToast();
  const [tab, setTab] = useState<'overview' | 'organize' | 'cite'>('overview');
  const [tagName, setTagName] = useState('');
  const [bibtex, setBibtex] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadPhase | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const ready = readySource(paper);
  const archived = paper.readingStatus === 'ARCHIVED';
  useEffect(() => {
    if (tab !== 'cite') return;
    let active = true;
    fetchExport(exportHref({ paperId: paper.id }, 'bibtex'))
      .then((text) => active && setBibtex(text))
      .catch(() => active && setBibtex(''));
    return () => {
      active = false;
    };
  }, [tab, paper.id, paper.version]);
  const copy = (text: string, message: string) =>
    void navigator.clipboard
      ?.writeText(text)
      .then(() => flash(message, 'done'))
      .catch(() => flash('Copying is not available in this browser.'));

  async function addTag() {
    const name = tagName.trim();
    if (!name) return;
    await mutate(async () => {
      const existing = page.tags.find(
        (t) => normalizeTag(t.name) === normalizeTag(name),
      );
      const tag =
        existing ??
        (await runCommand({
          command: 'tag.create',
          projectId: project.id,
          name,
          idempotencyKey: crypto.randomUUID(),
        }));
      await runCommand({
        command: 'paper.tag.add',
        projectPaperId: paper.id,
        tagId: tag.id,
      });
      setTagName('');
    }, 'Tag added');
  }

  return (
    <aside
      aria-label={`Paper details: ${paper.title}`}
      className="flex w-[min(400px,44%)] shrink-0 flex-col border-l border-bd2 bg-canvas max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-40 max-md:w-[min(400px,100%)] max-md:shadow-pop"
    >
      <div className="flex items-center gap-1.5 border-b border-bd2 px-3 py-2.5">
        <span className="flex-1 truncate text-xs text-tx3">
          {paper.paper?.venue ??
            (paper.origin === 'PRIVATE'
              ? 'Private document'
              : providerNames(paper.paper!))}
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
          {paper.paper
            ? authorSummary(paper.paper)
            : 'Uploaded by a project member; not linked to public metadata.'}
        </p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {ready ? (
            <Link
              href={`/app/projects/${project.id}/reader?paper=${paper.id}`}
              className="inline-flex h-[30px] items-center gap-1.5 rounded-[7px] bg-acb px-3 text-ctl font-medium text-white hover:bg-acbh"
            >
              <BookOpen aria-hidden="true" className="size-[13px]" />
              Open PDF
            </Link>
          ) : (
            <Link
              href={`/app/projects/${project.id}/reader?paper=${paper.id}`}
              className="inline-flex h-[30px] items-center gap-1.5 rounded-[7px] border border-bd px-3 text-ctl hover:bg-hov"
            >
              <BookOpen aria-hidden="true" className="size-[13px]" />
              Reader
            </Link>
          )}
          {canWrite && !archived ? (
            <>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  void uploadPdf(project.id, paper.id, file, setUpload)
                    .catch((error: unknown) => {
                      setUpload(null);
                      flash(
                        error instanceof Error
                          ? error.message
                          : 'The upload failed.',
                      );
                    })
                    .finally(reload);
                }}
              />
              <Btn
                variant="outline"
                size="lg"
                disabled={
                  !!upload && !['quarantined', 'rejected'].includes(upload)
                }
                onClick={() => fileInput.current?.click()}
              >
                <FileUp aria-hidden="true" />
                Upload PDF
              </Btn>
            </>
          ) : null}
          <Btn
            variant="outline"
            size="lg"
            onClick={() =>
              copy(referenceText(paper.paper, paper.title), 'Reference copied')
            }
          >
            <Quote aria-hidden="true" />
            Cite
          </Btn>
          <Btn variant="ai" size="lg" onClick={onAsk}>
            <Sparkles aria-hidden="true" />
            Ask Atlas
          </Btn>
        </div>
        {upload ? (
          <p role="status" className="mb-3 text-ctl text-tx2">
            {uploadLabels[upload]}
          </p>
        ) : null}
        <div
          role="tablist"
          aria-label="Paper detail"
          className="mb-3.5 flex gap-0.5 border-b border-bd2"
        >
          {(
            [
              ['overview', 'Overview'],
              ['organize', 'Organize'],
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
            {paper.paper ? (
              <>
                <h3 className="mb-1.5 text-[11.5px] text-tx3">Abstract</h3>
                <p className="mb-4 font-read text-sm leading-[1.7]">
                  {paper.paper.abstract ?? (
                    <span className="text-tx3 italic">
                      No abstract provided by the source.
                    </span>
                  )}
                </p>
              </>
            ) : null}
            <dl className="mb-[18px] grid grid-cols-[96px_1fr] gap-x-2.5 gap-y-[7px] text-ctl">
              <dt className="text-tx3">Status</dt>
              <dd>
                {canWrite ? (
                  <select
                    aria-label="Reading status"
                    className="h-[26px] rounded-md border border-bd bg-canvas px-1.5 text-ctl"
                    value={paper.readingStatus}
                    disabled={busy}
                    onChange={(e) =>
                      void mutate(
                        () =>
                          runCommand({
                            command: 'paper.update',
                            id: paper.id,
                            expectedVersion: paper.version,
                            readingStatus: e.target.value as ReadingStatus,
                          }),
                        'Reading status saved',
                      )
                    }
                  >
                    {readingStatuses.map((s) => (
                      <option key={s} value={s}>
                        {statusLabels[s]}
                      </option>
                    ))}
                  </select>
                ) : (
                  statusLabels[paper.readingStatus]
                )}
              </dd>
              <dt className="text-tx3">Added</dt>
              <dd>{new Date(paper.addedAt).toLocaleDateString()}</dd>
              {paper.paper ? (
                <>
                  <dt className="text-tx3">Year</dt>
                  <dd>{paper.paper.year ?? 'Not listed'}</dd>
                  <dt className="text-tx3">Cited by</dt>
                  <dd>
                    {paper.paper.citationCount === null
                      ? 'Unavailable'
                      : `${paper.paper.citationCount.toLocaleString()} (at save time)`}
                  </dd>
                  <dt className="text-tx3">DOI</dt>
                  <dd className="break-all">
                    {paper.paper.doi ?? 'None recorded'}
                  </dd>
                  <dt className="text-tx3">Provenance</dt>
                  <dd>
                    {paper.paper.provenance.map((p) => (
                      <span key={p.externalId} className="block">
                        {p.provider === 'openalex'
                          ? 'OpenAlex'
                          : 'Semantic Scholar'}{' '}
                        {p.externalId} ·{' '}
                        {new Date(p.retrievedAt).toLocaleDateString()}
                      </span>
                    ))}
                  </dd>
                </>
              ) : null}
            </dl>
            <h3 className="mb-1.5 text-[11.5px] text-tx3">PDF sources</h3>
            {paper.sources.length ? (
              <ul className="flex flex-col gap-1.5">
                {paper.sources.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-lg border border-bd2 p-2.5 text-ctl"
                  >
                    <span className="flex items-center gap-2">
                      <span className="flex-1 truncate">
                        v{s.ordinal} · {s.fileName}
                      </span>
                      <StatusTag
                        tone={s.state === 'READY' ? 'accent' : 'default'}
                      >
                        {sourceStateLabels[s.state]}
                      </StatusTag>
                    </span>
                    <span className="mt-1 block text-[11.5px] text-tx3">
                      {formatBytes(s.byteSize)} · your upload ·{' '}
                      {new Date(s.createdAt).toLocaleString()}
                      {s.failure ? ` · ${s.failure}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ctl text-tx3">
                No PDF stored.{' '}
                {paper.paper?.pdfLocations.length
                  ? 'An external open-access copy is listed on the source site; '
                  : ''}
                Upload a copy you are permitted to use.
              </p>
            )}
          </div>
        ) : null}
        {tab === 'organize' ? (
          <div
            role="tabpanel"
            aria-label="Organize"
            className="flex flex-col gap-4"
          >
            <fieldset>
              <legend className="mb-1.5 text-[11.5px] text-tx3">
                Collections
              </legend>
              {page.collections.length ? (
                page.collections.map((c) => {
                  const member = paper.collectionIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className="flex h-7 items-center gap-2 text-ctl"
                    >
                      <input
                        type="checkbox"
                        checked={member}
                        disabled={!canWrite || busy}
                        onChange={() =>
                          void mutate(
                            () =>
                              runCommand({
                                command: member
                                  ? 'collection.paper.remove'
                                  : 'collection.paper.add',
                                collectionId: c.id,
                                projectPaperId: paper.id,
                              }),
                            member
                              ? `Removed from ${c.name}`
                              : `Added to ${c.name}`,
                          )
                        }
                      />
                      {c.name}
                    </label>
                  );
                })
              ) : (
                <p className="text-ctl text-tx3">No collections yet.</p>
              )}
            </fieldset>
            <div>
              <h3 className="mb-1.5 text-[11.5px] text-tx3">Tags</h3>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {paper.tagIds.length ? (
                  paper.tagIds.map((id) => {
                    const tag = page.tags.find((t) => t.id === id);
                    if (!tag) return null;
                    return (
                      <span
                        key={id}
                        className="inline-flex h-6 items-center gap-1 rounded-sm bg-el px-2 text-xs text-tx2"
                      >
                        #{tag.name}
                        {canWrite ? (
                          <button
                            type="button"
                            aria-label={`Remove tag ${tag.name}`}
                            className="text-tx3 hover:text-tx"
                            onClick={() =>
                              void mutate(
                                () =>
                                  runCommand({
                                    command: 'paper.tag.remove',
                                    projectPaperId: paper.id,
                                    tagId: id,
                                  }),
                                'Tag removed',
                              )
                            }
                          >
                            <X aria-hidden="true" className="size-3" />
                          </button>
                        ) : null}
                      </span>
                    );
                  })
                ) : (
                  <span className="text-ctl text-tx3">No tags.</span>
                )}
              </div>
              {canWrite ? (
                <form
                  className="flex gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void addTag();
                  }}
                >
                  <label className="flex h-[28px] flex-1 items-center rounded-md border border-bd px-2">
                    <span className="sr-only">Tag name</span>
                    <input
                      value={tagName}
                      maxLength={40}
                      list="atlas-project-tags"
                      onChange={(e) => setTagName(e.target.value)}
                      placeholder="Add a tag"
                      className="min-w-0 flex-1 text-ctl"
                    />
                  </label>
                  <datalist id="atlas-project-tags">
                    {page.tags.map((t) => (
                      <option key={t.id} value={t.name} />
                    ))}
                  </datalist>
                  <Btn
                    variant="outline"
                    size="base"
                    type="submit"
                    disabled={busy}
                  >
                    Add
                  </Btn>
                </form>
              ) : null}
            </div>
            {canWrite ? (
              <div>
                {archived ? (
                  <Btn
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void mutate(
                        () =>
                          runCommand({
                            command: 'paper.update',
                            id: paper.id,
                            expectedVersion: paper.version,
                            readingStatus: 'TO_READ',
                          }),
                        'Paper restored to the library',
                      )
                    }
                  >
                    Restore to library
                  </Btn>
                ) : (
                  <Btn
                    variant="danger"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove “${paper.title}” from this project’s library? It moves to Archived and can be restored.`,
                        )
                      )
                        void mutate(
                          () =>
                            runCommand({
                              command: 'paper.archive',
                              id: paper.id,
                              expectedVersion: paper.version,
                            }),
                          'Paper archived',
                        );
                    }}
                  >
                    <Archive aria-hidden="true" />
                    Remove from library
                  </Btn>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
        {tab === 'cite' ? (
          <div role="tabpanel" aria-label="Citation">
            <pre className="mb-2.5 max-h-[260px] overflow-auto rounded-lg border border-bd2 bg-code p-3 font-mono text-[11.5px] leading-[1.6] whitespace-pre-wrap text-[var(--syn-t)]">
              {bibtex === null
                ? 'Loading…'
                : bibtex || 'The BibTeX export could not be loaded.'}
            </pre>
            <div className="flex flex-wrap gap-1.5">
              <Btn
                variant="outline"
                className="text-xs"
                disabled={!bibtex}
                onClick={() => bibtex && copy(bibtex, 'BibTeX copied')}
              >
                <Copy aria-hidden="true" className="!size-3" />
                Copy BibTeX
              </Btn>
              <a
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-bd px-2.5 text-xs hover:bg-hov"
                href={exportHref({ paperId: paper.id }, 'bibtex')}
                download
              >
                <Download aria-hidden="true" className="size-3" />
                .bib
              </a>
              <a
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-bd px-2.5 text-xs hover:bg-hov"
                href={exportHref({ paperId: paper.id }, 'ris')}
                download
              >
                <Download aria-hidden="true" className="size-3" />
                .ris
              </a>
              {paper.paper?.doi ? (
                <Btn
                  variant="outline"
                  className="text-xs"
                  onClick={() => copy(paper.paper!.doi!, 'DOI copied')}
                >
                  Copy DOI
                </Btn>
              ) : null}
            </div>
            <p className="mt-2 text-[11.5px] text-tx3">
              Generated from the metadata saved with this paper; missing fields
              are omitted, not guessed.
            </p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
