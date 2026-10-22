'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUp,
  AtSign,
  BookOpen,
  Eye,
  FilePlus,
  FileText,
  Hash,
  ListPlus,
  Plus,
  Sparkles,
  SquarePen,
  ThumbsUp,
  X,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import { Btn, IconBtn } from '@/components/atlas/button';
import {
  Avatar,
  AvatarStack,
  SampleTag,
  UnreadBadge,
} from '@/components/atlas/chips';
import { EmptyState } from '@/components/atlas/states';
import { useToast } from '@/components/atlas/toast';
import { useAtlas } from '@/features/atlas-ai/atlas-provider';
import { moduleHref } from '@/features/shell/navigation';
import { usePreviewStore } from '@/features/shell/preview-store';
import { SidebarToggle } from '@/features/shell/topbar';
import { useMediaQuery } from '@/features/shell/use-media';
import { TaskStatusIcon } from '@/features/tasks/task-icons';
import { people, type PersonId } from '@/lib/preview/people';
import { paperById } from '@/lib/preview/research';
import {
  channelMessages,
  channels,
  documentById,
  tasks,
  threadReplies,
  type ChannelKey,
  type ChannelMessage,
} from '@/lib/preview/workspace';
import { useSearchParams } from 'next/navigation';
function parts(text: string) {
  return text.split(/(@\w+)/).filter(Boolean);
}
let localSeq = 0;
/**
 * Channels (handoff §6 "Channels"): channel list, compact messages with
 * paper/task/doc references, @Atlas and a thread panel. Messages typed here
 * stay in this tab and are never delivered.
 */
export function ChannelsScreen() {
  const atlas = useAtlas();
  const flash = useToast();
  const store = usePreviewStore();
  const params = useSearchParams();
  const empty = params.get('demo') === 'empty';
  const showList = useMediaQuery('(min-width: 900px)');
  const showThread = useMediaQuery('(min-width: 1100px)');
  const [channel, setChannel] = useState<ChannelKey>('reading-group');
  const { setContext } = atlas;
  useEffect(() => {
    setContext([
      { id: `ch-${channel}`, kind: 'channel', title: `#${channel}` },
    ]);
  }, [channel, setContext]);
  const [threadOpen, setThreadOpen] = useState(true);
  const [input, setInput] = useState('');
  const [reply, setReply] = useState('');
  const [replies, setReplies] = useState<
    { who: PersonId; time: string; text: string }[]
  >([]);
  const meta = channels.find((c) => c.key === channel) ?? channels[1];
  const messages: ChannelMessage[] = empty
    ? []
    : [...channelMessages[channel], ...(store.channelDrafts[channel] ?? [])];
  const thread =
    threadOpen && showThread && channel === 'reading-group' && !empty;
  const send = () => {
    const text = input.trim();
    if (!text) return;
    const add: ChannelMessage[] = [
      {
        id: `local-${++localSeq}`,
        who: 'taha',
        time: 'now',
        text,
        local: true,
      },
    ];
    if (/@atlas/i.test(text))
      add.push({
        id: `local-ai-${localSeq}`,
        who: 'atlas',
        time: 'now',
        ai: true,
        local: true,
        text: `Sample reply based on #${channel}: the group agrees memory comparisons need matched batch sizes before Thursday. I can draft that as a task for Mehmet.`,
      });
    store.addChannelMessages(channel, add);
    setInput('');
  };
  return (
    <div className="flex min-h-0 flex-1">
      {showList ? (
        <nav
          aria-label="Channels"
          className="flex w-[220px] shrink-0 flex-col border-r border-bd2"
        >
          <div className="flex h-12 items-center gap-2 pr-2.5 pl-3">
            <SidebarToggle />
            <span className="flex-1 font-medium">Sparse Evoformer</span>
            <IconBtn
              label="New message"
              size="base"
              onClick={() =>
                flash('New conversations arrive with Phase 05 communication')
              }
            >
              <SquarePen aria-hidden="true" className="size-[14px]" />
            </IconBtn>
          </div>
          <div className="flex-1 overflow-auto px-2 py-1">
            <div className="px-2 pt-2 pb-1 text-[11.5px] font-medium text-tx3">
              Channels
            </div>
            {channels.map((c) => {
              const active = c.key === channel;
              const unread = !active && c.unread ? c.unread : 0;
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => setChannel(c.key)}
                  className={cn(
                    'flex h-[30px] w-full items-center gap-2 rounded-md px-2 hover:bg-hov hover:text-tx',
                    active
                      ? 'bg-hov text-tx'
                      : unread
                        ? 'font-semibold text-tx'
                        : 'text-tx2',
                  )}
                >
                  <Hash aria-hidden="true" className="size-[14px] text-tx3" />
                  <span className="flex-1 text-left">{c.key}</span>
                  {unread ? (
                    <UnreadBadge>
                      {unread}
                      <span className="sr-only"> unread</span>
                    </UnreadBadge>
                  ) : null}
                </button>
              );
            })}
            <div className="px-2 pt-3.5 pb-1 text-[11.5px] font-medium text-tx3">
              Direct messages
            </div>
            {(['ayse', 'mehmet', 'jonas'] as const).map((id, i) => (
              <button
                key={id}
                type="button"
                onClick={() =>
                  flash('Direct messages arrive with Phase 05 communication')
                }
                className="flex h-[30px] w-full items-center gap-2 rounded-md px-2 text-tx2 hover:bg-hov hover:text-tx"
              >
                <span className="relative">
                  <Avatar person={people[id]} size={18} square />
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute -right-0.5 -bottom-0.5 size-[7px] rounded-full border-[1.5px] border-canvas',
                      i < 2 ? 'bg-ac' : 'bg-tx3',
                    )}
                  />
                </span>
                {people[id].name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => atlas.ask({ mode: 'focus' })}
              className="flex h-[30px] w-full items-center gap-2 rounded-md px-2 text-tx2 hover:bg-hov hover:text-tx"
            >
              <span
                aria-hidden="true"
                className="grid size-[18px] place-items-center rounded-[5px] bg-acb font-serif text-[13px] font-semibold text-white"
              >
                A
              </span>
              Atlas
            </button>
          </div>
        </nav>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-bd2 pr-3 pl-4">
          {!showList ? <SidebarToggle /> : null}
          <Hash aria-hidden="true" className="size-[15px] text-tx3" />
          <h1 className="text-sm font-semibold">{channel}</h1>
          <span className="truncate text-xs text-tx3 max-sm:hidden">
            {meta.topic}
          </span>
          <span className="flex-1" />
          <AvatarStack
            people={(['taha', 'ayse', 'mehmet', 'elif'] as const).map(
              (id) => people[id],
            )}
            ring="var(--bg)"
            className="max-sm:hidden"
          />
          <Btn
            variant="ai"
            onClick={() =>
              atlas.ask({
                mode: 'focus',
                chips: [
                  {
                    id: `ch-${channel}`,
                    kind: 'channel',
                    title: `#${channel}`,
                  },
                ],
                prompt: '/summarize this discussion and draft follow-up tasks',
              })
            }
          >
            <Sparkles aria-hidden="true" />
            Summarize
          </Btn>
        </header>
        <div className="min-h-0 flex-1 overflow-auto pt-3.5 pb-2">
          {messages.length === 0 ? (
            <div className="max-w-[520px] px-6 pt-10">
              <EmptyState
                icon={Hash}
                title={`This is the start of #${channel}`}
                description="Share papers, link tasks and ask @Atlas to summarize threads. Messages here are visible to project members."
                className="items-start px-0 text-left"
              />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2.5 px-5 pt-1.5 pb-2.5 text-[11.5px] text-tx3">
                <span className="h-px flex-1 bg-bd2" />
                Today · sample conversation
                <span className="h-px flex-1 bg-bd2" />
              </div>
              <ol aria-label={`Messages in #${channel}`}>
                {messages.map((m, i) => (
                  <li key={m.id}>
                    {channel === 'reading-group' && i === 2 ? (
                      <div className="flex items-center gap-2.5 px-5 py-1 text-[11px] text-danger">
                        <span className="h-px flex-1 bg-danger opacity-50" />
                        New
                      </div>
                    ) : null}
                    <Message
                      message={m}
                      highlighted={m.id === 'c2' && thread}
                      onThread={() => setThreadOpen(true)}
                      onAtlas={atlas.ask}
                      flash={flash}
                    />
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
        <form
          className="px-4 pb-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <div className="rounded-xl border border-bd bg-canvas">
            <label htmlFor="channel-input" className="sr-only">
              Message #{channel}
            </label>
            <input
              id="channel-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Message #${channel} — type @Atlas to ask`}
              className="h-10 w-full px-3 text-[13.5px]"
            />
            <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
              <IconBtn
                label="Attach"
                size="base"
                tone="muted"
                onClick={() => flash('Attachments are UI-only in this preview')}
              >
                <Plus aria-hidden="true" className="size-[14px]" />
              </IconBtn>
              <IconBtn
                label="Mention someone"
                size="base"
                tone="muted"
                onClick={() => setInput((v) => `${v}@`)}
              >
                <AtSign aria-hidden="true" className="size-[14px]" />
              </IconBtn>
              <IconBtn
                label="Share a paper"
                size="base"
                tone="muted"
                onClick={() =>
                  flash('Sharing papers in messages is UI-only in this preview')
                }
              >
                <BookOpen aria-hidden="true" className="size-[14px]" />
              </IconBtn>
              <Btn
                variant="aiGhost"
                size="md"
                className="font-normal"
                onClick={() => setInput((v) => `@Atlas ${v}`)}
              >
                <Sparkles aria-hidden="true" className="!size-3" />
                @Atlas
              </Btn>
              <span className="flex-1 pr-2 text-right text-[11px] text-tx3 max-sm:hidden">
                Stays in this tab · not delivered
              </span>
              <button
                type="submit"
                aria-label="Send message"
                className={cn(
                  'grid size-7 place-items-center rounded-[7px]',
                  input ? 'bg-acb text-white' : 'bg-el text-tx3',
                )}
              >
                <ArrowUp aria-hidden="true" className="size-[14px]" />
              </button>
            </div>
          </div>
        </form>
      </div>
      {thread ? (
        <aside
          aria-label="Thread"
          className="flex w-[340px] shrink-0 flex-col border-l border-bd2"
        >
          <div className="flex h-12 items-center gap-2 border-b border-bd2 pr-2.5 pl-4">
            <h2 className="font-semibold">Thread</h2>
            <span className="text-xs text-tx3"># {channel}</span>
            <span className="flex-1" />
            <IconBtn
              label="Close thread"
              size="base"
              onClick={() => setThreadOpen(false)}
            >
              <X aria-hidden="true" className="size-[14px]" />
            </IconBtn>
          </div>
          <div className="flex-1 overflow-auto py-3">
            <div className="flex gap-2.5 border-b border-bd2 px-4 pt-1.5 pb-3">
              <Avatar person={people.mehmet} size={28} square />
              <div>
                <div className="text-ctl">
                  <span className="font-semibold">Mehmet Kaya</span>{' '}
                  <span className="text-[11px] text-tx3">10:05</span>
                </div>
                <p className="text-ui leading-normal">
                  Their memory numbers assume batch size 1 — worth checking
                  against our A100 profile before we compare.
                </p>
              </div>
            </div>
            <div className="px-4 pt-2.5 pb-1 text-[11.5px] text-tx3">
              {threadReplies.length + replies.length} replies
            </div>
            {[...threadReplies, ...replies].map((r, i) => (
              <div key={i} className="flex gap-2.5 px-4 py-[7px]">
                <Avatar person={people[r.who]} size={28} square />
                <div>
                  <div className="text-ctl">
                    <span className="font-semibold">{people[r.who].name}</span>{' '}
                    <span className="text-[11px] text-tx3">{r.time}</span>
                  </div>
                  <p className="text-ui leading-normal">{r.text}</p>
                </div>
              </div>
            ))}
          </div>
          <form
            className="px-3 pb-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!reply.trim()) return;
              setReplies((r) => [
                ...r,
                { who: 'taha', time: 'now · local', text: reply.trim() },
              ]);
              setReply('');
            }}
          >
            <div className="flex gap-1.5 rounded-[9px] border border-bd py-[5px] pr-[5px] pl-2.5">
              <label htmlFor="thread-reply" className="sr-only">
                Reply in thread
              </label>
              <input
                id="thread-reply"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Reply in thread…"
                className="min-w-0 flex-1 text-ui"
              />
              <button
                type="submit"
                aria-label="Send reply"
                className="grid size-[26px] place-items-center rounded-md bg-el hover:bg-hov"
              >
                <ArrowUp aria-hidden="true" className="size-[13px]" />
              </button>
            </div>
          </form>
        </aside>
      ) : null}
    </div>
  );
}
function Message({
  message: m,
  highlighted,
  onThread,
  onAtlas,
  flash,
}: {
  message: ChannelMessage;
  highlighted: boolean;
  onThread: () => void;
  onAtlas: ReturnType<typeof useAtlas>['ask'];
  flash: (m: string) => void;
}) {
  const person = people[m.who];
  const paper = m.paper ? paperById(m.paper) : null;
  const task = m.task ? tasks.find((t) => t.id === m.task) : null;
  const doc = m.doc ? documentById(m.doc) : null;
  return (
    <article
      aria-label={`${person.name} at ${m.time}`}
      className={cn(
        'flex gap-2.5 px-5 py-[7px] hover:bg-card',
        highlighted && 'bg-card',
      )}
    >
      {m.who === 'atlas' ? (
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-acb font-serif text-[15px] font-semibold text-white"
        >
          A
        </span>
      ) : (
        <Avatar person={person} size={32} square />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-ui font-semibold">{person.name}</span>
          {m.ai ? <SampleTag>AI · sample</SampleTag> : null}
          {m.local && !m.ai ? (
            <SampleTag>Local draft · not sent</SampleTag>
          ) : null}
          <span className="text-[11px] text-tx3">{m.time}</span>
        </div>
        <p className="text-[13.5px] leading-[1.55] text-tx">
          {parts(m.text).map((p, i) =>
            p.startsWith('@') ? (
              <span key={i} className="rounded-[3px] bg-acs px-[3px] text-actx">
                {p}
              </span>
            ) : (
              <span key={i}>{p}</span>
            ),
          )}
        </p>
        {paper ? (
          <Link
            href={moduleHref('library', `paper=${paper.id}`)}
            className="mt-[7px] flex max-w-[460px] items-center gap-2.5 rounded-lg border border-bd2 bg-card px-3 py-[9px] hover:border-bd"
          >
            <BookOpen aria-hidden="true" className="size-[15px] text-tx3" />
            <span className="min-w-0 flex-1">
              <span className="block font-serif text-[15px] leading-[1.25]">
                {paper.title}
              </span>
              <span className="text-[11.5px] text-tx3">
                {paper.short} · {paper.venue}
              </span>
            </span>
            <span className="text-[11.5px] text-tx2">Open</span>
          </Link>
        ) : null}
        {task ? (
          <Link
            href={moduleHref('tasks', `task=${task.id}`)}
            className="mt-[7px] inline-flex h-[26px] items-center gap-1.5 rounded-md border border-bd2 bg-card px-[9px] text-xs hover:border-bd"
          >
            <TaskStatusIcon status={task.status} className="size-3" />
            <span className="font-mono text-[11px] text-tx3">{task.id}</span>
            {task.title}
          </Link>
        ) : null}
        {doc ? (
          <Link
            href={moduleHref('documents', `doc=${doc.id}`)}
            className="mt-[7px] inline-flex h-[26px] items-center gap-1.5 rounded-md border border-bd2 bg-card px-[9px] text-xs hover:border-bd"
          >
            <FileText aria-hidden="true" className="size-3 text-tx3" />
            {doc.title}
          </Link>
        ) : null}
        {m.ai ? (
          <div className="mt-2 flex gap-1.5">
            <Btn
              variant="subtle"
              size="sm"
              className="text-[11.5px]"
              onClick={() =>
                onAtlas({
                  mode: 'focus',
                  chips: [
                    {
                      id: 'ch-reading',
                      kind: 'channel',
                      title: '#reading-group',
                    },
                  ],
                  prompt: '/create-task from the low-rank vs sparse discussion',
                })
              }
            >
              <ListPlus aria-hidden="true" className="!size-[11px]" />
              Create follow-up tasks
            </Btn>
            <Btn
              variant="subtle"
              size="sm"
              className="text-[11.5px]"
              onClick={() =>
                flash('Adding to a note is a preview — nothing was changed')
              }
            >
              <FilePlus aria-hidden="true" className="!size-[11px]" />
              Add to note
            </Btn>
          </div>
        ) : null}
        {m.reactions?.length || m.replies ? (
          <div className="mt-[7px] flex items-center gap-1.5">
            {m.reactions?.map((r) => (
              <span
                key={r.icon}
                className="inline-flex h-[22px] items-center gap-1 rounded-[11px] border border-bd px-[7px] text-[11.5px] text-tx2"
              >
                {r.icon === 'thumbs-up' ? (
                  <ThumbsUp aria-label="Thumbs up" className="size-[11px]" />
                ) : (
                  <Eye aria-label="Seen" className="size-[11px]" />
                )}
                {r.count}
              </span>
            ))}
            {m.replies ? (
              <button
                type="button"
                onClick={onThread}
                className="text-xs font-medium text-actx hover:underline"
              >
                {m.replies} replies
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
