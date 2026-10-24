'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { JSONContent } from '@tiptap/react';
import {
  Archive,
  ArchiveRestore,
  BookOpen,
  CopyPlus,
  Ellipsis,
  FileDown,
  FileText,
  History,
  Link2,
  ListTodo,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import {
  documentKindLabels,
  relationshipLabels,
  wordCount,
  validateDocumentContent,
  type ArtifactOption,
  type DocumentDto,
  type DocumentSummaryDto,
  type LinkDto,
  type ProjectDto,
  type ReferenceDto,
} from '@atlas/core';
import { Btn, IconBtn } from '@/components/atlas/button';
import { InlineRef } from '@/components/atlas/chips';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
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
import { usePlatform } from '@/features/platform/platform-context';
import { Crumb, Topbar } from '@/features/shell/topbar';
import {
  ApiError,
  artifactCommand,
  documentExportHref,
  fetchDocument,
  fetchDocuments,
  fetchLinks,
  fetchOptions,
} from '@/features/artifacts/client';
import { ArtifactSearch } from '@/features/artifacts/artifact-search';
import { ARTIFACTS_CHANGED } from '@/features/atlas-ai/proposal-review';
import { DocUi } from './editor/doc-context';
import { DocEditor, type LiveEditorConfig } from './editor/doc-editor';
import { LiveRefsContext } from './editor/live-nodes';
import { clearDraft, purgeDrafts, readDraft, type StoredDraft } from './drafts';
import { LiveVersionHistoryDialog } from './live-version-history';
import { saveLabels, useAutosave } from './use-autosave';

const ago = (value: string) => {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};
const message = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : fallback;

/** Live Documents (Phase 04): real project documents in the approved design. */
export function LiveDocuments({ project }: { project: ProjectDto }) {
  const params = useSearchParams();
  const platform = usePlatform();
  const scope = `${platform.profile?.id ?? ''}:${project.id}`;
  const id = params.get('doc');
  if (id && /^[0-9a-f-]{36}$/i.test(id))
    return <LiveDocument key={`${scope}:${id}`} project={project} id={id} />;
  return <DocumentIndex key={scope} project={project} />;
}

function DocumentIndex({ project }: { project: ProjectDto }) {
  const router = useRouter();
  const flash = useToast();
  const { setContext } = useAtlas();
  const canWrite = project.capabilities.includes('project.write');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState<{
    key: string;
    items: DocumentSummaryDto[];
    next: string | null;
    error: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const restorePending = useRef(false);
  const [notice, setNotice] = useState('');
  const [restored, setRestored] = useState<DocumentSummaryDto | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [pagingKey, setPagingKey] = useState<string | null>(null);
  const request = useRef({ active: false, paging: false });
  const key = `${archived}:${refresh}`;
  useEffect(() => {
    setContext([
      {
        id: `project:${project.id}`,
        kind: 'project',
        title: project.name,
        research: { kind: 'project', projectId: project.id },
      },
    ]);
  }, [project.id, project.name, setContext]);
  useEffect(() => {
    const currentRequest = { active: true, paging: false };
    request.current = currentRequest;
    fetchDocuments(project.id, archived)
      .then(
        (p) =>
          currentRequest.active &&
          setPage({ key, items: p.items, next: p.nextCursor, error: '' }),
      )
      .catch(
        (e: unknown) =>
          currentRequest.active &&
          setPage({
            key,
            items: [],
            next: null,
            error: message(e, 'Documents could not be loaded.'),
          }),
      );
    return () => {
      currentRequest.active = false;
    };
  }, [archived, key, project.id]);
  const current = page?.key === key ? page : null;
  async function restore(document: DocumentSummaryDto) {
    if (restorePending.current) return;
    restorePending.current = true;
    setRestoring(document.id);
    setNotice('');
    const pending = request.current;
    try {
      await artifactCommand({
        command: 'document.restore',
        id: document.id,
        expectedVersion: document.version,
      });
      if (!pending.active) return;
      setRestored(document);
      setNotice(`Restored “${document.title}”.`);
      flash(`Restored “${document.title}”.`, 'done');
      setArchived(false);
      setRefresh((n) => n + 1);
    } catch (e) {
      if (!pending.active) return;
      setNotice(
        e instanceof ApiError && e.code === 'CONFLICT'
          ? 'The document changed. The list has been refreshed; review it and try again.'
          : e instanceof ApiError && e.code === 'NETWORK'
            ? 'Restore could not be confirmed. Check Active and Archived before retrying.'
            : message(e, 'The document could not be restored.'),
      );
      setRefresh((n) => n + 1);
    } finally {
      restorePending.current = false;
      setRestoring(null);
    }
  }
  async function loadMore() {
    const pending = request.current;
    if (!current?.next || pending.paging) return;
    pending.paging = true;
    setPagingKey(key);
    try {
      const next = await fetchDocuments(project.id, archived, current.next);
      if (pending.active)
        setPage((previous) =>
          previous?.key === key
            ? {
                ...previous,
                items: [
                  ...new Map(
                    [...previous.items, ...next.items].map((d) => [d.id, d]),
                  ).values(),
                ],
                next: next.nextCursor,
              }
            : previous,
        );
    } catch (e) {
      if (pending.active)
        setNotice(
          message(e, 'More documents could not be loaded. Retry Load more.'),
        );
    } finally {
      pending.paging = false;
      if (pending.active) setPagingKey(null);
    }
  }
  async function create() {
    setBusy(true);
    try {
      const created = await artifactCommand({
        command: 'document.create',
        projectId: project.id,
        title: 'Untitled document',
        kind: 'RESEARCH_NOTE',
        idempotencyKey: crypto.randomUUID(),
      });
      router.push(`/app/projects/${project.id}/documents?doc=${created.id}`);
    } catch (e) {
      flash(message(e, 'The document could not be created.'));
      setBusy(false);
    }
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar>
        <Crumb as="span" parent={project.name} title="Documents" />
      </Topbar>
      <AtlasAnchor placement="canvas" />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[920px] px-8 pt-[calc(44px+var(--aic))] pb-16 max-sm:px-4">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <h1 className="mr-2 font-serif text-[30px] leading-none font-medium">
              Documents
            </h1>
            {canWrite ? (
              <Segmented
                label="Document list"
                size="sm"
                value={archived ? 'archived' : 'active'}
                onChange={(v) => setArchived(v === 'archived')}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'archived', label: 'Archived' },
                ]}
              />
            ) : null}
            <span className="flex-1" />
            {canWrite ? (
              <Btn
                variant="primary"
                disabled={busy}
                onClick={() => void create()}
              >
                <Plus aria-hidden="true" />
                New document
              </Btn>
            ) : null}
          </div>
          <ArtifactSearch projectId={project.id} />
          <div role="status" className="mb-3 text-ctl text-tx2">
            {notice}
          </div>
          {restored ? (
            <Link
              className="mb-3 inline-block text-ctl text-actx underline"
              href={`/app/projects/${project.id}/documents?doc=${restored.id}`}
            >
              Open restored document
            </Link>
          ) : null}
          {!current ? (
            <SkeletonLines widths={[90, 72, 84]} />
          ) : current.error ? (
            <ErrorBanner title="Documents are unavailable">
              {current.error}
            </ErrorBanner>
          ) : !current.items.length ? (
            <EmptyState
              icon={FileText}
              title={archived ? 'No archived documents' : 'No documents yet'}
              description={
                archived
                  ? 'Archived documents appear here and can be restored.'
                  : 'Create a research note to start writing. Every save is kept as an immutable revision.'
              }
              dashed
            >
              {canWrite && !archived ? (
                <Btn
                  variant="primary"
                  disabled={busy}
                  onClick={() => void create()}
                >
                  <Plus aria-hidden="true" />
                  New document
                </Btn>
              ) : null}
            </EmptyState>
          ) : (
            <ul
              aria-label={archived ? 'Archived documents' : 'Documents'}
              className="border-t border-bd2"
            >
              {current.items.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center gap-2 border-b border-bd2"
                >
                  {d.archived ? (
                    <div className="flex min-w-0 flex-1 items-center gap-3 px-2 py-3">
                      <FileText
                        aria-hidden="true"
                        className="size-[15px] shrink-0 text-tx3"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-serif text-[17px]">
                          {d.title}
                        </span>
                        <span className="text-[11.5px] text-tx3">
                          {documentKindLabels[d.kind]} · revision {d.revision} ·
                          edited {ago(d.updatedAt)}
                          {d.updatedBy ? ` by ${d.updatedBy.name}` : ''}
                        </span>
                      </span>
                    </div>
                  ) : (
                    <Link
                      href={`/app/projects/${project.id}/documents?doc=${d.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3 px-2 py-3 hover:bg-card focus-visible:bg-card"
                    >
                      <FileText
                        aria-hidden="true"
                        className="size-[15px] shrink-0 text-tx3"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-serif text-[17px]">
                          {d.title}
                        </span>
                        <span className="text-[11.5px] text-tx3">
                          {documentKindLabels[d.kind]} · revision {d.revision} ·
                          edited {ago(d.updatedAt)}
                          {d.updatedBy ? ` by ${d.updatedBy.name}` : ''}
                        </span>
                      </span>
                    </Link>
                  )}
                  {d.archived && canWrite ? (
                    <Btn
                      size="sm"
                      disabled={restoring !== null}
                      aria-label={`Restore ${d.title}`}
                      onClick={() => void restore(d)}
                    >
                      <ArchiveRestore aria-hidden="true" />
                      {restoring === d.id ? 'Restoring…' : 'Restore'}
                    </Btn>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {current?.next ? (
            <Btn
              className="mt-3"
              disabled={pagingKey === key}
              onClick={() => void loadMore()}
            >
              {pagingKey === key ? 'Loading…' : 'Load more'}
            </Btn>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LiveDocument({ project, id }: { project: ProjectDto; id: string }) {
  const [state, setState] = useState<{
    doc: DocumentDto | null;
    error: string;
    code: string;
  }>({ doc: null, error: '', code: '' });
  const [generation, setGeneration] = useState(0);
  const reload = useCallback(() => setGeneration((n) => n + 1), []);
  useEffect(() => {
    let alive = true;
    fetchDocument(id)
      .then((doc) => alive && setState({ doc, error: '', code: '' }))
      .catch(
        (e: unknown) =>
          alive &&
          setState({
            doc: null,
            error: message(e, 'This document is unavailable.'),
            code: e instanceof ApiError ? e.code : '',
          }),
      );
    return () => {
      alive = false;
    };
  }, [generation, id]);
  if (state.error)
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <Topbar>
          <Crumb as="span" parent={project.name} title="Documents" />
        </Topbar>
        <div className="mx-auto w-full max-w-[740px] px-10 pt-24 max-sm:px-5">
          <EmptyState
            icon={FileText}
            title="Document unavailable"
            description={
              state.code === 'NOT_FOUND'
                ? 'It may have been archived, or you may no longer have access.'
                : state.error
            }
          >
            <Link
              className="text-ctl text-actx underline"
              href={`/app/projects/${project.id}/documents`}
            >
              All documents
            </Link>
            {state.code !== 'NOT_FOUND' ? (
              <Btn onClick={reload}>Retry</Btn>
            ) : null}
          </EmptyState>
        </div>
      </div>
    );
  if (!state.doc)
    return (
      <div
        className="mx-auto w-full max-w-[740px] px-10 pt-28"
        aria-busy="true"
      >
        <SkeletonLines widths={[70, 96, 88, 60]} />
      </div>
    );
  // Remount on every authoritative reload so editor and autosave start clean.
  return (
    <DocumentView
      key={`${state.doc.versionId}:${generation}`}
      project={project}
      initial={state.doc}
      reload={reload}
    />
  );
}

function DocumentView({
  project,
  initial,
  reload,
}: {
  project: ProjectDto;
  initial: DocumentDto;
  reload: () => void;
}) {
  const router = useRouter();
  const flash = useToast();
  const atlas = useAtlas();
  const platform = usePlatform();
  const actorId = platform.profile?.id ?? '';
  const canEdit = initial.capabilities.includes('document.edit');
  const [doc, setDoc] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [history, setHistory] = useState(false);
  const [rail, setRail] = useState(false);
  const [links, setLinks] = useState<LinkDto[] | null>(null);
  const [words, setWords] = useState(() => {
    const v = validateDocumentContent(initial.content);
    return v.ok ? wordCount(v.content) : 0;
  });
  // Drafts from other accounts or expired drafts are removed before reading.
  // This view renders only after a client fetch, so storage is available.
  const [draft, setDraft] = useState<StoredDraft | null>(() => {
    purgeDrafts(actorId);
    const stored = readDraft(actorId, project.id, initial.id);
    if (
      stored &&
      JSON.stringify(stored.content) !== JSON.stringify(initial.content)
    )
      return stored;
    if (stored) clearDraft(actorId, project.id, initial.id);
    return null;
  });
  const [editorKey, setEditorKey] = useState(0);
  const [content, setContent] = useState(initial.content as JSONContent);
  const [extra, setExtra] = useState<Map<string, ReferenceDto>>(new Map());
  const [extraPeople, setExtraPeople] = useState<Map<string, string>>(
    new Map(),
  );
  const autosave = useAutosave({
    actorId,
    projectId: project.id,
    documentId: doc.id,
    revision: doc.revision,
    initialContent: initial.content as JSONContent,
    enabled: canEdit,
    onSaved: (revision) => setDoc((d) => ({ ...d, revision })),
  });
  const { setContext } = atlas;
  useEffect(() => {
    // Document identity only; linked papers are never implied as AI context.
    setContext([
      {
        id: `document:${doc.id}`,
        kind: 'document',
        title: doc.title,
        research: { kind: 'project', projectId: project.id },
      },
    ]);
  }, [doc.id, doc.title, project.id, setContext]);
  // An approved Atlas proposal created a newer revision: adopt it unless the
  // user has unsaved edits (those then surface as an explicit conflict).
  const savedStatus = autosave.status;
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ documentId?: string }>).detail;
      if (detail?.documentId === doc.id && savedStatus === 'saved') reload();
    };
    window.addEventListener(ARTIFACTS_CHANGED, listener);
    return () => window.removeEventListener(ARTIFACTS_CHANGED, listener);
  }, [doc.id, reload, savedStatus]);
  const loadLinks = useCallback(() => {
    fetchLinks(doc.artifactId)
      .then((r) => setLinks(r.links))
      .catch(() => setLinks([]));
  }, [doc.artifactId]);
  useEffect(() => {
    loadLinks();
  }, [loadLinks, doc.revision]);

  const references = useMemo(() => {
    const map = new Map<string, ReferenceDto>(extra);
    for (const r of doc.references) if (r.id) map.set(r.id, r);
    return map;
  }, [doc.references, extra]);
  const people = useMemo(() => {
    const map = new Map(extraPeople);
    for (const p of doc.people) map.set(p.id, p.name);
    return map;
  }, [doc.people, extraPeople]);
  const refsValue = useMemo(
    () => ({
      projectId: project.id,
      references,
      people,
      open: (href: string) => router.push(href),
    }),
    [people, project.id, references, router],
  );
  const { change, save } = autosave;
  const live = useMemo<LiveEditorConfig>(
    () => ({
      editable: canEdit,
      onChange: change,
      onSave: () => void save(),
      search: (q, kind) => fetchOptions(project.id, q, kind, doc.id),
      remember: (o: ArtifactOption) =>
        setExtra((m) =>
          new Map(m).set(o.id, {
            artifactId: o.artifactId,
            kind: o.kind,
            id: o.id,
            state: 'AVAILABLE',
            title: o.title,
            detail: o.detail,
            href:
              o.kind === 'PAPER'
                ? `/app/projects/${project.id}/library?paper=${o.id}`
                : o.kind === 'TASK'
                  ? `/app/projects/${project.id}/tasks?task=${o.id}`
                  : `/app/projects/${project.id}/documents?doc=${o.id}`,
          }),
        ),
      rememberPerson: (p) =>
        setExtraPeople((m) => new Map(m).set(p.id, p.name)),
      askAbout: (selection) =>
        atlas.ask({
          mode: 'open',
          draft: `Explain this passage from “${doc.title}”: “${selection}”`,
        }),
    }),
    [atlas, change, save, canEdit, doc.id, doc.title, project.id],
  );
  const ui = useMemo(
    () => ({
      commentsResolved: true,
      openComments: () => setRail(true),
      flash,
      openTask: () => {},
    }),
    [flash],
  );

  async function rename() {
    const next = title.trim();
    if (!next || next === doc.title) {
      setTitle(doc.title);
      return;
    }
    try {
      await artifactCommand({
        command: 'document.rename',
        id: doc.id,
        expectedVersion: doc.version,
        title: next,
      });
      setDoc((d) => ({ ...d, title: next, version: d.version + 1 }));
    } catch (e) {
      setTitle(doc.title);
      flash(message(e, 'Rename failed. Refresh and try again.'));
    }
  }
  async function lifecycle(
    command: 'document.archive' | 'document.restore' | 'document.duplicate',
  ) {
    try {
      if (command === 'document.duplicate') {
        const copy = await artifactCommand({
          command,
          id: doc.id,
          idempotencyKey: crypto.randomUUID(),
        });
        router.push(`/app/projects/${project.id}/documents?doc=${copy.id}`);
        return;
      }
      if (
        command === 'document.archive' &&
        !window.confirm(
          `Archive “${doc.title}”? It can be restored from Archived documents.`,
        )
      )
        return;
      await artifactCommand({
        command,
        id: doc.id,
        expectedVersion: doc.version,
      });
      if (command === 'document.archive')
        router.push(`/app/projects/${project.id}/documents`);
      else reload();
    } catch (e) {
      flash(message(e, 'That action failed. Refresh and try again.'));
    }
  }
  async function restoreRevision(revision: number) {
    try {
      await autosave.save();
      const result = await artifactCommand({
        command: 'document.restore-version',
        id: doc.id,
        expectedRevision: autosave.revision,
        revision,
        clientRequestId: crypto.randomUUID(),
      });
      clearDraft(actorId, project.id, doc.id);
      setHistory(false);
      flash(
        `Restored revision ${revision} as revision ${result.revision}`,
        'done',
      );
      reload();
    } catch (e) {
      flash(
        e instanceof ApiError && e.code === 'CONFLICT'
          ? 'The document changed meanwhile. Review the latest revision first.'
          : message(e, 'Restore failed.'),
      );
    }
  }
  async function keepMine() {
    try {
      const latest = await fetchDocument(doc.id);
      await autosave.saveOnTop(latest.revision);
      flash(
        'Your draft was saved as a new revision. The other revision stays in history.',
        'done',
      );
    } catch (e) {
      flash(message(e, 'Unable to save your draft.'));
    }
  }
  function discardMine() {
    clearDraft(actorId, project.id, doc.id);
    reload();
  }
  function restoreDraft() {
    if (!draft) return;
    setContent(draft.content as JSONContent);
    setEditorKey((k) => k + 1);
    autosave.change(draft.content as JSONContent);
    setDraft(null);
  }
  const papers = [...references.values()].filter((r) => r.kind === 'PAPER');
  const linkedTasks = (links ?? []).filter((l) => l.other.kind === 'TASK');
  const linkedPapers = (links ?? []).filter((l) => l.other.kind === 'PAPER');
  const status = canEdit ? autosave.status : null;

  return (
    <DocUi.Provider value={ui}>
      <LiveRefsContext.Provider value={refsValue}>
        <div className="aic-wide flex min-h-0 flex-1 flex-col">
          <Topbar
            actions={
              <>
                <button
                  type="button"
                  aria-label="Links"
                  aria-pressed={rail}
                  onClick={() => setRail((r) => !r)}
                  className={cn(
                    'grid size-7 place-items-center rounded-md hover:bg-hov hover:text-tx',
                    rail ? 'bg-hov text-tx' : 'text-tx2',
                  )}
                >
                  <Link2 aria-hidden="true" className="size-[15px]" />
                </button>
                <button
                  type="button"
                  aria-label="Version history"
                  onClick={() => setHistory(true)}
                  className="grid size-7 place-items-center rounded-md text-tx2 hover:bg-hov hover:text-tx"
                >
                  <History aria-hidden="true" className="size-[15px]" />
                </button>
                <Menu>
                  <MenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="More document actions"
                      className="grid size-7 place-items-center rounded-md text-tx2 hover:bg-hov hover:text-tx"
                    >
                      <Ellipsis aria-hidden="true" className="size-[15px]" />
                    </button>
                  </MenuTrigger>
                  <MenuContent width={230} align="end">
                    <MenuItem
                      icon={<History />}
                      onSelect={() => setHistory(true)}
                    >
                      Version history
                    </MenuItem>
                    {(['markdown', 'text', 'html'] as const).map((format) => (
                      <MenuItem
                        key={format}
                        icon={<FileDown />}
                        onSelect={() => {
                          window.location.href = documentExportHref(
                            doc.id,
                            format,
                          );
                        }}
                      >
                        Export{' '}
                        {format === 'markdown'
                          ? 'Markdown'
                          : format === 'text'
                            ? 'plain text'
                            : 'HTML'}
                      </MenuItem>
                    ))}
                    <MenuItem icon={<FileDown />} disabled sub="unavailable">
                      Export PDF / LaTeX
                    </MenuItem>
                    {canEdit ? (
                      <>
                        <MenuSeparator />
                        <MenuItem
                          icon={<CopyPlus />}
                          onSelect={() => void lifecycle('document.duplicate')}
                        >
                          Duplicate
                        </MenuItem>
                        <MenuItem
                          icon={<Archive />}
                          onSelect={() => void lifecycle('document.archive')}
                        >
                          Archive
                        </MenuItem>
                      </>
                    ) : null}
                  </MenuContent>
                </Menu>
              </>
            }
          >
            <Crumb parent={project.name} title={doc.title} as="span" />
          </Topbar>
          <AtlasAnchor placement="canvas" reserve="wide" />
          <div className="relative flex min-h-0 flex-1">
            <div className="relative min-w-0 flex-1 overflow-auto">
              <article className="relative mx-auto max-w-[740px] px-10 pt-[calc(68px+var(--aic))] pb-40 max-sm:px-5">
                {doc.archived ? (
                  <ErrorBanner
                    title="This document is archived"
                    action={
                      canEdit ? (
                        <Btn
                          size="sm"
                          onClick={() => void lifecycle('document.restore')}
                        >
                          <ArchiveRestore aria-hidden="true" />
                          Restore
                        </Btn>
                      ) : null
                    }
                  />
                ) : null}
                {draft ? (
                  <div
                    role="alert"
                    className="mb-[18px] flex flex-wrap items-center gap-2 rounded-lg border border-aiib bg-acs px-3 py-2 text-ctl text-actx"
                  >
                    <span className="flex-1">
                      Unsaved changes from{' '}
                      {new Date(draft.savedAt).toLocaleString('en-US')} were
                      kept on this device
                      {draft.baseRevision !== doc.revision
                        ? ` (based on revision ${draft.baseRevision}; the document is now at revision ${doc.revision}).`
                        : '.'}
                    </span>
                    <Btn
                      size="sm"
                      variant="primary"
                      onClick={restoreDraft}
                      disabled={!canEdit}
                    >
                      Recover draft
                    </Btn>
                    <Btn
                      size="sm"
                      onClick={() => {
                        clearDraft(actorId, project.id, doc.id);
                        setDraft(null);
                      }}
                    >
                      Discard draft
                    </Btn>
                  </div>
                ) : null}
                {status === 'conflict' ? (
                  <div
                    role="alert"
                    className="mb-[18px] rounded-lg border border-warn/40 bg-warns px-3 py-2.5 text-ctl"
                  >
                    <div className="font-medium text-warn">
                      Someone saved a newer revision
                    </div>
                    <p className="mb-2 text-tx2">
                      Autosave stopped so nothing is overwritten. Your changes
                      are kept in this editor and on this device.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <Btn size="sm" onClick={() => setHistory(true)}>
                        Compare revisions
                      </Btn>
                      <Btn
                        size="sm"
                        variant="primary"
                        onClick={() => void keepMine()}
                      >
                        Save mine as a new revision
                      </Btn>
                      <Btn size="sm" variant="ghost" onClick={discardMine}>
                        Discard mine and load latest
                      </Btn>
                    </div>
                  </div>
                ) : null}
                <div className="mb-3.5 flex flex-wrap items-center gap-2 text-xs text-tx3">
                  <FileText aria-hidden="true" className="size-[13px]" />
                  {documentKindLabels[doc.kind]}
                  <span aria-hidden="true">·</span>
                  Revision {autosave.revision}
                  <span aria-hidden="true">·</span>
                  Edited {ago(doc.updatedAt)}
                  {doc.updatedBy ? ` by ${doc.updatedBy.name}` : ''}
                  {!canEdit ? (
                    <>
                      <span aria-hidden="true">·</span>
                      View only
                    </>
                  ) : null}
                </div>
                {canEdit ? (
                  <h1 className="mb-3.5">
                    <input
                      aria-label="Document title"
                      value={title}
                      maxLength={200}
                      onChange={(e) => setTitle(e.target.value)}
                      onBlur={() => void rename()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                        if (e.key === 'Escape') {
                          setTitle(doc.title);
                          e.currentTarget.blur();
                        }
                      }}
                      className="w-full bg-transparent font-serif text-[42px] leading-[1.08] font-medium tracking-[-0.01em] outline-none max-sm:text-[32px]"
                    />
                  </h1>
                ) : (
                  <h1 className="mb-3.5 font-serif text-[42px] leading-[1.08] font-medium tracking-[-0.01em] text-balance break-words max-sm:text-[32px]">
                    {doc.title}
                  </h1>
                )}
                <div className="mb-[34px] flex flex-wrap gap-1.5">
                  <InlineRef
                    icon={<BookOpen aria-hidden="true" />}
                    onClick={() => setRail(true)}
                  >
                    {linkedPapers.length} linked{' '}
                    {linkedPapers.length === 1 ? 'paper' : 'papers'}
                  </InlineRef>
                  <InlineRef
                    icon={<ListTodo aria-hidden="true" />}
                    onClick={() => setRail(true)}
                  >
                    {linkedTasks.length
                      ? linkedTasks.map((l) => l.other.detail).join(' · ')
                      : 'No linked tasks'}
                  </InlineRef>
                  <InlineRef
                    icon={<Sparkles aria-hidden="true" />}
                    onClick={() => atlas.ask({ mode: 'focus' })}
                  >
                    Ask Atlas · proposals need approval
                  </InlineRef>
                </div>
                <DocEditor
                  key={editorKey}
                  content={content}
                  onWords={setWords}
                  onDirty={() => {}}
                  onOpenComments={() => setRail(true)}
                  flash={flash}
                  live={live}
                />
                {papers.length ? (
                  <section
                    aria-label="References"
                    className="mt-12 border-t border-bd2 pt-4 font-sans"
                  >
                    <h2 className="mb-2.5 font-serif text-[22px] font-medium">
                      References
                    </h2>
                    <ol>
                      {papers.map((p, i) => (
                        <li
                          key={p.artifactId}
                          className="flex gap-2.5 py-1.5 text-ui leading-normal text-tx2"
                        >
                          <span className="w-[22px] pt-0.5 font-mono text-[11px] text-tx3">
                            [{i + 1}]
                          </span>
                          {p.state === 'UNAVAILABLE' || !p.title ? (
                            <span className="text-tx3">
                              Unavailable reference
                            </span>
                          ) : (
                            <Link
                              href={p.href ?? '#'}
                              className="flex-1 hover:text-tx"
                            >
                              {p.detail}. <i className="font-read">{p.title}</i>
                              {p.state === 'ARCHIVED' ? ' · archived' : ''}
                            </Link>
                          )}
                        </li>
                      ))}
                    </ol>
                  </section>
                ) : null}
              </article>
              <div className="pointer-events-none sticky bottom-3 flex justify-end px-3.5">
                <span
                  role="status"
                  aria-live="polite"
                  className={cn(
                    'rounded-sm border border-bd2 bg-canvas px-2 py-[3px] text-[11.5px] text-tx3',
                    (status === 'failed' || status === 'conflict') &&
                      'text-danger',
                    status === 'offline' && 'text-warn',
                  )}
                >
                  {status ? saveLabels[status] : 'View only'} ·{' '}
                  {words.toLocaleString('en-US')} words
                </span>
              </div>
            </div>
            {rail ? (
              <LinksRail
                project={project}
                artifactId={doc.artifactId}
                links={links}
                canEdit={canEdit}
                onClose={() => setRail(false)}
                onChanged={loadLinks}
              />
            ) : null}
          </div>
        </div>
        <LiveVersionHistoryDialog
          open={history}
          onOpenChange={setHistory}
          documentId={doc.id}
          title={doc.title}
          currentRevision={autosave.revision}
          canRestore={canEdit}
          onRestore={restoreRevision}
        />
      </LiveRefsContext.Provider>
    </DocUi.Provider>
  );
}

/** Typed relationships for this document; links never grant access. */
export function LinksRail({
  project,
  artifactId,
  links,
  canEdit,
  onClose,
  onChanged,
}: {
  project: ProjectDto;
  artifactId: string;
  links: LinkDto[] | null;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const flash = useToast();
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<ArtifactOption[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetchOptions(project.id, query, 'TASK')
        .then((r) => setOptions(r.items))
        .catch(() => setOptions([]));
    }, 200);
    return () => clearTimeout(timer.current);
  }, [project.id, query]);
  async function track(task: ArtifactOption) {
    try {
      await artifactCommand({
        command: 'artifact.link.create',
        projectId: project.id,
        sourceArtifactId: artifactId,
        targetArtifactId: task.artifactId,
        relationship: 'TRACKS',
        idempotencyKey: crypto.randomUUID(),
      });
      setQuery('');
      onChanged();
    } catch (e) {
      flash(message(e, 'The link could not be created.'));
    }
  }
  async function unlink(id: string) {
    try {
      await artifactCommand({ command: 'artifact.link.remove', id });
      onChanged();
    } catch (e) {
      flash(message(e, 'The link could not be removed.'));
    }
  }
  return (
    <aside
      aria-label="Links"
      className="flex w-[300px] shrink-0 flex-col border-l border-bd2 max-[900px]:absolute max-[900px]:inset-y-0 max-[900px]:right-0 max-[900px]:z-20 max-[900px]:bg-canvas max-[900px]:shadow-pop"
    >
      <div className="flex items-center gap-0.5 border-b border-bd2 px-2.5 py-2">
        <span className="px-1 text-ctl font-medium">Linked research</span>
        <span className="flex-1" />
        <IconBtn label="Close links" size="base" tone="muted" onClick={onClose}>
          <X aria-hidden="true" className="size-[14px]" />
        </IconBtn>
      </div>
      <div className="flex-1 overflow-auto p-3">
        {links === null ? (
          <SkeletonLines widths={[80, 60]} />
        ) : !links.length ? (
          <p className="text-ctl text-tx3">
            No linked papers, documents or tasks yet. Citations you insert
            appear here.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {links.map((l) => (
              <li
                key={l.id}
                className="rounded-lg border border-bd2 bg-card p-2.5 text-ctl"
              >
                <div className="text-[11px] text-tx3">
                  {
                    relationshipLabels[l.relationship][
                      l.direction === 'outgoing' ? 0 : 1
                    ]
                  }
                  {l.origin === 'CONTENT' ? ' · from document text' : ''}
                </div>
                {l.other.state === 'UNAVAILABLE' || !l.other.title ? (
                  <span className="text-tx3">Unavailable reference</span>
                ) : (
                  <Link
                    href={l.other.href ?? '#'}
                    className="font-medium hover:underline"
                  >
                    {l.other.kind === 'TASK' ? `${l.other.detail} ` : ''}
                    {l.other.title}
                    {l.other.state === 'ARCHIVED' ? ' · archived' : ''}
                  </Link>
                )}
                {canEdit && l.origin === 'MANUAL' ? (
                  <button
                    type="button"
                    className="mt-1 block text-[11.5px] text-tx3 hover:text-danger"
                    onClick={() => void unlink(l.id)}
                  >
                    Remove link
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canEdit ? (
          <div className="mt-4">
            <label className="text-[11.5px] text-tx3" htmlFor="track-task">
              Track a task
            </label>
            <input
              id="track-task"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks…"
              className="mt-1 h-8 w-full rounded-[7px] border border-bd px-2.5 text-ctl"
            />
            <ul className="mt-1">
              {options.slice(0, 6).map((o) => (
                <li key={o.artifactId}>
                  <button
                    type="button"
                    onClick={() => void track(o)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ctl hover:bg-hov"
                  >
                    <ListTodo aria-hidden="true" className="size-3 text-tx3" />
                    <span className="truncate">
                      {o.detail} {o.title}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
