'use client';
import Link from 'next/link';
import {
  AtSign,
  Bell,
  Inbox as InboxIcon,
  ListTodo,
  MessageSquare,
  Share2,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import { Avatar } from '@/components/atlas/chips';
import { resolveHref } from '@/features/shell/navigation';
import { usePreviewStore } from '@/features/shell/preview-store';
import { people } from '@/lib/preview/people';
import {
  notifications,
  type NotificationType,
  type SampleNotification,
} from '@/lib/preview/workspace';
export const typeIcons: Record<NotificationType, typeof Bell> = {
  mention: AtSign,
  task: ListTodo,
  ai: Sparkles,
  share: Share2,
  comment: MessageSquare,
  invite: UserPlus,
  update: Bell,
};
export type InboxFilter =
  'all' | 'unread' | 'mentions' | 'tasks' | 'shared' | 'activity';
export function useNotifications(filter: InboxFilter) {
  const store = usePreviewStore();
  const isUnread = (n: SampleNotification) =>
    n.unread && !store.readAll && !store.readIds.includes(n.id);
  const list = notifications.filter(
    (n) =>
      filter === 'all' ||
      (filter === 'unread' && isUnread(n)) ||
      (filter === 'mentions' &&
        (n.type === 'mention' || n.type === 'comment')) ||
      (filter === 'tasks' && n.type === 'task') ||
      (filter === 'shared' && (n.type === 'share' || n.type === 'invite')) ||
      (filter === 'activity' && (n.type === 'ai' || n.type === 'update')),
  );
  return {
    list,
    isUnread,
    unreadCount: notifications.filter(isUnread).length,
    markAllRead: store.markAllRead,
    markRead: store.markRead,
  };
}
export function NotificationRow({
  n,
  unread,
  selected,
  href,
  onSelect,
  onNavigate,
  surface = 'pop',
}: {
  n: SampleNotification;
  unread: boolean;
  selected?: boolean;
  href?: string;
  onSelect?: () => void;
  onNavigate?: () => void;
  surface?: 'pop' | 'canvas';
}) {
  const person = people[n.who];
  const Icon = typeIcons[n.type];
  const body = (
    <>
      <span className="relative shrink-0">
        <Avatar person={person} size={28} />
        <span
          className={cn(
            'absolute -right-[3px] -bottom-[3px] grid size-4 place-items-center rounded-full text-tx2',
            surface === 'pop' ? 'bg-pop' : 'bg-canvas',
          )}
        >
          <Icon aria-hidden="true" className="size-[10px]" />
        </span>
      </span>
      <span className="min-w-0 flex-1 text-ctl leading-[1.45]">
        <span className="font-semibold">{person.name}</span>{' '}
        <span className="text-tx2">{n.text}</span>{' '}
        <span className="font-medium">{n.object}</span>
        {n.quote ? (
          <span className="mt-[3px] block truncate text-tx3">{n.quote}</span>
        ) : null}
      </span>
      <span className="flex flex-col items-end gap-1.5">
        <span className="text-[11px] whitespace-nowrap text-tx3">{n.time}</span>
        {unread ? (
          <span className="size-[7px] rounded-full bg-ac">
            <span className="sr-only">Unread</span>
          </span>
        ) : null}
      </span>
    </>
  );
  const cls = cn(
    'flex w-full gap-2.5 rounded-lg p-2.5 text-left hover:bg-hov',
    selected && 'bg-hov',
  );
  if (href)
    return (
      <Link
        href={href}
        className={cls}
        {...(onNavigate ? { onClick: onNavigate } : {})}
      >
        {body}
      </Link>
    );
  return (
    <button
      type="button"
      className={cls}
      onClick={onSelect}
      aria-pressed={selected}
    >
      {body}
    </button>
  );
}
export function InboxEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-5 pt-[30px] pb-[34px] text-center">
      <span className="grid size-11 place-items-center rounded-xl bg-el text-tx2">
        <InboxIcon aria-hidden="true" className="size-5" />
      </span>
      <span className="font-medium">{title}</span>
      <span className="max-w-[240px] text-xs text-tx3">{description}</span>
    </div>
  );
}
export function notificationHref(n: SampleNotification) {
  return resolveHref(n.target);
}
