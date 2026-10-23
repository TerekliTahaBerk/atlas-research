import {
  CircleCheck,
  CircleSlash,
  Minus,
  CircleDashed,
  CircleDot,
  CircleEllipsis,
  SignalHigh,
  SignalLow,
  SignalMedium,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import type { Priority, TaskStatus } from '@/lib/preview/workspace';
import {
  taskPriorityLabels,
  taskStatusLabels,
  type TaskPriorityValue,
  type TaskStatusValue,
} from '@atlas/core';
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

/** Live (Phase 04) statuses reuse the approved icon language. */
const liveStatus: Record<
  TaskStatusValue,
  { icon: typeof CircleDot; className: string }
> = {
  TODO: { icon: CircleDashed, className: 'text-tx3' },
  IN_PROGRESS: { icon: CircleDot, className: 'text-warn' },
  IN_REVIEW: { icon: CircleEllipsis, className: 'text-tx2' },
  DONE: { icon: CircleCheck, className: 'text-ac' },
  CANCELLED: { icon: CircleSlash, className: 'text-tx3' },
};
export function LiveStatusIcon({
  status,
  className,
}: {
  status: TaskStatusValue;
  className?: string;
}) {
  const m = liveStatus[status];
  return (
    <m.icon
      role="img"
      aria-label={taskStatusLabels[status]}
      className={cn('size-[14px] shrink-0', m.className, className)}
    />
  );
}
const livePriority: Record<TaskPriorityValue, typeof SignalHigh> = {
  URGENT: SignalHigh,
  HIGH: SignalHigh,
  MEDIUM: SignalMedium,
  LOW: SignalLow,
  NONE: Minus,
};
export function LivePriorityIcon({
  priority,
  className,
}: {
  priority: TaskPriorityValue;
  className?: string;
}) {
  const Icon = livePriority[priority];
  return (
    <Icon
      role="img"
      aria-label={taskPriorityLabels[priority]}
      className={cn(
        'size-[14px] shrink-0',
        priority === 'URGENT' ? 'text-danger' : 'text-tx3',
        className,
      )}
    />
  );
}
