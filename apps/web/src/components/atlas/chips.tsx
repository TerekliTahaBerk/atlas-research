import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import type { Person } from '@/lib/preview/people';
/** Compact, removable reference chip (handoff `ContextChip`). */
export function RefChip({
  icon,
  children,
  onRemove,
  removeLabel,
  className,
  title,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-[22px] max-w-[230px] items-center gap-[5px] rounded-sm border border-bd2 bg-el pr-1 pl-[7px] text-[11.5px] text-tx2 [&_svg]:size-[11px] [&_svg]:shrink-0',
        !onRemove && 'pr-[7px]',
        className,
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? 'Remove context'}
          className="grid size-4 place-items-center rounded-[3px] text-tx3 hover:bg-hov hover:text-tx"
        >
          <X className="size-[10px]" aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}
/** Inline object reference used inside prose (task, file, linked item). */
export function InlineRef({
  icon,
  children,
  onClick,
  className,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const cls = cn(
    'inline-flex h-6 items-center gap-[5px] whitespace-nowrap rounded-sm border border-bd2 bg-el px-2 font-sans text-xs text-tx2 [&_svg]:size-3',
    onClick && 'hover:bg-hov hover:text-tx',
    className,
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {icon}
      {children}
    </button>
  ) : (
    <span className={cls}>
      {icon}
      {children}
    </span>
  );
}
export function CountBadge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'tnum grid h-5 min-w-5 place-items-center rounded-sm bg-el px-1.5 font-sans text-[11px] text-tx2',
        className,
      )}
    >
      {children}
    </span>
  );
}
export function UnreadBadge({ children }: { children: ReactNode }) {
  return (
    <span className="tnum grid h-[17px] min-w-[18px] place-items-center rounded-[9px] bg-acs px-[5px] text-[10.5px] font-semibold text-actx">
      {children}
    </span>
  );
}
export function Kbd({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        'grid h-[17px] min-w-[17px] place-items-center rounded-xs border border-bd2 bg-el px-1 font-sans text-[10.5px] text-tx3',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
/** Visible preview boundary label ("Sample", "Prototype", "Sample data"). */
export function SampleTag({
  children = 'Sample',
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-xs border border-bd px-[5px] font-sans text-[10.5px] leading-4 text-tx3',
        className,
      )}
    >
      {children}
    </span>
  );
}
export function StatusTag({
  children,
  tone = 'default',
  className,
}: {
  children: ReactNode;
  tone?: 'default' | 'accent';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px]',
        tone === 'accent' ? 'border-aiib text-actx' : 'border-bd text-tx2',
        className,
      )}
    >
      {children}
    </span>
  );
}
export function Dot({
  color,
  className,
}: {
  color: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-1.5 shrink-0 rounded-full', className)}
      style={{ background: color }}
    />
  );
}
/** Initials avatar; colors are fixture-provided and AA with white text. */
export function Avatar({
  person,
  size = 20,
  square = false,
  ring,
  className,
  title,
}: {
  person: Pick<Person, 'initials' | 'color' | 'name'>;
  size?: number;
  square?: boolean;
  ring?: string;
  className?: string;
  title?: string;
}) {
  return (
    <span
      role="img"
      aria-label={title ?? person.name}
      title={title ?? person.name}
      className={cn(
        'grid shrink-0 place-items-center font-semibold text-white select-none',
        square ? 'rounded-[25%]' : 'rounded-full',
        className,
      )}
      style={{
        width: size,
        height: size,
        background: person.color,
        fontSize: Math.max(7.5, Math.round(size * 0.38 * 2) / 2),
        boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
      }}
    >
      <span aria-hidden="true">{person.initials}</span>
    </span>
  );
}
export function AvatarStack({
  people,
  size = 20,
  ring = 'var(--card)',
  className,
}: {
  people: Pick<Person, 'initials' | 'color' | 'name'>[];
  size?: number;
  ring?: string;
  className?: string;
}) {
  return (
    <span className={cn('flex pl-[5px]', className)}>
      {people.map((p) => (
        <Avatar
          key={p.name}
          person={p}
          size={size}
          ring={ring}
          className="-ml-[5px]"
        />
      ))}
    </span>
  );
}
