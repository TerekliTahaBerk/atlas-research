import type { TaskData } from "./collaboration-types";
export const priorities = ["low", "medium", "high", "urgent"] as const;
export function calendarToday(now = new Date(), timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((key) => parts.find((p) => p.type === key)!.value)
    .join("-");
}
export function calendarAfter(day: string, offset: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
}
export function dueLabel(
  task: Pick<TaskData, "dueDate" | "status">,
  today = calendarToday(),
) {
  const day = task.dueDate;
  if (!day) return "";
  if (task.status !== "done" && day < today) return "Overdue · " + day;
  if (day === today) return "Today";
  if (day === calendarAfter(today, 1)) return "Tomorrow";
  return day;
}
export function taskPayload(t: TaskData) {
  return {
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    assigneeId: t.assigneeId,
    dueDate: t.dueDate,
    revision: t.revision,
  };
}
