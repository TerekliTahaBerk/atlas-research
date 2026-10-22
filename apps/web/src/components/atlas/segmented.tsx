'use client';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@atlas/ui/lib/utils';
export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  /** Accessible name when the label is icon-only. */
  ariaLabel?: string;
}
/**
 * Segmented control (handoff `SegmentedControl`: track --el, active --hov).
 * Radio-group semantics with roving focus and arrow-key selection.
 */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  size = 'base',
  variant = 'track',
  className,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentOption<T>[];
  size?: 'sm' | 'base';
  variant?: 'track' | 'plain' | 'solid';
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + options.length) % options.length;
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    refs.current[next]?.focus();
  }
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'flex w-max max-w-full shrink-0 gap-0.5',
        variant === 'track' &&
          (size === 'sm'
            ? 'rounded-[7px] border border-bd2 bg-el p-[2px]'
            : 'rounded-lg border border-bd2 bg-el p-[3px]'),
        variant === 'solid' && 'rounded-lg bg-el p-[3px]',
        className,
      )}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.ariaLabel}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKey(event, index)}
            className={cn(
              'flex items-center gap-[5px] whitespace-nowrap transition-colors [&_svg]:size-[13px]',
              size === 'sm'
                ? 'h-6 rounded-[5px] px-[9px] text-xs'
                : 'h-[26px] rounded-md px-2.5 text-ctl',
              active ? 'bg-hov text-tx' : 'text-tx2 hover:text-tx',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
