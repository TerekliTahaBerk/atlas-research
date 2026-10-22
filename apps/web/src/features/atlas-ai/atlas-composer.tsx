'use client';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  AlignLeft,
  ArrowUp,
  AtSign,
  BookOpen,
  FileCode,
  FileText,
  FlaskConical,
  FolderKanban,
  GitCompare,
  Hash,
  ListPlus,
  ListTodo,
  MessageCircle,
  PenLine,
  Plus,
  Quote,
  Search,
  Sigma,
  Square,
  User,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import {
  commandsFor,
  filterMentions,
  type EntityKind,
  type MentionItem,
} from './contracts';
import { useAtlas } from './atlas-provider';
export const kindIcons: Partial<Record<EntityKind, typeof BookOpen>> = {
  paper: BookOpen,
  document: FileText,
  manuscript: FileCode,
  task: ListTodo,
  person: User,
  channel: Hash,
  project: FolderKanban,
  experiment: FlaskConical,
};
const commandIcons: Record<string, typeof BookOpen> = {
  ask: MessageCircle,
  search: Search,
  summarize: AlignLeft,
  compare: GitCompare,
  cite: Quote,
  rewrite: PenLine,
  latex: Sigma,
  'create-task': ListPlus,
};
const MENTION = /(^|\s)@([\w\-ğüşöçıİ]*)$/i;
const SLASH = /^\/([\w-]*)$/;
/**
 * The Atlas composer (handoff `AtlasComposer`): 42px, radius 10, soft green
 * in workspaces and neutral over the LaTeX editor. `@` opens structured
 * references, `/` opens context-specific commands.
 */
export function AtlasComposer({
  tone = 'green',
  height = 42,
  placeholder,
  className,
}: {
  tone?: 'green' | 'neutral';
  height?: number;
  placeholder?: string;
  className?: string;
}) {
  const atlas = useAtlas();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const value = atlas.input;
  const mention = value.match(MENTION);
  const slash = value.match(SLASH);
  const kind: 'mention' | 'slash' | null =
    dismissedFor === value
      ? null
      : mention
        ? 'mention'
        : slash
          ? 'slash'
          : null;
  const groups = kind === 'mention' ? filterMentions(mention?.[2] ?? '') : [];
  const mentionItems = groups.flatMap((g) => g.items);
  const commands =
    kind === 'slash' ? commandsFor(atlas.screen, slash?.[1] ?? '') : [];
  const count = kind === 'mention' ? mentionItems.length : commands.length;
  const active = Math.min(index, Math.max(0, count - 1));
  const open = kind !== null;
  const { setMenuOpen } = atlas;
  useEffect(() => {
    setMenuOpen(open);
    return () => setMenuOpen(false);
  }, [open, setMenuOpen]);
  const { registerInput } = atlas;
  useEffect(() => {
    return registerInput(inputRef.current);
  }, [registerInput]);
  useLayoutEffect(() => {
    if (!open) return;
    const el = document.getElementById(`${listId}-${active}`);
    if (el && typeof el.scrollIntoView === 'function')
      el.scrollIntoView({ block: 'nearest' });
  }, [active, listId, open]);
  function change(next: string) {
    setIndex(0);
    setDismissedFor(null);
    atlas.setInput(next);
  }
  function pickMention(item: MentionItem) {
    atlas.setInput(value.replace(/@[\w\-ğüşöçıİ]*$/i, ''));
    atlas.addChip({ id: item.id, kind: item.kind, title: item.title });
    if (atlas.mode === 'compact') atlas.setMode('open');
    inputRef.current?.focus();
  }
  function pickCommand(id: string) {
    atlas.setInput(`/${id} `);
    inputRef.current?.focus();
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      if (!count) return;
      setIndex((active + (event.key === 'ArrowDown' ? 1 : -1) + count) % count);
      return;
    }
    if (open && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setDismissedFor(value);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (kind === 'mention') {
        const item = mentionItems[active];
        if (item) pickMention(item);
        return;
      }
      if (kind === 'slash') {
        const cmd = commands[active];
        if (cmd) pickCommand(cmd.id);
        return;
      }
      atlas.send();
    }
  }
  const green = tone === 'green';
  let optionIndex = -1;
  return (
    <div className={cn('relative', className)}>
      <div
        className={cn(
          'flex items-center gap-1.5 rounded-xl border pr-1.5 pl-2 transition-[border-color,box-shadow] duration-150',
          green ? 'bg-aiin' : 'bg-el',
          focused
            ? green
              ? 'border-ac shadow-[0_0_0_3px_var(--acs)]'
              : 'border-tx3 shadow-[0_0_0_3px_var(--acs)]'
            : green
              ? 'border-aiib'
              : 'border-bd',
        )}
        style={{ height }}
      >
        <button
          type="button"
          aria-label="Add context (@)"
          onClick={() => {
            change(value && !/\s$/.test(value) ? `${value} @` : `${value}@`);
            inputRef.current?.focus();
          }}
          className="grid size-7 shrink-0 place-items-center rounded-md text-actx hover:bg-acs"
        >
          <Plus aria-hidden="true" className="size-[17px]" />
        </button>
        <input
          ref={inputRef}
          role="combobox"
          aria-label="Ask Atlas"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={
            open && count ? `${listId}-${active}` : undefined
          }
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={placeholder}
          onChange={(e) => change(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            setFocused(true);
            if (atlas.mode === 'compact') atlas.setMode('open');
          }}
          onBlur={() => setFocused(false)}
          className="h-10 min-w-0 flex-1 text-[13.5px] text-tx focus-visible:outline-none"
        />
        <button
          type="button"
          aria-label={atlas.busy ? 'Stop (Esc)' : 'Send (Enter)'}
          onClick={() => (atlas.busy ? atlas.stop() : atlas.send())}
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-[7px] transition-colors',
            atlas.busy
              ? 'bg-hov text-tx'
              : value
                ? 'bg-acb text-white hover:bg-acbh'
                : 'text-tx3',
          )}
        >
          {atlas.busy ? (
            <Square aria-hidden="true" className="size-[11px] fill-current" />
          ) : (
            <ArrowUp aria-hidden="true" className="size-[14px]" />
          )}
        </button>
      </div>
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label={
            kind === 'mention' ? 'Mention suggestions' : 'Slash commands'
          }
          className={cn(
            'absolute top-[50px] left-2.5 z-[5] max-h-[min(320px,50vh)] max-w-[calc(100%-20px)] animate-atlas-in overflow-auto rounded-xl border border-bd bg-pop p-[5px] shadow-pop',
            kind === 'mention' ? 'w-[300px]' : 'w-[320px]',
          )}
        >
          {kind === 'mention' ? (
            groups.length ? (
              groups.map((g) => (
                <div key={g.group} role="group" aria-label={g.group}>
                  <div
                    aria-hidden="true"
                    className="px-[9px] pt-[7px] pb-[3px] text-[11px] text-tx3"
                  >
                    {g.group}
                  </div>
                  {g.items.map((item) => {
                    optionIndex += 1;
                    const i = optionIndex;
                    const Icon = kindIcons[item.kind] ?? AtSign;
                    return (
                      <div
                        key={item.id}
                        id={`${listId}-${i}`}
                        role="option"
                        aria-selected={i === active}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickMention(item)}
                        onMouseEnter={() => setIndex(i)}
                        className={cn(
                          'flex min-h-[30px] cursor-pointer items-center gap-[9px] rounded-md px-[9px] py-1 text-ui',
                          i === active && 'bg-hov',
                        )}
                      >
                        <Icon
                          aria-hidden="true"
                          className="size-[13px] shrink-0 text-tx3"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {item.title}
                        </span>
                        <span className="text-[11px] text-tx3">{item.sub}</span>
                      </div>
                    );
                  })}
                </div>
              ))
            ) : (
              <div role="status" className="p-2.5 text-ctl text-tx3">
                No matches in this sample workspace
              </div>
            )
          ) : (
            <>
              <div
                aria-hidden="true"
                className="px-[9px] pt-[7px] pb-[3px] text-[11px] text-tx3"
              >
                Commands · preview only
              </div>
              {commands.length ? (
                commands.map((c, i) => {
                  const Icon = commandIcons[c.id] ?? MessageCircle;
                  return (
                    <div
                      key={c.id}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={i === active}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickCommand(c.id)}
                      onMouseEnter={() => setIndex(i)}
                      className={cn(
                        'flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-[9px] text-ui',
                        i === active && 'bg-hov',
                      )}
                    >
                      <Icon
                        aria-hidden="true"
                        className="size-[13px] shrink-0 text-actx"
                      />
                      <span className="font-mono text-ctl">/{c.id}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-tx3">
                        {c.description}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div role="status" className="p-2.5 text-ctl text-tx3">
                  No command for this context
                </div>
              )}
            </>
          )}
          <div
            aria-hidden="true"
            className="mt-1 border-t border-bd2 px-[9px] pt-1.5 pb-1 text-[11px] text-tx3"
          >
            ↑ ↓ move · ↵ pick · Esc dismiss
          </div>
        </div>
      ) : null}
    </div>
  );
}
