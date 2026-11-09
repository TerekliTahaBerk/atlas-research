-- Additive Phase 03; no existing content, volume or credential is replaced.
BEGIN;
-- Exclusive scope locks serialize content writes too; editor is a valid writer.
-- Governance callers still enforce owner/admin separately, with RLS action checks.
CREATE OR REPLACE FUNCTION app.lock_project(w uuid,p uuid,exclusive boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT app.lock_workspace(w,false) OR NOT app.has_project_role(w,p,ARRAY['owner','admin','editor','viewer']) THEN RETURN false; END IF;
 IF exclusive THEN
  IF NOT app.has_project_role(w,p,ARRAY['owner','admin','editor']) THEN RETURN false; END IF;
  PERFORM 1 FROM app.projects WHERE id=p AND "workspaceId"=w FOR UPDATE;
 ELSE PERFORM 1 FROM app.projects WHERE id=p AND "workspaceId"=w FOR SHARE;
 END IF;
 RETURN app.has_project_role(w,p,ARRAY['owner','admin','editor','viewer']);
END $$;

ALTER TABLE app.artifacts DROP CONSTRAINT artifacts_kind_check;
ALTER TABLE app.artifacts ADD CONSTRAINT artifacts_kind_check CHECK(kind IN ('source','annotation','document','task','discussion'));
CREATE TABLE app.documents(id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,title text NOT NULL CHECK(length(title) BETWEEN 1 AND 300),body jsonb NOT NULL,revision integer NOT NULL DEFAULT 1 CHECK(revision>0),"createdBy" text NOT NULL REFERENCES identity.users(id),"archivedAt" timestamptz,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),"artifactKind" text NOT NULL DEFAULT 'document' CHECK("artifactKind"='document'),UNIQUE("workspaceId","projectId",id),FOREIGN KEY("workspaceId","projectId",id,"artifactKind") REFERENCES app.artifacts("workspaceId","projectId",id,kind));
CREATE TABLE app.document_versions(id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,"documentId" uuid NOT NULL,revision integer NOT NULL,title text NOT NULL,body jsonb NOT NULL,"createdBy" text NOT NULL REFERENCES identity.users(id),"createdAt" timestamptz NOT NULL DEFAULT now(),UNIQUE("documentId",revision),FOREIGN KEY("workspaceId","projectId","documentId") REFERENCES app.documents("workspaceId","projectId",id));
CREATE TABLE app.document_writes(id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,"documentId" uuid NOT NULL,"requestId" uuid NOT NULL,"actorId" text NOT NULL REFERENCES identity.users(id),hash text NOT NULL,revision integer NOT NULL,"createdAt" timestamptz NOT NULL DEFAULT now(),UNIQUE("documentId","requestId"),FOREIGN KEY("workspaceId","projectId","documentId") REFERENCES app.documents("workspaceId","projectId",id));
CREATE TABLE app.citations(id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,"documentId" uuid NOT NULL,"sourceId" uuid NOT NULL,"versionId" uuid NOT NULL,"annotationId" uuid,page integer CHECK(page BETWEEN 1 AND 500),quote text NOT NULL DEFAULT '',"createdAt" timestamptz NOT NULL DEFAULT now(),UNIQUE("workspaceId","projectId",id),FOREIGN KEY("workspaceId","projectId","documentId") REFERENCES app.documents("workspaceId","projectId",id),FOREIGN KEY("workspaceId","projectId","sourceId","versionId") REFERENCES app.source_versions("workspaceId","projectId","sourceId",id),FOREIGN KEY("workspaceId","projectId","annotationId") REFERENCES app.annotations("workspaceId","projectId",id));
CREATE TABLE app.artifact_links("workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,"fromId" uuid NOT NULL,"toId" uuid NOT NULL,CHECK("fromId"<>"toId"),PRIMARY KEY("fromId","toId"),FOREIGN KEY("workspaceId","projectId","fromId") REFERENCES app.artifacts("workspaceId","projectId",id),FOREIGN KEY("workspaceId","projectId","toId") REFERENCES app.artifacts("workspaceId","projectId",id));
CREATE TABLE app.tasks(id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,title text NOT NULL CHECK(length(title) BETWEEN 1 AND 300),description text NOT NULL DEFAULT '' CHECK(length(description)<=20000),status text NOT NULL DEFAULT 'backlog' CHECK(status IN ('backlog','in_progress','in_review','done')),priority text NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),"assigneeId" text REFERENCES identity.users(id),"dueDate" text,revision integer NOT NULL DEFAULT 1,"archivedAt" timestamptz,"createdBy" text NOT NULL REFERENCES identity.users(id),"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),"artifactKind" text NOT NULL DEFAULT 'task' CHECK("artifactKind"='task'),UNIQUE("workspaceId","projectId",id),FOREIGN KEY("workspaceId","projectId",id,"artifactKind") REFERENCES app.artifacts("workspaceId","projectId",id,kind));
CREATE TABLE app.discussions(id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,title text NOT NULL CHECK(length(title) BETWEEN 1 AND 300),"createdBy" text NOT NULL REFERENCES identity.users(id),"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),"artifactKind" text NOT NULL DEFAULT 'discussion' CHECK("artifactKind"='discussion'),UNIQUE("workspaceId","projectId",id),FOREIGN KEY("workspaceId","projectId",id,"artifactKind") REFERENCES app.artifacts("workspaceId","projectId",id,kind));
CREATE TABLE app.messages(id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,"discussionId" uuid NOT NULL,"authorId" text NOT NULL REFERENCES identity.users(id),"clientId" uuid NOT NULL,"artifactIds" uuid[] NOT NULL DEFAULT '{}',body text NOT NULL CHECK(length(body) BETWEEN 1 AND 20000),revision integer NOT NULL DEFAULT 1,"editedAt" timestamptz,"createdAt" timestamptz NOT NULL DEFAULT now(),UNIQUE("discussionId","authorId","clientId"),FOREIGN KEY("workspaceId","projectId","discussionId") REFERENCES app.discussions("workspaceId","projectId",id));
CREATE TABLE app.notifications(id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,"recipientId" text NOT NULL REFERENCES identity.users(id),"targetId" uuid NOT NULL,event text NOT NULL CHECK(event IN ('assignment','reply','mention')),"eventId" text NOT NULL,"readAt" timestamptz,"createdAt" timestamptz NOT NULL DEFAULT now(),UNIQUE("recipientId","eventId"),FOREIGN KEY("workspaceId","projectId","targetId") REFERENCES app.artifacts("workspaceId","projectId",id) DEFERRABLE INITIALLY DEFERRED);

CREATE INDEX documents_scope ON app.documents("projectId","updatedAt");
CREATE INDEX tasks_scope ON app.tasks("projectId",status);
CREATE INDEX discussions_scope ON app.discussions("projectId","updatedAt");
CREATE INDEX messages_thread ON app.messages("discussionId","createdAt");
CREATE INDEX notifications_recipient ON app.notifications("recipientId","createdAt");
CREATE INDEX links_target ON app.artifact_links("toId");
CREATE INDEX citations_document ON app.citations("documentId");
GRANT CREATE ON SCHEMA app TO atlas_policy;
CREATE FUNCTION app.eligible_member(w uuid,p uuid,u text,editing boolean) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM app.project_members pm JOIN app.workspace_members wm ON wm."workspaceId"=pm."workspaceId" AND wm."userId"=pm."userId" WHERE pm."workspaceId"=w AND pm."projectId"=p AND pm."userId"=u AND pm.active AND wm.active AND (NOT editing OR pm.role IN ('owner','admin','editor')))
$$;
ALTER FUNCTION app.eligible_member(uuid,uuid,text,boolean) OWNER TO atlas_policy;
REVOKE CREATE ON SCHEMA app FROM atlas_policy;
REVOKE ALL ON FUNCTION app.eligible_member(uuid,uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.eligible_member(uuid,uuid,text,boolean) TO atlas_runtime;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['documents','document_versions','document_writes','citations','artifact_links','tasks','discussions','messages'] LOOP
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('GRANT SELECT,INSERT ON app.%I TO atlas_runtime',t);
 EXECUTE format('CREATE POLICY collaboration_read ON app.%I FOR SELECT TO atlas_runtime USING(app.can_read_research("workspaceId","projectId"))',t);
 EXECUTE format('CREATE POLICY collaboration_insert ON app.%I FOR INSERT TO atlas_runtime WITH CHECK(app.can_write_research("workspaceId","projectId"))',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['documents','tasks','discussions','messages'] LOOP
 EXECUTE format('GRANT UPDATE ON app.%I TO atlas_runtime',t);
 EXECUTE format('CREATE POLICY collaboration_update ON app.%I FOR UPDATE TO atlas_runtime USING(app.can_write_research("workspaceId","projectId")) WITH CHECK(app.can_write_research("workspaceId","projectId"))',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['documents','tasks','discussions'] LOOP
 EXECUTE format('CREATE TRIGGER identity_guard BEFORE UPDATE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.guard_research()',t);
 EXECUTE format('CREATE POLICY creator ON app.%I AS RESTRICTIVE FOR INSERT TO atlas_runtime WITH CHECK("createdBy"=app.actor_id())',t);
 END LOOP;
END $$;
CREATE POLICY version_creator ON app.document_versions AS RESTRICTIVE FOR INSERT TO atlas_runtime WITH CHECK("createdBy"=app.actor_id());
CREATE POLICY write_actor ON app.document_writes AS RESTRICTIVE FOR INSERT TO atlas_runtime WITH CHECK("actorId"=app.actor_id());
CREATE POLICY message_creator ON app.messages AS RESTRICTIVE FOR INSERT TO atlas_runtime WITH CHECK("authorId"=app.actor_id());
CREATE POLICY message_editor ON app.messages AS RESTRICTIVE FOR UPDATE TO atlas_runtime USING("authorId"=app.actor_id() OR app.has_project_role("workspaceId","projectId",ARRAY['owner','admin'])) WITH CHECK("authorId"=app.actor_id() OR app.has_project_role("workspaceId","projectId",ARRAY['owner','admin']));
CREATE POLICY assignment ON app.tasks AS RESTRICTIVE FOR INSERT TO atlas_runtime WITH CHECK("assigneeId" IS NULL OR app.eligible_member("workspaceId","projectId","assigneeId",true));
CREATE POLICY assignment_update ON app.tasks AS RESTRICTIVE FOR UPDATE TO atlas_runtime USING(true) WITH CHECK("assigneeId" IS NULL OR app.eligible_member("workspaceId","projectId","assigneeId",true));
ALTER TABLE app.notifications ENABLE ROW LEVEL SECURITY; ALTER TABLE app.notifications FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON app.notifications TO atlas_runtime;
GRANT UPDATE("readAt") ON app.notifications TO atlas_runtime;
CREATE POLICY notification_own ON app.notifications FOR SELECT TO atlas_runtime USING("recipientId"=app.actor_id() AND app.is_active_actor());
CREATE POLICY notification_update ON app.notifications FOR UPDATE TO atlas_runtime USING("recipientId"=app.actor_id() AND app.is_active_actor()) WITH CHECK("recipientId"=app.actor_id() AND app.is_active_actor());
CREATE POLICY notification_create ON app.notifications FOR INSERT TO atlas_runtime WITH CHECK(app.can_write_research("workspaceId","projectId") AND app.eligible_member("workspaceId","projectId","recipientId",false));
-- Membership lifecycle clears assignments atomically, including workspace-wide revocation.
GRANT SELECT,UPDATE ON app.tasks TO atlas_policy;
GRANT CREATE ON SCHEMA app TO atlas_policy;
CREATE FUNCTION app.clear_ineligible_assignments() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE app.tasks SET "assigneeId"=NULL,revision=revision+1,"updatedAt"=now() WHERE "workspaceId"=NEW."workspaceId" AND "assigneeId"=NEW."userId" AND NOT app.eligible_member("workspaceId","projectId","assigneeId",true);
 RETURN NEW;
END $$;
ALTER FUNCTION app.clear_ineligible_assignments() OWNER TO atlas_policy;
REVOKE CREATE ON SCHEMA app FROM atlas_policy;
REVOKE ALL ON FUNCTION app.clear_ineligible_assignments() FROM PUBLIC;
CREATE TRIGGER clear_project_assignments AFTER UPDATE OF active,role ON app.project_members FOR EACH ROW EXECUTE FUNCTION app.clear_ineligible_assignments();
CREATE TRIGGER clear_workspace_assignments AFTER UPDATE OF active ON app.workspace_members FOR EACH ROW EXECUTE FUNCTION app.clear_ineligible_assignments();

CREATE FUNCTION app.guard_collaboration() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME IN ('documents','tasks','discussions') THEN
  IF NEW."createdBy"<>OLD."createdBy" THEN RAISE EXCEPTION 'immutable author' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME IN ('documents','tasks') AND (to_jsonb(NEW)->'archivedAt') IS DISTINCT FROM (to_jsonb(OLD)->'archivedAt') AND NOT app.has_project_role(NEW."workspaceId",NEW."projectId",ARRAY['owner','admin']) THEN RAISE EXCEPTION 'unavailable' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME='messages' THEN
  IF ROW(NEW.id,NEW."workspaceId",NEW."projectId",NEW."discussionId",NEW."authorId",NEW."clientId",NEW."createdAt",NEW."artifactIds") IS DISTINCT FROM ROW(OLD.id,OLD."workspaceId",OLD."projectId",OLD."discussionId",OLD."authorId",OLD."clientId",OLD."createdAt",OLD."artifactIds") THEN RAISE EXCEPTION 'immutable message identity' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='citations' THEN
  IF NEW."annotationId" IS NULL THEN
   IF NEW.page IS NOT NULL OR NEW.quote<>'' THEN RAISE EXCEPTION 'citation locator requires annotation' USING ERRCODE='23514'; END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM app.annotations a WHERE a.id=NEW."annotationId" AND a."workspaceId"=NEW."workspaceId" AND a."projectId"=NEW."projectId" AND a."sourceId"=NEW."sourceId" AND a."versionId"=NEW."versionId" AND a.page=NEW.page AND a.quote=NEW.quote) THEN RAISE EXCEPTION 'citation anchor mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER collaboration_guard BEFORE UPDATE ON app.documents FOR EACH ROW EXECUTE FUNCTION app.guard_collaboration();
CREATE TRIGGER collaboration_guard BEFORE UPDATE ON app.tasks FOR EACH ROW EXECUTE FUNCTION app.guard_collaboration();
CREATE TRIGGER collaboration_guard BEFORE UPDATE ON app.discussions FOR EACH ROW EXECUTE FUNCTION app.guard_collaboration();
CREATE TRIGGER collaboration_guard BEFORE UPDATE ON app.messages FOR EACH ROW EXECUTE FUNCTION app.guard_collaboration();
CREATE TRIGGER citation_anchor_guard BEFORE INSERT ON app.citations FOR EACH ROW EXECUTE FUNCTION app.guard_collaboration();

GRANT SELECT ON ALL TABLES IN SCHEMA app TO atlas_backup;
UPDATE ops.schema_revision SET revision='202611090006_collaboration' WHERE id=1;
COMMIT;
