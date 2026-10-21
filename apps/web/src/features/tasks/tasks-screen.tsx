'use client';
import { useState } from 'react';
import {
  Circle,
  CircleDot,
  CircleCheck,
  ArrowUp,
  Calendar,
  Sparkles,
  FileText,
} from 'lucide-react';
import { Button } from '@atlas/ui/components/button';
import { Badge } from '@atlas/ui/components/badge';
import { Input } from '@atlas/ui/components/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@atlas/ui/components/dialog';
import { PageHeader } from '@/components/page-header';
import {
  CreatePreview,
  PreviewNotice,
  ViewToggle,
  CapabilityButton,
} from '@/features/preview/primitives';
import {
  taskSamples,
  type PreviewTask,
  type TaskStatus,
} from '@/features/preview/fixtures';
import { useAtlas } from '@/features/atlas-ai/atlas-provider';
const statuses: readonly TaskStatus[] = ['To do', 'In progress', 'Done'];
export function TaskStatusLabel({ status }: { status: TaskStatus }) {
  const Icon =
    status === 'Done'
      ? CircleCheck
      : status === 'In progress'
        ? CircleDot
        : Circle;
  return (
    <span className="task-status">
      <Icon aria-hidden="true" />
      {status}
    </span>
  );
}
export function TaskPriority({
  priority,
}: {
  priority: PreviewTask['priority'];
}) {
  return (
    <span className="task-priority">
      <ArrowUp aria-hidden="true" />
      {priority}
    </span>
  );
}
export function TasksScreen() {
  const [tasks, setTasks] = useState<PreviewTask[]>([...taskSamples]);
  const [view, setView] = useState('Board');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [activeId, setActiveId] = useState<string | null>(null);
  const { openAssistant } = useAtlas();
  const active = tasks.find((task) => task.id === activeId);
  const filtered = tasks.filter(
    (task) =>
      task.title.toLowerCase().includes(query.toLowerCase()) &&
      (filter === 'All' || task.status === filter),
  );
  function update(status: TaskStatus) {
    setTasks((prev) =>
      prev.map((task) => (task.id === activeId ? { ...task, status } : task)),
    );
  }
  const taskCard = (task: PreviewTask) => (
    <button
      className="task-card"
      key={task.id}
      onClick={() => setActiveId(task.id)}
    >
      <span className="metadata">
        SAMPLE-{task.id.split('-')[1]?.toUpperCase()}
      </span>
      <strong>{task.title}</strong>
      <TaskPriority priority={task.priority} />
      <span className="task-card-footer">
        <span>
          <Calendar aria-hidden="true" />
          {task.due}
        </span>
        <span className="avatar-initials">{task.assignee}</span>
      </span>
    </button>
  );
  return (
    <div>
      <div className="module-heading-row">
        <PageHeader
          title="Tasks"
          description="Move your research forward, one thoughtful step at a time."
        />
        <CreatePreview kind="task" />
      </div>
      <PreviewNotice phase="04">
        Local task board · status changes reset when you leave. No assignments
        or notifications are sent.
      </PreviewNotice>
      <div className="collection-toolbar">
        <Input
          aria-label="Filter tasks"
          placeholder="Find a research task…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="sr-only" htmlFor="task-filter">
          Status filter
        </label>
        <select
          id="task-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option>All</option>
          {statuses.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
        <ViewToggle
          value={view}
          onChange={setView}
          options={['Board', 'List']}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            openAssistant({ context: 'tasks', prompt: '/subtasks' })
          }
        >
          <Sparkles data-icon="inline-start" />
          Plan with Atlas
        </Button>
      </div>
      {view === 'Board' ? (
        <div className="task-board">
          {statuses.map((status) => (
            <section className="task-column" key={status}>
              <header>
                <TaskStatusLabel status={status} />
                <Badge variant="secondary">
                  {filtered.filter((task) => task.status === status).length}
                </Badge>
              </header>
              {filtered.filter((task) => task.status === status).map(taskCard)}
              {!filtered.some((task) => task.status === status) ? (
                <p className="empty-inline">
                  No matching tasks in this column.
                </p>
              ) : null}
            </section>
          ))}
        </div>
      ) : (
        <div className="task-list">
          {filtered.map((task) => (
            <div key={task.id}>
              {taskCard(task)}
              <TaskStatusLabel status={task.status} />
            </div>
          ))}
        </div>
      )}
      {!filtered.length ? (
        <p role="status" className="empty-inline">
          No sample tasks match this filter.
        </p>
      ) : null}
      <Dialog
        open={Boolean(active)}
        onOpenChange={(open) => {
          if (!open) setActiveId(null);
        }}
      >
        <DialogContent>
          {active ? (
            <>
              <DialogHeader>
                <DialogTitle>{active.title}</DialogTitle>
                <DialogDescription>
                  Local task detail · synthetic team and dates
                </DialogDescription>
              </DialogHeader>
              <TaskPriority priority={active.priority} />
              <p>{active.description}</p>
              <label htmlFor="task-status">Status</label>
              <select
                id="task-status"
                value={active.status}
                onChange={(e) => {
                  const next = statuses.find((s) => s === e.target.value);
                  if (next) update(next);
                }}
              >
                {statuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
              <dl className="task-detail-metadata">
                <dt>Assignee</dt>
                <dd>{active.assignee} · sample researcher</dd>
                <dt>Due</dt>
                <dd>{active.due}</dd>
                <dt>Linked artifact</dt>
                <dd>
                  <FileText aria-hidden="true" />
                  Literature review
                </dd>
              </dl>
              <h3>Subtasks</h3>
              <label className="checkbox-line">
                <input type="checkbox" />
                Read the sample note (local checkbox)
              </label>
              <h3>Comments</h3>
              <p className="muted">
                Comments will remain connected to the task and its sources.
              </p>
              <CapabilityButton title="Add task comment" phase="04">
                Add comment
              </CapabilityButton>
              <Button
                variant="secondary"
                onClick={() => {
                  setActiveId(null);
                  openAssistant({
                    context: 'tasks',
                    references: [
                      { id: active.id, kind: 'task', title: active.title },
                    ],
                  });
                }}
              >
                Ask Atlas about task
              </Button>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
