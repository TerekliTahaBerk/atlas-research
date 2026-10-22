-- Phase 02 research discovery and library. Additive only: no Phase 01 table,
-- column, policy or grant is dropped, and no research data cascades.

CREATE TYPE "ReadingStatus" AS ENUM ('TO_READ', 'READING', 'READ', 'ARCHIVED');
CREATE TYPE "SourceState" AS ENUM ('PENDING_UPLOAD', 'QUARANTINED', 'SCANNING', 'PROCESSING', 'READY', 'FAILED', 'REJECTED');
CREATE TYPE "AnnotationKind" AS ENUM ('HIGHLIGHT', 'NOTE', 'PAGE_NOTE');
CREATE TYPE "AnnotationVisibility" AS ENUM ('PROJECT', 'PRIVATE');
CREATE TYPE "JobState" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'RETRYABLE', 'FAILED');

-- Public bibliographic identity only. No project, user, file or note data.
CREATE TABLE "research_papers" (
    "id" UUID NOT NULL,
    "normalized_doi" VARCHAR(300),
    "title" VARCHAR(1000) NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "research_papers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "research_papers_normalized_doi_key" ON "research_papers"("normalized_doi");

CREATE TABLE "paper_external_identifiers" (
    "provider" VARCHAR(30) NOT NULL,
    "external_id" VARCHAR(200) NOT NULL,
    "paper_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "paper_external_identifiers_pkey" PRIMARY KEY ("provider","external_id")
);
CREATE INDEX "paper_external_identifiers_paper_id_idx" ON "paper_external_identifiers"("paper_id");

-- Minimal project-scoped artifact registry (ADR 0009) for future typed links.
CREATE TABLE "artifacts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),
    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "artifacts_project_id_id_key" ON "artifacts"("project_id","id");

CREATE TABLE "project_papers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "artifact_id" UUID NOT NULL,
    "paper_id" UUID,
    "private_title" VARCHAR(1000),
    "metadata" JSONB,
    "reading_status" "ReadingStatus" NOT NULL DEFAULT 'TO_READ',
    "archived_at" TIMESTAMPTZ(3),
    "added_by_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "project_papers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "project_papers_artifact_id_key" ON "project_papers"("artifact_id");
CREATE UNIQUE INDEX "project_papers_project_id_id_key" ON "project_papers"("project_id","id");
CREATE UNIQUE INDEX "project_papers_project_id_paper_id_key" ON "project_papers"("project_id","paper_id");
CREATE INDEX "project_papers_project_id_created_at_id_idx" ON "project_papers"("project_id","created_at","id");

CREATE TABLE "paper_collections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "archived_at" TIMESTAMPTZ(3),
    "created_by_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "paper_collections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "paper_collections_project_id_id_key" ON "paper_collections"("project_id","id");
CREATE INDEX "paper_collections_project_id_name_id_idx" ON "paper_collections"("project_id","name","id");

CREATE TABLE "collection_memberships" (
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "collection_id" UUID NOT NULL,
    "project_paper_id" UUID NOT NULL,
    "added_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "collection_memberships_pkey" PRIMARY KEY ("collection_id","project_paper_id")
);
CREATE INDEX "collection_memberships_project_paper_id_idx" ON "collection_memberships"("project_paper_id");

CREATE TABLE "paper_tags" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "normalized_name" VARCHAR(40) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "paper_tags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "paper_tags_project_id_id_key" ON "paper_tags"("project_id","id");
CREATE UNIQUE INDEX "paper_tags_project_id_normalized_name_key" ON "paper_tags"("project_id","normalized_name");

CREATE TABLE "project_paper_tags" (
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "project_paper_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_paper_tags_pkey" PRIMARY KEY ("project_paper_id","tag_id")
);
CREATE INDEX "project_paper_tags_tag_id_idx" ON "project_paper_tags"("tag_id");

-- Immutable provenance per captured file. Object keys never leave the server.
CREATE TABLE "source_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "project_paper_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "source_type" VARCHAR(20) NOT NULL,
    "rights_basis" VARCHAR(30) NOT NULL,
    "state" "SourceState" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "file_name" VARCHAR(200) NOT NULL,
    "media_type" VARCHAR(100) NOT NULL,
    "declared_size" BIGINT NOT NULL,
    "declared_sha256" CHAR(64) NOT NULL,
    "byte_size" BIGINT,
    "sha256" CHAR(64),
    "quarantine_key" VARCHAR(500) NOT NULL,
    "object_key" VARCHAR(500),
    "failure" VARCHAR(200),
    "scanned_by" VARCHAR(120),
    "scan_completed_at" TIMESTAMPTZ(3),
    "ready_at" TIMESTAMPTZ(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "source_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "source_versions_project_id_id_key" ON "source_versions"("project_id","id");
CREATE UNIQUE INDEX "source_versions_project_paper_id_id_key" ON "source_versions"("project_paper_id","id");
CREATE UNIQUE INDEX "source_versions_project_paper_id_ordinal_key" ON "source_versions"("project_paper_id","ordinal");
CREATE UNIQUE INDEX "source_versions_quarantine_key_key" ON "source_versions"("quarantine_key");
CREATE UNIQUE INDEX "source_versions_object_key_key" ON "source_versions"("object_key");

CREATE TABLE "upload_intents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source_version_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "finalized_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "upload_intents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "upload_intents_source_version_id_key" ON "upload_intents"("source_version_id");

-- Transactional outbox for isolated scanning; later extraction kinds extend it.
CREATE TABLE "ingestion_jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source_version_id" UUID NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "state" "JobState" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMPTZ(3),
    "last_error" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ingestion_jobs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ingestion_jobs_source_version_id_kind_key" ON "ingestion_jobs"("source_version_id","kind");
CREATE INDEX "ingestion_jobs_kind_state_available_at_idx" ON "ingestion_jobs"("kind","state","available_at");

CREATE TABLE "paper_annotations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "project_paper_id" UUID NOT NULL,
    "source_version_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "kind" "AnnotationKind" NOT NULL,
    "visibility" "AnnotationVisibility" NOT NULL DEFAULT 'PROJECT',
    "body" TEXT,
    "anchor" JSONB NOT NULL,
    "anchor_status" VARCHAR(20) NOT NULL DEFAULT 'PRECISE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    CONSTRAINT "paper_annotations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "paper_annotations_source_version_id_created_at_id_idx" ON "paper_annotations"("source_version_id","created_at","id");

-- Actor-scoped idempotency records; never exposed to the runtime role.
CREATE TABLE "research_command_keys" (
    "actor_id" UUID NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "command" VARCHAR(60) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "research_command_keys_pkey" PRIMARY KEY ("actor_id","idempotency_key")
);

-- Composite tenant keys: children cannot point at another project's rows.
ALTER TABLE paper_external_identifiers ADD CONSTRAINT paper_identifier_paper_fk FOREIGN KEY (paper_id) REFERENCES research_papers(id) ON DELETE RESTRICT;
ALTER TABLE artifacts ADD CONSTRAINT artifact_project_fk FOREIGN KEY (organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT;
ALTER TABLE project_papers ADD CONSTRAINT project_paper_project_fk FOREIGN KEY (organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT;
ALTER TABLE project_papers ADD CONSTRAINT project_paper_artifact_fk FOREIGN KEY (project_id,artifact_id) REFERENCES artifacts(project_id,id) ON DELETE RESTRICT;
ALTER TABLE project_papers ADD CONSTRAINT project_paper_paper_fk FOREIGN KEY (paper_id) REFERENCES research_papers(id) ON DELETE RESTRICT;
ALTER TABLE project_papers ADD CONSTRAINT project_paper_added_by_fk FOREIGN KEY (added_by_id) REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE paper_collections ADD CONSTRAINT collection_project_fk FOREIGN KEY (organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT;
ALTER TABLE paper_collections ADD CONSTRAINT collection_creator_fk FOREIGN KEY (created_by_id) REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE collection_memberships ADD CONSTRAINT collection_membership_project_fk FOREIGN KEY (organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT;
ALTER TABLE collection_memberships ADD CONSTRAINT collection_membership_collection_fk FOREIGN KEY (project_id,collection_id) REFERENCES paper_collections(project_id,id) ON DELETE RESTRICT;
ALTER TABLE collection_memberships ADD CONSTRAINT collection_membership_paper_fk FOREIGN KEY (project_id,project_paper_id) REFERENCES project_papers(project_id,id) ON DELETE RESTRICT;
ALTER TABLE collection_memberships ADD CONSTRAINT collection_membership_actor_fk FOREIGN KEY (added_by_id) REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE paper_tags ADD CONSTRAINT tag_project_fk FOREIGN KEY (organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT;
ALTER TABLE paper_tags ADD CONSTRAINT tag_creator_fk FOREIGN KEY (created_by_id) REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE project_paper_tags ADD CONSTRAINT paper_tag_project_fk FOREIGN KEY (organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT;
ALTER TABLE project_paper_tags ADD CONSTRAINT paper_tag_paper_fk FOREIGN KEY (project_id,project_paper_id) REFERENCES project_papers(project_id,id) ON DELETE RESTRICT;
ALTER TABLE project_paper_tags ADD CONSTRAINT paper_tag_tag_fk FOREIGN KEY (project_id,tag_id) REFERENCES paper_tags(project_id,id) ON DELETE RESTRICT;
ALTER TABLE source_versions ADD CONSTRAINT source_project_fk FOREIGN KEY (organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT;
ALTER TABLE source_versions ADD CONSTRAINT source_paper_fk FOREIGN KEY (project_id,project_paper_id) REFERENCES project_papers(project_id,id) ON DELETE RESTRICT;
ALTER TABLE source_versions ADD CONSTRAINT source_creator_fk FOREIGN KEY (created_by_id) REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE upload_intents ADD CONSTRAINT upload_project_fk FOREIGN KEY (organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT;
ALTER TABLE upload_intents ADD CONSTRAINT upload_source_fk FOREIGN KEY (project_id,source_version_id) REFERENCES source_versions(project_id,id) ON DELETE RESTRICT;
ALTER TABLE upload_intents ADD CONSTRAINT upload_actor_fk FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE ingestion_jobs ADD CONSTRAINT job_project_fk FOREIGN KEY (organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT;
ALTER TABLE ingestion_jobs ADD CONSTRAINT job_source_fk FOREIGN KEY (project_id,source_version_id) REFERENCES source_versions(project_id,id) ON DELETE RESTRICT;
ALTER TABLE paper_annotations ADD CONSTRAINT annotation_project_fk FOREIGN KEY (organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT;
ALTER TABLE paper_annotations ADD CONSTRAINT annotation_paper_fk FOREIGN KEY (project_id,project_paper_id) REFERENCES project_papers(project_id,id) ON DELETE RESTRICT;
-- The annotated version must belong to the same project paper.
ALTER TABLE paper_annotations ADD CONSTRAINT annotation_source_fk FOREIGN KEY (project_paper_id,source_version_id) REFERENCES source_versions(project_paper_id,id) ON DELETE RESTRICT;
ALTER TABLE paper_annotations ADD CONSTRAINT annotation_author_fk FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE research_command_keys ADD CONSTRAINT command_key_actor_fk FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE RESTRICT;

ALTER TABLE research_papers ADD CONSTRAINT research_paper_doi_format CHECK (normalized_doi IS NULL OR (normalized_doi ~ '^10\.[0-9]{4,9}/[^[:space:]]+$' AND normalized_doi=lower(normalized_doi)));
ALTER TABLE research_papers ADD CONSTRAINT research_paper_metadata_bound CHECK (jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=65536 AND length(btrim(title))>0);
ALTER TABLE paper_external_identifiers ADD CONSTRAINT paper_identifier_format CHECK (
 (provider='openalex' AND external_id ~ '^W[0-9]{1,12}$') OR (provider='semantic-scholar' AND external_id ~ '^[0-9a-f]{40}$'));
ALTER TABLE artifacts ADD CONSTRAINT artifact_kind CHECK (kind IN ('PAPER'));
-- Public papers keep metadata snapshots; private sources keep only a title.
ALTER TABLE project_papers ADD CONSTRAINT project_paper_origin CHECK (
 (paper_id IS NOT NULL AND private_title IS NULL AND jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=65536) OR
 (paper_id IS NULL AND metadata IS NULL AND length(btrim(private_title))>0));
ALTER TABLE project_papers ADD CONSTRAINT project_paper_archive_state CHECK ((reading_status='ARCHIVED')=(archived_at IS NOT NULL));
ALTER TABLE paper_collections ADD CONSTRAINT collection_name_bound CHECK (length(btrim(name)) BETWEEN 1 AND 120);
CREATE UNIQUE INDEX paper_collections_active_name ON paper_collections(project_id,lower(name)) WHERE archived_at IS NULL;
ALTER TABLE paper_tags ADD CONSTRAINT tag_name_bound CHECK (length(btrim(name)) BETWEEN 1 AND 40 AND length(normalized_name) BETWEEN 1 AND 40);
ALTER TABLE source_versions ADD CONSTRAINT source_kind CHECK (source_type='UPLOAD' AND rights_basis='USER_UPLOAD' AND media_type='application/pdf');
ALTER TABLE source_versions ADD CONSTRAINT source_sizes CHECK (declared_size BETWEEN 8 AND 26214400 AND (byte_size IS NULL OR byte_size BETWEEN 8 AND 26214400) AND declared_sha256 ~ '^[a-f0-9]{64}$' AND (sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'));
-- Readable state requires a verified, accepted object.
ALTER TABLE source_versions ADD CONSTRAINT source_ready_requires_object CHECK (state<>'READY' OR (object_key IS NOT NULL AND sha256 IS NOT NULL AND byte_size IS NOT NULL AND scan_completed_at IS NOT NULL));
ALTER TABLE ingestion_jobs ADD CONSTRAINT job_kind CHECK (kind IN ('SCAN') AND attempts BETWEEN 0 AND 10);
ALTER TABLE paper_annotations ADD CONSTRAINT annotation_bounds CHECK (
 (body IS NULL OR length(body)<=10000) AND jsonb_typeof(anchor)='object' AND octet_length(anchor::text)<=16384
 AND (anchor->>'pageNumber') ~ '^[0-9]{1,5}$' AND anchor_status IN ('PRECISE','RECOVERED'));
ALTER TABLE research_command_keys ADD CONSTRAINT command_key_hash CHECK (request_hash ~ '^[a-f0-9]{64}$');

-- Source versions are immutable provenance: identity, measured content and
-- accepted objects never change once set, and READY is terminal.
CREATE FUNCTION atlas_private.guard_source_version() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 IF NEW.id<>OLD.id OR NEW.project_id<>OLD.project_id OR NEW.project_paper_id<>OLD.project_paper_id OR NEW.ordinal<>OLD.ordinal
  OR NEW.declared_sha256<>OLD.declared_sha256 OR NEW.declared_size<>OLD.declared_size OR NEW.quarantine_key<>OLD.quarantine_key
  OR NEW.file_name<>OLD.file_name OR NEW.created_by_id<>OLD.created_by_id
  OR (OLD.sha256 IS NOT NULL AND NEW.sha256 IS DISTINCT FROM OLD.sha256)
  OR (OLD.byte_size IS NOT NULL AND NEW.byte_size IS DISTINCT FROM OLD.byte_size)
  OR (OLD.object_key IS NOT NULL AND NEW.object_key IS DISTINCT FROM OLD.object_key)
  OR (OLD.state IN ('READY','REJECTED') AND NEW.state<>OLD.state) THEN
  RAISE EXCEPTION 'CONFLICT';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER source_versions_immutable BEFORE UPDATE OR DELETE ON source_versions FOR EACH ROW EXECUTE FUNCTION atlas_private.guard_source_version();
CREATE FUNCTION atlas_private.guard_annotation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 IF NEW.source_version_id<>OLD.source_version_id OR NEW.project_paper_id<>OLD.project_paper_id OR NEW.anchor<>OLD.anchor
  OR NEW.author_id<>OLD.author_id OR NEW.kind<>OLD.kind OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER paper_annotations_anchor_immutable BEFORE UPDATE OR DELETE ON paper_annotations FOR EACH ROW EXECUTE FUNCTION atlas_private.guard_annotation();

-- ------------------------------------------------------------------ RLS
ALTER TABLE research_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_external_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_paper_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_command_keys ENABLE ROW LEVEL SECURITY;

-- Global metadata is visible only through a readable project association, so
-- a row's existence never reveals another tenant's saves.
CREATE FUNCTION atlas_private.can_read_paper(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM project_papers pp WHERE pp.paper_id=target AND atlas_private.can('project',pp.project_id,'project.read'))
$$;
GRANT SELECT ON research_papers,paper_external_identifiers,artifacts,project_papers,paper_collections,collection_memberships,paper_tags,project_paper_tags,source_versions,upload_intents,paper_annotations TO atlas_runtime;
CREATE POLICY research_paper_read ON research_papers FOR SELECT TO atlas_runtime USING (atlas_private.can_read_paper(id));
CREATE POLICY paper_identifier_read ON paper_external_identifiers FOR SELECT TO atlas_runtime USING (atlas_private.can_read_paper(paper_id));
CREATE POLICY artifact_read ON artifacts FOR SELECT TO atlas_runtime USING (atlas_private.can('project',project_id,'project.read'));
CREATE POLICY project_paper_read ON project_papers FOR SELECT TO atlas_runtime USING (atlas_private.can('project',project_id,'project.read'));
CREATE POLICY collection_read ON paper_collections FOR SELECT TO atlas_runtime USING (atlas_private.can('project',project_id,'project.read'));
CREATE POLICY collection_membership_read ON collection_memberships FOR SELECT TO atlas_runtime USING (atlas_private.can('project',project_id,'project.read'));
CREATE POLICY tag_read ON paper_tags FOR SELECT TO atlas_runtime USING (atlas_private.can('project',project_id,'project.read'));
CREATE POLICY paper_tag_read ON project_paper_tags FOR SELECT TO atlas_runtime USING (atlas_private.can('project',project_id,'project.read'));
CREATE POLICY source_read ON source_versions FOR SELECT TO atlas_runtime USING (atlas_private.can('project',project_id,'project.read'));
CREATE POLICY upload_read ON upload_intents FOR SELECT TO atlas_runtime USING (actor_id=(SELECT atlas_private.actor()) AND atlas_private.can('project',project_id,'project.read'));
-- Private annotations are author-only; deleted annotations are never read.
CREATE POLICY annotation_read ON paper_annotations FOR SELECT TO atlas_runtime USING (
 deleted_at IS NULL AND atlas_private.can('project',project_id,'project.read')
 AND (visibility='PROJECT' OR author_id=(SELECT atlas_private.actor())));
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['research_papers','paper_external_identifiers','artifacts','project_papers','paper_collections','collection_memberships','paper_tags','project_paper_tags','source_versions','upload_intents','ingestion_jobs','paper_annotations','research_command_keys'] LOOP
  EXECUTE format('CREATE POLICY deny_insert ON public.%I FOR INSERT TO atlas_runtime WITH CHECK (false)',t);
  EXECUTE format('CREATE POLICY deny_update ON public.%I FOR UPDATE TO atlas_runtime USING (false) WITH CHECK (false)',t);
  EXECUTE format('CREATE POLICY deny_delete ON public.%I FOR DELETE TO atlas_runtime USING (false)',t);
 END LOOP;
END $$;

-- ------------------------------------------------------- research commands
CREATE FUNCTION atlas_private.research_replay(who uuid, key uuid, cmd text, hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE stored research_command_keys%ROWTYPE;
BEGIN
 IF key IS NULL OR hash IS NULL OR hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 -- Serialize the same actor/key so concurrent replays observe one outcome.
 PERFORM pg_advisory_xact_lock(71003,hashtext(who::text||key::text));
 SELECT * INTO stored FROM research_command_keys WHERE actor_id=who AND idempotency_key=key;
 IF stored.actor_id IS NULL THEN RETURN NULL; END IF;
 IF stored.command<>cmd OR stored.request_hash<>hash THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 RETURN stored.result || jsonb_build_object('replayed',true);
END $$;
CREATE FUNCTION atlas_private.research_remember(who uuid, key uuid, cmd text, hash text, outcome jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 INSERT INTO research_command_keys(actor_id,idempotency_key,command,request_hash,result) VALUES(who,key,cmd,hash,outcome);
 RETURN outcome;
END $$;
CREATE FUNCTION atlas_private.validate_text(v text, maximum integer) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$ BEGIN
 IF v IS NULL OR length(btrim(v)) NOT BETWEEN 1 AND maximum OR v ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 RETURN btrim(v);
END $$;

CREATE FUNCTION atlas_private.mutate_research(cmd text, input jsonb, request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 actor uuid:=atlas_private.actor(); v_result jsonb; v_replay jsonb; v_key uuid; v_hash text;
 v_project projects%ROWTYPE; v_pp project_papers%ROWTYPE; v_col paper_collections%ROWTYPE; v_tag paper_tags%ROWTYPE;
 v_sv source_versions%ROWTYPE; v_an paper_annotations%ROWTYPE; v_intent upload_intents%ROWTYPE;
 v_paper uuid; v_doi text; v_ids jsonb; v_meta jsonb; v_title text; v_lock text; v_artifact uuid; v_target uuid;
 v_existing_doi text; v_ordinal integer; v_name text; v_status text; v_outcome text;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 IF jsonb_typeof(input)<>'object' OR octet_length(input::text)>131072 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=actor AND deleted_at IS NULL) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 -- Shared hold on the hierarchy lock: research writes run concurrently with
 -- each other, but never interleave with a revocation's capability change.
 PERFORM pg_advisory_xact_lock_shared(71001,1);
 v_key:=CASE WHEN input ? 'idempotencyKey' THEN (input->>'idempotencyKey')::uuid END;
 v_hash:=input->>'requestHash';

 IF cmd IN ('paper.save','paper.create','collection.create','tag.create') THEN
  SELECT * INTO v_project FROM projects WHERE id=(input->>'projectId')::uuid;
  PERFORM atlas_private.require_cap('project',v_project.id,'project.write');
  v_replay:=atlas_private.research_replay(actor,v_key,cmd,v_hash);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  v_target:=v_project.id;
 END IF;

 IF cmd='paper.save' THEN
  v_doi:=nullif(input#>>'{paper,doi}','');
  IF v_doi IS NOT NULL AND (v_doi !~ '^10\.[0-9]{4,9}/[^[:space:]]+$' OR v_doi<>lower(v_doi)) THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  v_ids:=input#>'{paper,identifiers}'; v_meta:=input#>'{paper,metadata}';
  v_title:=atlas_private.validate_text(input#>>'{paper,title}',1000);
  IF jsonb_typeof(v_ids)<>'array' OR jsonb_array_length(v_ids) NOT BETWEEN 1 AND 4 OR jsonb_typeof(v_meta)<>'object' THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  -- Lock every identity key in a stable order; concurrent saves of one work
  -- (same DOI or provider ID, any project) resolve to one paper row.
  FOR v_lock IN SELECT DISTINCT k FROM (
    SELECT 'doi:'||v_doi AS k WHERE v_doi IS NOT NULL
    UNION SELECT (e->>'provider')||':'||(e->>'externalId') FROM jsonb_array_elements(v_ids) e) keys ORDER BY k LOOP
   PERFORM pg_advisory_xact_lock(71002,hashtext(v_lock));
  END LOOP;
  IF v_doi IS NOT NULL THEN SELECT id INTO v_paper FROM research_papers WHERE normalized_doi=v_doi; END IF;
  IF v_paper IS NULL THEN
   SELECT i.paper_id INTO v_paper FROM paper_external_identifiers i JOIN jsonb_array_elements(v_ids) e
    ON i.provider=e->>'provider' AND i.external_id=e->>'externalId' ORDER BY i.paper_id LIMIT 1;
  END IF;
  IF v_paper IS NULL THEN
   INSERT INTO research_papers(id,normalized_doi,title,metadata,updated_at) VALUES(gen_random_uuid(),v_doi,v_title,v_meta,now()) RETURNING id INTO v_paper;
  ELSE
   SELECT normalized_doi INTO v_existing_doi FROM research_papers WHERE id=v_paper FOR UPDATE;
   -- A provider ID already bound to a different DOI is an identity conflict
   -- for human review, never an automatic merge.
   IF v_doi IS NOT NULL AND v_existing_doi IS NOT NULL AND v_existing_doi<>v_doi THEN RAISE EXCEPTION 'CONFLICT'; END IF;
   UPDATE research_papers SET normalized_doi=coalesce(normalized_doi,v_doi),title=v_title,metadata=v_meta,updated_at=now() WHERE id=v_paper;
  END IF;
  INSERT INTO paper_external_identifiers(provider,external_id,paper_id)
   SELECT e->>'provider',e->>'externalId',v_paper FROM jsonb_array_elements(v_ids) e ON CONFLICT DO NOTHING;
  SELECT * INTO v_pp FROM project_papers WHERE project_id=v_project.id AND paper_id=v_paper FOR UPDATE;
  IF v_pp.id IS NOT NULL THEN
   IF v_pp.archived_at IS NOT NULL THEN
    UPDATE project_papers SET reading_status='TO_READ',archived_at=NULL,version=version+1,updated_at=now() WHERE id=v_pp.id;
   END IF;
   v_result:=jsonb_build_object('id',v_pp.id,'existing',true);
  ELSE
   INSERT INTO artifacts(id,organization_id,workspace_id,project_id,kind) VALUES(gen_random_uuid(),v_project.organization_id,v_project.workspace_id,v_project.id,'PAPER') RETURNING id INTO v_artifact;
   INSERT INTO project_papers(id,organization_id,workspace_id,project_id,artifact_id,paper_id,metadata,added_by_id,updated_at)
    VALUES(gen_random_uuid(),v_project.organization_id,v_project.workspace_id,v_project.id,v_artifact,v_paper,v_meta,actor,now()) RETURNING * INTO v_pp;
   v_result:=jsonb_build_object('id',v_pp.id,'existing',false);
  END IF;
  PERFORM atlas_private.research_remember(actor,v_key,cmd,v_hash,v_result);
 ELSIF cmd='paper.create' THEN
  INSERT INTO artifacts(id,organization_id,workspace_id,project_id,kind) VALUES(gen_random_uuid(),v_project.organization_id,v_project.workspace_id,v_project.id,'PAPER') RETURNING id INTO v_artifact;
  INSERT INTO project_papers(id,organization_id,workspace_id,project_id,artifact_id,private_title,added_by_id,updated_at)
   VALUES(gen_random_uuid(),v_project.organization_id,v_project.workspace_id,v_project.id,v_artifact,atlas_private.validate_text(input->>'title',1000),actor,now()) RETURNING * INTO v_pp;
  v_result:=atlas_private.research_remember(actor,v_key,cmd,v_hash,jsonb_build_object('id',v_pp.id,'existing',false));
 ELSIF cmd IN ('paper.update','paper.archive') THEN
  SELECT * INTO v_pp FROM project_papers WHERE id=(input->>'id')::uuid FOR UPDATE;
  PERFORM atlas_private.require_cap('project',v_pp.project_id,'project.write');
  IF v_pp.version IS DISTINCT FROM (input->>'expectedVersion')::integer THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  v_status:=CASE WHEN cmd='paper.archive' THEN 'ARCHIVED' ELSE input->>'readingStatus' END;
  IF v_status NOT IN ('TO_READ','READING','READ','ARCHIVED') THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  UPDATE project_papers SET reading_status=v_status::"ReadingStatus",
   archived_at=CASE WHEN v_status='ARCHIVED' THEN coalesce(archived_at,now()) END,version=version+1,updated_at=now() WHERE id=v_pp.id;
  v_target:=v_pp.project_id;v_result:=jsonb_build_object('id',v_pp.id);
 ELSIF cmd='collection.create' THEN
  BEGIN
   INSERT INTO paper_collections(id,organization_id,workspace_id,project_id,name,description,created_by_id,updated_at)
    VALUES(gen_random_uuid(),v_project.organization_id,v_project.workspace_id,v_project.id,atlas_private.validate_text(input->>'name',120),
     nullif(btrim(left(coalesce(input->>'description',''),500)),''),actor,now()) RETURNING * INTO v_col;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'CONFLICT';
  END;
  v_result:=atlas_private.research_remember(actor,v_key,cmd,v_hash,jsonb_build_object('id',v_col.id));
 ELSIF cmd IN ('collection.update','collection.archive') THEN
  SELECT * INTO v_col FROM paper_collections WHERE id=(input->>'id')::uuid FOR UPDATE;
  PERFORM atlas_private.require_cap('project',v_col.project_id,'project.write');
  IF v_col.archived_at IS NOT NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_col.version IS DISTINCT FROM (input->>'expectedVersion')::integer THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  BEGIN
   UPDATE paper_collections SET name=CASE WHEN cmd='collection.update' THEN atlas_private.validate_text(input->>'name',120) ELSE name END,
    description=CASE WHEN cmd='collection.update' THEN nullif(btrim(left(coalesce(input->>'description',''),500)),'') ELSE description END,
    archived_at=CASE WHEN cmd='collection.archive' THEN now() END,version=version+1,updated_at=now() WHERE id=v_col.id;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'CONFLICT';
  END;
  v_target:=v_col.project_id;v_result:=jsonb_build_object('id',v_col.id);
 ELSIF cmd IN ('collection.paper.add','collection.paper.remove') THEN
  SELECT * INTO v_col FROM paper_collections WHERE id=(input->>'collectionId')::uuid;
  SELECT * INTO v_pp FROM project_papers WHERE id=(input->>'projectPaperId')::uuid;
  PERFORM atlas_private.require_cap('project',v_col.project_id,'project.write');
  -- Same-project membership only; another project's paper is undiscoverable.
  IF v_pp.id IS NULL OR v_pp.project_id<>v_col.project_id OR v_col.archived_at IS NOT NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF cmd='collection.paper.add' THEN
   INSERT INTO collection_memberships(organization_id,workspace_id,project_id,collection_id,project_paper_id,added_by_id)
    VALUES(v_col.organization_id,v_col.workspace_id,v_col.project_id,v_col.id,v_pp.id,actor) ON CONFLICT DO NOTHING;
  ELSE
   DELETE FROM collection_memberships WHERE collection_id=v_col.id AND project_paper_id=v_pp.id;
  END IF;
  v_target:=v_col.project_id;v_result:=jsonb_build_object('id',v_col.id);
 ELSIF cmd='tag.create' THEN
  v_name:=atlas_private.validate_text(normalize(input->>'name',NFKC),40);
  INSERT INTO paper_tags(id,organization_id,workspace_id,project_id,name,normalized_name,created_by_id)
   VALUES(gen_random_uuid(),v_project.organization_id,v_project.workspace_id,v_project.id,regexp_replace(v_name,'\s+',' ','g'),
    lower(regexp_replace(v_name,'\s+',' ','g')),actor) ON CONFLICT (project_id,normalized_name) DO NOTHING RETURNING * INTO v_tag;
  IF v_tag.id IS NULL THEN
   SELECT * INTO v_tag FROM paper_tags WHERE project_id=v_project.id AND normalized_name=lower(regexp_replace(v_name,'\s+',' ','g'));
   v_result:=jsonb_build_object('id',v_tag.id,'existing',true);
  ELSE v_result:=jsonb_build_object('id',v_tag.id,'existing',false); END IF;
  PERFORM atlas_private.research_remember(actor,v_key,cmd,v_hash,v_result);
 ELSIF cmd IN ('paper.tag.add','paper.tag.remove') THEN
  SELECT * INTO v_tag FROM paper_tags WHERE id=(input->>'tagId')::uuid;
  SELECT * INTO v_pp FROM project_papers WHERE id=(input->>'projectPaperId')::uuid;
  PERFORM atlas_private.require_cap('project',v_pp.project_id,'project.write');
  IF v_tag.id IS NULL OR v_tag.project_id<>v_pp.project_id THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF cmd='paper.tag.add' THEN
   INSERT INTO project_paper_tags(organization_id,workspace_id,project_id,project_paper_id,tag_id)
    VALUES(v_pp.organization_id,v_pp.workspace_id,v_pp.project_id,v_pp.id,v_tag.id) ON CONFLICT DO NOTHING;
  ELSE DELETE FROM project_paper_tags WHERE project_paper_id=v_pp.id AND tag_id=v_tag.id; END IF;
  v_target:=v_pp.project_id;v_result:=jsonb_build_object('id',v_pp.id);
 ELSIF cmd='annotation.create' THEN
  SELECT * INTO v_sv FROM source_versions WHERE id=(input->>'sourceVersionId')::uuid;
  PERFORM atlas_private.require_cap('project',v_sv.project_id,'project.write');
  v_replay:=atlas_private.research_replay(actor,v_key,cmd,v_hash);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  -- Only accepted, immutable versions can be annotated.
  IF v_sv.state<>'READY' THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  IF input->>'kind' NOT IN ('HIGHLIGHT','NOTE','PAGE_NOTE') OR coalesce(input->>'visibility','PROJECT') NOT IN ('PROJECT','PRIVATE')
   OR jsonb_typeof(input->'anchor')<>'object' OR length(coalesce(input->>'body',''))>10000 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  INSERT INTO paper_annotations(id,organization_id,workspace_id,project_id,project_paper_id,source_version_id,author_id,kind,visibility,body,anchor,updated_at)
   VALUES(gen_random_uuid(),v_sv.organization_id,v_sv.workspace_id,v_sv.project_id,v_sv.project_paper_id,v_sv.id,actor,(input->>'kind')::"AnnotationKind",
    coalesce(input->>'visibility','PROJECT')::"AnnotationVisibility",nullif(input->>'body',''),input->'anchor',now()) RETURNING * INTO v_an;
  v_target:=v_sv.project_id;
  v_result:=atlas_private.research_remember(actor,v_key,cmd,v_hash,jsonb_build_object('id',v_an.id));
 ELSIF cmd IN ('annotation.update','annotation.delete') THEN
  SELECT * INTO v_an FROM paper_annotations WHERE id=(input->>'id')::uuid FOR UPDATE;
  PERFORM atlas_private.require_cap('project',v_an.project_id,'project.read');
  IF v_an.deleted_at IS NOT NULL OR (v_an.visibility='PRIVATE' AND v_an.author_id<>actor) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_an.author_id<>actor THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  PERFORM atlas_private.require_cap('project',v_an.project_id,'project.write');
  IF v_an.version IS DISTINCT FROM (input->>'expectedVersion')::integer THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  IF cmd='annotation.update' AND length(coalesce(input->>'body',''))>10000 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  UPDATE paper_annotations SET body=CASE WHEN cmd='annotation.update' THEN nullif(input->>'body','') ELSE body END,
   deleted_at=CASE WHEN cmd='annotation.delete' THEN now() END,version=version+1,updated_at=now() WHERE id=v_an.id;
  v_target:=v_an.project_id;v_result:=jsonb_build_object('id',v_an.id);
 ELSIF cmd='upload.create' THEN
  -- Server-issued only: the quarantine key is generated by the web server.
  SELECT * INTO v_pp FROM project_papers WHERE id=(input->>'projectPaperId')::uuid FOR UPDATE;
  PERFORM atlas_private.require_cap('project',v_pp.project_id,'project.write');
  v_replay:=atlas_private.research_replay(actor,v_key,cmd,v_hash);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_pp.archived_at IS NOT NULL THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  SELECT coalesce(max(ordinal),0)+1 INTO v_ordinal FROM source_versions WHERE project_paper_id=v_pp.id;
  IF v_ordinal>20 THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  INSERT INTO source_versions(id,organization_id,workspace_id,project_id,project_paper_id,ordinal,source_type,rights_basis,file_name,media_type,
   declared_size,declared_sha256,quarantine_key,created_by_id,updated_at)
   VALUES(gen_random_uuid(),v_pp.organization_id,v_pp.workspace_id,v_pp.project_id,v_pp.id,v_ordinal,'UPLOAD','USER_UPLOAD',
    atlas_private.validate_text(input->>'fileName',200),input->>'mediaType',(input->>'byteSize')::bigint,input->>'sha256',input->>'quarantineKey',actor,now())
   RETURNING * INTO v_sv;
  INSERT INTO upload_intents(id,organization_id,workspace_id,project_id,source_version_id,actor_id,expires_at)
   VALUES(gen_random_uuid(),v_sv.organization_id,v_sv.workspace_id,v_sv.project_id,v_sv.id,actor,now()+interval '15 minutes') RETURNING * INTO v_intent;
  v_target:=v_pp.project_id;
  v_result:=atlas_private.research_remember(actor,v_key,cmd,v_hash,jsonb_build_object('id',v_intent.id,'sourceVersionId',v_sv.id,'expiresAt',v_intent.expires_at));
 ELSIF cmd='upload.finalize' THEN
  SELECT * INTO v_intent FROM upload_intents WHERE id=(input->>'id')::uuid FOR UPDATE;
  IF v_intent.id IS NULL OR v_intent.actor_id<>actor THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  PERFORM atlas_private.require_cap('project',v_intent.project_id,'project.write');
  SELECT * INTO v_sv FROM source_versions WHERE id=v_intent.source_version_id FOR UPDATE;
  IF v_intent.finalized_at IS NOT NULL THEN RETURN jsonb_build_object('id',v_intent.id,'state',v_sv.state,'replayed',true); END IF;
  v_outcome:=input->>'outcome';
  -- Expired grants cannot be finalized into the library.
  IF v_intent.expires_at<now() THEN v_outcome:='REJECTED'; END IF;
  IF v_outcome='QUARANTINED' THEN
   IF (input->>'byteSize')::bigint IS DISTINCT FROM v_sv.declared_size OR input->>'sha256' IS DISTINCT FROM v_sv.declared_sha256 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   UPDATE source_versions SET state='QUARANTINED',byte_size=(input->>'byteSize')::bigint,sha256=input->>'sha256',updated_at=now() WHERE id=v_sv.id;
   INSERT INTO ingestion_jobs(id,organization_id,workspace_id,project_id,source_version_id,kind,updated_at)
    VALUES(gen_random_uuid(),v_sv.organization_id,v_sv.workspace_id,v_sv.project_id,v_sv.id,'SCAN',now());
  ELSIF v_outcome='REJECTED' THEN
   UPDATE source_versions SET state='REJECTED',failure=CASE WHEN v_intent.expires_at<now() THEN 'Upload grant expired.' ELSE left(coalesce(input->>'failure','Rejected.'),200) END,updated_at=now() WHERE id=v_sv.id;
  ELSE RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  UPDATE upload_intents SET finalized_at=now() WHERE id=v_intent.id;
  v_target:=v_intent.project_id;v_result:=jsonb_build_object('id',v_intent.id,'state',v_outcome);
 ELSE RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;

 INSERT INTO audit_events(id,organization_id,actor_id,action,resource_id,request_id)
  VALUES(gen_random_uuid(),(SELECT organization_id FROM projects WHERE id=v_target),actor,cmd,(v_result->>'id')::uuid,request_id);
 RETURN v_result;
END $$;

-- Extend the single command boundary without editing the reviewed functions.
ALTER FUNCTION atlas_private.mutate(text,jsonb,uuid) RENAME TO mutate_platform;
REVOKE EXECUTE ON FUNCTION atlas_private.mutate_platform(text,jsonb,uuid) FROM atlas_runtime;
CREATE FUNCTION atlas_private.mutate(command text,input jsonb,request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF command IN ('paper.save','paper.create','paper.update','paper.archive','collection.create','collection.update','collection.archive',
  'collection.paper.add','collection.paper.remove','tag.create','paper.tag.add','paper.tag.remove','annotation.create','annotation.update',
  'annotation.delete','upload.create','upload.finalize') THEN
  RETURN atlas_private.mutate_research(command,input,request_id);
 END IF;
 RETURN atlas_private.mutate_platform(command,input,request_id);
END $$;

-- ------------------------------------------------- isolated scanner boundary
-- Called only by the server's HMAC-authenticated scanner endpoints. Leases
-- bound concurrent work; expired leases are reclaimed with a retry budget.
CREATE FUNCTION atlas_private.claim_scan_jobs(maximum integer, lease_seconds integer)
RETURNS TABLE(job_id uuid, source_version_id uuid, quarantine_key text, sha256 text, byte_size bigint, attempt integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF maximum NOT BETWEEN 1 AND 10 OR lease_seconds NOT BETWEEN 30 AND 900 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 -- Leases that expired five times terminally fail instead of looping.
 UPDATE source_versions s SET state='FAILED',failure='Scanning did not complete.',updated_at=now() FROM ingestion_jobs j
  WHERE j.source_version_id=s.id AND j.kind='SCAN' AND j.state='RUNNING' AND j.locked_until<now() AND j.attempts>=5;
 UPDATE ingestion_jobs SET state='FAILED',last_error='lease expired',updated_at=now() WHERE kind='SCAN' AND state='RUNNING' AND locked_until<now() AND attempts>=5;
 RETURN QUERY
 WITH picked AS (
  SELECT j.id FROM ingestion_jobs j WHERE j.kind='SCAN' AND j.attempts<5 AND (
   (j.state IN ('QUEUED','RETRYABLE') AND j.available_at<=now()) OR (j.state='RUNNING' AND j.locked_until<now()))
  ORDER BY j.available_at,j.id FOR UPDATE SKIP LOCKED LIMIT maximum),
 claimed AS (
  UPDATE ingestion_jobs j SET state='RUNNING',attempts=j.attempts+1,locked_until=now()+make_interval(secs=>lease_seconds),updated_at=now()
  FROM picked WHERE j.id=picked.id RETURNING j.id,j.source_version_id,j.attempts),
 marked AS (
  UPDATE source_versions s SET state='SCANNING',updated_at=now() FROM claimed WHERE s.id=claimed.source_version_id RETURNING s.id,s.quarantine_key,s.sha256,s.byte_size)
 SELECT c.id,c.source_version_id,m.quarantine_key::text,m.sha256::text,m.byte_size,c.attempts FROM claimed c JOIN marked m ON m.id=c.source_version_id;
END $$;
CREATE FUNCTION atlas_private.complete_scan(job uuid, verdict text, measured_sha256 text, scanner text, accepted_key text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE j ingestion_jobs%ROWTYPE; s source_versions%ROWTYPE; outcome text;
BEGIN
 SELECT * INTO j FROM ingestion_jobs WHERE id=job FOR UPDATE;
 IF j.id IS NULL OR j.state<>'RUNNING' OR j.locked_until<now() THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 SELECT * INTO s FROM source_versions WHERE id=j.source_version_id FOR UPDATE;
 IF verdict NOT IN ('CLEAN','INFECTED','INVALID','ERROR') OR scanner IS NULL OR length(scanner) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 -- The accepted object must be bound to this exact project and version.
 IF verdict='CLEAN' AND (measured_sha256 IS DISTINCT FROM s.sha256 OR accepted_key IS NULL
  OR accepted_key !~ ('^accepted/'||s.project_id::text||'/'||s.id::text||'/[A-Za-z0-9_-]{32}\.pdf$')) THEN
  verdict:='INVALID';
 END IF;
 IF verdict='CLEAN' THEN
  UPDATE source_versions SET state='READY',object_key=accepted_key,scanned_by=scanner,scan_completed_at=now(),ready_at=now(),updated_at=now() WHERE id=s.id;
  UPDATE ingestion_jobs SET state='SUCCEEDED',locked_until=NULL,last_error=NULL,updated_at=now() WHERE id=j.id;
  outcome:='READY';
 ELSIF verdict IN ('INFECTED','INVALID') THEN
  UPDATE source_versions SET state='REJECTED',scanned_by=scanner,scan_completed_at=now(),
   failure=CASE WHEN verdict='INFECTED' THEN 'Rejected by malware scanning.' ELSE 'The file failed validation.' END,updated_at=now() WHERE id=s.id;
  UPDATE ingestion_jobs SET state='SUCCEEDED',locked_until=NULL,updated_at=now() WHERE id=j.id;
  outcome:='REJECTED';
 ELSIF j.attempts>=5 THEN
  UPDATE source_versions SET state='FAILED',failure='Scanning did not complete.',updated_at=now() WHERE id=s.id;
  UPDATE ingestion_jobs SET state='FAILED',locked_until=NULL,last_error='scanner error',updated_at=now() WHERE id=j.id;
  outcome:='FAILED';
 ELSE
  -- Transient scanner failure: stay quarantined and retry with backoff.
  UPDATE source_versions SET state='QUARANTINED',updated_at=now() WHERE id=s.id;
  UPDATE ingestion_jobs SET state='RETRYABLE',locked_until=NULL,last_error='scanner error',available_at=now()+make_interval(secs=>30*power(2,j.attempts)::integer),updated_at=now() WHERE id=j.id;
  outcome:='QUARANTINED';
 END IF;
 INSERT INTO audit_events(id,organization_id,actor_id,action,resource_id,request_id)
  VALUES(gen_random_uuid(),s.organization_id,'00000000-0000-0000-0000-000000000000','source.scan.'||lower(outcome),s.id,gen_random_uuid());
 RETURN outcome;
END $$;

-- Minimal lookup for a currently leased job; no other scanner reads exist.
CREATE FUNCTION atlas_private.scan_job_source(job uuid)
RETURNS TABLE(project_id uuid, source_version_id uuid, quarantine_key text, sha256 text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT s.project_id,s.id,s.quarantine_key::text,s.sha256::text FROM ingestion_jobs j JOIN source_versions s ON s.id=j.source_version_id
 WHERE j.id=job AND j.state='RUNNING' AND j.locked_until>=now()
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA atlas_private FROM PUBLIC;
GRANT EXECUTE ON FUNCTION atlas_private.mutate(text,jsonb,uuid),atlas_private.claim_scan_jobs(integer,integer),atlas_private.complete_scan(uuid,text,text,text,text),atlas_private.scan_job_source(uuid),
 atlas_private.can_read_paper(uuid) TO atlas_runtime;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON public.research_papers,public.paper_external_identifiers,public.artifacts,public.project_papers,public.paper_collections,public.collection_memberships,public.paper_tags,public.project_paper_tags,public.source_versions,public.upload_intents,public.ingestion_jobs,public.paper_annotations,public.research_command_keys FROM %I',r);
  END IF;
 END LOOP;
END $$;

-- Private Storage buckets when this database hosts Supabase Storage. No
-- storage.objects policy is created: browser roles have no object access,
-- and every transfer uses a short-lived server-signed grant.
DO $$ BEGIN
 IF to_regclass('storage.buckets') IS NOT NULL THEN
  INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
   VALUES('atlas-quarantine','atlas-quarantine',false,26214400,ARRAY['application/pdf']),
         ('atlas-sources','atlas-sources',false,26214400,ARRAY['application/pdf'])
   ON CONFLICT (id) DO NOTHING;
  IF EXISTS(SELECT 1 FROM storage.buckets WHERE id IN ('atlas-quarantine','atlas-sources') AND public) THEN
   RAISE EXCEPTION 'Atlas source buckets must be private.';
  END IF;
 END IF;
END $$;
