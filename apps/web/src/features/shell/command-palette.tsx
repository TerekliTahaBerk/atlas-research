'use client';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  BookOpen,
  FileCode,
  FileText,
  ListTodo,
  Search,
  Sparkles,
  SunMoon,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalTitle,
} from '@/components/atlas/overlay';
import { useAtlas } from '@/features/atlas-ai/atlas-provider';
import { papers } from '@/lib/preview/research';
import { documents, tasks } from '@/lib/preview/workspace';
import { usePlatformOptional } from '@/features/platform/platform-context';
import { allDestinations, moduleHref } from './navigation';
interface Result {
  id: string;
  group: string;
  label: string;
  sub?: string;
  icon: LucideIcon;
  run: () => void;
}
/**
 * ⌘K command palette (handoff `CommandPalette`, 580px). Searches pages and
 * sample fixtures locally; "Ask Atlas" hands off to the shared AI layer
 * rather than duplicating it.
 */
export function CommandPalette({
  open,
  onOpenChange,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocus: () => void;
}) {
  const router = useRouter();
  const platform = usePlatformOptional();
  const atlas = useAtlas();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listId = useId();
  const navigated = useRef(false);
  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    const has = (s: string) => !q || s.toLowerCase().includes(q);
    const go = (href: string) => () => router.push(href);
    const out: Result[] = [];
    if (platform) {
      for (const item of [
        { id: 'home', name: 'Home', href: '/app/home' },
        { id: 'settings', name: 'Settings', href: '/app/settings/profile' },
        ...platform.workspaces.map((w) => ({
          id: w.id,
          name: w.name,
          href: `/app/workspaces/${w.id}`,
        })),
        ...platform.projects.map((p) => ({
          id: p.id,
          name: p.name,
          href: `/app/projects/${p.id}/overview`,
        })),
      ]) {
        if (has(item.name))
          out.push({
            id: item.id,
            group: 'Navigation',
            label: item.name,
            icon: FileText,
            run: () => window.location.assign(item.href),
          });
      }
      return out;
    }
    allDestinations
      .filter((d) => has(d.label))
      .slice(0, q ? 8 : 5)
      .forEach((d) =>
        out.push({
          id: `page-${d.href}`,
          group: 'Pages',
          label: d.label,
          icon: d.icon,
          run: go(d.href),
        }),
      );
    papers
      .filter((p) => has(p.title) || has(p.short))
      .slice(0, 3)
      .forEach((p) =>
        out.push({
          id: p.id,
          group: 'Papers',
          label: p.title,
          sub: p.short,
          icon: BookOpen,
          run: go(moduleHref('library', `paper=${p.id}`)),
        }),
      );
    documents
      .filter((d) => has(d.title))
      .forEach((d) =>
        out.push({
          id: d.id,
          group: 'Documents',
          label: d.title,
          sub: d.kind,
          icon: FileText,
          run: go(moduleHref('documents', `doc=${d.id}`)),
        }),
      );
    tasks
      .filter((t) => has(`${t.id} ${t.title}`))
      .slice(0, 3)
      .forEach((t) =>
        out.push({
          id: t.id,
          group: 'Tasks',
          label: `${t.id} ${t.title}`,
          icon: ListTodo,
          run: go(moduleHref('tasks', `task=${t.id}`)),
        }),
      );
    out.push(
      {
        id: 'ask',
        group: 'Actions',
        label: q ? `Ask Atlas: “${query.trim()}”` : 'Ask Atlas…',
        sub: '⌘J',
        icon: Sparkles,
        run: () => atlas.ask({ mode: 'focus', draft: query.trim() }),
      },
      {
        id: 'new-ms',
        group: 'Actions',
        label: 'Open manuscript',
        icon: FileCode,
        run: go(moduleHref('manuscripts')),
      },
      {
        id: 'theme',
        group: 'Actions',
        label: 'Toggle light / dark',
        icon: SunMoon,
        run: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
      },
    );
    return out;
  }, [atlas, query, resolvedTheme, router, setTheme, platform]);
  const active = Math.min(index, Math.max(0, results.length - 1));
  function run(r: Result | undefined) {
    if (!r) return;
    navigated.current = r.group !== 'Actions' || r.id === 'new-ms';
    onOpenChange(false);
    r.run();
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex(
        (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) %
          results.length,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(results[active]);
    }
  }
  const groups = Array.from(new Set(results.map((r) => r.group)));
  const pageMatches = results.filter((r) => r.group !== 'Actions').length;
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setQuery('');
          setIndex(0);
          navigated.current = false;
        }
        onOpenChange(next);
      }}
    >
      <ModalContent
        position="top"
        className="w-[min(580px,calc(100vw-32px))] overflow-hidden rounded-2xl"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (!navigated.current) returnFocus();
        }}
      >
        <ModalTitle className="sr-only">Search Atlas</ModalTitle>
        <ModalDescription className="sr-only">
          Search pages and sample papers, documents and tasks. Use the arrow
          keys and Enter.
        </ModalDescription>
        <div className="flex h-12 items-center gap-2.5 border-b border-bd2 px-3.5">
          <Search aria-hidden="true" className="size-4 text-tx3" />
          <input
            role="combobox"
            aria-label="Search Atlas"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={
              results[active] ? `${listId}-${results[active].id}` : undefined
            }
            value={query}
            autoFocus
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={onKey}
            placeholder="Search papers, documents, tasks, people…"
            className="flex-1 text-sm"
          />
          <span className="rounded-xs border border-bd px-[5px] py-px text-[11px] text-tx3">
            esc
          </span>
        </div>
        <div
          id={listId}
          role="listbox"
          aria-label="Results"
          className="max-h-[380px] overflow-auto p-[5px]"
        >
          {groups.map((g) => (
            <div key={g} role="group" aria-label={g}>
              <div
                aria-hidden="true"
                className="px-2.5 pt-2 pb-1 text-[11px] text-tx3"
              >
                {g}
              </div>
              {results
                .filter((r) => r.group === g)
                .map((r) => {
                  const i = results.indexOf(r);
                  const Icon = r.icon;
                  return (
                    <div
                      key={r.id}
                      id={`${listId}-${r.id}`}
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setIndex(i)}
                      onClick={() => run(r)}
                      className={cn(
                        'flex h-[34px] cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-ui',
                        i === active && 'bg-hov',
                      )}
                    >
                      <Icon
                        aria-hidden="true"
                        className="size-[14px] shrink-0 text-tx3"
                      />
                      <span className="min-w-0 flex-1 truncate">{r.label}</span>
                      {r.sub ? (
                        <span className="text-[11.5px] text-tx3">{r.sub}</span>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          ))}
          {query && pageMatches === 0 ? (
            <p role="status" className="px-2.5 py-2 text-ctl text-tx3">
              No pages or sample items match “{query}”.
            </p>
          ) : null}
        </div>
        <div className="flex gap-3.5 border-t border-bd2 px-3.5 py-2 text-[11.5px] text-tx3">
          <span>↵ open</span>
          <span>⌘J ask Atlas</span>
          <span className="flex-1" />
          <span>Sample data</span>
        </div>
      </ModalContent>
    </Modal>
  );
}
