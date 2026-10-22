import {
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleEllipsis,
  SignalHigh,
  SignalLow,
  SignalMedium,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import type { Priority, TaskStatus } from '@/lib/preview/workspace';
/** Status icon colors are the only color on the board (handoff §4). */
const statusMeta: Record<
  TaskStatus,
  { icon: typeof CircleDot; label: string; className: string }
> = {
  backlog: { icon: CircleDashed, label: 'Backlog', className: 'text-tx3' },
  progress: { icon: CircleDot, label: 'In progress', className: 'text-warn' },
  review: { icon: CircleEllipsis, label: 'In review', className: 'text-tx2' },
  done: { icon: CircleCheck, label: 'Done', className: 'text-ac' },
};
export function statusLabel(status: TaskStatus) {
  return statusMeta[status].label;
}
export function TaskStatusIcon({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  const m = statusMeta[status];
  return (
    <m.icon
      role="img"
      aria-label={m.label}
      className={cn('size-[14px] shrink-0', m.className, className)}
    />
  );
}
const priorityIcons = {
  High: SignalHigh,
  Medium: SignalMedium,
  Low: SignalLow,
} as const;
export function PriorityIcon({
  priority,
  className,
}: {
  priority: Priority;
  className?: string;
}) {
  const Icon = priorityIcons[priority];
  return (
    <Icon
      role="img"
      aria-label={`${priority} priority`}
      className={cn('size-[14px] shrink-0 text-tx3', className)}
    />
  );
}
