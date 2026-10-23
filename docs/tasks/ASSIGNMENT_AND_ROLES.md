# Assignment and capability matrix

Capabilities derive from the existing project capabilities (`artifactCapabilities`), not a new role system:

| Capability                                                                                                                                                          | Requires        | Project role                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------- |
| document.read, document.version.read, document.export, task.read, artifact.search                                                                                   | `project.read`  | VIEWER, EDITOR, OWNER; workspace members for workspace-visible projects |
| document.create/edit/version.restore/archive, task.create/edit/assign/status.update/archive, milestone.manage, artifact.link.create/remove, AI proposal application | `project.write` | EDITOR, OWNER                                                           |

Private projects need an explicit project grant; organization/workspace administrators without one get 404 for every Phase 04 endpoint. Archived documents are visible (for restore) only to writers. Removed members lose all access immediately (RLS evaluates live memberships).

Assignment eligibility (`atlas_private.task_assignable`): an explicit OWNER or EDITOR project membership that currently confers `project.write`. Viewers, workspace-only members, other tenants and arbitrary IDs are rejected with `VALIDATION_ERROR`.

Revocation policy: when an assignee loses eligibility, the stored `assignee_id` is kept for history but displayed as "Former participant" without a name; the person cannot read the task; the assignee cannot be newly assigned anywhere, while other task fields stay editable and the task can be reassigned or unassigned. Person mentions follow the same participant rule.
