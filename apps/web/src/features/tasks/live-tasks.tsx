'use client';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Archive,
  ArchiveRestore,
  ArrowRightLeft,
  BookOpen,
  ChevronDown,
  Columns3,
  FileText,
  Flag,
  List,
  ListFilter,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import {
  canTransition,
  relationshipLabels,
  taskPriorities,
  taskPriorityLabels,
  taskStatusLabels,
  taskTransitions,
  type ArtifactOption,
  type ProjectDto,
  type TaskDetailDto,
  type TaskDto,
  type TaskPage,
  type TaskPriorityValue,
  type TaskStatusValue,
} from '@atlas/core';
import { Btn, IconBtn } from '@/components/atlas/button';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
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
import { Topbar } from '@/features/shell/topbar';
import {
  ApiError,
  artifactCommand,
  fetchOptions,
  fetchTask,
} from '@/features/artifacts/client';
import { ARTIFACTS_CHANGED } from '@/features/atlas-ai/proposal-review';
import { LivePriorityIcon, LiveStatusIcon } from './task-icons';
import { useTaskPages } from './use-task-pages';

const emptyTasks: TaskDto[] = [];
const boardColumns: TaskStatusValue[] = [
  'TODO',
  'IN_PROGRESS',
  'IN_REVIEW',
  'DONE',
];
const allStatuses: TaskStatusValue[] = [...boardColumns, 'CANCELLED'];
type Filters = {
  assignee?: string | undefined;
  milestone?: string | undefined;
  priority?: TaskPriorityValue | undefined;
  archived?: 'true' | undefined;
};
const message = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : fallback;
const due = (value: string | null) =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    : null;

/**
 * Live Tasks (Phase 04): the approved board/list with real persistence.
 * Status changes are optimistic with rollback; the server decides the
 * transition policy and version check. Every drag has a keyboard menu.
 */
export function LiveTasks({ project }: { project: ProjectDto }) {
  return <TaskWorkspace key={project.id} project={project} />;
}

function TaskWorkspace({ project }: { project: ProjectDto }) {
  const router = useRouter();
  const params = useSearchParams();
  const flash = useToast();
  const atlas = useAtlas();
  const selectedId = params.get('task');
  const [view, setView] = useState<'board' | 'list'>('board');
  const [filters, setFilters] = useState<Filters>({});
  const {
    data,
    error,
    moreError,
    paging,
    loading,
    loadMore,
    reload,
    setTasks,
  } = useTaskPages(project.id, filters);
  const tasks = data?.items ?? emptyTasks;
  const moving = useRef(new Set<string>());
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatusValue | null>(null);
  const [announce, setAnnounce] = useState('');
  const [creating, setCreating] = useState<TaskStatusValue | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  useEffect(() => {
    const listener = (event: Event) => {
      if ((event as CustomEvent<{ tasks?: boolean }>).detail?.tasks) reload();
    };
    window.addEventListener(ARTIFACTS_CHANGED, listener);
    return () => window.removeEventListener(ARTIFACTS_CHANGED, listener);
  }, [reload]);
  const { setContext } = atlas;
  useEffect(() => {
    setContext([
      {
        id: `project:${project.id}`,
        kind: 'project',
        title: `Tasks · ${project.name}`,
        research: { kind: 'project', projectId: project.id },
      },
    ]);
  }, [project.id, project.name, setContext]);
  const canWrite =
    data?.capabilities.includes('task.edit') ??
    project.capabilities.includes('project.write');
  const current = tasks.find((t) => t.id === selectedId) ?? null;
  const open = (id: string | null) =>
    router.replace(
      `/app/projects/${project.id}/tasks${id ? `?task=${id}` : ''}`,
      { scroll: false },
    );

  /** Optimistic move with rollback; announces the outcome either way. */
  async function move(task: TaskDto, status: TaskStatusValue) {
    if (task.status === status || moving.current.has(task.id)) return;
    if (!canTransition(task.status, status)) {
      setAnnounce(
        `#${task.number} cannot move from ${taskStatusLabels[task.status]} to ${taskStatusLabels[status]}. Allowed: ${taskTransitions[task.status].map((s) => taskStatusLabels[s]).join(', ')}.`,
      );
      return;
    }
    moving.current.add(task.id);
    setTasks((list) =>
      list.map((t) =>
        t.id === task.id ? { ...t, status, version: task.version + 1 } : t,
      ),
    );
    try {
      await artifactCommand({
        command: 'task.transition',
        id: task.id,
        expectedVersion: task.version,
        status,
      });
      reload();
      setAnnounce(`#${task.number} moved to ${taskStatusLabels[status]}.`);
    } catch (e) {
      setTasks((list) => list.map((t) => (t.id === task.id ? task : t)));
      setAnnounce(
        e instanceof ApiError && e.code === 'CONFLICT'
          ? `#${task.number} changed elsewhere and was not moved. The board was refreshed.`
          : `#${task.number} was not moved: ${message(e, 'request failed')}`,
      );
      if (
        e instanceof ApiError &&
        ['CONFLICT', 'NOT_FOUND', 'FORBIDDEN', 'UNAUTHENTICATED'].includes(
          e.code,
        )
      )
        reload();
    } finally {
      moving.current.delete(task.id);
    }
  }
  const onDrop = (e: DragEvent, status: TaskStatusValue) => {
    e.preventDefault();
    const id = dragging ?? e.dataTransfer.getData('text/plain');
    const task = tasks.find((t) => t.id === id);
    if (task) void move(task, status);
    setDragging(null);
    setOver(null);
  };
  async function create(status: TaskStatusValue) {
    const title = draftTitle.trim();
    if (!title) return;
    try {
      const created = await artifactCommand({
        command: 'task.create',
        projectId: project.id,
        title,
        status: status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'TODO',
        ...(filters.milestone ? { milestoneId: filters.milestone } : {}),
        idempotencyKey: crypto.randomUUID(),
      });
      setDraftTitle('');
      setCreating(null);
      setAnnounce(`Created #${created.taskNumber}.`);
      reload();
      open(created.id);
    } catch (e) {
      flash(message(e, 'The task could not be created.'));
    }
  }
  const participants = data?.participants ?? [];
  const milestones = data?.milestones ?? [];
  const filterCount = Object.values(filters).filter(Boolean).length;
  const columns = useMemo(
    () =>
      tasks.some((t) => t.status === 'CANCELLED') ? allStatuses : boardColumns,
    [tasks],
  );
  const createForm = (status: TaskStatusValue) => (
    <form
      className="flex gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        void create(status);
      }}
    >
      <label className="sr-only" htmlFor={`new-task-${status}`}>
        New task title
      </label>
      <input
        id={`new-task-${status}`}
        autoFocus
        value={draftTitle}
        maxLength={200}
        onChange={(e) => setDraftTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setCreating(null)}
        placeholder="Task title…"
        className="h-8 min-w-0 flex-1 rounded-[7px] border border-bd bg-card px-2.5 text-ctl"
      />
      <Btn type="submit" variant="primary" size="md">
        Create
      </Btn>
    </form>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar />
      <AtlasAnchor placement="canvas" />
      <p role="status" aria-live="assertive" className="sr-only">
        {announce}
      </p>
      <div className="flex flex-wrap items-center gap-2 px-5 pt-[calc(44px+var(--aic))] pb-3 max-sm:px-4">
        <span className="mb-[-2px] w-full text-xs text-tx3">
          {project.name}
        </span>
        <h1 className="mr-2 font-serif text-[30px] leading-none font-medium">
          Tasks
        </h1>
        <Segmented
          label="Task view"
          size="sm"
          value={view}
          onChange={setView}
          options={[
            {
              value: 'board',
              label: 'Board',
              icon: <Columns3 aria-hidden="true" className="!size-3" />,
            },
            {
              value: 'list',
              label: 'List',
              icon: <List aria-hidden="true" className="!size-3" />,
            },
          ]}
        />
        <Menu>
          <MenuTrigger asChild>
            <Btn variant="ghost" size="md">
              <ListFilter aria-hidden="true" className="!size-3" />
              Filter{filterCount ? ` · ${filterCount}` : ''}
            </Btn>
          </MenuTrigger>
          <MenuContent width={240} align="start">
            <MenuLabel>Assignee</MenuLabel>
            <MenuRadioGroup
              value={filters.assignee ?? 'any'}
              onValueChange={(v) =>
                setFilters((f) => ({
                  ...f,
                  assignee: v === 'any' ? undefined : v,
                }))
              }
            >
              <MenuRadioItem value="any">Anyone</MenuRadioItem>
              <MenuRadioItem value="me">Assigned to me</MenuRadioItem>
              <MenuRadioItem value="none">Unassigned</MenuRadioItem>
              {participants.map((p) => (
                <MenuRadioItem key={p.id} value={p.id}>
                  {p.name}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
            <MenuSeparator />
            <MenuLabel>Priority</MenuLabel>
            <MenuRadioGroup
              value={filters.priority ?? 'any'}
              onValueChange={(v) =>
                setFilters((f) => ({
                  ...f,
                  priority: v === 'any' ? undefined : (v as TaskPriorityValue),
                }))
              }
            >
              <MenuRadioItem value="any">Any priority</MenuRadioItem>
              {taskPriorities.map((p) => (
                <MenuRadioItem key={p} value={p}>
                  {taskPriorityLabels[p]}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
            <MenuSeparator />
            <MenuLabel>Milestone</MenuLabel>
            <MenuRadioGroup
              value={filters.milestone ?? 'any'}
              onValueChange={(v) =>
                setFilters((f) => ({
                  ...f,
                  milestone: v === 'any' ? undefined : v,
                }))
              }
            >
              <MenuRadioItem value="any">Any milestone</MenuRadioItem>
              {milestones.map((m) => (
                <MenuRadioItem key={m.id} value={m.id}>
                  {m.title}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
            <MenuSeparator />
            <MenuItem
              icon={<Archive />}
              onSelect={() =>
                setFilters((f) => ({
                  ...f,
                  archived: f.archived ? undefined : 'true',
                }))
              }
            >
              {filters.archived ? 'Show active tasks' : 'Show archived tasks'}
            </MenuItem>
            {filterCount ? (
              <MenuItem onSelect={() => setFilters({})}>Clear filters</MenuItem>
            ) : null}
          </MenuContent>
        </Menu>
        {milestones.length ? (
          <span className="text-[11.5px] text-tx3 max-sm:hidden">
            {milestones
              .map(
                (m) =>
                  `${m.title} · ${m.doneTasks}/${m.doneTasks + m.openTasks}`,
              )
              .join('  ·  ')}
          </span>
        ) : null}
        <span className="flex-1" />
        <Btn
          variant="ai"
          onClick={() =>
            atlas.ask({
              mode: 'focus',
              draft:
                'Suggest a task breakdown as a bulleted list for the next research milestone',
            })
          }
        >
          <Sparkles aria-hidden="true" />
          Plan with Atlas
        </Btn>
        {canWrite && !filters.archived ? (
          <Btn variant="primary" onClick={() => setCreating('TODO')}>
            <Plus aria-hidden="true" />
            New task
          </Btn>
        ) : null}
      </div>
      <div className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto px-5 pt-1 pb-[30px] max-sm:px-4">
          {error && !loading ? (
            <ErrorBanner
              title="Tasks are unavailable"
              action={<Btn onClick={reload}>Retry</Btn>}
            >
              {error}
            </ErrorBanner>
          ) : !data ? (
            <SkeletonLines widths={[60, 80, 70]} />
          ) : view === 'board' ? (
            <>
              <div className="flex min-w-max items-start gap-3">
                {columns.map((status) => {
                  const items = tasks.filter((t) => t.status === status);
                  const target = over === status && dragging;
                  return (
                    <section
                      key={status}
                      aria-label={`${taskStatusLabels[status]} · ${items.length}${data.nextCursor ? ' loaded' : ''}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (over !== status) setOver(status);
                      }}
                      onDragLeave={() =>
                        setOver((o) => (o === status ? null : o))
                      }
                      onDrop={(e) => onDrop(e, status)}
                      className={cn(
                        'flex min-h-[240px] w-[268px] shrink-0 flex-col gap-1.5 rounded-xl px-1 pb-2 outline-1 outline-dashed transition-colors',
                        target ? 'bg-acs outline-aiib' : 'outline-transparent',
                      )}
                    >
                      <div className="flex h-[30px] items-center gap-[7px] px-1 text-ctl">
                        <LiveStatusIcon status={status} />
                        <h2 className="font-medium">
                          {taskStatusLabels[status]}
                        </h2>
                        <span className="text-tx3">
                          {items.length}
                          {data.nextCursor ? ' loaded' : ''}
                        </span>
                        <span className="flex-1" />
                        {canWrite &&
                        (status === 'TODO' || status === 'IN_PROGRESS') &&
                        !filters.archived ? (
                          <IconBtn
                            label={`New task in ${taskStatusLabels[status]}`}
                            size="sm"
                            tone="muted"
                            onClick={() => setCreating(status)}
                          >
                            <Plus aria-hidden="true" className="size-[13px]" />
                          </IconBtn>
                        ) : null}
                      </div>
                      {creating === status ? createForm(status) : null}
                      {items.map((t) => (
                        <TaskCard
                          key={t.id}
                          task={t}
                          selected={t.id === selectedId}
                          dragging={dragging === t.id}
                          canWrite={canWrite && !t.archived}
                          onOpen={() => open(t.id)}
                          onMove={(s) => void move(t, s)}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', t.id);
                            e.dataTransfer.effectAllowed = 'move';
                            setDragging(t.id);
                          }}
                          onDragEnd={() => {
                            setDragging(null);
                            setOver(null);
                          }}
                        />
                      ))}
                      {items.length === 0 ? (
                        <div className="grid h-16 place-items-center rounded-lg border border-dashed border-bd2 text-xs text-tx3">
                          {canWrite ? 'Drop tasks here' : 'No tasks'}
                        </div>
                      ) : null}
                    </section>
                  );
                })}
              </div>
              {!tasks.length && !loading ? (
                <EmptyState
                  icon={Flag}
                  title={
                    filters.archived
                      ? 'No archived tasks'
                      : filterCount
                        ? 'No tasks match these filters'
                        : 'No tasks in this project yet'
                  }
                  description="Plan research work as tasks, link them to papers and documents, and move them across the board."
                  className="mt-4 max-w-[720px]"
                />
              ) : null}
            </>
          ) : (
            allStatuses.map((status) => {
              const items = tasks.filter((t) => t.status === status);
              return (
                <section key={status} aria-label={taskStatusLabels[status]}>
                  <div className="mt-2 flex h-[34px] items-center gap-[7px] rounded-md bg-card px-2.5 text-ctl">
                    <LiveStatusIcon status={status} />
                    <h2 className="font-medium">{taskStatusLabels[status]}</h2>
                    <span className="text-tx3">
                      {items.length}
                      {data.nextCursor ? ' loaded' : ''}
                    </span>
                  </div>
                  {creating === status ? (
                    <div className="py-1.5">{createForm(status)}</div>
                  ) : null}
                  <ul>
                    {items.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => open(t.id)}
                          aria-current={
                            t.id === selectedId ? 'true' : undefined
                          }
                          className="flex h-[38px] w-full items-center gap-3 border-b border-bd2 px-2.5 text-left hover:bg-card"
                        >
                          <LivePriorityIcon
                            priority={t.priority}
                            className="size-[13px]"
                          />
                          <span className="w-[52px] font-mono text-[11px] text-tx3">
                            #{t.number}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {t.title}
                          </span>
                          {t.dueDate ? (
                            <span className="text-[11.5px] text-tx3">
                              Due {due(t.dueDate)}
                            </span>
                          ) : null}
                          <span className="w-[120px] truncate text-right text-[11.5px] text-tx3 max-sm:hidden">
                            {t.assignee
                              ? (t.assignee.name ?? 'Former participant')
                              : 'Unassigned'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
          )}
          {data ? (
            <div
              className="mt-4 flex flex-wrap items-center gap-3 text-xs text-tx3"
              aria-busy={paging}
            >
              <p role="status">
                {tasks.length} tasks loaded
                {data.nextCursor
                  ? ' · More tasks remain. Column counts show loaded tasks.'
                  : ' · All matching tasks loaded.'}
              </p>
              {moreError ? (
                <ErrorBanner title="More tasks could not be loaded">
                  {moreError}
                </ErrorBanner>
              ) : null}
              {data.nextCursor ? (
                <Btn disabled={paging} onClick={() => void loadMore()}>
                  {paging
                    ? 'Loading tasks…'
                    : moreError
                      ? 'Retry loading tasks'
                      : 'Load more tasks'}
                </Btn>
              ) : null}
            </div>
          ) : null}
        </div>
        {current ? (
          <TaskDetail
            key={current.id}
            project={project}
            task={current}
            page={data!}
            canWrite={canWrite}
            onClose={() => open(null)}
            onChanged={reload}
            onMove={(s) => void move(current, s)}
          />
        ) : null}
      </div>
    </div>
  );
}

function TaskCard({
  task: t,
  selected,
  dragging,
  canWrite,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  task: TaskDto;
  selected: boolean;
  dragging: boolean;
  canWrite: boolean;
  onOpen: () => void;
  onMove: (status: TaskStatusValue) => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable={canWrite}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'relative flex flex-col gap-2 rounded-lg border bg-card px-[11px] py-2.5 transition-opacity hover:border-bd',
        canWrite && 'cursor-grab',
        selected ? 'border-tx3' : 'border-bd2',
        dragging && 'opacity-40',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="flex-1 font-mono text-[11px] text-tx3">
          #{t.number}
        </span>
        <LivePriorityIcon priority={t.priority} className="size-[13px]" />
        {canWrite ? (
          <Menu>
            <MenuTrigger asChild>
              <button
                type="button"
                aria-label={`Move #${t.number} ${t.title}`}
                className="relative z-[1] grid size-[22px] place-items-center rounded-sm text-tx3 hover:bg-hov hover:text-tx"
              >
                <ArrowRightLeft aria-hidden="true" className="size-3" />
              </button>
            </MenuTrigger>
            <MenuContent width={200} align="end">
              <MenuLabel>Move to</MenuLabel>
              {taskTransitions[t.status].map((s) => (
                <MenuItem
                  key={s}
                  icon={<LiveStatusIcon status={s} />}
                  onSelect={() => onMove(s)}
                >
                  {taskStatusLabels[s]}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="text-left text-ui leading-[1.4] after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-ac"
      >
        {t.title}
      </button>
      <div className="flex items-center gap-2 text-[11.5px] text-tx3">
        <span className="truncate">
          {t.assignee
            ? (t.assignee.name ?? 'Former participant')
            : 'Unassigned'}
        </span>
        {t.dueDate ? <span>· Due {due(t.dueDate)}</span> : null}
        <span className="flex-1" />
        {t.linkedPapers ? (
          <span className="inline-flex items-center gap-[3px]">
            <BookOpen aria-hidden="true" className="size-[11px]" />
            {t.linkedPapers}
            <span className="sr-only">linked papers</span>
          </span>
        ) : null}
        {t.linkedDocuments ? (
          <span className="inline-flex items-center gap-[3px]">
            <FileText aria-hidden="true" className="size-[11px]" />
            {t.linkedDocuments}
            <span className="sr-only">linked documents</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function TaskDetail({
  project,
  task,
  page,
  canWrite,
  onClose,
  onChanged,
  onMove,
}: {
  project: ProjectDto;
  task: TaskDto;
  page: TaskPage;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
  onMove: (status: TaskStatusValue) => void;
}) {
  const flash = useToast();
  const [detail, setDetail] = useState<TaskDetailDto | null>(null);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [linkQuery, setLinkQuery] = useState('');
  const [options, setOptions] = useState<ArtifactOption[]>([]);
  const editable = canWrite && !task.archived;
  // Sequential edits in this panel advance the concurrency token locally;
  // a change made elsewhere still fails with CONFLICT and reloads.
  const version = useRef(task.version);
  const previous = useRef(task);
  useEffect(() => {
    const before = previous.current;
    // Reconcile committed fields without closing an open menu or discarding
    // text the user is still editing during the background refresh.
    setTitle((value) => (value === before.title ? task.title : value));
    setDescription((value) =>
      value === before.description ? task.description : value,
    );
    version.current = task.version;
    previous.current = task;
  }, [task]);
  // Links do not change the task version; refetch after link edits.
  const [linksKey, setLinksKey] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchTask(task.id)
      .then((d) => alive && setDetail(d))
      .catch(() => alive && setDetail(null));
    return () => {
      alive = false;
    };
  }, [task.id, task.version, linksKey]);
  useEffect(() => {
    if (!linkQuery.trim()) return;
    let alive = true;
    const timer = setTimeout(() => {
      fetchOptions(project.id, linkQuery)
        .then(
          (r) =>
            alive &&
            setOptions(
              r.items.filter((o) => o.kind !== 'TASK' || o.id !== task.id),
            ),
        )
        .catch(() => alive && setOptions([]));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [linkQuery, project.id, task.id]);
  async function update(fields: Record<string, unknown>, label: string) {
    try {
      await artifactCommand({
        command: 'task.update',
        id: task.id,
        expectedVersion: version.current,
        ...fields,
      });
      version.current += 1;
      onChanged();
    } catch (e) {
      flash(
        e instanceof ApiError && e.code === 'CONFLICT'
          ? `#${task.number} changed elsewhere; your ${label} change was not saved. Reloaded the latest version.`
          : message(e, `Unable to update the ${label}.`),
      );
      onChanged();
    }
  }
  async function assign(assigneeId: string | null) {
    try {
      await artifactCommand({
        command: 'task.assign',
        id: task.id,
        expectedVersion: version.current,
        assigneeId,
      });
      version.current += 1;
      onChanged();
    } catch (e) {
      flash(message(e, 'Only eligible project editors can be assigned.'));
      onChanged();
    }
  }
  async function lifecycle(command: 'task.archive' | 'task.restore') {
    try {
      await artifactCommand({
        command,
        id: task.id,
        expectedVersion: version.current,
      });
      version.current += 1;
      onChanged();
    } catch (e) {
      flash(message(e, 'That action failed.'));
    }
  }
  async function link(o: ArtifactOption) {
    try {
      await artifactCommand({
        command: 'artifact.link.create',
        projectId: project.id,
        sourceArtifactId:
          o.kind === 'DOCUMENT' ? o.artifactId : task.artifactId,
        targetArtifactId:
          o.kind === 'DOCUMENT' ? task.artifactId : o.artifactId,
        // A document tracks this task; the task references papers and depends on tasks.
        relationship:
          o.kind === 'DOCUMENT'
            ? 'TRACKS'
            : o.kind === 'PAPER'
              ? 'REFERENCES'
              : 'DEPENDS_ON',
        idempotencyKey: crypto.randomUUID(),
      });
      setLinkQuery('');
      setOptions([]);
      setLinksKey((n) => n + 1);
      onChanged();
    } catch (e) {
      flash(message(e, 'The link could not be created.'));
    }
  }
  async function newMilestone() {
    const name = window
      .prompt('Milestone title (for example “Model evaluation”)')
      ?.trim();
    if (!name) return;
    try {
      const created = await artifactCommand({
        command: 'milestone.create',
        projectId: project.id,
        title: name,
        idempotencyKey: crypto.randomUUID(),
      });
      await update({ milestoneId: created.id }, 'milestone');
    } catch (e) {
      flash(message(e, 'The milestone could not be created.'));
    }
  }
  const milestone = page.milestones.find((m) => m.id === task.milestoneId);
  const assignable = page.participants.filter((p) => p.assignable);
  return (
    <aside
      aria-label={`Task #${task.number}`}
      className="flex w-[min(420px,46%)] shrink-0 flex-col border-l border-bd2 bg-canvas max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-40 max-md:w-[min(420px,100%)] max-md:shadow-pop"
    >
      <div className="flex items-center gap-1.5 border-b border-bd2 px-3 py-2.5">
        <span className="flex-1 font-mono text-[11.5px] text-tx3">
          #{task.number}
          {task.archived ? ' · archived' : ''}
        </span>
        {canWrite ? (
          <IconBtn
            label={task.archived ? 'Restore task' : 'Archive task'}
            size="base"
            onClick={() =>
              void lifecycle(task.archived ? 'task.restore' : 'task.archive')
            }
          >
            {task.archived ? (
              <ArchiveRestore aria-hidden="true" className="size-[14px]" />
            ) : (
              <Archive aria-hidden="true" className="size-[14px]" />
            )}
          </IconBtn>
        ) : null}
        <IconBtn label="Close task" size="base" onClick={onClose}>
          <X aria-hidden="true" className="size-[14px]" />
        </IconBtn>
      </div>
      <div className="flex-1 overflow-auto px-[18px] pt-4 pb-5">
        {editable ? (
          <h2 className="mb-3.5">
            <input
              aria-label="Task title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() =>
                title.trim() &&
                title.trim() !== task.title &&
                void update({ title: title.trim() }, 'title')
              }
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className="w-full bg-transparent font-serif text-2xl leading-[1.15] font-medium outline-none"
            />
          </h2>
        ) : (
          <h2 className="mb-3.5 font-serif text-2xl leading-[1.15] font-medium">
            {task.title}
          </h2>
        )}
        <dl className="mb-[18px] grid grid-cols-[90px_1fr] items-center gap-x-2.5 gap-y-[9px] text-ctl">
          <dt className="text-tx3">Status</dt>
          <dd>
            <Menu>
              <MenuTrigger asChild disabled={!editable}>
                <button
                  type="button"
                  aria-label={`Status: ${taskStatusLabels[task.status]}`}
                  className="-ml-1.5 flex h-6 items-center gap-1.5 rounded-sm px-1.5 hover:bg-hov"
                >
                  <LiveStatusIcon
                    status={task.status}
                    className="size-[13px]"
                  />
                  {taskStatusLabels[task.status]}
                  {editable ? (
                    <ChevronDown
                      aria-hidden="true"
                      className="size-3 text-tx3"
                    />
                  ) : null}
                </button>
              </MenuTrigger>
              <MenuContent width={200} align="start">
                {taskTransitions[task.status].map((s) => (
                  <MenuItem
                    key={s}
                    icon={<LiveStatusIcon status={s} />}
                    onSelect={() => onMove(s)}
                  >
                    {taskStatusLabels[s]}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          </dd>
          <dt className="text-tx3">Priority</dt>
          <dd>
            <Menu>
              <MenuTrigger asChild disabled={!editable}>
                <button
                  type="button"
                  aria-label={`Priority: ${taskPriorityLabels[task.priority]}`}
                  className="-ml-1.5 flex h-6 items-center gap-1.5 rounded-sm px-1.5 hover:bg-hov"
                >
                  <LivePriorityIcon
                    priority={task.priority}
                    className="size-[13px]"
                  />
                  {taskPriorityLabels[task.priority]}
                </button>
              </MenuTrigger>
              <MenuContent width={200} align="start">
                <MenuRadioGroup
                  value={task.priority}
                  onValueChange={(v) =>
                    void update({ priority: v }, 'priority')
                  }
                >
                  {taskPriorities.map((p) => (
                    <MenuRadioItem
                      key={p}
                      value={p}
                      icon={<LivePriorityIcon priority={p} />}
                    >
                      {taskPriorityLabels[p]}
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
              </MenuContent>
            </Menu>
          </dd>
          <dt className="text-tx3">Assignee</dt>
          <dd>
            <Menu>
              <MenuTrigger asChild disabled={!editable}>
                <button
                  type="button"
                  aria-label={`Assignee: ${task.assignee?.name ?? (task.assignee ? 'former participant' : 'unassigned')}`}
                  className="-ml-1.5 flex h-6 items-center gap-1.5 rounded-sm px-1.5 hover:bg-hov"
                >
                  {task.assignee
                    ? (task.assignee.name ??
                      'Former participant (access removed)')
                    : 'Unassigned'}
                </button>
              </MenuTrigger>
              <MenuContent width={240} align="start">
                <MenuLabel>Eligible project editors</MenuLabel>
                <MenuRadioGroup
                  value={task.assignee?.id ?? 'none'}
                  onValueChange={(v) => void assign(v === 'none' ? null : v)}
                >
                  <MenuRadioItem value="none">Unassigned</MenuRadioItem>
                  {assignable.map((p) => (
                    <MenuRadioItem key={p.id} value={p.id}>
                      {p.name}
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
              </MenuContent>
            </Menu>
          </dd>
          <dt className="text-tx3">
            <label htmlFor="task-due">Due</label>
          </dt>
          <dd>
            <input
              id="task-due"
              type="date"
              disabled={!editable}
              defaultValue={task.dueDate ?? ''}
              onChange={(e) =>
                void update({ dueDate: e.target.value || null }, 'due date')
              }
              className="-ml-1.5 h-6 rounded-sm bg-transparent px-1.5 text-ctl hover:bg-hov"
            />
          </dd>
          <dt className="text-tx3">Milestone</dt>
          <dd>
            <Menu>
              <MenuTrigger asChild disabled={!editable}>
                <button
                  type="button"
                  aria-label={`Milestone: ${milestone?.title ?? 'none'}`}
                  className="-ml-1.5 flex h-6 items-center gap-1.5 rounded-sm px-1.5 hover:bg-hov"
                >
                  <Flag aria-hidden="true" className="size-3 text-tx3" />
                  {milestone?.title ?? 'No milestone'}
                </button>
              </MenuTrigger>
              <MenuContent width={240} align="start">
                <MenuRadioGroup
                  value={task.milestoneId ?? 'none'}
                  onValueChange={(v) =>
                    void update(
                      { milestoneId: v === 'none' ? null : v },
                      'milestone',
                    )
                  }
                >
                  <MenuRadioItem value="none">No milestone</MenuRadioItem>
                  {page.milestones.map((m) => (
                    <MenuRadioItem
                      key={m.id}
                      value={m.id}
                      sub={m.targetDate ? due(m.targetDate) : undefined}
                    >
                      {m.title}
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
                <MenuSeparator />
                <MenuItem icon={<Plus />} onSelect={() => void newMilestone()}>
                  New milestone…
                </MenuItem>
              </MenuContent>
            </Menu>
          </dd>
          <dt className="text-tx3">Created</dt>
          <dd className="text-tx2">
            {task.createdBy?.name ?? 'Former participant'} ·{' '}
            {new Date(task.createdAt).toLocaleDateString('en-US')}
          </dd>
          <dt className="text-tx3">Updated</dt>
          <dd className="text-tx2">
            {new Date(task.updatedAt).toLocaleString('en-US')}
          </dd>
        </dl>
        <h3 className="mb-1.5 text-[11.5px] text-tx3">
          <label htmlFor="task-description">Description</label>
        </h3>
        <textarea
          id="task-description"
          value={description}
          readOnly={!editable}
          maxLength={20000}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() =>
            description !== task.description &&
            void update({ description }, 'description')
          }
          placeholder={
            editable ? 'Describe the research work…' : 'No description'
          }
          className="mb-4 min-h-[96px] w-full resize-y rounded-[7px] border border-bd2 bg-transparent p-2.5 font-read text-sm leading-[1.65] text-tx2"
        />
        <h3 className="mb-1.5 text-[11.5px] text-tx3">Linked</h3>
        <ul className="mb-2 flex flex-col gap-1.5">
          {detail === null ? (
            <li>
              <SkeletonLines widths={[70]} />
            </li>
          ) : !detail.links.length ? (
            <li className="text-ctl text-tx3">
              No linked papers, documents or tasks.
            </li>
          ) : (
            detail.links.map((l) => (
              <li key={l.id} className="flex items-center gap-1.5 text-ctl">
                <span className="w-[86px] shrink-0 text-[11px] text-tx3">
                  {
                    relationshipLabels[l.relationship][
                      l.direction === 'outgoing' ? 0 : 1
                    ]
                  }
                </span>
                {l.other.state === 'UNAVAILABLE' || !l.other.title ? (
                  <span className="text-tx3">Unavailable reference</span>
                ) : (
                  <Link
                    href={l.other.href ?? '#'}
                    className="inline-flex h-6 min-w-0 items-center gap-[5px] rounded-sm border border-bd2 bg-el px-2 text-xs hover:bg-hov"
                  >
                    {l.other.kind === 'PAPER' ? (
                      <BookOpen
                        aria-hidden="true"
                        className="size-3 text-tx3"
                      />
                    ) : (
                      <FileText
                        aria-hidden="true"
                        className="size-3 text-tx3"
                      />
                    )}
                    <span className="truncate">
                      {l.other.kind === 'TASK' ? `${l.other.detail} ` : ''}
                      {l.other.title}
                    </span>
                    {l.other.state === 'ARCHIVED' ? (
                      <span className="text-tx3">· archived</span>
                    ) : null}
                  </Link>
                )}
                {editable && l.origin === 'MANUAL' ? (
                  <button
                    type="button"
                    aria-label={`Remove link to ${l.other.title ?? 'reference'}`}
                    onClick={() =>
                      void artifactCommand({
                        command: 'artifact.link.remove',
                        id: l.id,
                      }).then(
                        () => {
                          setLinksKey((n) => n + 1);
                          onChanged();
                        },
                        (e: unknown) =>
                          flash(message(e, 'Unable to remove the link.')),
                      )
                    }
                    className="grid size-5 place-items-center rounded-sm text-tx3 hover:bg-hov"
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                ) : null}
              </li>
            ))
          )}
        </ul>
        {editable ? (
          <div className="mb-[18px]">
            <label className="sr-only" htmlFor="task-link">
              Link a paper, document or task
            </label>
            <input
              id="task-link"
              value={linkQuery}
              onChange={(e) => setLinkQuery(e.target.value)}
              placeholder="Link a paper, document or blocking task…"
              className="h-8 w-full rounded-[7px] border border-bd px-2.5 text-ctl"
            />
            {linkQuery.trim() ? (
              <ul className="mt-1">
                {options.slice(0, 8).map((o) => (
                  <li key={o.artifactId}>
                    <button
                      type="button"
                      onClick={() => void link(o)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ctl hover:bg-hov"
                    >
                      <span className="w-[70px] shrink-0 text-[11px] text-tx3">
                        {o.kind === 'PAPER'
                          ? 'Paper'
                          : o.kind === 'DOCUMENT'
                            ? 'Document'
                            : 'Depends on'}
                      </span>
                      <span className="truncate">
                        {o.kind === 'TASK' ? `${o.detail} ` : ''}
                        {o.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <section
          aria-label="Activity"
          className="rounded-xl border border-bd2 bg-card px-3 py-2.5 text-ctl text-tx3"
        >
          Comments and notifications arrive with project communication (Phase
          05). Nothing here is sent to collaborators.
        </section>
      </div>
    </aside>
  );
}
