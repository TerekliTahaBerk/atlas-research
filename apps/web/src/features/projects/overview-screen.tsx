'use client';
import Link from 'next/link';
import {
  BookOpen,
  CalendarClock,
  FileCode,
  FileText,
  FlaskConical,
  Hash,
  Waypoints,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import { Avatar, SampleTag } from '@/components/atlas/chips';
import {
  AtlasAnchor,
  ContextualAITrigger,
} from '@/features/atlas-ai/atlas-surface';
import { SharePopover } from '@/features/overlays/share-popover';
import { moduleHref, resolveHref } from '@/features/shell/navigation';
import { usePreviewStore } from '@/features/shell/preview-store';
import { Crumb, Topbar } from '@/features/shell/topbar';
import { TaskStatusIcon } from '@/features/tasks/task-icons';
import { projectTeam } from '@/lib/preview/extras';
import { people } from '@/lib/preview/people';
import { projectActivity, projectPhases } from '@/lib/preview/workspace';
const assets = [
  { icon: BookOpen, n: 14, label: 'Papers', href: moduleHref('library') },
  {
    icon: FileText,
    n: 6,
    label: 'Documents',
    href: moduleHref('documents', 'doc=d1'),
  },
  {
    icon: FileCode,
    n: 1,
    label: 'Manuscript',
    href: moduleHref('manuscripts'),
  },
  {
    icon: FlaskConical,
    n: 3,
    label: 'Notebooks',
    href: moduleHref('experiments'),
  },
  { icon: Hash, n: 2, label: 'Channels', href: moduleHref('channels') },
  { icon: Waypoints, n: 27, label: 'Links', href: moduleHref('graph') },
];
/** Project overview (prototype "overview"): an active research workspace. */
export function OverviewScreen() {
  const { tasks } = usePreviewStore();
  const done = tasks.filter((t) => t.status === 'done').length;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar actions={<SharePopover resource="Sparse Evoformer" />}>
        <Crumb parent="Projects" title="Sparse Evoformer" as="span" />
      </Topbar>
      <AtlasAnchor placement="canvas" />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="max-w-[1120px] px-8 pt-[calc(52px+var(--aic))] pb-20 max-sm:px-4">
          <div className="mb-1.5 text-xs text-tx3">
            Project · Kaya Lab · sample
          </div>
          <div className="mb-2 flex flex-wrap items-end gap-4">
            <h1 className="min-w-[280px] flex-1 font-serif text-[42px] leading-[1.05] font-medium max-sm:min-w-0 max-sm:basis-full max-sm:text-[34px]">
              Sparse Evoformer
            </h1>
            <div className="flex items-center gap-2.5">
              <span className="flex pl-1.5" aria-label="Team">
                {projectTeam.map((m) => (
                  <Avatar
                    key={m.id}
                    person={people[m.id]}
                    size={26}
                    ring="var(--bg)"
                    className="-ml-1.5"
                    title={`${people[m.id].name} · ${m.role}`}
                  />
                ))}
              </span>
              <ContextualAITrigger
                mode="focus"
                chips={[
                  { id: 'pr1', kind: 'project', title: 'Sparse Evoformer' },
                ]}
                prompt="What is at risk for the Oct 30 internal deadline?"
              >
                What’s at risk?
              </ContextualAITrigger>
            </div>
          </div>
          <p className="mb-7 max-w-[700px] font-read text-[15.5px] leading-[1.7] text-tx2">
            Learned block sparsity for memory-efficient structure prediction.
            Target: NeurIPS 2026 submission, internal review Nov 7.
          </p>
          <section
            aria-label="Timeline"
            className="mb-7 rounded-2xl border border-bd2 bg-card px-[18px] py-4"
          >
            <div className="mb-3.5 flex flex-wrap items-center gap-2.5 text-ctl">
              <h2 className="font-semibold">Timeline</h2>
              <span className="text-tx3">
                {done} of {tasks.length} tasks done
              </span>
              <span className="flex-1" />
              <span className="inline-flex items-center gap-[5px] text-[11.5px] text-warn">
                <CalendarClock aria-hidden="true" className="size-3" />
                Internal deadline in 8 days
              </span>
            </div>
            <ol className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-y-3">
              {projectPhases.map((p) => (
                <li key={p.label} className="flex flex-col gap-1.5 pr-3">
                  <div className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'size-2.5 shrink-0 rounded-full',
                        p.state === 'done'
                          ? 'bg-ac'
                          : p.state === 'now'
                            ? 'bg-warn'
                            : 'bg-bd',
                      )}
                    />
                    <span aria-hidden="true" className="h-px flex-1 bg-bd" />
                  </div>
                  <span
                    className={cn(
                      'text-ctl font-medium',
                      p.state === 'next' ? 'text-tx3' : 'text-tx',
                    )}
                  >
                    {p.label}
                  </span>
                  <span className="text-[11px] text-tx3">
                    {p.state === 'done'
                      ? 'Done'
                      : p.state === 'now'
                        ? 'In progress'
                        : 'Upcoming'}{' '}
                    · {p.dates}
                  </span>
                </li>
              ))}
            </ol>
          </section>
          <ul
            aria-label="Linked resources"
            className="mb-8 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5"
          >
            {assets.map((a) => (
              <li key={a.label}>
                <Link
                  href={a.href}
                  className="flex flex-col gap-2.5 rounded-xl border border-bd2 bg-card px-3.5 py-3 hover:border-bd hover:bg-el"
                >
                  <a.icon aria-hidden="true" className="size-[15px] text-tx2" />
                  <span>
                    <span className="tnum mr-1.5 text-xl font-semibold">
                      {a.n}
                    </span>
                    <span className="text-ctl text-tx2">{a.label}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] gap-8">
            <section aria-label="Recent activity">
              <h2 className="mb-2.5 flex items-center gap-2 font-serif text-2xl font-medium">
                Recent activity{' '}
                <SampleTag className="font-sans">Sample</SampleTag>
              </h2>
              <ul className="border-t border-bd2">
                {projectActivity.map((a) => (
                  <li key={a.object}>
                    <Link
                      href={resolveHref(a.href)}
                      className="flex items-center gap-2.5 border-b border-bd2 px-1 py-2.5 hover:bg-card"
                    >
                      <Avatar person={people[a.who]} size={22} />
                      <span className="min-w-0 flex-1 truncate text-ctl">
                        <span className="font-medium">
                          {people[a.who].short}
                        </span>{' '}
                        <span className="text-tx2">{a.verb}</span> {a.object}
                      </span>
                      <span className="text-[11px] text-tx3">{a.time}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-label="Next up">
              <div className="mb-2.5 flex items-center">
                <h2 className="flex-1 font-serif text-2xl font-medium">
                  Next up
                </h2>
                <Link
                  href={moduleHref('tasks')}
                  className="text-xs text-tx2 hover:text-tx"
                >
                  Board
                </Link>
              </div>
              <ul className="border-t border-bd2">
                {tasks
                  .filter((t) => t.status !== 'done')
                  .slice(0, 4)
                  .map((t) => (
                    <li key={t.id}>
                      <Link
                        href={moduleHref('tasks', `task=${t.id}`)}
                        className="flex items-center gap-2.5 border-b border-bd2 px-1 py-2.5 hover:bg-card"
                      >
                        <TaskStatusIcon status={t.status} />
                        <span className="font-mono text-[11px] text-tx3">
                          {t.id}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-ui">
                          {t.title}
                        </span>
                        <Avatar person={people[t.assignee]} size={20} />
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
