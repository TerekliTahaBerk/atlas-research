BEGIN;
ALTER TABLE app.tasks ADD COLUMN position double precision NOT NULL DEFAULT 0;
-- Retain the prior edited-first order within each status without changing task revisions/content.
SET LOCAL ROLE atlas_policy;
WITH ranked AS (SELECT id,row_number() OVER(PARTITION BY "projectId",status ORDER BY "updatedAt" DESC,id)*1024 AS n FROM app.tasks)
UPDATE app.tasks t SET position=r.n FROM ranked r WHERE t.id=r.id;
RESET ROLE;
ALTER TABLE app.tasks ADD CONSTRAINT task_position_finite CHECK(position > '-Infinity'::float8 AND position < 'Infinity'::float8);
CREATE INDEX tasks_board_order ON app.tasks("projectId",status,position,id) WHERE "archivedAt" IS NULL;
CREATE INDEX tasks_assignee_due ON app.tasks("projectId","assigneeId","dueDate") WHERE "archivedAt" IS NULL;
CREATE TABLE app.task_writes(
 "taskId" uuid NOT NULL,"requestId" uuid NOT NULL,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,
 "actorId" text NOT NULL REFERENCES identity.users(id),hash text NOT NULL,revision integer NOT NULL CHECK(revision>0),
 "createdAt" timestamptz NOT NULL DEFAULT now(),PRIMARY KEY("taskId","requestId"),
 FOREIGN KEY("workspaceId","projectId","taskId") REFERENCES app.tasks("workspaceId","projectId",id)
);
ALTER TABLE app.task_writes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.task_writes FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON app.task_writes TO atlas_runtime;
GRANT SELECT ON app.task_writes TO atlas_backup;
CREATE POLICY task_receipt_read ON app.task_writes FOR SELECT TO atlas_runtime USING("actorId"=app.actor_id() AND app.can_read_research("workspaceId","projectId"));
CREATE POLICY task_receipt_write ON app.task_writes FOR INSERT TO atlas_runtime WITH CHECK("actorId"=app.actor_id() AND app.can_write_research("workspaceId","projectId"));
UPDATE ops.schema_revision SET revision='202611100010_tasks_experience' WHERE id=1;
COMMIT;
