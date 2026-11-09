BEGIN;
-- Existing last-known reading_states rows stay intact and remain the fallback for first use.
CREATE TABLE app.reading_positions(
 "workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,"sourceId" uuid NOT NULL,"versionId" uuid NOT NULL,
 "userId" text NOT NULL REFERENCES identity.users(id),page integer NOT NULL DEFAULT 1 CHECK(page BETWEEN 1 AND 100000),
 zoom double precision NOT NULL DEFAULT 1 CHECK(zoom BETWEEN 0.5 AND 2.5),
 "zoomMode" text NOT NULL DEFAULT 'manual' CHECK("zoomMode" IN ('manual','width','page')),
 position double precision NOT NULL DEFAULT 0 CHECK(position BETWEEN 0 AND 1),"updatedAt" timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY("versionId","userId"),
 FOREIGN KEY("workspaceId","projectId","sourceId","versionId") REFERENCES app.source_versions("workspaceId","projectId","sourceId",id)
);
ALTER TABLE app.reading_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.reading_positions FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON app.reading_positions TO atlas_runtime;
GRANT SELECT ON app.reading_positions TO atlas_backup;
CREATE POLICY position_read ON app.reading_positions FOR SELECT TO atlas_runtime USING("userId"=app.actor_id() AND app.can_read_research("workspaceId","projectId"));
CREATE POLICY position_create ON app.reading_positions FOR INSERT TO atlas_runtime WITH CHECK("userId"=app.actor_id() AND app.can_read_research("workspaceId","projectId"));
CREATE POLICY position_update ON app.reading_positions FOR UPDATE TO atlas_runtime USING("userId"=app.actor_id() AND app.can_read_research("workspaceId","projectId")) WITH CHECK("userId"=app.actor_id() AND app.can_read_research("workspaceId","projectId"));
CREATE FUNCTION app.guard_reading_position() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF ROW(NEW."workspaceId",NEW."projectId",NEW."sourceId",NEW."versionId",NEW."userId") IS DISTINCT FROM ROW(OLD."workspaceId",OLD."projectId",OLD."sourceId",OLD."versionId",OLD."userId") THEN RAISE EXCEPTION 'immutable reading position scope'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reading_position_guard BEFORE UPDATE ON app.reading_positions FOR EACH ROW EXECUTE FUNCTION app.guard_reading_position();
-- PDF viewing/notes do not depend on the 500-page extraction/AI preparation boundary.
ALTER TABLE app.reading_states DROP CONSTRAINT reading_states_page_check;
ALTER TABLE app.reading_states ADD CONSTRAINT reading_states_page_check CHECK(page BETWEEN 1 AND 100000);
ALTER TABLE app.annotations DROP CONSTRAINT annotations_page_check;
ALTER TABLE app.annotations ADD CONSTRAINT annotations_page_check CHECK(page BETWEEN 1 AND 100000);
UPDATE ops.schema_revision SET revision='202611090009_reader_experience' WHERE id=1;
COMMIT;
