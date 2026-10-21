'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  MessageSquare,
  CircleCheck,
  FileText,
  Check,
} from 'lucide-react';
import { Button } from '@atlas/ui/components/button';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@atlas/ui/components/tabs';
import { PageHeader } from '@/components/page-header';
import { PreviewNotice } from './primitives';
const events = [
  {
    id: 'activity-reading',
    icon: MessageSquare,
    title: 'A question in reading-group',
    detail:
      'Jamie linked the literature review to a discussion about evidence.',
    href: '/app/projects/sample/channels',
    time: 'Sample · 20 minutes ago',
  },
  {
    id: 'activity-task',
    icon: CircleCheck,
    title: 'A next step for your methodology',
    detail: 'The sample team is outlining an evaluation plan.',
    href: '/app/projects/sample/tasks',
    time: 'Sample · 2 hours ago',
  },
  {
    id: 'activity-note',
    icon: FileText,
    title: 'A thought worth coming back to',
    detail: 'Your literature review brings three research themes together.',
    href: '/app/projects/sample/documents',
    time: 'Sample · Yesterday',
  },
];
export function InboxScreen() {
  const [read, setRead] = useState<string[]>([]);
  const renderEvents = (unread: boolean) => (
    <div className="inbox-list">
      {events
        .filter((e) => !unread || !read.includes(e.id))
        .map((event) => (
          <article className="inbox-item" key={event.id}>
            <event.icon aria-hidden="true" />
            <Link href={event.href}>
              <h2>{event.title}</h2>
              <p>{event.detail}</p>
              <small>{event.time}</small>
            </Link>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`${read.includes(event.id) ? 'Mark unread' : 'Mark read'}: ${event.title}`}
              onClick={() =>
                setRead((prev) =>
                  prev.includes(event.id)
                    ? prev.filter((id) => id !== event.id)
                    : [...prev, event.id],
                )
              }
            >
              {read.includes(event.id) ? (
                <Check aria-hidden="true" />
              ) : (
                <Bell aria-hidden="true" />
              )}
            </Button>
          </article>
        ))}
      {unread && read.length === events.length ? (
        <div className="assistant-welcome" role="status">
          <Check aria-hidden="true" />
          <h2>You’re all caught up.</h2>
          <p>No unread sample activity. This state is local to your visit.</p>
        </div>
      ) : null}
    </div>
  );
  return (
    <div className="inbox-screen">
      <PageHeader
        title="Inbox"
        description="The things that need your attention, with their context intact."
      />
      <PreviewNotice phase="05">
        Illustrative activity, not real notifications. Read states reset when
        you leave.
      </PreviewNotice>
      <Tabs defaultValue="all">
        <div className="collection-toolbar">
          <TabsList variant="line">
            <TabsTrigger value="all">All activity</TabsTrigger>
            <TabsTrigger value="unread">
              Unread ({events.length - read.length})
            </TabsTrigger>
          </TabsList>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRead(events.map((e) => e.id))}
          >
            Mark all read locally
          </Button>
        </div>
        <TabsContent value="all">{renderEvents(false)}</TabsContent>
        <TabsContent value="unread">{renderEvents(true)}</TabsContent>
      </Tabs>
    </div>
  );
}
