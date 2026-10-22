'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Maximize2 } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/atlas/overlay';
import { Segmented } from '@/components/atlas/segmented';
import {
  InboxEmpty,
  NotificationRow,
  notificationHref,
  useNotifications,
  type InboxFilter,
} from './inbox-items';
/** Compact inbox (handoff `InboxPopover`, 420px, anchored beside the sidebar). */
export function InboxPopover({
  trigger,
  side = 'right',
}: {
  trigger: ReactNode;
  side?: 'right' | 'bottom';
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] =
    useState<Extract<InboxFilter, 'all' | 'unread' | 'mentions'>>('all');
  const { list, isUnread, markAllRead, markRead } = useNotifications(tab);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        width={420}
        side={side}
        align="start"
        sideOffset={side === 'right' ? 8 : 6}
        aria-label="Inbox"
        className="overflow-hidden"
      >
        <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
          <h2 className="text-base font-semibold">Inbox</h2>
          <span className="flex-1" />
          <button
            type="button"
            onClick={markAllRead}
            className="h-6 rounded-sm px-1.5 text-xs text-tx2 hover:bg-hov hover:text-tx"
          >
            Mark all read
          </button>
          <Link
            href="/app/inbox"
            onClick={() => setOpen(false)}
            aria-label="Open inbox"
            className="grid size-6 place-items-center rounded-sm text-tx2 hover:bg-hov"
          >
            <Maximize2 aria-hidden="true" className="size-[13px]" />
          </Link>
        </div>
        <div className="border-b border-bd2 px-3 pb-2">
          <Segmented
            label="Inbox filter"
            variant="plain"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'all', label: 'All' },
              { value: 'unread', label: 'Unread' },
              { value: 'mentions', label: 'Mentions' },
            ]}
          />
        </div>
        <div className="max-h-[380px] overflow-auto p-1">
          {list.map((n) => (
            <NotificationRow
              key={n.id}
              n={n}
              unread={isUnread(n)}
              href={notificationHref(n)}
              onNavigate={() => {
                markRead(n.id);
                setOpen(false);
              }}
            />
          ))}
          {list.length === 0 ? (
            <InboxEmpty
              title="You’re all caught up"
              description="Mentions, assignments and finished Atlas tasks will appear here."
            />
          ) : null}
        </div>
        <div className="border-t border-bd2 px-4 py-2 text-[11px] text-tx3">
          Sample notifications · no notification service is connected
        </div>
      </PopoverContent>
    </Popover>
  );
}
