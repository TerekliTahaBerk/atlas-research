'use client';
import { useState, type DragEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRightLeft,
  ArrowUp,
  BookOpen,
  ChevronDown,
  CircleDashed,
  Columns3,
  FileCode,
  FileText,
  List,
  ListFilter,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import { Btn, IconBtn } from '@/components/atlas/button';
import { Avatar, Dot, SampleTag } from '@/components/atlas/chips';
import {
  Menu,
  MenuContent,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from '@/components/atlas/overlay';
import { Segmented } from '@/components/atlas/segmented';
import { useToast } from '@/components/atlas/toast';
import { useAtlas } from '@/features/atlas-ai/atlas-provider';
import { AtlasAnchor } from '@/features/atlas-ai/atlas-surface';
import { moduleHref } from '@/features/shell/navigation';
import { usePreviewStore } from '@/features/shell/preview-store';
import { Topbar } from '@/features/shell/topbar';
import { people } from '@/lib/preview/people';
import {
  labelColors,
  milestones,
  taskColumns,
  type SampleTask,
  type TaskStatus,
} from '@/lib/preview/workspace';
import { PriorityIcon, TaskStatusIcon, statusLabel } from './task-icons';
/**
 * Tasks (handoff §6 "Tasks"): board/list, drag between columns, detail
 * panel with AI milestones. Status changes are in-memory demonstrations.
 */
export function TasksScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const store = usePreviewStore();
  const flash = useToast();
  const atlas = useAtlas();
  const empty = params.get('demo') === 'empty';
  const taskId = params.get('task');
  const [view, setView] = useState<'board' | 'list'>('board');
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [plan, setPlan] = useState<'none' | 'ready'>('none');
  const [comment, setComment] = useState('');
  const tasks = empty ? [] : store.tasks;
  const current = tasks.find((t) => t.id === taskId) ?? null;
  const open = (id: string | null) => {
    setPlan('none');
    router.replace(
      id ? moduleHref('tasks', `task=${id}`) : moduleHref('tasks'),
      { scroll: false },
    );
  };
  const move = (id: string, status: TaskStatus) => {
    const t = store.tasks.find((x) => x.id === id);
    if (!t || t.status === status) return;
    store.moveTask(id, status);
    flash(`${id} moved to ${statusLabel(status)} · in-memory preview`, 'done');
  };
  const onDrop = (e: DragEvent, status: TaskStatus) => {
    e.preventDefault();
    const id = dragging ?? e.dataTransfer.getData('text/plain');
    if (id) move(id, status);
    setDragging(null);
    setOver(null);
  };
  const planWithAtlas = () =>
    atlas.ask({
      mode: 'focus',
      draft: '/create-task plan the remaining work for the NeurIPS draft',
    });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar />
      <AtlasAnchor placement="canvas" />
      <div className="flex flex-wrap items-center gap-2 px-5 pt-[calc(44px+var(--aic))] pb-3 max-sm:px-4">
        <span className="mb-[-2px] w-full text-xs text-tx3">
          Sparse Evoformer
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
        <Btn
          variant="ghost"
          size="md"
          onClick={() => flash('Task filters are UI-only in this preview')}
        >
          <ListFilter aria-hidden="true" className="!size-3" />
          Filter
        </Btn>
        <span className="text-[11.5px] text-tx3 max-sm:hidden">
          Sample tasks · changes stay in this tab
        </span>
        <span className="flex-1" />
        <Btn variant="ai" onClick={planWithAtlas}>
          <Sparkles aria-hidden="true" />
          Plan with Atlas
        </Btn>
        <Btn
          variant="primary"
          onClick={() =>
            flash('Task creation is a preview — nothing was created')
          }
        >
          <Plus aria-hidden="true" />
          New task
        </Btn>
      </div>
      <div className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto px-5 pt-1 pb-[30px] max-sm:px-4">
          {view === 'board' ? (
            <>
              <div className="flex min-w-max items-start gap-3">
                {taskColumns.map((col) => {
                  const items = tasks.filter((t) => t.status === col.key);
                  const target = over === col.key && dragging;
                  return (
                    <section
                      key={col.key}
                      aria-label={`${col.label} · ${items.length}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (over !== col.key) setOver(col.key);
                      }}
                      onDragLeave={() =>
                        setOver((o) => (o === col.key ? null : o))
                      }
                      onDrop={(e) => onDrop(e, col.key)}
                      className={cn(
                        'flex min-h-[240px] w-[268px] shrink-0 flex-col gap-1.5 rounded-xl px-1 pb-2 outline-1 outline-dashed transition-colors',
                        target ? 'bg-acs outline-aiib' : 'outline-transparent',
                      )}
                    >
                      <div className="flex h-[30px] items-center gap-[7px] px-1 text-ctl">
                        <TaskStatusIcon status={col.key} />
                        <h2 className="font-medium">{col.label}</h2>
                        <span className="text-tx3">{items.length}</span>
                        <span className="flex-1" />
                        <IconBtn
                          label={`New task in ${col.label}`}
                          size="sm"
                          tone="muted"
                          onClick={() =>
                            flash(
                              'Task creation is a preview — nothing was created',
                            )
                          }
                        >
                          <Plus aria-hidden="true" className="size-[13px]" />
                        </IconBtn>
                      </div>
                      {items.map((t) => (
                        <TaskCard
                          key={t.id}
                          task={t}
                          selected={t.id === taskId}
                          dragging={dragging === t.id}
                          onOpen={() => open(t.id)}
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
                          Drop tasks here
                        </div>
                      ) : null}
                    </section>
                  );
                })}
              </div>
              {empty ? (
                <div className="mt-[18px] flex max-w-[720px] items-center gap-3 rounded-xl border border-aiib bg-acs px-4 py-3.5">
                  <Sparkles aria-hidden="true" className="size-4 text-actx" />
                  <div className="flex-1 text-ctl">
                    <div className="font-medium">
                      No tasks in this project yet
                    </div>
                    <div className="text-tx2">
                      Atlas can draft a sample plan from your manuscript outline
                      and deadlines.
                    </div>
                  </div>
                  <Btn variant="primary" onClick={planWithAtlas}>
                    Plan with Atlas
                  </Btn>
                </div>
              ) : null}
            </>
          ) : (
            taskColumns.map((col) => {
              const items = tasks.filter((t) => t.status === col.key);
              return (
                <section key={col.key} aria-label={col.label}>
                  <div className="mt-2 flex h-[34px] items-center gap-[7px] rounded-md bg-card px-2.5 text-ctl">
                    <TaskStatusIcon status={col.key} />
                    <h2 className="font-medium">{col.label}</h2>
                    <span className="text-tx3">{items.length}</span>
                  </div>
                  <ul>
                    {items.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => open(t.id)}
                          className="flex h-[38px] w-full items-center gap-3 border-b border-bd2 px-2.5 text-left hover:bg-card"
                        >
                          <PriorityIcon
                            priority={t.priority}
                            className="size-[13px]"
                          />
                          <span className="w-[52px] font-mono text-[11px] text-tx3">
                            {t.id}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {t.title}
                          </span>
                          {t.labels.map((l) => (
                            <span
                              key={l}
                              className="inline-flex items-center gap-[5px] text-[11.5px] text-tx3 max-sm:hidden"
                            >
                              <Dot color={labelColors[l]} />
                              {l}
                            </span>
                          ))}
                          <Avatar person={people[t.assignee]} size={20} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </div>
        {current ? (
          <aside
            aria-label={`Task ${current.id}`}
            className="flex w-[min(420px,46%)] shrink-0 flex-col border-l border-bd2 bg-canvas max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-40 max-md:w-[min(420px,100%)] max-md:shadow-pop"
          >
            <div className="flex items-center gap-1.5 border-b border-bd2 px-3 py-2.5">
              <span className="flex-1 font-mono text-[11.5px] text-tx3">
                {current.id}
              </span>
              <IconBtn
                label="Close task"
                size="base"
                onClick={() => open(null)}
              >
                <X aria-hidden="true" className="size-[14px]" />
              </IconBtn>
            </div>
            <div className="flex-1 overflow-auto px-[18px] pt-4 pb-5">
              <h2 className="mb-3.5 font-serif text-2xl leading-[1.15] font-medium">
                {current.title}
              </h2>
              <dl className="mb-[18px] grid grid-cols-[90px_1fr] items-center gap-x-2.5 gap-y-[9px] text-ctl">
                <dt className="text-tx3">Status</dt>
                <dd>
                  <Menu>
                    <MenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Status: ${statusLabel(current.status)}`}
                        className="-ml-1.5 flex h-6 items-center gap-1.5 rounded-sm px-1.5 hover:bg-hov"
                      >
                        <TaskStatusIcon
                          status={current.status}
                          className="size-[13px]"
                        />
                        {statusLabel(current.status)}
                        <ChevronDown
                          aria-hidden="true"
                          className="size-3 text-tx3"
                        />
                      </button>
                    </MenuTrigger>
                    <MenuContent width={200} align="start">
                      <MenuRadioGroup
                        value={current.status}
                        onValueChange={(v) => move(current.id, v as TaskStatus)}
                      >
                        {taskColumns.map((c) => (
                          <MenuRadioItem
                            key={c.key}
                            value={c.key}
                            icon={<TaskStatusIcon status={c.key} />}
                          >
                            {c.label}
                          </MenuRadioItem>
                        ))}
                      </MenuRadioGroup>
                    </MenuContent>
                  </Menu>
                </dd>
                <dt className="text-tx3">Priority</dt>
                <dd className="flex items-center gap-1.5">
                  <PriorityIcon
                    priority={current.priority}
                    className="size-[13px] text-tx2"
                  />
                  {current.priority}
                </dd>
                <dt className="text-tx3">Assignee</dt>
                <dd className="flex items-center gap-1.5">
                  <Avatar person={people[current.assignee]} size={18} />
                  {people[current.assignee].name}
                </dd>
                <dt className="text-tx3">Labels</dt>
                <dd className="flex gap-1.5">
                  {current.labels.map((l) => (
                    <span
                      key={l}
                      className="inline-flex h-5 items-center gap-[5px] rounded-[10px] border border-bd2 px-[7px] text-[11.5px]"
                    >
                      <Dot color={labelColors[l]} />
                      {l}
                    </span>
                  ))}
                </dd>
                <dt className="text-tx3">Due</dt>
                <dd>Oct 30 · NeurIPS internal deadline</dd>
              </dl>
              <h3 className="mb-1.5 text-[11.5px] text-tx3">Description</h3>
              <p className="mb-4 font-read text-sm leading-[1.65] text-tx2">
                Draft the method section from the routing notes. Define the
                block mask M before Eq. 1 and report the sweep from run_14 in
                Table 1.
              </p>
              <h3 className="mb-1.5 text-[11.5px] text-tx3">Linked</h3>
              <div className="mb-[18px] flex flex-wrap gap-1.5">
                <LinkChip
                  href={moduleHref('library', 'paper=p1')}
                  icon={BookOpen}
                >
                  Okafor et al., 2024
                </LinkChip>
                <LinkChip
                  href={moduleHref('documents', 'doc=d1')}
                  icon={FileText}
                >
                  Related work — sparse attention
                </LinkChip>
                <LinkChip href={moduleHref('manuscripts')} icon={FileCode}>
                  main.tex §3
                </LinkChip>
              </div>
              <section
                aria-label="Atlas planning"
                className="mb-[18px] rounded-xl border border-bd2 bg-card"
              >
                <div className="flex items-center gap-2 px-3 py-[9px] text-ctl">
                  <Sparkles
                    aria-hidden="true"
                    className="size-[13px] text-actx"
                  />
                  <span className="font-medium">Atlas planning</span>
                  <span className="flex-1" />
                  {plan === 'none' ? (
                    <Btn
                      variant="subtle"
                      size="sm"
                      onClick={() => setPlan('ready')}
                    >
                      Break into milestones
                    </Btn>
                  ) : null}
                </div>
                {plan === 'ready' ? (
                  <>
                    <ul className="px-3 pb-1.5">
                      {milestones.map((m) => (
                        <li
                          key={m.title}
                          className="flex items-center gap-2 border-t border-bd2 py-1.5 text-ctl"
                        >
                          <CircleDashed
                            aria-hidden="true"
                            className="size-3 text-tx3"
                          />
                          <span className="flex-1">{m.title}</span>
                          <span className="text-[11px] text-tx3">{m.due}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex items-center gap-1.5 px-3 pt-1 pb-3">
                      <Btn
                        variant="primary"
                        size="md"
                        onClick={() => {
                          setPlan('none');
                          flash(
                            'Adding subtasks is a preview — nothing was created',
                          );
                        }}
                      >
                        Add as subtasks
                      </Btn>
                      <Btn
                        variant="ghost"
                        size="md"
                        onClick={() =>
                          flash(
                            'Regenerating needs a model — this is the sample plan',
                          )
                        }
                      >
                        Regenerate
                      </Btn>
                      <span className="flex-1" />
                      <SampleTag>Sample plan</SampleTag>
                    </div>
                  </>
                ) : null}
              </section>
              <h3 className="mb-2 text-[11.5px] text-tx3">Activity</h3>
              <div className="mb-2.5 flex gap-2 text-ctl">
                <Avatar person={people.ayse} size={20} />
                <div>
                  <span className="font-medium">Ayşe</span>{' '}
                  <span className="text-tx3">· 2h</span>
                  <p className="text-tx2">
                    Happy to review once Table 1 is in. Ping me in
                    #sparse-evoformer.
                  </p>
                </div>
              </div>
              <div className="mb-3 flex gap-2 text-xs text-tx3">
                <ArrowRightLeft
                  aria-hidden="true"
                  className="mx-1 mt-0.5 size-3"
                />
                Taha moved this from Backlog to In progress · yesterday
              </div>
              <form
                className="flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  setComment('');
                  flash('Comments are a preview — nothing was posted');
                }}
              >
                <label htmlFor="task-comment" className="sr-only">
                  Leave a comment
                </label>
                <input
                  id="task-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Leave a comment… use @ to mention"
                  className="h-8 min-w-0 flex-1 rounded-[7px] border border-bd px-2.5 text-ctl"
                />
                <button
                  type="submit"
                  aria-label="Post comment"
                  className="grid size-8 place-items-center rounded-[7px] bg-el hover:bg-hov"
                >
                  <ArrowUp aria-hidden="true" className="size-[14px]" />
                </button>
              </form>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
function TaskCard({
  task: t,
  selected,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  task: SampleTask;
  selected: boolean;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'relative flex cursor-grab flex-col gap-2 rounded-lg border bg-card px-[11px] py-2.5 transition-opacity hover:border-bd',
        selected ? 'border-tx3' : 'border-bd2',
        dragging && 'opacity-40',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="flex-1 font-mono text-[11px] text-tx3">{t.id}</span>
        <PriorityIcon priority={t.priority} className="size-[13px]" />
        <Avatar person={people[t.assignee]} size={20} />
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="text-left text-ui leading-[1.4] after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-ac"
      >
        {t.title}
      </button>
      <div className="flex items-center gap-2 text-[11.5px] text-tx3">
        {t.labels.map((l) => (
          <span
            key={l}
            className="inline-flex h-5 items-center gap-[5px] rounded-[10px] border border-bd2 px-[7px]"
          >
            <Dot color={labelColors[l]} />
            {l}
          </span>
        ))}
        <span className="flex-1" />
        {t.linkedPapers ? (
          <span className="inline-flex items-center gap-[3px]">
            <BookOpen aria-hidden="true" className="size-[11px]" />
            {t.linkedPapers}
            <span className="sr-only">linked papers</span>
          </span>
        ) : null}
        {t.linkedDocs ? (
          <span className="inline-flex items-center gap-[3px]">
            <FileText aria-hidden="true" className="size-[11px]" />
            {t.linkedDocs}
            <span className="sr-only">linked documents</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
function LinkChip({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: typeof BookOpen;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-6 items-center gap-[5px] rounded-sm border border-bd2 bg-el px-2 text-xs hover:bg-hov"
    >
      <Icon aria-hidden="true" className="size-3 text-tx3" />
      {children}
    </Link>
  );
}
