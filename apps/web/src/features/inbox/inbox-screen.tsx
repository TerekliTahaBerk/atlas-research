'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CheckCheck } from 'lucide-react';
import { Btn, btnVariants } from '@/components/atlas/button';
import { Avatar } from '@/components/atlas/chips';
import { Segmented } from '@/components/atlas/segmented';
import { useToast } from '@/components/atlas/toast';
import { Crumb, Topbar } from '@/features/shell/topbar';
import { useMediaQuery } from '@/features/shell/use-media';
import { people } from '@/lib/preview/people';
import {
  InboxEmpty,
  NotificationRow,
  notificationHref,
  useNotifications,
  type InboxFilter,
} from './inbox-items';
const tabs: { value: InboxFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'mentions', label: 'Mentions' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'shared', label: 'Shared' },
  { value: 'activity', label: 'Activity' },
];
/** Full inbox: grouped list + preview (handoff `InboxPage`). */
export function InboxScreen() {
  const flash = useToast();
  const [tab, setTab] = useState<InboxFilter>('all');
  const [selected, setSelected] = useState('n1');
  const showPreview = useMediaQuery('(min-width: 900px)');
  const { list, isUnread, markAllRead, markRead } = useNotifications(tab);
  const current = list.find((n) => n.id === selected) ?? list[0];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar
        actions={
          <Btn variant="ghost" onClick={markAllRead}>
            <CheckCheck aria-hidden="true" />
            Mark all read
          </Btn>
        }
      >
        <Crumb title="Inbox" as="span" />
      </Topbar>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-[min(460px,100%)] shrink-0 flex-col border-r border-bd2 max-[899px]:w-full max-[899px]:border-r-0">
          <div className="px-4 pt-5 pb-2.5">
            <h1 className="mb-3 font-serif text-[30px] leading-none font-medium">
              Inbox
            </h1>
            <Segmented
              label="Inbox filter"
              variant="plain"
              value={tab}
              onChange={setTab}
              options={tabs}
              className="flex-wrap"
            />
          </div>
          <div className="flex-1 overflow-auto px-2 pb-4">
            {(['Today', 'This week'] as const).map((g) => {
              const items = list.filter((n) => n.group === g);
              if (!items.length) return null;
              return (
                <section key={g} aria-label={g}>
                  <h2 className="px-2 pt-3 pb-1 text-[11.5px] text-tx3">{g}</h2>
                  {items.map((n) => (
                    <NotificationRow
                      key={n.id}
                      n={n}
                      surface="canvas"
                      unread={isUnread(n)}
                      selected={showPreview && current?.id === n.id}
                      {...(showPreview
                        ? { onSelect: () => setSelected(n.id) }
                        : {
                            href: notificationHref(n),
                            onNavigate: () => markRead(n.id),
                          })}
                    />
                  ))}
                </section>
              );
            })}
            {list.length === 0 ? (
              <InboxEmpty
                title="Nothing here"
                description="You’re all caught up in this view."
              />
            ) : null}
            <p className="px-2 pt-4 text-[11px] text-tx3">
              Sample notifications · no notification service is connected.
            </p>
          </div>
        </div>
        {showPreview && current ? (
          <section
            aria-label="Notification preview"
            className="min-w-0 flex-1 overflow-auto px-9 py-16"
          >
            <div className="max-w-[620px]">
              <div className="mb-3.5 flex items-center gap-2.5">
                <Avatar person={people[current.who]} size={32} />
                <div>
                  <div className="text-ui">
                    <span className="font-semibold">
                      {people[current.who].name}
                    </span>{' '}
                    <span className="text-tx2">{current.text}</span>
                  </div>
                  <div className="text-[11.5px] text-tx3">
                    {current.time} · {current.group}
                  </div>
                </div>
              </div>
              <h2 className="mb-3.5 font-serif text-[28px] leading-[1.15] font-medium">
                {current.object}
              </h2>
              {current.quote ? (
                <blockquote className="mb-[18px] rounded-lg border border-bd2 bg-card px-4 py-3 font-read text-[15px] leading-[1.7]">
                  {current.quote}
                </blockquote>
              ) : null}
              <div className="flex gap-1.5">
                <Link
                  href={notificationHref(current)}
                  onClick={() => markRead(current.id)}
                  className={btnVariants({ variant: 'primary', size: 'lg' })}
                >
                  <ArrowUpRight aria-hidden="true" />
                  Open
                </Link>
                <Btn
                  variant="outline"
                  size="lg"
                  onClick={() =>
                    flash('Replies are a preview — nothing was sent')
                  }
                >
                  Reply
                </Btn>
                <Btn
                  variant="ghost"
                  size="lg"
                  onClick={() => {
                    markRead(current.id);
                    flash('Marked done in this session', 'done');
                  }}
                >
                  Mark done
                </Btn>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
