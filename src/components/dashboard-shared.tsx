"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { calendarToday, dueLabel } from "@/lib/task-model";
import { statusName } from "@/lib/collaboration-types";
import type { DashboardTask } from "@/lib/dashboard-types";
import { Icon } from "./ui";
export function useCalendarToday() {
  const [today, setToday] = useState(calendarToday);
  useEffect(() => {
    const tick = () => setToday(calendarToday()),
      timer = setInterval(tick, 60000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, []);
  return today;
}
export const displayDate = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export function DashboardTasks({
  items,
  today,
}: {
  items: DashboardTask[];
  today: string;
}) {
  return (
    <div className="dashboard-rows">
      {items.map((t) => (
        <Link key={t.id} className="dashboard-row" href={t.href}>
          <Icon name="check" />
          <span>
            <strong>{t.title}</strong>
            <small>
              {t.projectName ? t.projectName + " · " : ""}
              {t.priority} · {statusName(t.status)}
              {t.dueDate ? " · " + dueLabel(t, today) : ""}
              {t.assignedToYou ? " · Assigned to you" : ""}
            </small>
          </span>
        </Link>
      ))}
    </div>
  );
}
