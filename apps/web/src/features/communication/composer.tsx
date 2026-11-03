'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUp, AtSign, BookOpen, Sparkles, X } from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import {
  MESSAGE_LIMIT,
  MESSAGE_REFERENCE_LIMIT,
  mentionToken,
  visibleLength,
  type MessageReferenceInput,
} from '@atlas/core';
import { Btn, IconBtn } from '@/components/atlas/button';
import { fetchPeople } from './client';

export interface ShareDraft {
  reference: MessageReferenceInput;
  label: string;
}
export interface ComposerSubmit {
  body: string;
  references: MessageReferenceInput[];
  labels: string[];
}

/**
 * Plain-text composer. `@Name` choices are recorded with their stable
 * profile IDs and converted to `<@id>` tokens at submit time; typed text that
 * merely looks like a name never becomes a mention.
 */
export function Composer({
  channelId,
  placeholder,
  label,
  disabled,
  disabledReason,
  shares,
  onRemoveShare,
  onShare,
  onAtlas,
  onSubmit,
  compact = false,
}: {
  channelId: string;
  placeholder: string;
  label: string;
  disabled: boolean;
  disabledReason?: string;
  shares: ShareDraft[];
  onRemoveShare: (index: number) => void;
  onShare?: () => void;
  onAtlas?: () => void;
  onSubmit: (input: ComposerSubmit) => void;
  compact?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [chosen, setChosen] = useState<{ id: string; name: string }[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const [active, setActive] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (query === null) return;
    let alive = true;
    const timer = setTimeout(() => {
      fetchPeople(channelId, query)
        .then((people) => alive && setOptions(people))
        .catch(() => alive && setOptions([]));
    }, 120);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [channelId, query]);
  const detect = (value: string, caret: number) => {
    const match = /(^|\s)@([^\s@]{0,40})$/.exec(value.slice(0, caret));
    setQuery(match ? match[2]! : null);
    setActive(0);
  };
  const pick = (person: { id: string; name: string }) => {
    const el = area.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([^\s@]{0,40})$/, '');
    const next = `${before}@${person.name} ${text.slice(caret)}`;
    setText(next);
    setChosen((c) => (c.some((p) => p.id === person.id) ? c : [...c, person]));
    setQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = before.length + person.name.length + 2;
      el?.setSelectionRange(pos, pos);
    });
  };
  const toBody = () => {
    let body = text;
    // Longest names first so “Ada Lovelace” wins over “Ada”.
    for (const p of [...chosen].sort((a, b) => b.name.length - a.name.length))
      body = body.split(`@${p.name}`).join(mentionToken(p.id));
    return body.trim();
  };
  const length = visibleLength(toBody());
  const over = length > MESSAGE_LIMIT;
  const submit = () => {
    const body = toBody();
    if (!body || over || disabled) return;
    onSubmit({
      body,
      references: shares.map((s) => s.reference),
      labels: shares.map((s) => s.label),
    });
    setText('');
    setChosen([]);
    setQuery(null);
  };
  if (disabled)
    return (
      <div className="px-4 pb-3.5">
        <p
          role="status"
          className="rounded-xl border border-dashed border-bd px-3 py-2.5 text-ctl text-tx3"
        >
          {disabledReason ?? 'You can read this channel but not post.'}
        </p>
      </div>
    );
  const listId = `${id}-people`;
  return (
    <form
      className={cn('relative', compact ? 'px-3 pb-3.5' : 'px-4 pb-3.5')}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {query !== null && options.length ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Mention a project member"
          className="absolute bottom-full left-4 z-10 mb-1 max-h-56 w-64 overflow-auto rounded-lg border border-bd bg-pop p-1 shadow-pop"
        >
          {options.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              className={cn(
                'cursor-pointer rounded-md px-2 py-1.5 text-ctl',
                i === active && 'bg-hov',
              )}
            >
              {p.name}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="rounded-xl border border-bd bg-canvas focus-within:border-actx">
        {shares.length ? (
          <ul
            aria-label="Research to share"
            className="flex flex-wrap gap-1.5 px-2.5 pt-2"
          >
            {shares.map((s, i) => (
              <li
                key={`${s.reference.artifactId}-${i}`}
                className="inline-flex h-6 max-w-[260px] items-center gap-1 rounded-md border border-bd2 bg-card pr-1 pl-2 text-xs"
              >
                <BookOpen
                  aria-hidden="true"
                  className="size-3 shrink-0 text-tx3"
                />
                <span className="truncate">{s.label}</span>
                <IconBtn
                  label={`Remove ${s.label}`}
                  size="xs"
                  tone="muted"
                  onClick={() => onRemoveShare(i)}
                >
                  <X aria-hidden="true" className="size-[11px]" />
                </IconBtn>
              </li>
            ))}
          </ul>
        ) : null}
        <label htmlFor={`${id}-input`} className="sr-only">
          {label}
        </label>
        <textarea
          id={`${id}-input`}
          ref={area}
          value={text}
          rows={compact ? 1 : 2}
          role="combobox"
          aria-expanded={query !== null && options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            query !== null && options[active]
              ? `${listId}-${active}`
              : undefined
          }
          aria-describedby={`${id}-hint`}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            detect(e.target.value, e.target.selectionStart);
          }}
          onKeyDown={(e) => {
            if (query !== null && options.length) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                setActive(
                  (active + (e.key === 'ArrowDown' ? 1 : -1) + options.length) %
                    options.length,
                );
                return;
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                pick(options[active]!);
                return;
              }
              if (e.key === 'Escape') {
                setQuery(null);
                return;
              }
            }
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              submit();
            }
          }}
          className="block w-full resize-none bg-transparent px-3 py-2.5 text-[13.5px] outline-none"
        />
        <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
          <IconBtn
            label="Mention someone"
            size="base"
            tone="muted"
            onClick={() => {
              const next = `${text}${text && !text.endsWith(' ') ? ' ' : ''}@`;
              setText(next);
              setQuery('');
              area.current?.focus();
            }}
          >
            <AtSign aria-hidden="true" className="size-[14px]" />
          </IconBtn>
          {onShare ? (
            <Btn
              type="button"
              size="md"
              variant="ghost"
              className="font-normal"
              disabled={shares.length >= MESSAGE_REFERENCE_LIMIT}
              onClick={onShare}
            >
              <BookOpen aria-hidden="true" className="!size-3" />
              Share research
            </Btn>
          ) : null}
          {onAtlas ? (
            <Btn
              type="button"
              variant="aiGhost"
              size="md"
              className="font-normal"
              onClick={onAtlas}
            >
              <Sparkles aria-hidden="true" className="!size-3" />
              @Atlas
            </Btn>
          ) : null}
          <span
            id={`${id}-hint`}
            className={cn(
              'flex-1 pr-2 text-right text-[11px] max-sm:hidden',
              over ? 'text-danger' : 'text-tx3',
            )}
          >
            {over
              ? `${length - MESSAGE_LIMIT} characters over the limit`
              : 'Enter to send · Shift+Enter for a new line'}
          </span>
          <button
            type="submit"
            aria-label="Send message"
            disabled={!text.trim() || over}
            className={cn(
              'ml-auto grid size-7 place-items-center rounded-[7px]',
              text.trim() && !over ? 'bg-acb text-white' : 'bg-el text-tx3',
            )}
          >
            <ArrowUp aria-hidden="true" className="size-[14px]" />
          </button>
        </div>
      </div>
    </form>
  );
}
