'use client';
import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, FileText, ListTodo, Search } from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import {
  SNIPPET_END,
  SNIPPET_START,
  type ArtifactKind,
  type SearchHit,
} from '@atlas/core';
import { Segmented } from '@/components/atlas/segmented';
import { searchProject } from './client';

const icons = { PAPER: BookOpen, DOCUMENT: FileText, TASK: ListTodo };
/** Renders bounded plain-text snippets; markers become <mark>, never HTML. */
export function Snippet({ text }: { text: string }) {
  const parts = text.split(
    new RegExp(`(${SNIPPET_START}[^${SNIPPET_END}]*${SNIPPET_END})`),
  );
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith(SNIPPET_START) ? (
          <mark key={i} className="rounded-[2px] bg-acs text-actx">
            {part.slice(1, -1)}
          </mark>
        ) : (
          <span key={i}>
            {part.replaceAll(SNIPPET_START, '').replaceAll(SNIPPET_END, '')}
          </span>
        ),
      )}
    </>
  );
}

/** Project-scoped search over saved papers, documents and tasks. */
export function ArtifactSearch({ projectId }: { projectId: string }) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'ALL' | ArtifactKind>('ALL');
  const [result, setResult] = useState<{
    key: string;
    items: SearchHit[];
    next: string | null;
    error: string;
  } | null>(null);
  const [active, setActive] = useState(0);
  const q = query.trim();
  const key = `${q}|${kind}`;
  useEffect(() => {
    if (!q) return;
    let alive = true;
    const timer = setTimeout(() => {
      searchProject(projectId, { q, ...(kind === 'ALL' ? {} : { kind }) })
        .then(
          (page) =>
            alive &&
            setResult({
              key,
              items: page.items,
              next: page.nextCursor,
              error: '',
            }),
        )
        .catch(
          (e: unknown) =>
            alive &&
            setResult({
              key,
              items: [],
              next: null,
              error: e instanceof Error ? e.message : 'Search failed.',
            }),
        );
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [key, kind, projectId, q]);
  const current = q && result?.key === key ? result : null;
  const loading = !!q && !current;
  const items = current?.items ?? [];
  const index = Math.min(active, Math.max(0, items.length - 1));
  return (
    <section aria-label="Search project" className="mb-6 max-w-[720px]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-9 min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-bd bg-el px-3">
          <Search aria-hidden="true" className="size-[14px] text-tx3" />
          <input
            role="combobox"
            aria-label="Search papers, documents and tasks"
            aria-expanded={!!q}
            aria-controls={listId}
            aria-activedescendant={
              items[index] ? `${listId}-${index}` : undefined
            }
            value={query}
            placeholder="Search papers, documents and tasks…"
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (items.length)
                  setActive(
                    (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) %
                      items.length,
                  );
              } else if (e.key === 'Enter' && items[index]) {
                e.preventDefault();
                router.push(items[index].href);
              } else if (e.key === 'Escape') setQuery('');
            }}
            className="min-w-0 flex-1 bg-transparent text-ui outline-none"
          />
        </div>
        <Segmented
          label="Result type"
          size="sm"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'PAPER', label: 'Papers' },
            { value: 'DOCUMENT', label: 'Documents' },
            { value: 'TASK', label: 'Tasks' },
          ]}
        />
      </div>
      {q ? (
        <div className="mt-2 rounded-xl border border-bd2 bg-card">
          <p role="status" className="sr-only">
            {loading
              ? 'Searching'
              : current?.error
                ? current.error
                : `${items.length} results`}
          </p>
          {current?.error ? (
            <p role="alert" className="p-3 text-ctl text-danger">
              {current.error}
            </p>
          ) : loading ? (
            <p className="p-3 text-ctl text-tx3">Searching…</p>
          ) : !items.length ? (
            <p className="p-3 text-ctl text-tx3">
              No matching research artifacts in this project.
            </p>
          ) : (
            <ul
              id={listId}
              role="listbox"
              aria-label="Search results"
              className="p-1"
            >
              {items.map((hit, i) => {
                const Icon = icons[hit.kind];
                return (
                  <li
                    key={hit.artifactId}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === index}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => router.push(hit.href)}
                    className={cn(
                      'flex cursor-pointer gap-2.5 rounded-lg px-2.5 py-2',
                      i === index && 'bg-hov',
                    )}
                  >
                    <Icon
                      aria-hidden="true"
                      className="mt-0.5 size-[14px] shrink-0 text-tx3"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ui font-medium">
                        {hit.title}
                      </span>
                      <span className="block text-[11.5px] text-tx3">
                        {hit.detail} ·{' '}
                        {new Date(hit.updatedAt).toLocaleDateString('en-US')}
                      </span>
                      {hit.snippet ? (
                        <span className="mt-0.5 block text-ctl leading-[1.5] text-tx2">
                          <Snippet text={hit.snippet} />
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {current?.next ? (
            <button
              type="button"
              className="w-full border-t border-bd2 p-2 text-ctl text-tx2 hover:bg-hov"
              onClick={() =>
                void searchProject(projectId, {
                  q,
                  cursor: current.next!,
                  ...(kind === 'ALL' ? {} : { kind }),
                }).then((page) =>
                  setResult(
                    (prev) =>
                      prev && {
                        ...prev,
                        items: [...prev.items, ...page.items],
                        next: page.nextCursor,
                      },
                  ),
                )
              }
            >
              Show more results
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
