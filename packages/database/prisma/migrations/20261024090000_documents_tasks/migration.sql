-- Phase 04 documents, tasks and typed artifact links. Additive only: no
-- Phase 01-03 table, column, policy or grant is dropped, nothing cascades,
-- and the reviewed command functions are wrapped rather than edited.
-- Apply only to an identified, approved development target.

-- ------------------------------------------------------------ artifact registry
-- The Phase 02 registry gains the two new kinds. Existing PAPER rows and IDs
-- are untouched; (project, id, kind) lets every owner row and link endpoint
-- prove the kind of the artifact it points at.
ALTER TABLE artifacts DROP CONSTRAINT artifact_kind;
ALTER TABLE artifacts ADD CONSTRAINT artifact_kind CHECK (kind IN ('PAPER','DOCUMENT','TASK'));
CREATE UNIQUE INDEX artifacts_project_id_id_kind_key ON artifacts(project_id,id,kind);
ALTER TABLE project_papers ADD COLUMN artifact_kind varchar(30) NOT NULL DEFAULT 'PAPER' CHECK (artifact_kind='PAPER');
ALTER TABLE project_papers ADD CONSTRAINT project_paper_artifact_kind_fk FOREIGN KEY (project_id,artifact_id,artifact_kind) REFERENCES artifacts(project_id,id,kind) ON DELETE RESTRICT;

-- ------------------------------------------------------------------ documents
CREATE TABLE documents (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL, workspace_id uuid NOT NULL, project_id uuid NOT NULL,
 artifact_id uuid NOT NULL UNIQUE,
 artifact_kind varchar(30) NOT NULL DEFAULT 'DOCUMENT' CHECK (artifact_kind='DOCUMENT'),
 title varchar(200) NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
 kind varchar(30) NOT NULL DEFAULT 'RESEARCH_NOTE' CHECK (kind IN ('RESEARCH_NOTE','GENERAL_DOCUMENT','LITERATURE_REVIEW','EXPERIMENT_NOTE')),
 created_by_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
 updated_by_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
 current_version_id uuid,
 current_revision integer NOT NULL DEFAULT 0 CHECK (current_revision>=0),
 content_schema_version integer NOT NULL DEFAULT 1 CHECK (content_schema_version=1),
 -- Server-derived plain-text projection of the current revision; never HTML.
 search_text text NOT NULL DEFAULT '' CHECK (length(search_text)<=200000),
 search_document tsvector GENERATED ALWAYS AS (setweight(to_tsvector('simple',title),'A') || setweight(to_tsvector('simple',left(search_text,200000)),'B')) STORED,
 version integer NOT NULL DEFAULT 1,
 archived_at timestamptz(3),
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 updated_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE (project_id,id),
 CHECK ((current_version_id IS NULL)=(current_revision=0)),
 FOREIGN KEY (organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (project_id,artifact_id,artifact_kind) REFERENCES artifacts(project_id,id,kind) ON DELETE RESTRICT
);
CREATE INDEX documents_project_updated ON documents(project_id,archived_at,updated_at DESC,id);
CREATE INDEX documents_search ON documents USING gin(search_document);

-- Immutable snapshots. A restore writes a new revision; nothing is rewritten.
CREATE TABLE document_versions (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL, workspace_id uuid NOT NULL, project_id uuid NOT NULL,
 document_id uuid NOT NULL,
 revision integer NOT NULL CHECK (revision BETWEEN 1 AND 1000000),
 author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
 content jsonb NOT NULL CHECK (jsonb_typeof(content)='object' AND content->>'type'='doc' AND octet_length(content::text)<=400000),
 content_hash char(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
 schema_version integer NOT NULL CHECK (schema_version=1),
 change_summary varchar(200),
 source varchar(20) NOT NULL CHECK (source IN ('CREATE','EDITOR','RESTORE','DUPLICATE','AI_PROPOSAL')),
 restored_from_revision integer CHECK (restored_from_revision IS NULL OR restored_from_revision>=1),
 ai_run_id uuid,
 client_request_id uuid NOT NULL,
 reference_artifact_ids uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(reference_artifact_ids)<=500),
 mentioned_profile_ids uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(mentioned_profile_ids)<=200),
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE (document_id,revision),
 UNIQUE (document_id,id,revision),
 UNIQUE (document_id,client_request_id),
 UNIQUE (project_id,id),
 CHECK ((source='RESTORE')=(restored_from_revision IS NOT NULL)),
 CHECK ((source='AI_PROPOSAL')=(ai_run_id IS NOT NULL)),
 FOREIGN KEY (organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (project_id,document_id) REFERENCES documents(project_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (project_id,ai_run_id) REFERENCES ai_runs(project_id,id) ON DELETE RESTRICT
);
CREATE INDEX document_versions_history ON document_versions(document_id,revision DESC);
-- The current pointer must name a real revision of this same document.
ALTER TABLE documents ADD CONSTRAINT document_current_version_fk FOREIGN KEY (id,current_version_id,current_revision)
 REFERENCES document_versions(document_id,id,revision) ON DELETE RESTRICT;

CREATE FUNCTION atlas_private.immutable_document_version() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'CONFLICT'; END $$;
CREATE TRIGGER document_versions_immutable BEFORE UPDATE OR DELETE ON document_versions FOR EACH ROW EXECUTE FUNCTION atlas_private.immutable_document_version();

-- ------------------------------------------------------------ tasks/milestones
CREATE TABLE task_milestones (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL, workspace_id uuid NOT NULL, project_id uuid NOT NULL,
 title varchar(120) NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
 description varchar(1000),
 target_date date,
 status varchar(12) NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','ACTIVE','DONE')),
 created_by_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
 version integer NOT NULL DEFAULT 1,
 archived_at timestamptz(3),
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 updated_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE (project_id,id),
 FOREIGN KEY (organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX task_milestones_project ON task_milestones(project_id,archived_at,target_date,id);

CREATE TABLE tasks (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL, workspace_id uuid NOT NULL, project_id uuid NOT NULL,
 artifact_id uuid NOT NULL UNIQUE,
 artifact_kind varchar(30) NOT NULL DEFAULT 'TASK' CHECK (artifact_kind='TASK'),
 task_number integer NOT NULL CHECK (task_number BETWEEN 1 AND 10000000),
 title varchar(200) NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
 description text NOT NULL DEFAULT '' CHECK (length(description)<=20000),
 status varchar(16) NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO','IN_PROGRESS','IN_REVIEW','DONE','CANCELLED')),
 priority varchar(8) NOT NULL DEFAULT 'NONE' CHECK (priority IN ('NONE','LOW','MEDIUM','HIGH','URGENT')),
 created_by_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
 updated_by_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
 assignee_id uuid REFERENCES profiles(id) ON DELETE RESTRICT,
 milestone_id uuid,
 due_date date,
 ai_run_id uuid,
 version integer NOT NULL DEFAULT 1,
 completed_at timestamptz(3),
 archived_at timestamptz(3),
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 updated_at timestamptz(3) NOT NULL DEFAULT now(),
 search_document tsvector GENERATED ALWAYS AS (setweight(to_tsvector('simple',title),'A') || setweight(to_tsvector('simple',description),'B')) STORED,
 UNIQUE (project_id,id),
 UNIQUE (project_id,task_number),
 CHECK ((status='DONE')=(completed_at IS NOT NULL)),
 FOREIGN KEY (organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (project_id,artifact_id,artifact_kind) REFERENCES artifacts(project_id,id,kind) ON DELETE RESTRICT,
 FOREIGN KEY (project_id,milestone_id) REFERENCES task_milestones(project_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (project_id,ai_run_id) REFERENCES ai_runs(project_id,id) ON DELETE RESTRICT
);
CREATE INDEX tasks_board ON tasks(project_id,archived_at,status,task_number);
CREATE INDEX tasks_assignee ON tasks(project_id,assignee_id) WHERE archived_at IS NULL;
CREATE INDEX tasks_milestone ON tasks(project_id,milestone_id) WHERE milestone_id IS NOT NULL;
CREATE INDEX tasks_search ON tasks USING gin(search_document);

-- Project papers are searchable through an expression index over the same
-- bounded title/abstract fields; nothing is copied out of the library.
CREATE INDEX project_papers_search ON project_papers USING gin((
 setweight(to_tsvector('simple',coalesce(private_title,metadata->>'title','')),'A') ||
 setweight(to_tsvector('simple',left(coalesce(metadata->>'abstract',''),20000)),'B')));

-- ---------------------------------------------------------------- typed links
CREATE TABLE research_artifact_links (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL, workspace_id uuid NOT NULL, project_id uuid NOT NULL,
 source_artifact_id uuid NOT NULL, source_kind varchar(30) NOT NULL,
 target_artifact_id uuid NOT NULL, target_kind varchar(30) NOT NULL,
 relationship varchar(20) NOT NULL,
 -- CONTENT links mirror typed references in a document's current revision.
 origin varchar(10) NOT NULL DEFAULT 'MANUAL' CHECK (origin IN ('MANUAL','CONTENT')),
 created_by_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 archived_at timestamptz(3),
 archived_by_id uuid REFERENCES profiles(id) ON DELETE RESTRICT,
 UNIQUE (project_id,id),
 CHECK (source_artifact_id<>target_artifact_id),
 CHECK ((archived_at IS NULL)=(archived_by_id IS NULL)),
 -- Explicit endpoint-kind / relationship matrix (docs/artifacts/LINK_TYPES.md).
 CHECK ((source_kind,relationship,target_kind) IN (
  ('DOCUMENT','CITES','PAPER'),('DOCUMENT','REFERENCES','DOCUMENT'),('DOCUMENT','TRACKS','TASK'),
  ('TASK','REFERENCES','PAPER'),('TASK','RELATES_TO','DOCUMENT'),('TASK','DEPENDS_ON','TASK'),
  ('PAPER','RELATED_TO','PAPER'))),
 CHECK (origin='MANUAL' OR (source_kind='DOCUMENT' AND relationship IN ('CITES','REFERENCES','TRACKS'))),
 FOREIGN KEY (organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT,
 -- Both endpoints share the link's project: cross-project links cannot exist.
 FOREIGN KEY (project_id,source_artifact_id,source_kind) REFERENCES artifacts(project_id,id,kind) ON DELETE RESTRICT,
 FOREIGN KEY (project_id,target_artifact_id,target_kind) REFERENCES artifacts(project_id,id,kind) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX research_artifact_links_active ON research_artifact_links(source_artifact_id,target_artifact_id,relationship,origin) WHERE archived_at IS NULL;
CREATE INDEX research_artifact_links_source ON research_artifact_links(project_id,source_artifact_id) WHERE archived_at IS NULL;
CREATE INDEX research_artifact_links_target ON research_artifact_links(project_id,target_artifact_id) WHERE archived_at IS NULL;

-- ------------------------------------------------------------------------ RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_artifact_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON documents,document_versions,task_milestones,tasks,research_artifact_links FROM PUBLIC;
GRANT SELECT ON documents,document_versions,task_milestones,tasks,research_artifact_links TO atlas_runtime;
-- Archived documents remain listable for writers (to restore them) only; their
-- versions are unreadable until restored, so exports/search/history cannot leak.
CREATE POLICY document_read ON documents FOR SELECT TO atlas_runtime USING (
 atlas_private.can('project',project_id,'project.read') AND (archived_at IS NULL OR atlas_private.can('project',project_id,'project.write')));
CREATE POLICY document_version_read ON document_versions FOR SELECT TO atlas_runtime USING (
 atlas_private.can('project',project_id,'project.read')
 AND EXISTS(SELECT 1 FROM documents d WHERE d.id=document_id AND d.project_id=document_versions.project_id AND d.archived_at IS NULL));
CREATE POLICY milestone_read ON task_milestones FOR SELECT TO atlas_runtime USING (atlas_private.can('project',project_id,'project.read'));
CREATE POLICY task_read ON tasks FOR SELECT TO atlas_runtime USING (atlas_private.can('project',project_id,'project.read'));
CREATE POLICY link_read ON research_artifact_links FOR SELECT TO atlas_runtime USING (atlas_private.can('project',project_id,'project.read'));
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['documents','document_versions','task_milestones','tasks','research_artifact_links'] LOOP
  EXECUTE format('CREATE POLICY deny_insert ON public.%I FOR INSERT TO atlas_runtime WITH CHECK (false)',t);
  EXECUTE format('CREATE POLICY deny_update ON public.%I FOR UPDATE TO atlas_runtime USING (false) WITH CHECK (false)',t);
  EXECUTE format('CREATE POLICY deny_delete ON public.%I FOR DELETE TO atlas_runtime USING (false)',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=t) THEN
   EXECUTE format('REVOKE ALL ON public.documents,public.document_versions,public.task_milestones,public.tasks,public.research_artifact_links FROM %I',t);
  END IF;
 END LOOP;
END $$;

-- -------------------------------------------------------------------- helpers
-- Assignment eligibility: an explicit OWNER/EDITOR grant that is live now.
CREATE FUNCTION atlas_private.task_assignable(profile uuid, p uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM project_memberships m WHERE m.project_id=p AND m.profile_id=profile AND m.role IN ('OWNER','EDITOR'))
  AND coalesce(atlas_private.allowed(profile,'project',p,'project.write'),false)
$$;
-- People who may be mentioned or shown: anyone who can currently read the project.
CREATE FUNCTION atlas_private.project_participant(profile uuid, p uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(atlas_private.allowed(profile,'project',p,'project.read'),false)
$$;

CREATE FUNCTION atlas_private.artifact_active(a uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT CASE (SELECT kind FROM artifacts WHERE id=a)
  WHEN 'PAPER' THEN EXISTS(SELECT 1 FROM project_papers WHERE artifact_id=a AND archived_at IS NULL)
  WHEN 'DOCUMENT' THEN EXISTS(SELECT 1 FROM documents WHERE artifact_id=a AND archived_at IS NULL)
  WHEN 'TASK' THEN EXISTS(SELECT 1 FROM tasks WHERE artifact_id=a AND archived_at IS NULL)
  ELSE false END
$$;

-- Typed reference atoms anywhere in a Tiptap document.
CREATE FUNCTION atlas_private.document_nodes(content jsonb) RETURNS SETOF jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT DISTINCT n FROM jsonb_path_query(content,'strict $.**') n
 WHERE jsonb_typeof(n)='object' AND n->>'type' IN ('citation','documentRef','taskRef','personMention')
$$;

/*
 * Defense in depth behind the server's schema validator: node/mark types are
 * allowlisted, and every typed reference is resolved inside this project.
 * Nodes identical to ones in the previous revision were validated when they
 * were introduced (history may reference since-archived sources); every new
 * or altered reference must resolve to an active, readable target and any
 * quote/page must be copied from a real annotation or extracted chunk.
 */
CREATE FUNCTION atlas_private.document_references(p uuid, doc_artifact uuid, content jsonb, previous jsonb, trusted boolean,
 OUT artifact_ids uuid[], OUT profile_ids uuid[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 actor uuid:=atlas_private.actor(); n jsonb; a jsonb; prior jsonb[]; known boolean; v_count integer:=0;
 v_pp project_papers%ROWTYPE; v_sv source_versions%ROWTYPE; v_an paper_annotations%ROWTYPE; v_ch source_chunks%ROWTYPE;
 v_artifact uuid; v_profile uuid;
BEGIN
 artifact_ids:=ARRAY[]::uuid[]; profile_ids:=ARRAY[]::uuid[];
 IF EXISTS(SELECT 1 FROM jsonb_path_query(content,'strict $.**.type') t WHERE jsonb_typeof(t)='string' AND t#>>'{}' NOT IN (
  'doc','paragraph','heading','text','bulletList','orderedList','listItem','taskList','taskItem','blockquote','codeBlock',
  'horizontalRule','hardBreak','citation','documentRef','taskRef','personMention',
  'bold','italic','strike','code','link','underline','1','a','A','i','I')) THEN
  RAISE EXCEPTION 'VALIDATION_ERROR';
 END IF;
 prior:=CASE WHEN previous IS NULL THEN ARRAY[]::jsonb[] ELSE ARRAY(SELECT atlas_private.document_nodes(previous)) END;
 FOR n IN SELECT atlas_private.document_nodes(content) LOOP
  v_count:=v_count+1;
  IF v_count>500 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  a:=coalesce(n->'attrs','{}'::jsonb);
  known:=trusted OR n=ANY(prior);
  v_artifact:=NULL;
  IF n->>'type'='citation' THEN
   SELECT * INTO v_pp FROM project_papers WHERE id=(a->>'projectPaperId')::uuid AND project_id=p;
   IF v_pp.id IS NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   v_artifact:=v_pp.artifact_id;
   IF NOT known THEN
    IF v_pp.archived_at IS NOT NULL THEN RAISE EXCEPTION 'CONFLICT'; END IF;
    v_sv:=NULL; v_an:=NULL; v_ch:=NULL;
    IF a->>'sourceVersionId' IS NOT NULL THEN
     SELECT * INTO v_sv FROM source_versions WHERE id=(a->>'sourceVersionId')::uuid AND project_paper_id=v_pp.id AND state='READY';
     IF v_sv.id IS NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
     IF a->>'sourceChecksum' IS NOT NULL AND a->>'sourceChecksum'<>v_sv.sha256 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
    ELSIF a->>'sourceChecksum' IS NOT NULL OR a->>'annotationId' IS NOT NULL OR a->>'chunkId' IS NOT NULL THEN
     RAISE EXCEPTION 'VALIDATION_ERROR';
    END IF;
    IF a->>'annotationId' IS NOT NULL AND a->>'chunkId' IS NOT NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
    IF a->>'annotationId' IS NOT NULL THEN
     -- Private annotations of other people are undiscoverable.
     SELECT * INTO v_an FROM paper_annotations WHERE id=(a->>'annotationId')::uuid AND source_version_id=v_sv.id AND deleted_at IS NULL
      AND (visibility='PROJECT' OR author_id=actor);
     IF v_an.id IS NULL OR a->>'quote' IS DISTINCT FROM v_an.anchor->>'quote'
      OR (a->>'page')::integer IS DISTINCT FROM (v_an.anchor->>'pageNumber')::integer
      OR (a->>'startOffset')::integer IS DISTINCT FROM (v_an.anchor->>'startOffset')::integer
      OR (a->>'endOffset')::integer IS DISTINCT FROM (v_an.anchor->>'endOffset')::integer THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
    ELSIF a->>'chunkId' IS NOT NULL THEN
     SELECT * INTO v_ch FROM source_chunks WHERE id=(a->>'chunkId')::uuid AND source_version_id=v_sv.id AND project_id=p AND source_sha256=v_sv.sha256;
     IF v_ch.id IS NULL OR a->>'quote' IS NULL OR length(a->>'quote')<8 OR position(a->>'quote' in v_ch.text)=0
      OR (a->>'page')::integer IS DISTINCT FROM v_ch.page
      OR a->>'startOffset' IS NOT NULL OR a->>'endOffset' IS NOT NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
    ELSIF a->>'quote' IS NOT NULL OR a->>'page' IS NOT NULL OR a->>'startOffset' IS NOT NULL OR a->>'endOffset' IS NOT NULL THEN
     -- No unverifiable quotes or invented page numbers.
     RAISE EXCEPTION 'VALIDATION_ERROR';
    END IF;
   END IF;
  ELSIF n->>'type'='documentRef' THEN
   SELECT artifact_id INTO v_artifact FROM documents WHERE id=(a->>'documentId')::uuid AND project_id=p;
   IF v_artifact IS NULL OR v_artifact=doc_artifact THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   IF NOT known AND NOT atlas_private.artifact_active(v_artifact) THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  ELSIF n->>'type'='taskRef' THEN
   SELECT artifact_id INTO v_artifact FROM tasks WHERE id=(a->>'taskId')::uuid AND project_id=p;
   IF v_artifact IS NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   IF NOT known AND NOT atlas_private.artifact_active(v_artifact) THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  ELSE
   v_profile:=(a->>'profileId')::uuid;
   IF v_profile IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=v_profile) THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   -- Mentions never reach outsiders; Phase 04 sends no notifications.
   IF NOT known AND NOT atlas_private.project_participant(v_profile,p) THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   IF NOT v_profile=ANY(profile_ids) THEN profile_ids:=profile_ids||v_profile; END IF;
  END IF;
  IF v_artifact IS NOT NULL AND NOT v_artifact=ANY(artifact_ids) THEN artifact_ids:=artifact_ids||v_artifact; END IF;
 END LOOP;
END $$;

-- Content links mirror the current revision's references exactly.
CREATE FUNCTION atlas_private.sync_content_links(d documents, refs uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid:=atlas_private.actor(); BEGIN
 UPDATE research_artifact_links SET archived_at=now(),archived_by_id=actor
  WHERE source_artifact_id=d.artifact_id AND origin='CONTENT' AND archived_at IS NULL AND NOT (target_artifact_id=ANY(refs));
 INSERT INTO research_artifact_links(id,organization_id,workspace_id,project_id,source_artifact_id,source_kind,target_artifact_id,target_kind,relationship,origin,created_by_id)
  SELECT gen_random_uuid(),d.organization_id,d.workspace_id,d.project_id,d.artifact_id,'DOCUMENT',t.id,t.kind,
   CASE t.kind WHEN 'PAPER' THEN 'CITES' WHEN 'DOCUMENT' THEN 'REFERENCES' ELSE 'TRACKS' END,'CONTENT',actor
  FROM artifacts t WHERE t.id=ANY(refs) AND t.project_id=d.project_id
   AND NOT EXISTS(SELECT 1 FROM research_artifact_links l WHERE l.source_artifact_id=d.artifact_id AND l.target_artifact_id=t.id AND l.origin='CONTENT' AND l.archived_at IS NULL);
END $$;

-- Appends one immutable revision and moves the pointer in the same transaction.
CREATE FUNCTION atlas_private.document_commit(d documents, content jsonb, search text, source text, request uuid, summary text,
 restored integer, run uuid, trusted boolean) RETURNS document_versions
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid:=atlas_private.actor(); v document_versions%ROWTYPE; refs record; previous jsonb;
BEGIN
 IF content IS NULL OR jsonb_typeof(content)<>'object' OR content->>'type'<>'doc' OR octet_length(content::text)>400000
  OR search IS NULL OR length(search)>200000 OR length(coalesce(summary,''))>200 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 SELECT dv.content INTO previous FROM document_versions dv WHERE dv.id=d.current_version_id;
 SELECT * INTO refs FROM atlas_private.document_references(d.project_id,d.artifact_id,content,previous,trusted);
 INSERT INTO document_versions(id,organization_id,workspace_id,project_id,document_id,revision,author_id,content,content_hash,schema_version,
  change_summary,source,restored_from_revision,ai_run_id,client_request_id,reference_artifact_ids,mentioned_profile_ids)
  VALUES(gen_random_uuid(),d.organization_id,d.workspace_id,d.project_id,d.id,d.current_revision+1,actor,content,
   encode(sha256(convert_to(content::text,'UTF8')),'hex'),1,nullif(btrim(summary),''),source,restored,run,request,refs.artifact_ids,refs.profile_ids)
  RETURNING * INTO v;
 UPDATE documents SET current_version_id=v.id,current_revision=v.revision,search_text=search,updated_by_id=actor,updated_at=now() WHERE id=d.id;
 SELECT * INTO d FROM documents WHERE id=d.id;
 PERFORM atlas_private.sync_content_links(d,refs.artifact_ids);
 RETURN v;
END $$;

-- An AI proposal is applied only from the actor's own completed run here.
CREATE FUNCTION atlas_private.require_completed_run(run uuid, p uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF run IS NULL OR NOT EXISTS(SELECT 1 FROM ai_runs WHERE id=run AND project_id=p AND actor_id=atlas_private.actor() AND state='COMPLETED') THEN
  RAISE EXCEPTION 'NOT_FOUND';
 END IF;
END $$;

-- Deliberately small transition policy (docs/tasks/TRANSITION_POLICY.md).
CREATE FUNCTION atlas_private.task_transition_allowed(old text, new text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT (old,new) IN (('TODO','IN_PROGRESS'),('IN_PROGRESS','TODO'),('IN_PROGRESS','IN_REVIEW'),('IN_PROGRESS','DONE'),
  ('IN_REVIEW','IN_PROGRESS'),('IN_REVIEW','DONE'),('DONE','IN_PROGRESS'),('CANCELLED','TODO'),
  ('TODO','CANCELLED'),('IN_PROGRESS','CANCELLED'),('IN_REVIEW','CANCELLED'))
$$;

CREATE FUNCTION atlas_private.task_insert(pr projects, input jsonb, run uuid) RETURNS tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid:=atlas_private.actor(); v_artifact uuid; v_number integer; v_task tasks%ROWTYPE; v_status text; v_ref jsonb; v_target artifacts%ROWTYPE;
BEGIN
 v_status:=coalesce(input->>'status','TODO');
 IF v_status NOT IN ('TODO','IN_PROGRESS') OR coalesce(input->>'priority','NONE') NOT IN ('NONE','LOW','MEDIUM','HIGH','URGENT')
  OR length(coalesce(input->>'description',''))>20000 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 IF input->>'assigneeId' IS NOT NULL AND NOT atlas_private.task_assignable((input->>'assigneeId')::uuid,pr.id) THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 IF input->>'milestoneId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM task_milestones WHERE id=(input->>'milestoneId')::uuid AND project_id=pr.id AND archived_at IS NULL) THEN
  RAISE EXCEPTION 'VALIDATION_ERROR';
 END IF;
 -- Stable per-project human-readable numbers; the unique key backs the lock.
 PERFORM pg_advisory_xact_lock(71004,hashtext(pr.id::text));
 SELECT coalesce(max(task_number),0)+1 INTO v_number FROM tasks WHERE project_id=pr.id;
 INSERT INTO artifacts(id,organization_id,workspace_id,project_id,kind) VALUES(gen_random_uuid(),pr.organization_id,pr.workspace_id,pr.id,'TASK') RETURNING id INTO v_artifact;
 INSERT INTO tasks(id,organization_id,workspace_id,project_id,artifact_id,task_number,title,description,status,priority,created_by_id,updated_by_id,assignee_id,milestone_id,due_date,ai_run_id)
  VALUES(gen_random_uuid(),pr.organization_id,pr.workspace_id,pr.id,v_artifact,v_number,atlas_private.validate_text(input->>'title',200),
   coalesce(input->>'description',''),v_status,coalesce(input->>'priority','NONE'),actor,actor,(input->>'assigneeId')::uuid,(input->>'milestoneId')::uuid,
   (input->>'dueDate')::date,run)
  RETURNING * INTO v_task;
 FOR v_ref IN SELECT value FROM jsonb_array_elements(coalesce(input->'references','[]'::jsonb)) LOOP
  SELECT * INTO v_target FROM artifacts WHERE id=(v_ref#>>'{}')::uuid AND project_id=pr.id;
  IF v_target.id IS NULL OR v_target.kind NOT IN ('PAPER','DOCUMENT') THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  IF NOT atlas_private.artifact_active(v_target.id) THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  INSERT INTO research_artifact_links(id,organization_id,workspace_id,project_id,source_artifact_id,source_kind,target_artifact_id,target_kind,relationship,created_by_id)
   VALUES(gen_random_uuid(),pr.organization_id,pr.workspace_id,pr.id,v_artifact,'TASK',v_target.id,v_target.kind,
    CASE v_target.kind WHEN 'PAPER' THEN 'REFERENCES' ELSE 'RELATES_TO' END,actor) ON CONFLICT DO NOTHING;
 END LOOP;
 RETURN v_task;
END $$;

-- ----------------------------------------------------------- fixed commands
CREATE FUNCTION atlas_private.mutate_artifacts(cmd text, input jsonb, request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 actor uuid:=atlas_private.actor(); v_result jsonb; v_replay jsonb; v_key uuid; v_hash text; v_target uuid;
 v_project projects%ROWTYPE; v_doc documents%ROWTYPE; v_ver document_versions%ROWTYPE; v_old document_versions%ROWTYPE;
 v_task tasks%ROWTYPE; v_ms task_milestones%ROWTYPE; v_link research_artifact_links%ROWTYPE;
 v_src artifacts%ROWTYPE; v_dst artifacts%ROWTYPE; v_artifact uuid; v_status text; v_item jsonb; v_ids jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 IF jsonb_typeof(input)<>'object' OR octet_length(input::text)>450000 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=actor AND deleted_at IS NULL) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 -- Shared hierarchy lock: concurrent with other research writes, never
 -- interleaved with a revocation's capability change.
 PERFORM pg_advisory_xact_lock_shared(71001,1);
 v_key:=CASE WHEN input ? 'idempotencyKey' THEN (input->>'idempotencyKey')::uuid END;
 v_hash:=input->>'requestHash';

 IF cmd IN ('document.create','milestone.create','task.create','artifact.link.create','ai.task-proposal.apply') THEN
  SELECT * INTO v_project FROM projects WHERE id=(input->>'projectId')::uuid;
  PERFORM atlas_private.require_cap('project',v_project.id,'project.write');
  v_replay:=atlas_private.research_replay(actor,v_key,cmd,v_hash);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  v_target:=v_project.id;
 END IF;

 IF cmd='document.create' THEN
  IF coalesce(input->>'kind','RESEARCH_NOTE') NOT IN ('RESEARCH_NOTE','GENERAL_DOCUMENT','LITERATURE_REVIEW','EXPERIMENT_NOTE') THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  INSERT INTO artifacts(id,organization_id,workspace_id,project_id,kind) VALUES(gen_random_uuid(),v_project.organization_id,v_project.workspace_id,v_project.id,'DOCUMENT') RETURNING id INTO v_artifact;
  INSERT INTO documents(id,organization_id,workspace_id,project_id,artifact_id,title,kind,created_by_id,updated_by_id)
   VALUES(gen_random_uuid(),v_project.organization_id,v_project.workspace_id,v_project.id,v_artifact,atlas_private.validate_text(input->>'title',200),
    coalesce(input->>'kind','RESEARCH_NOTE'),actor,actor) RETURNING * INTO v_doc;
  v_ver:=atlas_private.document_commit(v_doc,input->'content',coalesce(input->>'searchText',''),'CREATE',v_key,NULL,NULL,NULL,false);
  v_result:=atlas_private.research_remember(actor,v_key,cmd,v_hash,jsonb_build_object('id',v_doc.id,'revision',v_ver.revision,'versionId',v_ver.id));

 ELSIF cmd IN ('document.save','document.restore-version','ai.document-proposal.apply') THEN
  SELECT * INTO v_doc FROM documents WHERE id=(input->>'id')::uuid FOR UPDATE;
  PERFORM atlas_private.require_cap('project',v_doc.project_id,'project.write');
  IF v_doc.archived_at IS NOT NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  v_target:=v_doc.project_id;
  -- A retried attempt returns its committed revision instead of a duplicate.
  SELECT * INTO v_ver FROM document_versions WHERE document_id=v_doc.id AND client_request_id=(input->>'clientRequestId')::uuid;
  IF v_ver.id IS NOT NULL THEN
   IF cmd='document.restore-version' THEN
    IF v_ver.restored_from_revision IS DISTINCT FROM (input->>'revision')::integer THEN RAISE EXCEPTION 'CONFLICT'; END IF;
   ELSIF v_ver.content_hash<>encode(sha256(convert_to((input->'content')::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'CONFLICT';
   END IF;
   RETURN jsonb_build_object('id',v_doc.id,'revision',v_ver.revision,'versionId',v_ver.id,'replayed',true);
  END IF;
  -- Optimistic concurrency: the revision is the token; never last-write-wins.
  IF v_doc.current_revision IS DISTINCT FROM (input->>'expectedRevision')::integer THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  IF cmd='document.save' THEN
   SELECT * INTO v_old FROM document_versions WHERE id=v_doc.current_version_id;
   IF v_old.content_hash=encode(sha256(convert_to((input->'content')::text,'UTF8')),'hex') THEN
    RETURN jsonb_build_object('id',v_doc.id,'revision',v_old.revision,'versionId',v_old.id,'unchanged',true);
   END IF;
   v_ver:=atlas_private.document_commit(v_doc,input->'content',input->>'searchText','EDITOR',(input->>'clientRequestId')::uuid,input->>'changeSummary',NULL,NULL,false);
  ELSIF cmd='ai.document-proposal.apply' THEN
   PERFORM atlas_private.require_completed_run((input->>'runId')::uuid,v_doc.project_id);
   v_ver:=atlas_private.document_commit(v_doc,input->'content',input->>'searchText','AI_PROPOSAL',(input->>'clientRequestId')::uuid,
    coalesce(input->>'changeSummary','Accepted Atlas proposal'),NULL,(input->>'runId')::uuid,false);
  ELSE
   SELECT * INTO v_old FROM document_versions WHERE document_id=v_doc.id AND revision=(input->>'revision')::integer;
   IF v_old.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
   -- Restored references are historical: they keep their identity and are
   -- re-authorized whenever they are rendered.
   v_ver:=atlas_private.document_commit(v_doc,v_old.content,input->>'searchText','RESTORE',(input->>'clientRequestId')::uuid,
    'Restored revision '||v_old.revision,v_old.revision,NULL,true);
  END IF;
  v_result:=jsonb_build_object('id',v_doc.id,'revision',v_ver.revision,'versionId',v_ver.id);

 ELSIF cmd='document.duplicate' THEN
  SELECT * INTO v_doc FROM documents WHERE id=(input->>'id')::uuid;
  PERFORM atlas_private.require_cap('project',v_doc.project_id,'project.write');
  IF v_doc.archived_at IS NOT NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  v_replay:=atlas_private.research_replay(actor,v_key,cmd,v_hash);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT * INTO v_old FROM document_versions WHERE id=v_doc.current_version_id;
  INSERT INTO artifacts(id,organization_id,workspace_id,project_id,kind) VALUES(gen_random_uuid(),v_doc.organization_id,v_doc.workspace_id,v_doc.project_id,'DOCUMENT') RETURNING id INTO v_artifact;
  INSERT INTO documents(id,organization_id,workspace_id,project_id,artifact_id,title,kind,created_by_id,updated_by_id)
   VALUES(gen_random_uuid(),v_doc.organization_id,v_doc.workspace_id,v_doc.project_id,v_artifact,
    atlas_private.validate_text(coalesce(input->>'title',left('Copy of '||v_doc.title,200)),200),v_doc.kind,actor,actor) RETURNING * INTO v_doc;
  -- Same-project copy keeps the typed references; a self-reference cannot occur
  -- because the copy is a new artifact.
  v_ver:=atlas_private.document_commit(v_doc,v_old.content,input->>'searchText','DUPLICATE',v_key,'Duplicated from revision '||v_old.revision,NULL,NULL,true);
  v_target:=v_doc.project_id;
  v_result:=atlas_private.research_remember(actor,v_key,cmd,v_hash,jsonb_build_object('id',v_doc.id,'revision',v_ver.revision,'versionId',v_ver.id));

 ELSIF cmd IN ('document.rename','document.archive','document.restore') THEN
  SELECT * INTO v_doc FROM documents WHERE id=(input->>'id')::uuid FOR UPDATE;
  PERFORM atlas_private.require_cap('project',v_doc.project_id,'project.write');
  IF v_doc.version IS DISTINCT FROM (input->>'expectedVersion')::integer THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  IF (cmd='document.restore')<>(v_doc.archived_at IS NOT NULL) THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  UPDATE documents SET title=CASE WHEN cmd='document.rename' THEN atlas_private.validate_text(input->>'title',200) ELSE title END,
   archived_at=CASE cmd WHEN 'document.archive' THEN now() WHEN 'document.restore' THEN NULL ELSE archived_at END,
   version=version+1,updated_by_id=actor,updated_at=now() WHERE id=v_doc.id;
  v_target:=v_doc.project_id;v_result:=jsonb_build_object('id',v_doc.id);

 ELSIF cmd='milestone.create' THEN
  INSERT INTO task_milestones(id,organization_id,workspace_id,project_id,title,description,target_date,created_by_id)
   VALUES(gen_random_uuid(),v_project.organization_id,v_project.workspace_id,v_project.id,atlas_private.validate_text(input->>'title',120),
    nullif(btrim(left(coalesce(input->>'description',''),1000)),''),(input->>'targetDate')::date,actor) RETURNING * INTO v_ms;
  v_result:=atlas_private.research_remember(actor,v_key,cmd,v_hash,jsonb_build_object('id',v_ms.id));
 ELSIF cmd IN ('milestone.update','milestone.archive') THEN
  SELECT * INTO v_ms FROM task_milestones WHERE id=(input->>'id')::uuid FOR UPDATE;
  PERFORM atlas_private.require_cap('project',v_ms.project_id,'project.write');
  IF v_ms.archived_at IS NOT NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_ms.version IS DISTINCT FROM (input->>'expectedVersion')::integer THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  IF cmd='milestone.update' AND input->>'status' NOT IN ('PLANNED','ACTIVE','DONE') THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  UPDATE task_milestones SET
   title=CASE WHEN cmd='milestone.update' THEN atlas_private.validate_text(input->>'title',120) ELSE title END,
   description=CASE WHEN cmd='milestone.update' THEN nullif(btrim(left(coalesce(input->>'description',''),1000)),'') ELSE description END,
   target_date=CASE WHEN cmd='milestone.update' THEN (input->>'targetDate')::date ELSE target_date END,
   status=CASE WHEN cmd='milestone.update' THEN input->>'status' ELSE status END,
   archived_at=CASE WHEN cmd='milestone.archive' THEN now() END,version=version+1,updated_at=now() WHERE id=v_ms.id;
  v_target:=v_ms.project_id;v_result:=jsonb_build_object('id',v_ms.id);

 ELSIF cmd='task.create' THEN
  v_task:=atlas_private.task_insert(v_project,input,NULL);
  v_result:=atlas_private.research_remember(actor,v_key,cmd,v_hash,jsonb_build_object('id',v_task.id,'taskNumber',v_task.task_number));
 ELSIF cmd='ai.task-proposal.apply' THEN
  PERFORM atlas_private.require_completed_run((input->>'runId')::uuid,v_project.id);
  IF jsonb_typeof(input->'tasks')<>'array' OR jsonb_array_length(input->'tasks') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  v_ids:='[]'::jsonb;
  -- Each proposed task passes the ordinary creation rules; no extra rights.
  FOR v_item IN SELECT value FROM jsonb_array_elements(input->'tasks') LOOP
   v_task:=atlas_private.task_insert(v_project,v_item,(input->>'runId')::uuid);
   v_ids:=v_ids||to_jsonb(v_task.id);
  END LOOP;
  v_result:=atlas_private.research_remember(actor,v_key,cmd,v_hash,jsonb_build_object('id',v_project.id,'taskIds',v_ids));
 ELSIF cmd IN ('task.update','task.assign','task.transition','task.archive','task.restore') THEN
  SELECT * INTO v_task FROM tasks WHERE id=(input->>'id')::uuid FOR UPDATE;
  PERFORM atlas_private.require_cap('project',v_task.project_id,'project.write');
  IF v_task.version IS DISTINCT FROM (input->>'expectedVersion')::integer THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  IF (cmd='task.restore')<>(v_task.archived_at IS NOT NULL) THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  v_status:=v_task.status;
  IF cmd='task.transition' THEN
   v_status:=input->>'status';
   IF NOT atlas_private.task_transition_allowed(v_task.status,v_status) THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  END IF;
  IF cmd IN ('task.update','task.assign') AND input ? 'assigneeId' AND input->>'assigneeId' IS NOT NULL
   AND input->>'assigneeId' IS DISTINCT FROM v_task.assignee_id::text AND NOT atlas_private.task_assignable((input->>'assigneeId')::uuid,v_task.project_id) THEN
   RAISE EXCEPTION 'VALIDATION_ERROR';
  END IF;
  IF cmd='task.update' THEN
   IF input ? 'priority' AND input->>'priority' NOT IN ('NONE','LOW','MEDIUM','HIGH','URGENT') THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   IF length(coalesce(input->>'description',''))>20000 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   IF input->>'milestoneId' IS NOT NULL AND input->>'milestoneId' IS DISTINCT FROM v_task.milestone_id::text
    AND NOT EXISTS(SELECT 1 FROM task_milestones WHERE id=(input->>'milestoneId')::uuid AND project_id=v_task.project_id AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'VALIDATION_ERROR';
   END IF;
  END IF;
  UPDATE tasks SET
   title=CASE WHEN cmd='task.update' AND input ? 'title' THEN atlas_private.validate_text(input->>'title',200) ELSE title END,
   description=CASE WHEN cmd='task.update' AND input ? 'description' THEN coalesce(input->>'description','') ELSE description END,
   priority=CASE WHEN cmd='task.update' AND input ? 'priority' THEN input->>'priority' ELSE priority END,
   due_date=CASE WHEN cmd='task.update' AND input ? 'dueDate' THEN (input->>'dueDate')::date ELSE due_date END,
   milestone_id=CASE WHEN cmd='task.update' AND input ? 'milestoneId' THEN (input->>'milestoneId')::uuid ELSE milestone_id END,
   assignee_id=CASE WHEN cmd IN ('task.update','task.assign') AND input ? 'assigneeId' THEN (input->>'assigneeId')::uuid ELSE assignee_id END,
   status=v_status,
   completed_at=CASE WHEN v_status='DONE' THEN coalesce(completed_at,now()) END,
   archived_at=CASE cmd WHEN 'task.archive' THEN now() WHEN 'task.restore' THEN NULL ELSE archived_at END,
   version=version+1,updated_by_id=actor,updated_at=now() WHERE id=v_task.id;
  v_target:=v_task.project_id;v_result:=jsonb_build_object('id',v_task.id);

 ELSIF cmd='artifact.link.create' THEN
  SELECT * INTO v_src FROM artifacts WHERE id=(input->>'sourceArtifactId')::uuid AND project_id=v_project.id;
  SELECT * INTO v_dst FROM artifacts WHERE id=(input->>'targetArtifactId')::uuid AND project_id=v_project.id;
  -- Another project's artifact is indistinguishable from a missing one.
  IF v_src.id IS NULL OR v_dst.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_src.id=v_dst.id OR (v_src.kind,input->>'relationship',v_dst.kind) NOT IN (
   ('DOCUMENT','CITES','PAPER'),('DOCUMENT','REFERENCES','DOCUMENT'),('DOCUMENT','TRACKS','TASK'),('TASK','REFERENCES','PAPER'),
   ('TASK','RELATES_TO','DOCUMENT'),('TASK','DEPENDS_ON','TASK'),('PAPER','RELATED_TO','PAPER')) THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  IF NOT atlas_private.artifact_active(v_src.id) OR NOT atlas_private.artifact_active(v_dst.id) THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  IF input->>'relationship'='DEPENDS_ON' THEN
   -- Serialize dependency edits per project; reject edges closing a cycle.
   PERFORM pg_advisory_xact_lock(71005,hashtext(v_project.id::text));
   IF EXISTS(WITH RECURSIVE reach(id) AS (
     SELECT v_dst.id UNION SELECT l.target_artifact_id FROM research_artifact_links l JOIN reach r ON l.source_artifact_id=r.id
     WHERE l.relationship='DEPENDS_ON' AND l.archived_at IS NULL) SELECT 1 FROM reach WHERE id=v_src.id) THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  END IF;
  SELECT * INTO v_link FROM research_artifact_links WHERE source_artifact_id=v_src.id AND target_artifact_id=v_dst.id
   AND relationship=input->>'relationship' AND origin='MANUAL' AND archived_at IS NULL;
  IF v_link.id IS NULL THEN
   INSERT INTO research_artifact_links(id,organization_id,workspace_id,project_id,source_artifact_id,source_kind,target_artifact_id,target_kind,relationship,created_by_id)
    VALUES(gen_random_uuid(),v_project.organization_id,v_project.workspace_id,v_project.id,v_src.id,v_src.kind,v_dst.id,v_dst.kind,input->>'relationship',actor) RETURNING * INTO v_link;
   v_result:=jsonb_build_object('id',v_link.id,'existing',false);
  ELSE v_result:=jsonb_build_object('id',v_link.id,'existing',true); END IF;
  v_result:=atlas_private.research_remember(actor,v_key,cmd,v_hash,v_result);
 ELSIF cmd='artifact.link.remove' THEN
  SELECT * INTO v_link FROM research_artifact_links WHERE id=(input->>'id')::uuid FOR UPDATE;
  PERFORM atlas_private.require_cap('project',v_link.project_id,'project.write');
  IF v_link.archived_at IS NOT NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  -- Content links follow the document text; edit the document instead.
  IF v_link.origin<>'MANUAL' THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  UPDATE research_artifact_links SET archived_at=now(),archived_by_id=actor WHERE id=v_link.id;
  v_target:=v_link.project_id;v_result:=jsonb_build_object('id',v_link.id);
 ELSE RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;

 -- Safe audit metadata only: action, resource ID, request ID; never content.
 INSERT INTO audit_events(id,organization_id,actor_id,action,resource_id,request_id)
  VALUES(gen_random_uuid(),(SELECT organization_id FROM projects WHERE id=v_target),actor,cmd,(v_result->>'id')::uuid,request_id);
 RETURN v_result;
END $$;

-- Extend the single command boundary without editing the reviewed functions.
ALTER FUNCTION atlas_private.mutate(text,jsonb,uuid) RENAME TO mutate_phase_02;
REVOKE EXECUTE ON FUNCTION atlas_private.mutate_phase_02(text,jsonb,uuid) FROM atlas_runtime;
CREATE FUNCTION atlas_private.mutate(command text,input jsonb,request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF command IN ('document.create','document.save','document.rename','document.restore-version','document.duplicate','document.archive',
  'document.restore','milestone.create','milestone.update','milestone.archive','task.create','task.update','task.assign','task.transition',
  'task.archive','task.restore','artifact.link.create','artifact.link.remove','ai.document-proposal.apply','ai.task-proposal.apply') THEN
  RETURN atlas_private.mutate_artifacts(command,input,request_id);
 END IF;
 RETURN atlas_private.mutate_phase_02(command,input,request_id);
END $$;

-- Read helpers for the runtime: definer functions return only booleans about
-- the caller's own project scope.
CREATE FUNCTION atlas_private.can_assign(profile uuid, p uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT atlas_private.can('project',p,'project.read') AND atlas_private.task_assignable(profile,p)
$$;
CREATE FUNCTION atlas_private.is_participant(profile uuid, p uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT atlas_private.can('project',p,'project.read') AND atlas_private.project_participant(profile,p)
$$;
-- Display names of current participants only; never e-mail or outsiders.
CREATE FUNCTION atlas_private.participant_names(p uuid, ids uuid[]) RETURNS TABLE(id uuid, display_name text, assignable boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT pr.id,pr.display_name::text,atlas_private.task_assignable(pr.id,p) FROM profiles pr
 WHERE atlas_private.can('project',p,'project.read') AND pr.id=ANY(ids[1:500]) AND pr.deleted_at IS NULL AND atlas_private.project_participant(pr.id,p)
$$;
CREATE FUNCTION atlas_private.project_participants(p uuid) RETURNS TABLE(id uuid, display_name text, assignable boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT pr.id,pr.display_name::text,atlas_private.task_assignable(pr.id,p) FROM profiles pr
 WHERE atlas_private.can('project',p,'project.read') AND pr.deleted_at IS NULL AND pr.id IN (
  SELECT m.profile_id FROM project_memberships m WHERE m.project_id=p
  UNION SELECT w.profile_id FROM workspace_memberships w JOIN projects x ON x.workspace_id=w.workspace_id WHERE x.id=p AND x.visibility='WORKSPACE')
  AND atlas_private.project_participant(pr.id,p)
 ORDER BY lower(pr.display_name),pr.id LIMIT 500
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA atlas_private FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON FUNCTION atlas_private.mutate(text,jsonb,uuid),atlas_private.can_assign(uuid,uuid),atlas_private.is_participant(uuid,uuid),atlas_private.participant_names(uuid,uuid[]),atlas_private.project_participants(uuid) FROM %I',r);
  END IF;
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION atlas_private.mutate(text,jsonb,uuid),atlas_private.can_assign(uuid,uuid),atlas_private.is_participant(uuid,uuid),
 atlas_private.participant_names(uuid,uuid[]),atlas_private.project_participants(uuid) TO atlas_runtime;
