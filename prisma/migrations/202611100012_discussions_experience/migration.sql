BEGIN;
ALTER TABLE app.discussions ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0), ADD COLUMN "archivedAt" timestamptz;
ALTER TABLE app.messages ADD COLUMN mentions text[] NOT NULL DEFAULT '{}';
CREATE INDEX messages_cursor_order ON app.messages("discussionId","createdAt",id);
CREATE INDEX discussions_recent_active ON app.discussions("projectId","updatedAt" DESC,id) WHERE "archivedAt" IS NULL;
UPDATE ops.schema_revision SET revision='202611100012_discussions_experience' WHERE id=1;
COMMIT;
