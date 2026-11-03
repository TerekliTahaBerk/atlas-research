'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AtSign,
  Bell,
  CheckCheck,
  Hash,
  ListTodo,
  Lock,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import type { NotificationDto, NotificationPageDto } from '@atlas/core';
import { Btn } from '@/components/atlas/button';
import { EmptyState, ErrorBanner } from '@/components/atlas/states';
import { Segmented } from '@/components/atlas/segmented';
import { Topbar, Crumb } from '@/features/shell/topbar';
import { communicate, fetchNotifications, fetchUnread } from './client';
import { useRealtimeTopic } from './realtime';

const icons = {
  MENTION: AtSign,
  ARTIFACT_SHARED: AtSign,
  THREAD_REPLY: MessageSquare,
  TASK_ASSIGNED: ListTodo,
  CHANNEL_ADDED: Hash,
  CHANNEL_REMOVED: Lock,
} as const;
export const INBOX_CHANGED = 'atlas:inbox-changed';

/** Unread count for the navigation badge, refreshed by the private user topic. */
export function useUnreadNotifications() {
  const [state, setState] = useState<{ unread: number; topic: string | null }>({
    unread: 0,
    topic: null,
  });
  const refresh = useCallback(() => {
    fetchUnread()
      .then((r) => setState(r))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener(INBOX_CHANGED, refresh);
    const interval = setInterval(refresh, 120000);
    return () => {
      window.removeEventListener(INBOX_CHANGED, refresh);
      clearInterval(interval);
    };
  }, [refresh]);
  useRealtimeTopic(
    state.topic,
    (event) => {
      if (
        event.event === 'notification.created' ||
        event.event === 'notification.read'
      ) {
        refresh();
        window.dispatchEvent(new CustomEvent(INBOX_CHANGED));
      }
    },
    refresh,
    undefined,
    // The count was just fetched; only re-subscriptions need a refresh.
    { skipInitialResync: true },
  );
  return state.unread;
}

/** Persistent, recipient-scoped inbox. Unavailable targets show no text. */
export function LiveInbox() {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState<NotificationPageDto | null>(null);
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const first = await fetchNotifications(undefined, filter === 'unread');
      setPage(first);
      setItems(first.items);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Notifications unavailable.');
    }
  }, [filter]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    window.addEventListener(INBOX_CHANGED, load);
    return () => window.removeEventListener(INBOX_CHANGED, load);
  }, [load]);
  const mark = async (ids: string[]) => {
    if (!ids.length) return;
    try {
      await communicate({ command: 'notification.read', ids });
      setItems((list) =>
        list.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)),
      );
      window.dispatchEvent(new CustomEvent(INBOX_CHANGED));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update.');
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar bordered>
        <Crumb as="h1" title="Inbox" />
      </Topbar>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[760px] px-6 pt-6 pb-16 max-sm:px-4">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Segmented
              label="Show"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                {
                  value: 'unread',
                  label: `Unread${page ? ` (${page.unread})` : ''}`,
                },
              ]}
            />
            <span className="flex-1" />
            <Btn
              variant="secondary"
              disabled={busy || !page?.unread}
              onClick={async () => {
                setBusy(true);
                try {
                  // Only notifications that existed when the page loaded.
                  await communicate({
                    command: 'notification.read-all',
                    ...(items[0] ? { before: new Date().toISOString() } : {}),
                  });
                  await load();
                  window.dispatchEvent(new CustomEvent(INBOX_CHANGED));
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : 'Could not update.',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <CheckCheck aria-hidden="true" />
              Mark all as read
            </Btn>
          </div>
          {error ? (
            <ErrorBanner
              title="Inbox unavailable"
              action={
                <Btn size="sm" onClick={() => void load()}>
                  Retry
                </Btn>
              }
            >
              {error}
            </ErrorBanner>
          ) : null}
          {!page && !error ? (
            <p className="text-ctl text-tx3">Loading notifications…</p>
          ) : null}
          {page && items.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={
                filter === 'unread'
                  ? 'You’re all caught up'
                  : 'No notifications yet'
              }
              description="Mentions, thread replies, shared research, task assignments and channel access changes appear here."
            />
          ) : null}
          <ul aria-label="Notifications" className="flex flex-col">
            {items.map((n) => {
              const Icon = icons[n.kind];
              const body = (
                <>
                  <Icon
                    aria-hidden="true"
                    className="mt-0.5 size-[15px] shrink-0 text-tx3"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block text-ui',
                        !n.read && 'font-semibold',
                      )}
                    >
                      {n.title}
                    </span>
                    {n.snippet ? (
                      <span className="block truncate text-ctl text-tx2">
                        {n.snippet}
                      </span>
                    ) : null}
                    <time
                      dateTime={n.createdAt}
                      className="text-[11px] text-tx3"
                    >
                      {new Date(n.createdAt).toLocaleString('en-US')}
                    </time>
                  </span>
                  {!n.read ? (
                    <span
                      aria-label="Unread"
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-acb"
                    />
                  ) : null}
                </>
              );
              return (
                <li
                  key={n.id}
                  className="flex items-start gap-1 border-b border-bd2"
                >
                  {n.href ? (
                    <Link
                      href={n.href}
                      onClick={() => void mark([n.id])}
                      className="flex min-w-0 flex-1 gap-2.5 rounded-lg px-2 py-3 hover:bg-hov"
                    >
                      {body}
                    </Link>
                  ) : (
                    <span className="flex min-w-0 flex-1 gap-2.5 px-2 py-3 text-tx2">
                      {body}
                    </span>
                  )}
                  {!n.read ? (
                    <Btn
                      size="sm"
                      className="mt-2.5"
                      onClick={() => void mark([n.id])}
                    >
                      Mark read
                    </Btn>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {page?.nextCursor ? (
            <Btn
              className="mt-3"
              variant="subtle"
              onClick={async () => {
                try {
                  const next = await fetchNotifications(
                    page.nextCursor ?? undefined,
                    filter === 'unread',
                  );
                  setPage(next);
                  setItems((list) => [
                    ...list,
                    ...next.items.filter(
                      (n) => !list.some((m) => m.id === n.id),
                    ),
                  ]);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : 'Could not load more.',
                  );
                }
              }}
            >
              Load older notifications
            </Btn>
          ) : null}
        </div>
      </div>
    </div>
  );
}
