-- Additive Phase 02 schema. Existing identities/projects and files are untouched.
BEGIN;
GRANT CREATE ON SCHEMA app TO atlas_policy;
CREATE FUNCTION app.can_read_research(w uuid,p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT app.has_project_role(w,p,ARRAY['owner','admin','editor','viewer']) AND EXISTS(SELECT 1 FROM app.projects WHERE "workspaceId"=w AND id=p AND ("deletedAt" IS NULL OR app.has_project_role(w,p,ARRAY['owner'])))
$$;
CREATE FUNCTION app.can_write_research(w uuid,p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT app.has_project_role(w,p,ARRAY['owner','admin','editor']) AND EXISTS(SELECT 1 FROM app.projects p1 JOIN app.workspaces w1 ON w1.id=p1."workspaceId" WHERE p1."workspaceId"=w AND p1.id=p AND p1."archivedAt" IS NULL AND p1."deletedAt" IS NULL AND w1."archivedAt" IS NULL)
$$;
ALTER FUNCTION app.can_read_research(uuid,uuid) OWNER TO atlas_policy;
ALTER FUNCTION app.can_write_research(uuid,uuid) OWNER TO atlas_policy;
REVOKE CREATE ON SCHEMA app FROM atlas_policy;
REVOKE ALL ON FUNCTION app.can_read_research(uuid,uuid),app.can_write_research(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_read_research(uuid,uuid),app.can_write_research(uuid,uuid) TO atlas_runtime;

CREATE TABLE app.artifacts(id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('source','annotation')),"createdAt" timestamptz NOT NULL DEFAULT now(), UNIQUE("workspaceId","projectId",id), UNIQUE("workspaceId","projectId",id,kind),FOREIGN KEY("workspaceId","projectId") REFERENCES app.projects("workspaceId",id));
CREATE TABLE app.sources(id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,title text NOT NULL CHECK(length(title) BETWEEN 1 AND 500),authors text[] NOT NULL DEFAULT '{}',year integer CHECK(year BETWEEN 1000 AND 2200),venue text NOT NULL DEFAULT '',doi text,url text,abstract text NOT NULL DEFAULT '',provenance jsonb NOT NULL,tags text[] NOT NULL DEFAULT '{}',"searchText" text NOT NULL DEFAULT '',"createdBy" text NOT NULL REFERENCES identity.users(id),"archivedAt" timestamptz,revision integer NOT NULL DEFAULT 1,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),"artifactKind" text NOT NULL DEFAULT 'source' CHECK("artifactKind"='source'),UNIQUE("workspaceId","projectId",id),UNIQUE("workspaceId","projectId",doi),UNIQUE("workspaceId","projectId",url),FOREIGN KEY("workspaceId","projectId",id,"artifactKind") REFERENCES app.artifacts("workspaceId","projectId",id,kind));
CREATE TABLE app.file_objects(id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,filename text NOT NULL CHECK(length(filename)<=200),sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 26214400),"createdBy" text NOT NULL REFERENCES identity.users(id),"createdAt" timestamptz NOT NULL DEFAULT now(),UNIQUE("workspaceId","projectId",id),FOREIGN KEY("workspaceId","projectId") REFERENCES app.projects("workspaceId",id));
CREATE TABLE app.source_versions(id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,"sourceId" uuid NOT NULL,ordinal integer NOT NULL CHECK(ordinal>0),"fileId" uuid UNIQUE,metadata jsonb NOT NULL,"extractionStatus" text NOT NULL DEFAULT 'metadata_only' CHECK("extractionStatus" IN ('metadata_only','queued','ready','image_only','failed','protected','cancelled')),"pageCount" integer,"textCharacters" integer,"extractedAt" timestamptz,"createdAt" timestamptz NOT NULL DEFAULT now(),UNIQUE("workspaceId","projectId",id),UNIQUE("workspaceId","projectId","sourceId",id),UNIQUE("sourceId",ordinal),FOREIGN KEY("workspaceId","projectId","sourceId") REFERENCES app.sources("workspaceId","projectId",id),FOREIGN KEY("workspaceId","projectId","fileId") REFERENCES app.file_objects("workspaceId","projectId",id));
CREATE TABLE app.upload_intents(id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,"sourceId" uuid NOT NULL,"fileId" uuid NOT NULL,"versionId" uuid,"createdBy" text NOT NULL REFERENCES identity.users(id),"expectedBytes" integer NOT NULL CHECK("expectedBytes" BETWEEN 1 AND 26214400),state text NOT NULL DEFAULT 'uploading' CHECK(state IN ('uploading','completed','failed')),"expiresAt" timestamptz NOT NULL,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),FOREIGN KEY("workspaceId","projectId","sourceId") REFERENCES app.sources("workspaceId","projectId",id),FOREIGN KEY("workspaceId","projectId","sourceId","versionId") REFERENCES app.source_versions("workspaceId","projectId","sourceId",id));
CREATE TABLE app.annotations(id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,"sourceId" uuid NOT NULL,"versionId" uuid NOT NULL,"authorId" text NOT NULL REFERENCES identity.users(id),kind text NOT NULL CHECK(kind IN ('highlight','note')),page integer NOT NULL CHECK(page BETWEEN 1 AND 500),quote text NOT NULL DEFAULT '' CHECK(length(quote)<=6000),body text NOT NULL DEFAULT '' CHECK(length(body)<=10000),rects jsonb NOT NULL,color text NOT NULL DEFAULT 'yellow' CHECK(color IN ('yellow','blue','green')),revision integer NOT NULL DEFAULT 1,"deletedAt" timestamptz,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),"artifactKind" text NOT NULL DEFAULT 'annotation' CHECK("artifactKind"='annotation'),UNIQUE("workspaceId","projectId",id),FOREIGN KEY("workspaceId","projectId",id,"artifactKind") REFERENCES app.artifacts("workspaceId","projectId",id,kind),FOREIGN KEY("workspaceId","projectId","sourceId","versionId") REFERENCES app.source_versions("workspaceId","projectId","sourceId",id));
CREATE TABLE app.collections(id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),"normalizedName" text NOT NULL,"createdAt" timestamptz NOT NULL DEFAULT now(),UNIQUE("workspaceId","projectId",id),UNIQUE("projectId","normalizedName"),FOREIGN KEY("workspaceId","projectId") REFERENCES app.projects("workspaceId",id));
CREATE TABLE app.source_collections("workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,"sourceId" uuid NOT NULL,"collectionId" uuid NOT NULL,PRIMARY KEY("sourceId","collectionId"),FOREIGN KEY("workspaceId","projectId","sourceId") REFERENCES app.sources("workspaceId","projectId",id),FOREIGN KEY("workspaceId","projectId","collectionId") REFERENCES app.collections("workspaceId","projectId",id));
CREATE TABLE app.reading_states("workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,"sourceId" uuid NOT NULL,"userId" text NOT NULL REFERENCES identity.users(id),"versionId" uuid,status text NOT NULL DEFAULT 'unread' CHECK(status IN ('unread','reading','done')),page integer NOT NULL DEFAULT 1 CHECK(page BETWEEN 1 AND 500),zoom double precision NOT NULL DEFAULT 1 CHECK(zoom BETWEEN 0.5 AND 2.5),position double precision NOT NULL DEFAULT 0 CHECK(position BETWEEN 0 AND 1),"updatedAt" timestamptz NOT NULL DEFAULT now(),PRIMARY KEY("sourceId","userId"),FOREIGN KEY("workspaceId","projectId","sourceId") REFERENCES app.sources("workspaceId","projectId",id),FOREIGN KEY("workspaceId","projectId","sourceId","versionId") REFERENCES app.source_versions("workspaceId","projectId","sourceId",id));
CREATE TABLE ops.file_jobs(id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,"versionId" uuid NOT NULL,"actorId" text NOT NULL,"sessionId" text NOT NULL,state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','succeeded','failed','cancelled')),attempts integer NOT NULL DEFAULT 0,error text,"nextAttemptAt" timestamptz NOT NULL DEFAULT now(),"leaseUntil" timestamptz,"createdAt" timestamptz NOT NULL DEFAULT now(),FOREIGN KEY("workspaceId","projectId","versionId") REFERENCES app.source_versions("workspaceId","projectId",id));
CREATE INDEX file_jobs_claim ON ops.file_jobs(state,"nextAttemptAt");
CREATE INDEX source_search ON app.sources USING gin(to_tsvector('simple',"searchText"));
CREATE INDEX source_scope ON app.sources("projectId","updatedAt");
CREATE INDEX annotations_version ON app.annotations("versionId",page);

CREATE FUNCTION app.guard_research() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW."workspaceId"<>OLD."workspaceId" OR NEW."projectId"<>OLD."projectId" OR NEW."createdAt"<>OLD."createdAt") THEN RAISE EXCEPTION 'immutable research identity'; END IF;
 IF TG_TABLE_NAME='sources' THEN
  IF TG_OP='UPDATE' AND NEW."createdBy"<>OLD."createdBy" THEN RAISE EXCEPTION 'immutable source creator'; END IF;
  NEW."searchText"=concat_ws(' ',NEW.title,array_to_string(NEW.authors,' '),NEW.doi,NEW.venue,array_to_string(NEW.tags,' '));
 ELSIF TG_TABLE_NAME='source_versions' AND TG_OP='UPDATE' THEN
  IF ROW(NEW."sourceId",NEW.ordinal,NEW."fileId",NEW.metadata) IS DISTINCT FROM ROW(OLD."sourceId",OLD.ordinal,OLD."fileId",OLD.metadata) THEN RAISE EXCEPTION 'immutable source version'; END IF;
 ELSIF TG_TABLE_NAME='annotations' AND TG_OP='UPDATE' THEN
  IF ROW(NEW."sourceId",NEW."versionId",NEW."authorId",NEW.kind,NEW.page,NEW.quote,NEW.rects) IS DISTINCT FROM ROW(OLD."sourceId",OLD."versionId",OLD."authorId",OLD.kind,OLD.page,OLD.quote,OLD.rects) THEN RAISE EXCEPTION 'immutable annotation anchor'; END IF;
 ELSIF TG_TABLE_NAME='upload_intents' AND TG_OP='UPDATE' THEN
  IF ROW(NEW."sourceId",NEW."fileId",NEW."createdBy",NEW."expectedBytes") IS DISTINCT FROM ROW(OLD."sourceId",OLD."fileId",OLD."createdBy",OLD."expectedBytes") THEN RAISE EXCEPTION 'immutable upload intent'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER source_guard BEFORE INSERT OR UPDATE ON app.sources FOR EACH ROW EXECUTE FUNCTION app.guard_research();
CREATE TRIGGER version_guard BEFORE UPDATE ON app.source_versions FOR EACH ROW EXECUTE FUNCTION app.guard_research();
CREATE TRIGGER annotation_guard BEFORE UPDATE ON app.annotations FOR EACH ROW EXECUTE FUNCTION app.guard_research();
CREATE TRIGGER intent_guard BEFORE UPDATE ON app.upload_intents FOR EACH ROW EXECUTE FUNCTION app.guard_research();

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['artifacts','sources','file_objects','source_versions','upload_intents','annotations','collections','source_collections','reading_states'] LOOP
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT,INSERT ON app.%I TO atlas_runtime',t);
  IF t<>'reading_states' THEN
   EXECUTE format('CREATE POLICY research_read ON app.%I FOR SELECT TO atlas_runtime USING(app.can_read_research("workspaceId","projectId"))',t);
   EXECUTE format('CREATE POLICY research_insert ON app.%I FOR INSERT TO atlas_runtime WITH CHECK(app.can_write_research("workspaceId","projectId"))',t);
  END IF;
 END LOOP;
END $$;
GRANT UPDATE ON app.sources,app.source_versions,app.upload_intents,app.annotations,app.reading_states TO atlas_runtime;
CREATE POLICY source_creator ON app.sources AS RESTRICTIVE FOR INSERT TO atlas_runtime WITH CHECK("createdBy"=app.actor_id());
CREATE POLICY file_creator ON app.file_objects AS RESTRICTIVE FOR INSERT TO atlas_runtime WITH CHECK("createdBy"=app.actor_id());
CREATE POLICY intent_creator ON app.upload_intents AS RESTRICTIVE FOR INSERT TO atlas_runtime WITH CHECK("createdBy"=app.actor_id());
CREATE POLICY annotation_author ON app.annotations AS RESTRICTIVE FOR INSERT TO atlas_runtime WITH CHECK("authorId"=app.actor_id());
CREATE POLICY source_update ON app.sources FOR UPDATE TO atlas_runtime USING(app.can_write_research("workspaceId","projectId")) WITH CHECK(app.can_write_research("workspaceId","projectId"));
CREATE POLICY version_update ON app.source_versions FOR UPDATE TO atlas_runtime USING(app.can_write_research("workspaceId","projectId")) WITH CHECK(app.can_write_research("workspaceId","projectId"));
CREATE POLICY intent_update ON app.upload_intents FOR UPDATE TO atlas_runtime USING(app.can_write_research("workspaceId","projectId") AND "createdBy"=app.actor_id()) WITH CHECK(app.can_write_research("workspaceId","projectId") AND "createdBy"=app.actor_id());
CREATE POLICY annotation_update ON app.annotations FOR UPDATE TO atlas_runtime USING(app.can_write_research("workspaceId","projectId") AND ("authorId"=app.actor_id() OR app.has_project_role("workspaceId","projectId",ARRAY['owner','admin']))) WITH CHECK(app.can_write_research("workspaceId","projectId") AND ("authorId"=app.actor_id() OR app.has_project_role("workspaceId","projectId",ARRAY['owner','admin'])));
GRANT DELETE ON app.source_collections TO atlas_runtime;
GRANT UPDATE ON app.collections TO atlas_runtime;
CREATE POLICY collection_update ON app.collections FOR UPDATE TO atlas_runtime USING(app.can_write_research("workspaceId","projectId")) WITH CHECK(app.can_write_research("workspaceId","projectId"));
CREATE TRIGGER collection_guard BEFORE UPDATE ON app.collections FOR EACH ROW EXECUTE FUNCTION app.guard_research();
CREATE POLICY collection_unlink ON app.source_collections FOR DELETE TO atlas_runtime USING(app.can_write_research("workspaceId","projectId"));
CREATE POLICY reading_own ON app.reading_states FOR SELECT TO atlas_runtime USING("userId"=app.actor_id() AND app.can_read_research("workspaceId","projectId"));
CREATE POLICY reading_create ON app.reading_states FOR INSERT TO atlas_runtime WITH CHECK("userId"=app.actor_id() AND app.can_read_research("workspaceId","projectId"));
CREATE POLICY reading_update ON app.reading_states FOR UPDATE TO atlas_runtime USING("userId"=app.actor_id() AND app.can_read_research("workspaceId","projectId")) WITH CHECK("userId"=app.actor_id() AND app.can_read_research("workspaceId","projectId"));
ALTER TABLE ops.file_jobs ENABLE ROW LEVEL SECURITY; ALTER TABLE ops.file_jobs FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON ops.file_jobs TO atlas_queue;
CREATE POLICY queue_jobs ON ops.file_jobs TO atlas_queue USING(true) WITH CHECK(true);
GRANT INSERT ON ops.file_jobs TO atlas_runtime;
GRANT SELECT(id,"workspaceId","projectId","versionId",state,attempts,error,"nextAttemptAt","leaseUntil","createdAt") ON ops.file_jobs TO atlas_runtime;
CREATE POLICY job_create ON ops.file_jobs FOR INSERT TO atlas_runtime WITH CHECK(app.can_write_research("workspaceId","projectId") AND "actorId"=app.actor_id() AND "sessionId"=current_setting('app.session_id',true) AND state='pending' AND attempts=0);
CREATE POLICY job_read ON ops.file_jobs FOR SELECT TO atlas_runtime USING(app.can_read_research("workspaceId","projectId"));
CREATE TABLE ops.provider_budget(provider text PRIMARY KEY,"nextAt" timestamptz NOT NULL,lease uuid);
INSERT INTO ops.provider_budget(provider,"nextAt") VALUES('crossref',now());
GRANT SELECT,UPDATE ON ops.provider_budget TO atlas_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA app,ops TO atlas_backup;
UPDATE ops.schema_revision SET revision='202611090005_library' WHERE id=1;
COMMIT;
