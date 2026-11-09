import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calendarToday,
  calendarAfter,
  dueLabel,
} from "../../src/lib/task-model";
test("calendar dates respect local midnight without shifting stored due dates", () => {
  const instant = new Date("2026-11-09T21:30:00Z");
  assert.equal(calendarToday(instant, "Europe/Istanbul"), "2026-11-10");
  assert.equal(calendarToday(instant, "America/New_York"), "2026-11-09");
  assert.equal(calendarAfter("2028-02-28", 1), "2028-02-29");
  assert.equal(calendarAfter("2026-12-31", 1), "2027-01-01");
  assert.equal(
    dueLabel({ dueDate: "2026-11-10", status: "in_progress" }, "2026-11-10"),
    "Today",
  );
  assert.equal(
    dueLabel({ dueDate: "2026-11-11", status: "backlog" }, "2026-11-10"),
    "Tomorrow",
  );
  assert.equal(
    dueLabel({ dueDate: "2026-11-09", status: "done" }, "2026-11-10"),
    "2026-11-09",
  );
  assert.equal(
    dueLabel({ dueDate: "2026-11-09", status: "backlog" }, "2026-11-10"),
    "Overdue · 2026-11-09",
  );
});
