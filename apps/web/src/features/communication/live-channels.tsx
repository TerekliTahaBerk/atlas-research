'use client';
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Archive,
  Hash,
  Lock,
  Plus,
  Settings2,
  Sparkles,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import type {
  ChannelDetailDto,
  ChannelListDto,
  MessageDto,
  ProjectDto,
  RealtimeEvent,
  ReactionKey,
} from '@atlas/core';
import { Btn, IconBtn } from '@/components/atlas/button';
import { UnreadBadge } from '@/components/atlas/chips';
import { EmptyState, ErrorBanner } from '@/components/atlas/states';
import { useToast } from '@/components/atlas/toast';
import { SidebarToggle } from '@/features/shell/topbar';
import { usePlatformOptional } from '@/features/platform/platform-context';
import { useMediaQuery } from '@/features/shell/use-media';
import {
  ApiError,
  communicate,
  fetchChanges,
  fetchChannel,
  fetchChannels,
  fetchMessages,
  fetchThread,
} from './client';
import { randomUUID } from './ids';
import {
  addPending,
  dropPending,
  emptyTimeline,
  mergeMessages,
  patchPending,
  pendingFor,
  repliesOf,
  topLevel,
  type PendingSend,
  type Timeline,
} from './timeline';
import { useRealtimeTopic, type LiveStatus } from './realtime';
import { Reconciler, type DeliveryHealth } from './delivery';
import { MessageItem, PendingItem } from './message-item';
import { Composer, type ComposerSubmit, type ShareDraft } from './composer';
import {
  ChannelSettingsDialog,
  CreateChannelDialog,
  RecoverChannelDialog,
  ShareResearchDialog,
} from './channel-dialogs';
import { AtlasPanel } from './atlas-panel';

type Action =
  | { type: 'reset' }
  | {
      type: 'merge';
      items: readonly MessageDto[];
      changeSeq?: number;
      before?: number | null;
    }
  | { type: 'pending'; send: PendingSend }
  | {
      type: 'patch';
      clientKey: string;
      status: PendingSend['status'];
      error: string | null;
    }
  | { type: 'drop'; clientKey: string };
function reducer(state: Timeline, action: Action): Timeline {
  switch (action.type) {
    case 'reset':
      return emptyTimeline();
    case 'merge':
      return mergeMessages(state, action.items, {
        ...(action.changeSeq !== undefined
          ? { changeSeq: action.changeSeq }
          : {}),
        ...('before' in action ? { before: action.before ?? null } : {}),
      });
    case 'pending':
      return addPending(state, action.send);
    case 'patch':
      return patchPending(state, action.clientKey, {
        status: action.status,
        error: action.error,
      });
    case 'drop':
      return dropPending(state, action.clientKey);
  }
}
const statusCopy: Record<LiveStatus, string> = {
  connecting: 'Connecting to live updates…',
  live: 'Live',
  reconnecting: 'Reconnecting — messages are safe and will be backfilled',
  offline: 'Offline — unsent messages stay here until you retry',
  unavailable: 'Live updates unavailable — refreshing periodically',
};
const delayedCopy =
  'Some live updates arrived late — this channel was synced from the server';

/**
 * Real project channels (A04). Content always comes from authorized server
 * reads; the private Realtime topic only triggers a cursor backfill. A
 * bounded cursor reconciliation runs even while the socket is live (A04.1),
 * so a lost event or a missed topic rotation is recovered without user
 * action; see `delivery.ts`.
 */
export function LiveChannels({ project }: { project: ProjectDto }) {
  const router = useRouter();
  const params = useSearchParams();
  const flash = useToast();
  const actorId = usePlatformOptional()?.profile?.id ?? null;
  const wide = useMediaQuery('(min-width: 900px)');
  const threadSide = useMediaQuery('(min-width: 1100px)');
  const [list, setList] = useState<ChannelListDto | null>(null);
  const [listError, setListError] = useState('');
  const [detail, setDetail] = useState<ChannelDetailDto | null>(null);
  const [denied, setDenied] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [timeline, dispatch] = useReducer(reducer, undefined, emptyTimeline);
  const [syncing, setSyncing] = useState(false);
  const [health, setHealth] = useState<DeliveryHealth>('ok');
  const [creating, setCreating] = useState(false);
  const [recovering, setRecovering] = useState<
    ChannelListDto['recoverable'][number] | null
  >(null);
  const [settings, setSettings] = useState(false);
  const [sharing, setSharing] = useState<'main' | 'thread' | null>(null);
  const [shares, setShares] = useState<ShareDraft[]>([]);
  const [threadShares, setThreadShares] = useState<ShareDraft[]>([]);
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [mobileList, setMobileList] = useState(!params.get('channel'));
  const selectedId =
    params.get('channel') ??
    list?.items.find((c) => c.isDefault && !c.archived)?.id ??
    list?.items.find((c) => !c.archived)?.id ??
    null;
  // Switching channels resets per-channel state during render (no effect).
  const [shown, setShown] = useState(selectedId);
  if (shown !== selectedId) {
    setShown(selectedId);
    dispatch({ type: 'reset' });
    setDetail(null);
    setDenied(false);
    setLoadError('');
    setShares([]);
    setThreadShares([]);
    setAtlasOpen(false);
    setHealth('ok');
  }
  const threadId = params.get('thread');
  const highlightId = params.get('message');
  const active = useRef<string | null>(null);
  const reconciler = useRef<Reconciler | null>(null);
  const subscribedTopic = useRef<string | null>(null);

  const navigate = useCallback(
    (next: {
      channel?: string | null;
      thread?: string | null;
      message?: string | null;
    }) => {
      const search = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(next))
        if (value) search.set(key, value);
        else search.delete(key);
      router.replace(`?${search.toString()}`, { scroll: false });
    },
    [params, router],
  );
  const loadList = useCallback(async () => {
    try {
      setList(await fetchChannels(project.id));
      setListError('');
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Channels unavailable.');
    }
  }, [project.id]);
  useEffect(() => {
    // Initial and refreshed authorized channel list.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadList();
  }, [loadList]);

  const refreshDetail = useCallback(async (channelId: string) => {
    try {
      const next = await fetchChannel(channelId);
      if (active.current === channelId) {
        setDetail(next);
        setDenied(false);
      }
      return next;
    } catch (e) {
      if (
        active.current === channelId &&
        e instanceof ApiError &&
        e.code === 'NOT_FOUND'
      ) {
        // Access was removed or never existed: show nothing of the channel.
        setDenied(true);
        setDetail(null);
        dispatch({ type: 'reset' });
      }
      return null;
    }
  }, []);

  /** Drains every change after the applied cursor (exactly-once merge). */
  const backfill = useCallback(
    () => reconciler.current?.run('command') ?? Promise.resolve(),
    [],
  );

  useEffect(() => {
    if (!selectedId) return;
    active.current = selectedId;
    const channelId = selectedId;
    const loop = new Reconciler({
      fetchChanges: (since) => fetchChanges(channelId, since),
      apply: (page) => {
        if (active.current === channelId)
          dispatch({
            type: 'merge',
            items: page.items,
            changeSeq: page.changeSeq,
          });
      },
      topic: () => subscribedTopic.current,
      // A rotation notice was lost: re-fetch the authorized topic, which
      // resubscribes (or reveals that access was revoked).
      onTopicStale: () => void refreshDetail(channelId),
      onDenied: () => void refreshDetail(channelId),
      onHealth: setHealth,
      onSyncing: setSyncing,
    });
    reconciler.current = loop;
    let alive = true;
    void (async () => {
      const next = await refreshDetail(selectedId);
      if (!next || !alive) return;
      try {
        const page = await fetchMessages(selectedId);
        if (!alive) return;
        dispatch({
          type: 'merge',
          items: page.items,
          changeSeq: page.changeSeq,
          before: page.before,
        });
        loop.seed(page.changeSeq);
        // Changes committed between the page and now are drained here.
        void loop.run('resync');
      } catch (e) {
        if (alive)
          setLoadError(
            e instanceof Error ? e.message : 'Messages unavailable.',
          );
      }
    })();
    return () => {
      alive = false;
      loop.stop();
      if (reconciler.current === loop) reconciler.current = null;
    };
  }, [selectedId, refreshDetail]);

  useEffect(() => {
    if (!threadId || !detail) return;
    let alive = true;
    fetchThread(threadId)
      .then(
        (t) =>
          alive && dispatch({ type: 'merge', items: [t.root, ...t.replies] }),
      )
      .catch(() => alive && navigate({ thread: null }));
    return () => {
      alive = false;
    };
  }, [threadId, detail, navigate]);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onEvent = useCallback(
    (event: RealtimeEvent) => {
      const channelId = active.current;
      if (!channelId) return;
      if (
        event.event === 'message.created' ||
        event.event === 'message.changed'
      ) {
        if (event.payload.channelId !== channelId) return;
        // Duplicate or stale events are harmless: the cursor dedupes.
        const loop = reconciler.current;
        if (!loop || event.payload.changeSeq <= loop.position) return;
        clearTimeout(timer.current);
        const changeSeq = event.payload.changeSeq;
        timer.current = setTimeout(() => loop.hint(changeSeq), 60);
      } else if (
        event.event === 'channel.changed' ||
        event.event === 'topic.rotated'
      ) {
        void refreshDetail(channelId).then(() => loadList());
      }
    },
    [refreshDetail, loadList],
  );
  useEffect(() => {
    subscribedTopic.current = detail?.topic ?? null;
  }, [detail?.topic]);
  const status = useRealtimeTopic(
    detail?.topic ?? null,
    onEvent,
    () => void reconciler.current?.run('resync'),
    () => {
      if (active.current) void refreshDetail(active.current);
    },
  );
  // Bounded reconciliation in every state, live included; paused while the
  // tab is hidden and run immediately when it becomes visible or focused.
  useEffect(() => {
    if (!detail) return;
    const sync = () =>
      reconciler.current?.update(status, document.visibilityState === 'hidden');
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [detail, status]);
  useEffect(() => {
    const focus = () => void reconciler.current?.run('resync');
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, []);

  const messages = useMemo(() => topLevel(timeline), [timeline]);
  const lastSeq = messages.at(-1)?.seq ?? 0;
  const channel = detail?.channel ?? null;
  const canPost = !!channel?.capabilities.includes('channel.post');
  useEffect(() => {
    if (!channel?.joined || !lastSeq || lastSeq <= 0) return;
    const t = setTimeout(() => {
      void communicate({
        command: 'channel.read',
        id: channel.id,
        seq: lastSeq,
      })
        .then(() => loadList())
        .catch(() => undefined);
    }, 800);
    return () => clearTimeout(t);
  }, [channel?.id, channel?.joined, lastSeq, loadList]);
  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`message-${highlightId}`);
    el?.scrollIntoView({ block: 'center' });
    el?.focus({ preventScroll: true });
  }, [highlightId, messages.length]);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!highlightId) bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, timeline.pending.length, highlightId]);

  const deliver = useCallback(
    async (send: PendingSend) => {
      try {
        await communicate({
          command: 'message.send',
          channelId: send.channelId,
          ...(send.threadRootId ? { threadRootId: send.threadRootId } : {}),
          body: send.body,
          references: send.references,
          idempotencyKey: send.clientKey,
        });
        await backfill();
        // Reconciled by client key when the committed copy arrives.
        dispatch({ type: 'drop', clientKey: send.clientKey });
      } catch (e) {
        dispatch({
          type: 'patch',
          clientKey: send.clientKey,
          status: 'failed',
          error:
            e instanceof ApiError && e.code === 'NETWORK'
              ? 'Delivery not confirmed. Retrying is safe — it cannot duplicate the message.'
              : e instanceof Error
                ? e.message
                : 'Sending failed.',
        });
        if (e instanceof ApiError && e.code === 'NOT_FOUND' && active.current)
          void refreshDetail(active.current);
      }
    },
    [backfill, refreshDetail],
  );
  const submit = (input: ComposerSubmit, threadRootId: string | null) => {
    if (!channel) return;
    const send: PendingSend = {
      clientKey: randomUUID(),
      channelId: channel.id,
      threadRootId,
      body: input.body,
      references: input.references,
      labels: input.labels,
      status: 'sending',
      error: null,
      createdAt: Date.now(),
    };
    dispatch({ type: 'pending', send });
    if (threadRootId) setThreadShares([]);
    else setShares([]);
    void deliver(send);
  };
  const retry = (send: PendingSend) => {
    dispatch({
      type: 'patch',
      clientKey: send.clientKey,
      status: 'retrying',
      error: null,
    });
    void deliver(send);
  };
  const react = async (m: MessageDto, emoji: ReactionKey, value: boolean) => {
    try {
      await communicate({
        command: 'reaction.set',
        messageId: m.id,
        emoji,
        active: value,
      });
      await backfill();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Reaction failed.');
    }
  };
  const edit = async (m: MessageDto, body: string) => {
    await communicate({
      command: 'message.edit',
      id: m.id,
      expectedVersion: m.version,
      body,
    });
    await backfill();
  };
  const remove = async (m: MessageDto) => {
    if (
      !window.confirm(
        'Delete this message? Its content is removed for everyone.',
      )
    )
      return;
    try {
      await communicate({
        command: 'message.delete',
        id: m.id,
        expectedVersion: m.version,
      });
      await backfill();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Delete failed.');
    }
  };
  const copyLink = async (m: MessageDto) => {
    const search = new URLSearchParams({ channel: m.channelId, message: m.id });
    if (m.threadRootId) search.set('thread', m.threadRootId);
    const href = `${window.location.origin}/app/projects/${project.id}/channels?${search}`;
    try {
      await navigator.clipboard.writeText(href);
      flash('Message link copied');
    } catch {
      flash('Copy failed — the link is in the address bar');
      navigate({ message: m.id, thread: m.threadRootId });
    }
  };
  const loadOlder = async () => {
    if (!channel || timeline.before === null) return;
    try {
      const page = await fetchMessages(channel.id, timeline.before);
      dispatch({ type: 'merge', items: page.items, before: page.before });
    } catch (e) {
      flash(
        e instanceof Error ? e.message : 'Could not load earlier messages.',
      );
    }
  };

  const threadRoot = threadId ? timeline.messages[threadId] : undefined;
  const showList = wide || mobileList;
  const showConversation = wide || !mobileList;
  const threadOpen = !!threadRoot && !!channel;

  const renderMessage = (m: MessageDto, inThread: boolean) => (
    <li key={m.id}>
      <MessageItem
        message={m}
        highlighted={m.id === highlightId}
        canPost={canPost}
        isOwn={m.clientKey !== null}
        inThread={inThread}
        onReply={() => navigate({ thread: m.id, message: null })}
        onReact={(emoji, value) => void react(m, emoji, value)}
        onEdit={(body) => edit(m, body)}
        onDelete={() => void remove(m)}
        onCopyLink={() => void copyLink(m)}
      />
    </li>
  );
  const pendingItems = (threadRootId: string | null) =>
    pendingFor(timeline, threadRootId)
      .filter((p) => p.channelId === channel?.id)
      .map((p) => (
        <li key={p.clientKey}>
          <PendingItem
            send={p}
            onRetry={() => retry(p)}
            onDiscard={() => dispatch({ type: 'drop', clientKey: p.clientKey })}
          />
        </li>
      ));

  return (
    <div className="flex min-h-0 flex-1">
      {showList ? (
        <nav
          aria-label="Channels"
          className={cn(
            'flex shrink-0 flex-col border-r border-bd2',
            wide ? 'w-[220px]' : 'w-full',
          )}
        >
          <div className="flex h-12 items-center gap-2 pr-2.5 pl-3">
            <SidebarToggle />
            <span className="min-w-0 flex-1 truncate font-medium">
              {project.name}
            </span>
            {list?.canCreate ? (
              <IconBtn
                label="New channel"
                size="base"
                onClick={() => setCreating(true)}
              >
                <Plus aria-hidden="true" className="size-[14px]" />
              </IconBtn>
            ) : null}
          </div>
          <div className="flex-1 overflow-auto px-2 py-1">
            <div className="px-2 pt-2 pb-1 text-[11.5px] font-medium text-tx3">
              Channels
            </div>
            {listError ? (
              <p role="alert" className="px-2 text-ctl text-danger">
                {listError}
              </p>
            ) : null}
            {!list && !listError ? (
              <p className="px-2 text-ctl text-tx3">Loading…</p>
            ) : null}
            {list?.items.length === 0 ? (
              <p className="px-2 py-1 text-ctl text-tx3">No channels yet.</p>
            ) : null}
            {list?.items.map((c) => {
              const current = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-current={current ? 'true' : undefined}
                  onClick={() => {
                    navigate({ channel: c.id, thread: null, message: null });
                    setMobileList(false);
                  }}
                  className={cn(
                    'flex h-[30px] w-full items-center gap-2 rounded-md px-2 hover:bg-hov hover:text-tx',
                    current
                      ? 'bg-hov text-tx'
                      : c.unread
                        ? 'font-semibold text-tx'
                        : 'text-tx2',
                    c.archived && 'opacity-60',
                  )}
                >
                  {c.visibility === 'RESTRICTED' ? (
                    <Lock
                      aria-label="Restricted"
                      className="size-[13px] text-tx3"
                    />
                  ) : (
                    <Hash aria-hidden="true" className="size-[14px] text-tx3" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-left">
                    {c.name}
                  </span>
                  {c.archived ? (
                    <Archive
                      aria-label="Archived"
                      className="size-3 text-tx3"
                    />
                  ) : null}
                  {!current && (c.mentions || c.unread) ? (
                    <UnreadBadge>
                      {c.mentions || c.unread}
                      <span className="sr-only">
                        {c.mentions ? ' unread mentions' : ' unread'}
                      </span>
                    </UnreadBadge>
                  ) : null}
                </button>
              );
            })}
            {list?.recoverable.length ? (
              <section aria-labelledby="channel-recovery" className="mt-3">
                <h2
                  id="channel-recovery"
                  className="px-2 pb-1 text-[11.5px] font-medium text-tx3"
                >
                  Needs a manager
                </h2>
                {list.recoverable.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setRecovering(c)}
                    className="flex h-[30px] w-full items-center gap-2 rounded-md px-2 text-tx2 hover:bg-hov hover:text-tx"
                  >
                    <Lock aria-hidden="true" className="size-[13px] text-tx3" />
                    <span className="min-w-0 flex-1 truncate text-left">
                      {c.name}
                    </span>
                    <span className="sr-only">: appoint a manager</span>
                  </button>
                ))}
              </section>
            ) : null}
          </div>
        </nav>
      ) : null}
      {showConversation ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-bd2 pr-3 pl-4">
            {!wide ? (
              <IconBtn
                label="Back to channels"
                size="base"
                onClick={() => setMobileList(true)}
              >
                <ArrowLeft aria-hidden="true" className="size-[14px]" />
              </IconBtn>
            ) : null}
            {channel?.visibility === 'RESTRICTED' ? (
              <Lock aria-hidden="true" className="size-[14px] text-tx3" />
            ) : (
              <Hash aria-hidden="true" className="size-[15px] text-tx3" />
            )}
            <h1 className="truncate text-sm font-semibold">
              {channel?.name ?? 'Channels'}
            </h1>
            {channel?.description ? (
              <span className="truncate text-xs text-tx3 max-sm:hidden">
                {channel.description}
              </span>
            ) : null}
            <span className="flex-1" />
            {channel ? (
              <span
                role="status"
                aria-live="polite"
                title={
                  status === 'live' && health === 'delayed'
                    ? delayedCopy
                    : statusCopy[status]
                }
                data-delivery={health}
                className={cn(
                  'inline-flex items-center gap-1 text-[11px]',
                  status === 'live' ? 'text-tx3' : 'text-warn',
                )}
              >
                {status === 'live' ? (
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-ac"
                  />
                ) : (
                  <WifiOff aria-hidden="true" className="size-3" />
                )}
                <span
                  className={cn(
                    status === 'live' && health === 'ok' && 'sr-only',
                  )}
                >
                  {syncing && status !== 'live'
                    ? 'Backfilling…'
                    : status === 'live' && health === 'delayed'
                      ? 'Live · synced'
                      : statusCopy[status]}
                </span>
              </span>
            ) : null}
            {channel ? (
              <>
                <Btn
                  size="md"
                  variant="ghost"
                  onClick={() => setSettings(true)}
                >
                  <Users aria-hidden="true" />
                  <span className="max-sm:sr-only">
                    {detail?.members.length ?? 0}
                  </span>
                  <span className="sr-only"> members and settings</span>
                </Btn>
                <IconBtn
                  label="Channel settings"
                  size="base"
                  onClick={() => setSettings(true)}
                >
                  <Settings2 aria-hidden="true" className="size-[14px]" />
                </IconBtn>
                <Btn variant="ai" size="md" onClick={() => setAtlasOpen(true)}>
                  <Sparkles aria-hidden="true" />
                  <span className="max-sm:sr-only">Ask Atlas</span>
                </Btn>
              </>
            ) : null}
          </header>
          {channel?.archived ? (
            <div
              role="status"
              className="border-b border-bd2 bg-el px-4 py-2 text-ctl text-tx2"
            >
              <Archive aria-hidden="true" className="mr-1.5 inline size-3.5" />
              This channel is archived. History is readable; new messages,
              reactions and edits are disabled.
            </div>
          ) : null}
          {channel && !channel.joined && channel.visibility === 'PROJECT' ? (
            <div className="flex items-center gap-2 border-b border-bd2 px-4 py-2 text-ctl text-tx2">
              <span className="flex-1">
                Join to track unread messages and get thread notifications.
              </span>
              <Btn
                size="sm"
                variant="secondary"
                onClick={async () => {
                  try {
                    await communicate({
                      command: 'channel.join',
                      id: channel.id,
                    });
                    await refreshDetail(channel.id);
                    await loadList();
                  } catch (e) {
                    flash(e instanceof Error ? e.message : 'Could not join.');
                  }
                }}
              >
                Join channel
              </Btn>
            </div>
          ) : null}
          <div
            className="min-h-0 flex-1 overflow-auto pt-3.5 pb-2"
            aria-busy={syncing}
          >
            {denied ? (
              <div className="max-w-[520px] px-6 pt-10">
                <EmptyState
                  icon={Lock}
                  title="You don’t have access to this channel"
                  description="It may be restricted, or your access was removed. Nothing from it is shown or delivered to you."
                  className="items-start px-0 text-left"
                >
                  <Btn
                    variant="secondary"
                    onClick={() =>
                      navigate({ channel: null, thread: null, message: null })
                    }
                  >
                    Back to channels
                  </Btn>
                </EmptyState>
              </div>
            ) : list && list.items.length === 0 ? (
              <div className="max-w-[520px] px-6 pt-10">
                <EmptyState
                  icon={Hash}
                  title="No channels yet"
                  description={
                    list.canCreate
                      ? 'Create a default #general channel for project-wide discussion, or a restricted channel for a smaller group.'
                      : 'A project owner or editor can create the first channel.'
                  }
                  className="items-start px-0 text-left"
                >
                  {list.canCreate ? (
                    <Btn variant="primary" onClick={() => setCreating(true)}>
                      Create channel
                    </Btn>
                  ) : null}
                </EmptyState>
              </div>
            ) : loadError ? (
              <div className="px-5">
                <ErrorBanner title="Messages could not be loaded">
                  {loadError}
                </ErrorBanner>
              </div>
            ) : !channel ? (
              <p className="px-5 text-ctl text-tx3">Loading conversation…</p>
            ) : (
              <>
                {timeline.before !== null ? (
                  <div className="px-5 pb-2">
                    <Btn
                      size="sm"
                      variant="subtle"
                      onClick={() => void loadOlder()}
                    >
                      Load earlier messages
                    </Btn>
                  </div>
                ) : messages.length === 0 && timeline.pending.length === 0 ? (
                  <div className="max-w-[520px] px-6 pt-10">
                    <EmptyState
                      icon={Hash}
                      title={`This is the start of #${channel.name}`}
                      description={
                        channel.visibility === 'RESTRICTED'
                          ? 'Only the members of this restricted channel can read it.'
                          : 'Messages here are visible to everyone who can read this project.'
                      }
                      className="items-start px-0 text-left"
                    />
                  </div>
                ) : null}
                <ol aria-label={`Messages in #${channel.name}`}>
                  {messages.map((m) => renderMessage(m, false))}
                  {pendingItems(null)}
                </ol>
                <div ref={bottom} />
              </>
            )}
          </div>
          {channel && !denied ? (
            <Composer
              channelId={channel.id}
              label={`Message #${channel.name}`}
              placeholder={`Message #${channel.name}`}
              disabled={!canPost}
              disabledReason={
                channel.archived
                  ? 'This channel is archived and read-only.'
                  : 'Viewers can read this channel but not post.'
              }
              shares={shares}
              onRemoveShare={(i) =>
                setShares((s) => s.filter((_, j) => j !== i))
              }
              onShare={() => setSharing('main')}
              onAtlas={() => setAtlasOpen(true)}
              onSubmit={(input) => submit(input, null)}
            />
          ) : null}
        </div>
      ) : null}
      {threadOpen && threadRoot && channel ? (
        <aside
          aria-label="Thread"
          className={cn(
            'flex flex-col border-l border-bd2 bg-canvas',
            threadSide ? 'w-[360px] shrink-0' : 'fixed inset-0 z-40',
          )}
        >
          <div className="flex h-12 items-center gap-2 border-b border-bd2 pr-2.5 pl-4">
            <h2 className="font-semibold">Thread</h2>
            <span className="text-xs text-tx3"># {channel.name}</span>
            <span className="flex-1" />
            <IconBtn
              label="Close thread"
              size="base"
              onClick={() => navigate({ thread: null })}
            >
              <X aria-hidden="true" className="size-[14px]" />
            </IconBtn>
          </div>
          <ol
            aria-label="Thread messages"
            className="flex-1 overflow-auto py-3"
          >
            {renderMessage(threadRoot, true)}
            <li className="px-4 pt-2.5 pb-1 text-[11.5px] text-tx3">
              {threadRoot.replyCount}{' '}
              {threadRoot.replyCount === 1 ? 'reply' : 'replies'}
            </li>
            {repliesOf(timeline, threadRoot.id).map((m) =>
              renderMessage(m, true),
            )}
            {pendingItems(threadRoot.id)}
          </ol>
          {threadRoot.deleted ? (
            <p className="px-4 pb-3.5 text-ctl text-tx3">
              The thread’s first message was deleted; replies are closed.
            </p>
          ) : (
            <Composer
              compact
              channelId={channel.id}
              label="Reply in thread"
              placeholder="Reply in thread…"
              disabled={!canPost}
              disabledReason={
                channel.archived
                  ? 'This channel is archived and read-only.'
                  : 'Viewers cannot reply.'
              }
              shares={threadShares}
              onRemoveShare={(i) =>
                setThreadShares((s) => s.filter((_, j) => j !== i))
              }
              onShare={() => setSharing('thread')}
              onAtlas={() => setAtlasOpen(true)}
              onSubmit={(input) => submit(input, threadRoot.id)}
            />
          )}
        </aside>
      ) : null}
      {atlasOpen && channel ? (
        <AtlasPanel
          projectId={project.id}
          channelId={channel.id}
          channelName={channel.name}
          threadRootId={threadOpen ? (threadId ?? null) : null}
          canPost={canPost}
          onClose={() => setAtlasOpen(false)}
          onPost={async (runId, body) => {
            await communicate({
              command: 'message.send',
              channelId: channel.id,
              ...(threadOpen && threadId ? { threadRootId: threadId } : {}),
              body: body.length > 3990 ? `${body.slice(0, 3989)}…` : body,
              aiRunId: runId,
              idempotencyKey: randomUUID(),
            });
            await backfill();
          }}
        />
      ) : null}
      <RecoverChannelDialog
        key={recovering?.id ?? 'none'}
        channel={recovering}
        actorId={actorId}
        onOpenChange={(open) => !open && setRecovering(null)}
        onRecovered={(id, self) => {
          setRecovering(null);
          flash('Manager appointed');
          void loadList();
          if (self) navigate({ channel: id, thread: null, message: null });
        }}
      />
      <CreateChannelDialog
        key={creating ? 'open' : 'closed'}
        projectId={project.id}
        open={creating}
        onOpenChange={setCreating}
        suggestDefault={!!list && list.items.length === 0}
        onCreated={(id) => {
          setCreating(false);
          void loadList().then(() =>
            navigate({ channel: id, thread: null, message: null }),
          );
          setMobileList(false);
        }}
      />
      {detail ? (
        <ChannelSettingsDialog
          key={`${detail.channel.id}-${detail.channel.version}-${settings}`}
          detail={detail}
          projectId={project.id}
          actorId={actorId}
          open={settings}
          onOpenChange={setSettings}
          onChanged={() => {
            void refreshDetail(detail.channel.id);
            void loadList();
          }}
        />
      ) : null}
      <ShareResearchDialog
        projectId={project.id}
        open={sharing !== null}
        onOpenChange={(open) => !open && setSharing(null)}
        onPick={(share) =>
          sharing === 'thread'
            ? setThreadShares((s) => [...s, share])
            : setShares((s) => [...s, share])
        }
      />
    </div>
  );
}
