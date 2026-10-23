# Task model

`tasks`: project-scoped (`organization_id, workspace_id, project_id`), `artifact_id` (TASK), human number `task_number` unique per project (allocated under a per-project advisory lock; shown as `#12`), `title` ≤200, `description` ≤20 000 (plain text), `status`, `priority` (NONE, LOW, MEDIUM, HIGH, URGENT), `assignee_id`, `milestone_id` (composite FK to the same project), `due_date`, `version` (optimistic token), `completed_at` (set iff DONE), `archived_at`, creator/updater, optional `ai_run_id` provenance and a generated full-text vector.

`task_milestones`: project-scoped research deliverables (title, description, target date, PLANNED/ACTIVE/DONE, version, archive). No roadmap engine.

Commands: `task.create` (idempotency key; optional initial status TODO/IN_PROGRESS, references to papers/documents), `task.update` (patch: title, description, priority, due date, milestone, assignee), `task.assign`, `task.transition`, `task.archive`, `task.restore`, `milestone.create/update/archive`. All require `expectedVersion` except creates.

UI (`features/tasks/live-tasks.tsx`): approved Board/List, filters (assignee incl. me/unassigned, priority, milestone, archived), optimistic moves with rollback and an `aria-live` announcement, a keyboard **Move** menu on every card listing only allowed targets, detail panel with status/priority/assignee/due/milestone, description, typed links, creator/update time. Comments are labelled as Phase 05; nothing fabricated is shown. Board pages hold 300 tasks (signed cursor for more).
