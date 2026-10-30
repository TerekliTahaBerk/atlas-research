'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, ListTodo } from 'lucide-react';
import {
  taskStatusLabels,
  type DocumentSummaryDto,
  type ProjectDto,
  type TaskDto,
} from '@atlas/core';
import { fetchDocuments, fetchTasks } from '@/features/artifacts/client';

/** Project overview: the actor's authorized recent documents and open tasks. */
export function ProjectWork({ project }: { project: ProjectDto }) {
  return <ProjectWorkContent key={project.id} project={project} />;
}

function ProjectWorkContent({ project }: { project: ProjectDto }) {
  const [docs, setDocs] = useState<DocumentSummaryDto[] | null>(null);
  const [tasks, setTasks] = useState<TaskDto[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchDocuments(project.id),
      fetchTasks(project.id, { sort: 'updated' }),
    ])
      .then(([d, t]) => {
        if (!alive) return;
        setDocs(d.items.slice(0, 5));
        setTasks(
          t.items
            .filter((x) => x.status !== 'DONE' && x.status !== 'CANCELLED')
            .slice(0, 5),
        );
      })
      .catch(() => alive && setError('Recent work could not be loaded.'));
    return () => {
      alive = false;
    };
  }, [project.id]);
  if (error) return <p className="mt-6 text-xs text-danger">{error}</p>;
  return (
    <div className="mt-8 grid max-w-[920px] gap-4 md:grid-cols-2">
      <section
        aria-label="Recent documents"
        className="rounded-2xl border border-bd2 bg-card p-4"
      >
        <h2 className="mb-2 font-serif text-xl">Recent documents</h2>
        {docs === null ? (
          <p className="text-ctl text-tx3">Loading…</p>
        ) : !docs.length ? (
          <p className="text-ctl text-tx3">No documents yet.</p>
        ) : (
          <ul>
            {docs.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/app/projects/${project.id}/documents?doc=${d.id}`}
                  className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-ctl hover:bg-hov"
                >
                  <FileText aria-hidden="true" className="size-3.5 text-tx3" />
                  <span className="truncate">{d.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section
        aria-label="Open tasks"
        className="rounded-2xl border border-bd2 bg-card p-4"
      >
        <h2 className="mb-2 font-serif text-xl">Open tasks</h2>
        {tasks === null ? (
          <p className="text-ctl text-tx3">Loading…</p>
        ) : !tasks.length ? (
          <p className="text-ctl text-tx3">No open tasks.</p>
        ) : (
          <ul>
            {tasks.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/app/projects/${project.id}/tasks?task=${t.id}`}
                  className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-ctl hover:bg-hov"
                >
                  <ListTodo aria-hidden="true" className="size-3.5 text-tx3" />
                  <span className="font-mono text-[11px] text-tx3">
                    #{t.number}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="text-[11px] text-tx3">
                    {taskStatusLabels[t.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
