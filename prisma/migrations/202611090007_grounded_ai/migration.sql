-- Additive AI preparation. External calls and workspace sharing remain OFF by default.
BEGIN;
ALTER TABLE app.source_versions ADD COLUMN "indexRevision" text;
CREATE TABLE app.source_pages(id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,"sourceId" uuid NOT NULL,"versionId" uuid NOT NULL,page integer NOT NULL CHECK(page BETWEEN 1 AND 500),text text NOT NULL CHECK(length(text)<=200000),sha256 text NOT NULL CHECK(length(sha256)=64),"fileSha256" text NOT NULL CHECK(length("fileSha256")=64),extractor text NOT NULL,"createdAt" timestamptz NOT NULL DEFAULT now(),UNIQUE("workspaceId","projectId",id),UNIQUE("versionId",page,extractor),FOREIGN KEY("workspaceId","projectId","sourceId","versionId") REFERENCES app.source_versions("workspaceId","projectId","sourceId",id));
CREATE TABLE app.source_chunks(id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,"pageId" uuid NOT NULL,start integer NOT NULL CHECK(start>=0),"end" integer NOT NULL CHECK("end">start),text text NOT NULL CHECK(length(text) BETWEEN 1 AND 1800),UNIQUE("pageId",start),FOREIGN KEY("workspaceId","projectId","pageId") REFERENCES app.source_pages("workspaceId","projectId",id));
CREATE INDEX source_chunks_fts ON app.source_chunks USING gin(to_tsvector('simple',text));
CREATE INDEX source_pages_scope ON app.source_pages("projectId","versionId",extractor);
CREATE TABLE app.ai_policies("workspaceId" uuid PRIMARY KEY REFERENCES app.workspaces(id),enabled boolean NOT NULL DEFAULT false,"dailyBudgetMicros" integer NOT NULL DEFAULT 0 CHECK("dailyBudgetMicros" BETWEEN 0 AND 100000000),revision integer NOT NULL DEFAULT 1,"termsVersion" text NOT NULL DEFAULT '',"updatedAt" timestamptz NOT NULL DEFAULT now(),CHECK(NOT enabled OR ("dailyBudgetMicros">0 AND "termsVersion"='openai-global-2026-11-09')));
CREATE TABLE app.ai_conversations(id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,"userId" text NOT NULL REFERENCES identity.users(id),title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),"versionIds" uuid[] NOT NULL CHECK(cardinality("versionIds") BETWEEN 1 AND 10),"createdAt" timestamptz NOT NULL DEFAULT now(),UNIQUE("workspaceId","projectId",id),FOREIGN KEY("workspaceId","projectId") REFERENCES app.projects("workspaceId",id));
CREATE TABLE app.ai_contexts(id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,"userId" text NOT NULL REFERENCES identity.users(id),"conversationId" uuid NOT NULL,question text NOT NULL CHECK(length(question) BETWEEN 2 AND 4000),"expiresAt" timestamptz NOT NULL,"createdAt" timestamptz NOT NULL DEFAULT now(),UNIQUE("workspaceId","projectId",id),FOREIGN KEY("workspaceId","projectId","conversationId") REFERENCES app.ai_conversations("workspaceId","projectId",id));
CREATE TABLE app.ai_evidence(id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,"userId" text NOT NULL REFERENCES identity.users(id),"contextId" uuid NOT NULL,"pageId" uuid NOT NULL,"sourceId" uuid NOT NULL,"versionId" uuid NOT NULL,page integer NOT NULL,start integer NOT NULL CHECK(start>=0),"end" integer NOT NULL CHECK("end">start),quote text NOT NULL CHECK(length(quote) BETWEEN 1 AND 1800),"quoteHash" text NOT NULL,"fileSha256" text NOT NULL,extractor text NOT NULL,"createdAt" timestamptz NOT NULL DEFAULT now(),UNIQUE("workspaceId","projectId",id),FOREIGN KEY("workspaceId","projectId","contextId") REFERENCES app.ai_contexts("workspaceId","projectId",id),FOREIGN KEY("workspaceId","projectId","pageId") REFERENCES app.source_pages("workspaceId","projectId",id),FOREIGN KEY("workspaceId","projectId","sourceId","versionId") REFERENCES app.source_versions("workspaceId","projectId","sourceId",id));
CREATE TABLE app.ai_runs(id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,"userId" text NOT NULL REFERENCES identity.users(id),"sessionId" text NOT NULL,"conversationId" uuid NOT NULL,"contextId" uuid NOT NULL UNIQUE,"requestId" uuid NOT NULL,"policyRevision" integer NOT NULL,state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','complete','insufficient','validation_failed','cancelled','limited','provider_error')),error text,model text NOT NULL CHECK(model='gpt-6-luna'),"reservedMicros" integer NOT NULL CHECK("reservedMicros">0),"chargedMicros" integer NOT NULL DEFAULT 0 CHECK("chargedMicros">=0),"inputTokens" integer,"outputTokens" integer,result jsonb,"dispatchedAt" timestamptz,"expiresAt" timestamptz NOT NULL,"completedAt" timestamptz,"createdAt" timestamptz NOT NULL DEFAULT now(),UNIQUE("workspaceId","projectId",id),UNIQUE("conversationId","requestId"),FOREIGN KEY("workspaceId","projectId","conversationId") REFERENCES app.ai_conversations("workspaceId","projectId",id),FOREIGN KEY("workspaceId","projectId","contextId") REFERENCES app.ai_contexts("workspaceId","projectId",id));
CREATE INDEX ai_runs_budget ON app.ai_runs("workspaceId","createdAt");
CREATE INDEX ai_runs_user ON app.ai_runs("userId",state,"createdAt");
CREATE INDEX ai_contexts_conversation ON app.ai_contexts("conversationId","createdAt");
CREATE INDEX ai_evidence_context ON app.ai_evidence("contextId");
CREATE TABLE app.ai_proposals(id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,"userId" text NOT NULL REFERENCES identity.users(id),"runId" uuid NOT NULL,"documentId" uuid NOT NULL,revision integer NOT NULL,before jsonb NOT NULL,after jsonb NOT NULL,"citationPlan" jsonb NOT NULL,"appliedRevision" integer,"previousVersionId" uuid REFERENCES app.document_versions(id),"undoRevision" integer,"createdAt" timestamptz NOT NULL DEFAULT now(),FOREIGN KEY("workspaceId","projectId","runId") REFERENCES app.ai_runs("workspaceId","projectId",id),FOREIGN KEY("workspaceId","projectId","documentId") REFERENCES app.documents("workspaceId","projectId",id));
CREATE TABLE app.ai_reviews(id uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"projectId" uuid NOT NULL,"userId" text NOT NULL REFERENCES identity.users(id),"runId" uuid NOT NULL,segment integer NOT NULL CHECK(segment BETWEEN 0 AND 11),verdict text NOT NULL CHECK(verdict IN ('supported','partial','unsupported','contradicted')),"updatedAt" timestamptz NOT NULL DEFAULT now(),UNIQUE("runId",segment),FOREIGN KEY("workspaceId","projectId","runId") REFERENCES app.ai_runs("workspaceId","projectId",id));
ALTER TABLE app.citations ADD COLUMN "pageId" uuid, ADD COLUMN start integer, ADD COLUMN "end" integer, ADD CONSTRAINT citation_page_fk FOREIGN KEY("workspaceId","projectId","pageId") REFERENCES app.source_pages("workspaceId","projectId",id);

CREATE FUNCTION app.guard_page_content() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='source_pages' THEN
  IF NOT EXISTS(SELECT 1 FROM app.source_versions v JOIN app.file_objects f ON f.id=v."fileId" WHERE v.id=NEW."versionId" AND v."sourceId"=NEW."sourceId" AND v."workspaceId"=NEW."workspaceId" AND v."projectId"=NEW."projectId" AND f.sha256=NEW."fileSha256") OR encode(sha256(convert_to(NEW.text,'UTF8')),'hex')<>NEW.sha256 THEN RAISE EXCEPTION 'invalid extraction' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='source_chunks' THEN
  IF NOT EXISTS(SELECT 1 FROM app.source_pages p WHERE p.id=NEW."pageId" AND p."workspaceId"=NEW."workspaceId" AND p."projectId"=NEW."projectId" AND substring(p.text FROM NEW.start+1 FOR NEW."end"-NEW.start)=NEW.text) THEN RAISE EXCEPTION 'invalid chunk' USING ERRCODE='23514'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM app.source_pages p JOIN app.ai_contexts c ON c.id=NEW."contextId" JOIN app.ai_conversations cv ON cv.id=c."conversationId" WHERE p.id=NEW."pageId" AND p."workspaceId"=NEW."workspaceId" AND p."projectId"=NEW."projectId" AND p."sourceId"=NEW."sourceId" AND p."versionId"=NEW."versionId" AND p.page=NEW.page AND p.extractor=NEW.extractor AND p."fileSha256"=NEW."fileSha256" AND NEW."versionId"=ANY(cv."versionIds") AND substring(p.text FROM NEW.start+1 FOR NEW."end"-NEW.start)=NEW.quote) OR encode(sha256(convert_to(NEW.quote,'UTF8')),'hex')<>NEW."quoteHash" THEN RAISE EXCEPTION 'invalid evidence' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER page_guard BEFORE INSERT ON app.source_pages FOR EACH ROW EXECUTE FUNCTION app.guard_page_content();
CREATE TRIGGER chunk_guard BEFORE INSERT ON app.source_chunks FOR EACH ROW EXECUTE FUNCTION app.guard_page_content();
CREATE TRIGGER evidence_guard BEFORE INSERT ON app.ai_evidence FOR EACH ROW EXECUTE FUNCTION app.guard_page_content();
-- Public document citations copy only the reviewed evidence, not conversation access.
CREATE FUNCTION app.guard_ai_citation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW."pageId" IS NOT NULL AND (NEW."annotationId" IS NOT NULL OR NOT EXISTS(SELECT 1 FROM app.source_pages p WHERE p.id=NEW."pageId" AND p."workspaceId"=NEW."workspaceId" AND p."projectId"=NEW."projectId" AND p."sourceId"=NEW."sourceId" AND p."versionId"=NEW."versionId" AND p.page=NEW.page AND NEW.start>=0 AND NEW."end">NEW.start AND substring(p.text FROM NEW.start+1 FOR NEW."end"-NEW.start)=NEW.quote)) THEN RAISE EXCEPTION 'invalid citation locator' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
-- Keep the Phase 03 message/archive guards; change only its citation locator case.
CREATE OR REPLACE FUNCTION app.guard_collaboration() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME IN ('documents','tasks','discussions') THEN
  IF NEW."createdBy"<>OLD."createdBy" THEN RAISE EXCEPTION 'immutable author' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME IN ('documents','tasks') AND (to_jsonb(NEW)->'archivedAt') IS DISTINCT FROM (to_jsonb(OLD)->'archivedAt') AND NOT app.has_project_role(NEW."workspaceId",NEW."projectId",ARRAY['owner','admin']) THEN RAISE EXCEPTION 'unavailable' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME='messages' THEN
  IF ROW(NEW.id,NEW."workspaceId",NEW."projectId",NEW."discussionId",NEW."authorId",NEW."clientId",NEW."createdAt",NEW."artifactIds") IS DISTINCT FROM ROW(OLD.id,OLD."workspaceId",OLD."projectId",OLD."discussionId",OLD."authorId",OLD."clientId",OLD."createdAt",OLD."artifactIds") THEN RAISE EXCEPTION 'immutable message identity' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='citations' THEN
  IF NEW."pageId" IS NOT NULL THEN
   RETURN NEW;
  ELSIF NEW."annotationId" IS NULL THEN
   IF NEW.page IS NOT NULL OR NEW.quote<>'' THEN RAISE EXCEPTION 'citation locator requires annotation' USING ERRCODE='23514'; END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM app.annotations a WHERE a.id=NEW."annotationId" AND a."workspaceId"=NEW."workspaceId" AND a."projectId"=NEW."projectId" AND a."sourceId"=NEW."sourceId" AND a."versionId"=NEW."versionId" AND a.page=NEW.page AND a.quote=NEW.quote) THEN RAISE EXCEPTION 'citation anchor mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ai_citation_guard BEFORE INSERT ON app.citations FOR EACH ROW EXECUTE FUNCTION app.guard_ai_citation();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['source_pages','source_chunks'] LOOP
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('GRANT SELECT,INSERT ON app.%I TO atlas_runtime',t);
 EXECUTE format('CREATE POLICY page_read ON app.%I FOR SELECT TO atlas_runtime USING(app.can_read_research("workspaceId","projectId"))',t);
 EXECUTE format('CREATE POLICY page_write ON app.%I FOR INSERT TO atlas_runtime WITH CHECK(app.can_write_research("workspaceId","projectId"))',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['ai_conversations','ai_contexts','ai_evidence','ai_runs','ai_proposals','ai_reviews'] LOOP
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('GRANT SELECT,INSERT ON app.%I TO atlas_runtime',t);
 EXECUTE format('CREATE POLICY ai_private_read ON app.%I FOR SELECT TO atlas_runtime USING("userId"=app.actor_id() AND app.can_read_research("workspaceId","projectId"))',t);
 EXECUTE format('CREATE POLICY ai_private_create ON app.%I FOR INSERT TO atlas_runtime WITH CHECK("userId"=app.actor_id() AND app.can_read_research("workspaceId","projectId"))',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['ai_runs','ai_proposals','ai_reviews'] LOOP
 EXECUTE format('GRANT UPDATE ON app.%I TO atlas_runtime',t);
 EXECUTE format('CREATE POLICY ai_private_update ON app.%I FOR UPDATE TO atlas_runtime USING("userId"=app.actor_id() AND app.can_read_research("workspaceId","projectId")) WITH CHECK("userId"=app.actor_id() AND app.can_read_research("workspaceId","projectId"))',t);
 END LOOP;
END $$;
ALTER TABLE app.ai_policies ENABLE ROW LEVEL SECURITY; ALTER TABLE app.ai_policies FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON app.ai_policies TO atlas_runtime;
CREATE POLICY ai_policy_read ON app.ai_policies FOR SELECT TO atlas_runtime USING(app.is_active_actor() AND app.is_workspace_member("workspaceId"));
CREATE POLICY ai_policy_create ON app.ai_policies FOR INSERT TO atlas_runtime WITH CHECK(app.is_active_actor() AND app.is_workspace_member("workspaceId") AND (app.has_workspace_role("workspaceId",ARRAY['owner']) OR (NOT enabled AND "dailyBudgetMicros"=0 AND revision=1 AND "termsVersion"='')));
CREATE POLICY ai_policy_update ON app.ai_policies FOR UPDATE TO atlas_runtime USING(app.has_workspace_role("workspaceId",ARRAY['owner'])) WITH CHECK(app.has_workspace_role("workspaceId",ARRAY['owner']));

CREATE POLICY context_parent ON app.ai_contexts AS RESTRICTIVE FOR INSERT TO atlas_runtime WITH CHECK(EXISTS(SELECT 1 FROM app.ai_conversations c WHERE c.id="conversationId" AND c."workspaceId"=ai_contexts."workspaceId" AND c."projectId"=ai_contexts."projectId" AND c."userId"=app.actor_id()));
CREATE POLICY run_parent ON app.ai_runs AS RESTRICTIVE FOR INSERT TO atlas_runtime WITH CHECK(state='queued' AND result IS NULL AND "dispatchedAt" IS NULL AND "chargedMicros"=0 AND EXISTS(SELECT 1 FROM app.ai_contexts c WHERE c.id="contextId" AND c."conversationId"=ai_runs."conversationId" AND c."userId"=app.actor_id()));
CREATE POLICY proposal_parent ON app.ai_proposals AS RESTRICTIVE FOR INSERT TO atlas_runtime WITH CHECK(app.can_write_research("workspaceId","projectId") AND EXISTS(SELECT 1 FROM app.ai_runs r WHERE r.id="runId" AND r.state='complete' AND r."userId"=app.actor_id()));
CREATE POLICY review_parent ON app.ai_reviews AS RESTRICTIVE FOR INSERT TO atlas_runtime WITH CHECK(EXISTS(SELECT 1 FROM app.ai_runs r WHERE r.id="runId" AND r.state='complete' AND r."userId"=app.actor_id()));
CREATE FUNCTION app.guard_ai_state() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='ai_conversations' THEN
  IF EXISTS(SELECT 1 FROM unnest(NEW."versionIds") v WHERE NOT EXISTS(SELECT 1 FROM app.source_versions sv WHERE sv.id=v AND sv."workspaceId"=NEW."workspaceId" AND sv."projectId"=NEW."projectId")) THEN RAISE EXCEPTION 'invalid AI scope' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='ai_runs' THEN
  IF (to_jsonb(NEW)-ARRAY['state','error','chargedMicros','inputTokens','outputTokens','result','dispatchedAt','completedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','error','chargedMicros','inputTokens','outputTokens','result','dispatchedAt','completedAt']) OR OLD.state NOT IN ('queued','running') OR (OLD.state='running' AND NEW.state='queued') THEN RAISE EXCEPTION 'immutable AI identity or terminal state' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='ai_proposals' THEN
  IF (to_jsonb(NEW)-ARRAY['appliedRevision','previousVersionId','undoRevision']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['appliedRevision','previousVersionId','undoRevision']) THEN RAISE EXCEPTION 'immutable proposal' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER conversation_scope BEFORE INSERT ON app.ai_conversations FOR EACH ROW EXECUTE FUNCTION app.guard_ai_state();
CREATE TRIGGER run_identity BEFORE UPDATE ON app.ai_runs FOR EACH ROW EXECUTE FUNCTION app.guard_ai_state();
CREATE TRIGGER proposal_identity BEFORE UPDATE ON app.ai_proposals FOR EACH ROW EXECUTE FUNCTION app.guard_ai_state();

-- Aggregate budget metadata only; no other member's prompts, outputs, IDs or project names.
GRANT SELECT,UPDATE ON app.ai_runs TO atlas_policy;
GRANT CREATE ON SCHEMA app TO atlas_policy;
CREATE FUNCTION app.ai_usage(w uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN app.is_active_actor() AND app.is_workspace_member(w) THEN jsonb_build_object(
 'activeWorkspace',(SELECT count(*)::int FROM app.ai_runs WHERE "workspaceId"=w AND state IN ('queued','running') AND "expiresAt">now()),
 'activeUser',(SELECT count(*)::int FROM app.ai_runs WHERE "userId"=app.actor_id() AND state IN ('queued','running') AND "expiresAt">now()),
 'requests',(SELECT count(*)::int FROM app.ai_runs WHERE "userId"=app.actor_id() AND "createdAt">=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),
 'spentMicros',(SELECT coalesce(sum("chargedMicros"),0)::int FROM app.ai_runs WHERE "workspaceId"=w AND "createdAt">=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),
 'heldMicros',(SELECT coalesce(sum("reservedMicros"),0)::int FROM app.ai_runs WHERE "workspaceId"=w AND state IN ('queued','running') AND "createdAt">=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')) ELSE NULL END
$$;
CREATE FUNCTION app.expire_ai_runs(w uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE affected integer;
BEGIN
 IF NOT app.is_active_actor() OR NOT app.is_workspace_member(w) THEN RETURN 0; END IF;
 UPDATE app.ai_runs SET state=CASE WHEN "dispatchedAt" IS NULL THEN 'cancelled' ELSE 'provider_error' END,error='INTERRUPTED',"chargedMicros"=CASE WHEN "dispatchedAt" IS NULL THEN 0 ELSE greatest("chargedMicros","reservedMicros") END,"completedAt"=now() WHERE "workspaceId"=w AND state IN ('queued','running') AND "expiresAt"<now();
 GET DIAGNOSTICS affected=ROW_COUNT;RETURN affected;
END $$;
ALTER FUNCTION app.ai_usage(uuid) OWNER TO atlas_policy;
ALTER FUNCTION app.expire_ai_runs(uuid) OWNER TO atlas_policy;
REVOKE CREATE ON SCHEMA app FROM atlas_policy;
REVOKE ALL ON FUNCTION app.ai_usage(uuid),app.expire_ai_runs(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ai_usage(uuid),app.expire_ai_runs(uuid) TO atlas_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO atlas_backup;
UPDATE ops.schema_revision SET revision='202611090007_grounded_ai' WHERE id=1;
COMMIT;
