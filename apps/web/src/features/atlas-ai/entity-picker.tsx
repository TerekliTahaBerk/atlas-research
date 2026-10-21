'use client';
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { AtSign, Command } from 'lucide-react';
import {
  getPickerItems,
  type AssistantContext,
  type ContextReference,
} from './contracts';
export function useEntityPicker({
  value,
  onChange,
  context,
  onAttach,
}: {
  value: string;
  onChange: (value: string) => void;
  context: AssistantContext;
  onAttach: (reference: ContextReference) => void;
}) {
  const id = useId();
  const [dismissed, setDismissed] = useState(false);
  const [index, setIndex] = useState(0);
  const match = value.match(/(?:^|\s)([@/])([^\n@/]*)$/);
  const trigger = match?.[1] === '@' ? '@' : '/';
  const items =
    match && !dismissed ? getPickerItems(trigger, match[2] ?? '', context) : [];
  const open = Boolean(match && !dismissed);
  const activeIndex = Math.min(index, Math.max(0, items.length - 1));
  function change(next: string) {
    setDismissed(false);
    setIndex(0);
    onChange(next);
  }
  function select(item: (typeof items)[number]) {
    if (item.reference?.future) return;
    if (item.reference) onAttach(item.reference);
    onChange(
      value.replace(/([@/])([^\n@/]*)$/, item.reference ? '' : `/${item.id} `),
    );
    setDismissed(true);
  }
  function onKeyDown(
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setDismissed(true);
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setIndex(
        (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + items.length) %
          Math.max(1, items.length),
      );
    }
    const selected = items[activeIndex];
    if (event.key === 'Enter' && selected) {
      event.preventDefault();
      select(selected);
    }
  }
  return {
    open,
    id,
    items,
    activeIndex,
    trigger,
    change,
    select,
    onKeyDown,
    inputProps: {
      role: 'combobox' as const,
      'aria-autocomplete': 'list' as const,
      'aria-expanded': open,
      'aria-controls': open ? id : undefined,
      'aria-activedescendant':
        open && items.length ? `${id}-${activeIndex}` : undefined,
    },
  };
}
export function EntityPicker({
  picker,
}: {
  picker: ReturnType<typeof useEntityPicker>;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!picker.open || !menu) return;
    function place() {
      if (!menu || getComputedStyle(menu).position === 'static') return;
      const anchor = menu.offsetParent;
      if (!(anchor instanceof HTMLElement)) return;
      const bounds = anchor.getBoundingClientRect();
      const panel = menu.closest('.assistant-panel')?.getBoundingClientRect();
      const topEdge = Math.max(0, panel?.top ?? 0);
      const bottomEdge = Math.min(
        window.innerHeight,
        panel?.bottom ?? window.innerHeight,
      );
      const above = Math.max(0, bounds.top - topEdge - 16);
      const below = Math.max(0, bottomEdge - bounds.bottom - 16);
      const required = Math.min(300, menu.scrollHeight);
      const down = above < required && below > above;
      menu.style.top = down ? 'calc(100% + 8px)' : 'auto';
      menu.style.bottom = down ? 'auto' : 'calc(100% + 8px)';
      menu.style.marginBottom = '0';
      menu.style.maxHeight = `${Math.max(80, Math.min(300, down ? below : above))}px`;
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [picker.open, picker.items.length]);
  useLayoutEffect(() => {
    if (!picker.open) return;
    const active = menuRef.current?.querySelector('[aria-selected="true"]');
    if (
      active instanceof HTMLElement &&
      typeof active.scrollIntoView === 'function'
    )
      active.scrollIntoView({ block: 'nearest' });
  }, [picker.open, picker.activeIndex]);
  if (!picker.open) return null;
  return (
    <div
      ref={menuRef}
      className="entity-picker"
      role="listbox"
      id={picker.id}
      aria-label={
        picker.trigger === '@' ? 'Mention suggestions' : 'Slash commands'
      }
    >
      <div className="picker-label">
        {picker.trigger === '@'
          ? 'Attach sample context'
          : 'Commands · preview only'}
      </div>
      {picker.items.map((item, index) => (
        <button
          type="button"
          role="option"
          key={item.id}
          id={`${picker.id}-${index}`}
          aria-selected={picker.activeIndex === index}
          aria-disabled={item.reference?.future || undefined}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => picker.select(item)}
        >
          {picker.trigger === '@' ? (
            <AtSign aria-hidden="true" />
          ) : (
            <Command aria-hidden="true" />
          )}
          <span>
            <strong>{item.title}</strong>
            <small>{item.description}</small>
          </span>
        </button>
      ))}
      {!picker.items.length ? (
        <p role="status">No matching items. Try another name.</p>
      ) : null}
      <div className="picker-hint">
        ↑ ↓ navigate · Enter select · Esc dismiss
      </div>
    </div>
  );
}
