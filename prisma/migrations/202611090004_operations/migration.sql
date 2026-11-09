CREATE SCHEMA ops;
-- Fresh identity also guards direct runtime SQL deletion, beyond the HTTP check.
CREATE OR REPLACE FUNCTION app.guard_project() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF (NEW.id,NEW."workspaceId",NEW."createdBy",NEW."createdAt") IS DISTINCT FROM (OLD.id,OLD."workspaceId",OLD."createdBy",OLD."createdAt") THEN RAISE EXCEPTION 'immutable_scope' USING ERRCODE='23514'; END IF;
 IF NEW."deletedAt" IS DISTINCT FROM OLD."deletedAt" AND (NOT app.has_project_role(OLD."workspaceId",OLD.id,ARRAY['owner']) OR NOT app.fresh_actor()) THEN RAISE EXCEPTION 'unavailable' USING ERRCODE='42501'; END IF;
 IF OLD."deletedAt" IS NOT NULL AND NEW."deletedAt" IS NULL AND OLD."deletedAt"<now()-interval '30 days' THEN RAISE EXCEPTION 'restore_expired' USING ERRCODE='23514'; END IF;
 IF (NEW.name,NEW.description) IS DISTINCT FROM (OLD.name,OLD.description) AND (OLD."archivedAt" IS NOT NULL OR EXISTS(SELECT 1 FROM app.workspaces WHERE id=OLD."workspaceId" AND "archivedAt" IS NOT NULL)) THEN RAISE EXCEPTION 'archived' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON SCHEMA ops FROM PUBLIC;
ALTER TABLE identity.mail_outbox SET SCHEMA ops;
REVOKE ALL ON ops.mail_outbox FROM atlas_auth;
GRANT USAGE ON SCHEMA identity TO atlas_auth;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA identity TO atlas_auth;
GRANT USAGE ON SCHEMA ops TO atlas_queue,atlas_runtime;
GRANT SELECT,INSERT,UPDATE ON ops.mail_outbox TO atlas_queue;
GRANT INSERT ON ops.mail_outbox TO atlas_runtime;
CREATE TABLE ops.schema_revision(id integer PRIMARY KEY CHECK(id=1),revision text NOT NULL);
CREATE TABLE ops.service_heartbeat(service text PRIMARY KEY,revision text NOT NULL,"checkedAt" timestamptz NOT NULL);
GRANT SELECT ON ops.schema_revision,ops.service_heartbeat TO atlas_runtime;
GRANT SELECT,INSERT,UPDATE ON ops.service_heartbeat TO atlas_queue;
GRANT USAGE ON SCHEMA app,identity,ops,public TO atlas_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA app,identity,ops,public TO atlas_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE atlas_migrator IN SCHEMA app,identity,ops,public GRANT SELECT ON TABLES TO atlas_backup;
INSERT INTO ops.schema_revision VALUES(1,'202611090004_operations');
