import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
/** Empty state: icon tile, serif title, short guidance, optional actions. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  dashed = false,
  className,
  headingLevel = 2,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
  dashed?: boolean;
  className?: string;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2.5 px-6 py-11 text-center',
        dashed && 'rounded-2xl border-[1.5px] border-dashed border-bd',
        className,
      )}
    >
      <span className="grid size-11 place-items-center rounded-xl bg-el text-tx2">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <Heading className="font-serif text-[22px]">{title}</Heading>
      <p className="max-w-[360px] text-ctl text-tx3">{description}</p>
      {children ? (
        <div className="mt-1.5 flex flex-wrap justify-center gap-1.5">
          {children}
        </div>
      ) : null}
    </div>
  );
}
export function ErrorBanner({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-danger/35 bg-dangers px-3 py-2.5 text-ctl"
    >
      <AlertCircle
        aria-hidden="true"
        className="mt-px size-[15px] shrink-0 text-danger"
      />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{title}</div>
        {children ? <div className="text-tx2">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}
export function SkeletonLines({
  widths = [92, 80, 60],
}: {
  widths?: number[];
}) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2.5">
      {widths.map((w, i) => (
        <div
          key={i}
          className="h-3 animate-atlas-pulse rounded-xs bg-el"
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  );
}
