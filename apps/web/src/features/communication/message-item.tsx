'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Copy,
  FileText,
  ListTodo,
  Lock,
  MessageSquare,
  Pencil,
  RotateCw,
  SmilePlus,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import {
  reactionGlyphs,
  reactionKeys,
  type MessageDto,
  type MessageReferenceDto,
  type ReactionKey,
} from '@atlas/core';
import { IconBtn, Btn } from '@/components/atlas/button';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from '@/components/atlas/overlay';
import { MessageBody } from './message-body';
import type { PendingSend } from './timeline';

const kindIcon = { PAPER: BookOpen, DOCUMENT: FileText, TASK: ListTodo };
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
const initials = (name: string | null) =>
  (name ?? '?')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
function PersonMark({
  name,
  size = 32,
}: {
  name: string | null;
  size?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-lg bg-el text-[12px] font-semibold text-tx2"
      style={{ width: size, height: size }}
    >
      {initials(name)}
    </span>
  );
}

/** A per-viewer, re-authorized research card. Unavailable cards say nothing. */
export function ReferenceCard({
  reference: r,
}: {
  reference: MessageReferenceDto;
}) {
  const Icon = kindIcon[r.kind];
  if (r.state === 'UNAVAILABLE' || !r.title)
    return (
      <span className="mt-[7px] flex max-w-[460px] items-center gap-2 rounded-lg border border-dashed border-bd2 px-3 py-2 text-[12px] text-tx3">
        <Lock aria-hidden="true" className="size-[13px]" />
        Shared research you can’t access
      </span>
    );
  const content = (
    <>
      <Icon aria-hidden="true" className="size-[15px] shrink-0 text-tx3" />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate leading-[1.25]',
            r.kind === 'PAPER'
              ? 'font-serif text-[15px] tracking-[-0.02em]'
              : 'text-ctl font-medium',
          )}
        >
          {r.title}
        </span>
        <span className="block text-[11.5px] text-tx3">
          {[
            r.detail,
            r.state === 'ARCHIVED' ? 'Archived' : null,
            r.citation
              ? r.citation.state === 'AVAILABLE'
                ? r.citation.page
                  ? `Source passage · p. ${r.citation.page}`
                  : 'Source version'
                : 'Cited passage no longer available'
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {r.citation?.quote ? (
          <span className="mt-1 block border-l-2 border-bd pl-2 text-ctl text-tx2 italic">
            “{r.citation.quote}”
          </span>
        ) : null}
      </span>
      <span className="text-[11.5px] text-tx2">Open</span>
    </>
  );
  const box =
    'mt-[7px] flex max-w-[460px] items-center gap-2.5 rounded-lg border border-bd2 bg-card px-3 py-[9px] hover:border-bd';
  return r.href ? (
    <Link href={r.href} className={box}>
      {content}
    </Link>
  ) : (
    <span className={box}>{content}</span>
  );
}

export function MessageItem({
  message: m,
  highlighted,
  canPost,
  isOwn,
  inThread,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onCopyLink,
}: {
  message: MessageDto;
  highlighted: boolean;
  canPost: boolean;
  isOwn: boolean;
  inThread: boolean;
  onReply?: () => void;
  onReact: (emoji: ReactionKey, active: boolean) => void;
  onEdit: (body: string) => Promise<void>;
  onDelete: () => void;
  onCopyLink: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body);
  const [error, setError] = useState('');
  const atlas = m.kind === 'ATLAS';
  const name = atlas ? 'Atlas' : (m.author.name ?? 'Former member');
  return (
    <article
      id={`message-${m.id}`}
      tabIndex={-1}
      aria-label={`${name} at ${time(m.createdAt)}`}
      className={cn(
        'group relative flex gap-2.5 px-5 py-[7px] hover:bg-card focus-within:bg-card',
        highlighted && 'bg-acs/40',
      )}
    >
      {atlas ? (
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-acb font-serif text-[15px] font-semibold tracking-[-0.02em] text-white"
        >
          A
        </span>
      ) : (
        <PersonMark name={m.author.name} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-ui font-semibold">{name}</span>
          {atlas ? (
            <span className="rounded-sm border border-aiib bg-acs px-1.5 text-[10.5px] text-actx">
              Generated analysis · posted by{' '}
              {m.author.name ?? 'a former member'} · verify against sources
            </span>
          ) : null}
          <time dateTime={m.createdAt} className="text-[11px] text-tx3">
            {time(m.createdAt)}
          </time>
          {m.editedAt && !m.deleted ? (
            <span className="text-[11px] text-tx3">(edited)</span>
          ) : null}
        </div>
        {m.deleted ? (
          <p className="text-[13.5px] text-tx3 italic">Message deleted</p>
        ) : editing ? (
          <form
            className="mt-1"
            onSubmit={async (e) => {
              e.preventDefault();
              setError('');
              try {
                await onEdit(draft);
                setEditing(false);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Edit failed.');
              }
            }}
          >
            <label htmlFor={`edit-${m.id}`} className="sr-only">
              Edit message
            </label>
            <textarea
              id={`edit-${m.id}`}
              value={draft}
              maxLength={8000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(false);
              }}
              className="w-full rounded-lg border border-bd bg-canvas p-2 text-[13.5px]"
              rows={3}
              autoFocus
            />
            {error ? (
              <p role="alert" className="text-ctl text-danger">
                {error}
              </p>
            ) : null}
            <div className="mt-1 flex gap-1.5">
              <Btn type="submit" variant="primary" size="sm">
                Save
              </Btn>
              <Btn type="button" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Btn>
            </div>
          </form>
        ) : (
          <p className="text-[13.5px] leading-[1.55] break-words whitespace-pre-wrap text-tx">
            <MessageBody body={m.body} mentions={m.mentions} />
          </p>
        )}
        {m.references.map((r, i) => (
          <ReferenceCard key={`${r.artifactId}-${i}`} reference={r} />
        ))}
        {m.reactions.length || (m.replyCount && !inThread) ? (
          <div className="mt-[7px] flex flex-wrap items-center gap-1.5">
            {m.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                aria-pressed={r.mine}
                disabled={!canPost}
                aria-label={`${reactionGlyphs[r.emoji].label}: ${r.count}${r.mine ? ', including you' : ''}`}
                onClick={() => onReact(r.emoji, !r.mine)}
                className={cn(
                  'inline-flex h-[22px] items-center gap-1 rounded-[11px] border px-[7px] text-[11.5px]',
                  r.mine
                    ? 'border-aiib bg-acs text-actx'
                    : 'border-bd text-tx2 hover:bg-hov',
                )}
              >
                <span aria-hidden="true">{reactionGlyphs[r.emoji].glyph}</span>
                {r.count}
              </button>
            ))}
            {m.replyCount && !inThread ? (
              <button
                type="button"
                onClick={onReply}
                className="text-xs font-medium text-actx hover:underline"
              >
                {m.replyCount} {m.replyCount === 1 ? 'reply' : 'replies'}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {!m.deleted && !editing ? (
        <div
          role="toolbar"
          aria-label="Message actions"
          className="absolute -top-3 right-4 hidden items-center gap-0.5 rounded-lg border border-bd2 bg-pop p-0.5 shadow-pop group-hover:flex group-focus-within:flex"
        >
          {canPost ? (
            <Menu>
              <MenuTrigger asChild>
                <IconBtn label="Add reaction" size="md" tone="muted">
                  <SmilePlus aria-hidden="true" className="size-[13px]" />
                </IconBtn>
              </MenuTrigger>
              <MenuContent width={180} align="end">
                {reactionKeys.map((key) => {
                  const mine = m.reactions.find((r) => r.emoji === key)?.mine;
                  return (
                    <MenuItem
                      key={key}
                      checked={!!mine}
                      onSelect={() => onReact(key, !mine)}
                    >
                      <span aria-hidden="true" className="mr-1.5">
                        {reactionGlyphs[key].glyph}
                      </span>
                      {reactionGlyphs[key].label}
                    </MenuItem>
                  );
                })}
              </MenuContent>
            </Menu>
          ) : null}
          {!inThread && onReply ? (
            <IconBtn
              label="Reply in thread"
              size="md"
              tone="muted"
              onClick={onReply}
            >
              <MessageSquare aria-hidden="true" className="size-[13px]" />
            </IconBtn>
          ) : null}
          <IconBtn
            label="Copy message link"
            size="md"
            tone="muted"
            onClick={onCopyLink}
          >
            <Copy aria-hidden="true" className="size-[13px]" />
          </IconBtn>
          {isOwn && canPost && !atlas ? (
            <IconBtn
              label="Edit message"
              size="md"
              tone="muted"
              onClick={() => {
                setDraft(m.body);
                setEditing(true);
              }}
            >
              <Pencil aria-hidden="true" className="size-[13px]" />
            </IconBtn>
          ) : null}
          {isOwn && canPost ? (
            <IconBtn
              label="Delete message"
              size="md"
              tone="muted"
              onClick={onDelete}
            >
              <Trash2 aria-hidden="true" className="size-[13px]" />
            </IconBtn>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/** Optimistic local send; never presented as delivered until the server says so. */
export function PendingItem({
  send,
  onRetry,
  onDiscard,
}: {
  send: PendingSend;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const label =
    send.status === 'sending'
      ? 'Sending…'
      : send.status === 'retrying'
        ? 'Retrying…'
        : 'Not sent';
  return (
    <article
      aria-label={`Your message, ${label}`}
      className={cn(
        'flex gap-2.5 px-5 py-[7px]',
        send.status === 'failed' ? 'bg-dangers/40' : 'opacity-70',
      )}
    >
      <PersonMark name="You" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-ui font-semibold">You</span>
          <span
            role="status"
            className={cn(
              'text-[11px]',
              send.status === 'failed' ? 'text-danger' : 'text-tx3',
            )}
          >
            {label}
          </span>
        </div>
        <p className="text-[13.5px] leading-[1.55] break-words whitespace-pre-wrap">
          {send.body}
        </p>
        {send.labels.length ? (
          <p className="mt-1 text-[11.5px] text-tx3">
            Sharing: {send.labels.join(', ')}
          </p>
        ) : null}
        {send.status === 'failed' ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {send.error ? (
              <span className="text-ctl text-danger">{send.error}</span>
            ) : null}
            <Btn size="sm" variant="secondary" onClick={onRetry}>
              <RotateCw aria-hidden="true" />
              Retry
            </Btn>
            <Btn size="sm" onClick={onDiscard}>
              <X aria-hidden="true" />
              Discard
            </Btn>
          </div>
        ) : null}
      </div>
    </article>
  );
}
