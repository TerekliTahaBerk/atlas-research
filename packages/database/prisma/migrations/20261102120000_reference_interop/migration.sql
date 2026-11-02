-- A03 research interoperability (additive; no existing row or rule changes).
--
-- 1. Imported bibliographic metadata is PROJECT-SCOPED. It is stored only on
--    private project references (paper_id IS NULL) and never written to the
--    global verified catalog (research_papers), so one tenant's file can never
--    rewrite or reveal another tenant's metadata.
-- 2. reference_import_links maps an external record (file/Zotero library +
--    key + version) to a project paper, so repeated imports are idempotent.
-- 3. external_connections holds one user's Zotero connection. Only an
--    application-encrypted credential is stored, readable by its owner only.

ALTER TABLE project_papers ADD COLUMN reference_metadata jsonb;
ALTER TABLE project_papers ADD CONSTRAINT project_paper_reference_metadata CHECK (
 reference_metadata IS NULL OR (paper_id IS NULL AND jsonb_typeof(reference_metadata)='object'
  AND octet_length(reference_metadata::text)<=65536 AND length(btrim(coalesce(reference_metadata->>'title','')))>0));
CREATE INDEX project_papers_reference_doi ON project_papers(project_id,(reference_metadata->>'doi'))
 WHERE reference_metadata->>'doi' IS NOT NULL;

CREATE TABLE reference_import_links (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL, workspace_id uuid NOT NULL, project_id uuid NOT NULL,
 project_paper_id uuid NOT NULL,
 source varchar(20) NOT NULL CHECK (source IN ('BIBTEX','RIS','CSL_JSON','ZOTERO')),
 library varchar(80) NOT NULL CHECK (length(library) BETWEEN 1 AND 80),
 item_key varchar(200) NOT NULL CHECK (length(item_key) BETWEEN 1 AND 200),
 item_version integer CHECK (item_version IS NULL OR item_version>=0),
 record_hash char(64) NOT NULL CHECK (record_hash ~ '^[a-f0-9]{64}$'),
 imported_by_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 updated_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE (project_id,source,library,item_key),
 FOREIGN KEY (organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT,
 -- The mapping and its paper share one project: no cross-project identity.
 FOREIGN KEY (project_id,project_paper_id) REFERENCES project_papers(project_id,id) ON DELETE RESTRICT
);
CREATE INDEX reference_import_links_paper ON reference_import_links(project_id,project_paper_id);

CREATE TABLE external_connections (
 id uuid PRIMARY KEY,
 profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
 provider varchar(20) NOT NULL CHECK (provider='ZOTERO'),
 external_user_id varchar(20) NOT NULL CHECK (external_user_id ~ '^[0-9]{1,20}$'),
 display_name varchar(200),
 -- Validated read-only access summary (libraries/groups); no secrets.
 access jsonb NOT NULL CHECK (jsonb_typeof(access)='object' AND octet_length(access::text)<=16384),
 -- AES-256-GCM envelope produced by the application; never plaintext.
 credential_ciphertext varchar(2000) CHECK (credential_ciphertext IS NULL OR credential_ciphertext ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'),
 created_at timestamptz(3) NOT NULL DEFAULT now(),
 updated_at timestamptz(3) NOT NULL DEFAULT now(),
 revoked_at timestamptz(3),
 -- A disconnected row keeps no credential at all.
 CHECK ((revoked_at IS NULL)=(credential_ciphertext IS NOT NULL))
);
CREATE UNIQUE INDEX external_connections_active ON external_connections(profile_id,provider) WHERE revoked_at IS NULL;

ALTER TABLE reference_import_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON reference_import_links,external_connections FROM PUBLIC;
GRANT SELECT ON reference_import_links,external_connections TO atlas_runtime;
CREATE POLICY reference_link_read ON reference_import_links FOR SELECT TO atlas_runtime
 USING (atlas_private.can('project',project_id,'project.read'));
-- A connection is visible to its owner only — never to project members.
CREATE POLICY external_connection_owner ON external_connections FOR SELECT TO atlas_runtime
 USING (profile_id=atlas_private.actor());
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['reference_import_links','external_connections'] LOOP
  EXECUTE format('CREATE POLICY deny_insert ON public.%I FOR INSERT TO atlas_runtime WITH CHECK (false)',t);
  EXECUTE format('CREATE POLICY deny_update ON public.%I FOR UPDATE TO atlas_runtime USING (false) WITH CHECK (false)',t);
  EXECUTE format('CREATE POLICY deny_delete ON public.%I FOR DELETE TO atlas_runtime USING (false)',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=t) THEN
   EXECUTE format('REVOKE ALL ON public.reference_import_links,public.external_connections FROM %I',t);
  END IF;
 END LOOP;
END $$;

-- ------------------------------------------------------------ fixed commands
CREATE FUNCTION atlas_private.mutate_references(cmd text, input jsonb, request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 actor uuid:=atlas_private.actor(); v_project projects%ROWTYPE; v_key uuid; v_hash text; v_replay jsonb; v_result jsonb;
 v_item jsonb; v_rec jsonb; v_link jsonb; v_doi text; v_pp project_papers%ROWTYPE; v_map reference_import_links%ROWTYPE;
 v_artifact uuid; v_outcome text; v_results jsonb:='[]'::jsonb; v_index integer:=0; v_conn external_connections%ROWTYPE;
 v_target uuid; v_org uuid;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 IF jsonb_typeof(input)<>'object' OR octet_length(input::text)>1600000 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=actor AND deleted_at IS NULL) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 PERFORM pg_advisory_xact_lock_shared(71001,1);

 IF cmd='reference.import' THEN
  SELECT * INTO v_project FROM projects WHERE id=(input->>'projectId')::uuid;
  PERFORM atlas_private.require_cap('project',v_project.id,'project.write');
  v_key:=(input->>'idempotencyKey')::uuid; v_hash:=input->>'requestHash';
  v_replay:=atlas_private.research_replay(actor,v_key,cmd,v_hash);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF jsonb_typeof(input->'items')<>'array' OR jsonb_array_length(input->'items') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  -- One import per project at a time: concurrent identical imports converge
  -- on the same papers instead of racing to create duplicates.
  PERFORM pg_advisory_xact_lock(71006,hashtext(v_project.id::text));
  FOR v_item IN SELECT value FROM jsonb_array_elements(input->'items') LOOP
   v_rec:=v_item->'record'; v_link:=nullif(v_item->'link','null'::jsonb); v_doi:=nullif(v_rec->>'doi','');
   IF jsonb_typeof(v_rec)<>'object' OR octet_length(v_rec::text)>65536 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   IF v_doi IS NOT NULL AND (v_doi !~ '^10\.[0-9]{4,9}/[^[:space:]]+$' OR v_doi<>lower(v_doi)) THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   IF v_link IS NOT NULL AND (v_link->>'source' NOT IN ('BIBTEX','RIS','CSL_JSON','ZOTERO')
    OR coalesce(v_link->>'recordHash','') !~ '^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   v_pp:=NULL; v_map:=NULL; v_outcome:=NULL;
   -- 1. This external record is already mapped in this project.
   IF v_link IS NOT NULL THEN
    SELECT * INTO v_map FROM reference_import_links WHERE project_id=v_project.id AND source=v_link->>'source'
     AND library=v_link->>'library' AND item_key=v_link->>'key' FOR UPDATE;
    IF v_map.id IS NOT NULL THEN SELECT * INTO v_pp FROM project_papers WHERE id=v_map.project_paper_id AND project_id=v_project.id; END IF;
   END IF;
   -- 2. An `atlas:<id>` export marker names a paper of THIS project only.
   IF v_pp.id IS NULL AND v_item->>'atlasId' IS NOT NULL THEN
    SELECT * INTO v_pp FROM project_papers WHERE id=(v_item->>'atlasId')::uuid AND project_id=v_project.id;
   END IF;
   -- 3. The same DOI is already in this project (verified paper or reference).
   IF v_pp.id IS NULL AND v_doi IS NOT NULL THEN
    SELECT pp.* INTO v_pp FROM project_papers pp JOIN research_papers rp ON rp.id=pp.paper_id
     WHERE pp.project_id=v_project.id AND rp.normalized_doi=v_doi;
    IF v_pp.id IS NULL THEN
     SELECT * INTO v_pp FROM project_papers WHERE project_id=v_project.id AND reference_metadata->>'doi'=v_doi ORDER BY created_at,id LIMIT 1;
    END IF;
   END IF;
   IF v_pp.id IS NOT NULL THEN
    v_outcome:='EXISTING';
    IF v_pp.archived_at IS NOT NULL THEN
     v_outcome:='ARCHIVED'; -- never restored implicitly by an import
    ELSIF coalesce((v_item->>'update')::boolean,false) AND v_pp.paper_id IS NULL AND v_map.id IS NOT NULL
     AND v_map.project_paper_id=v_pp.id AND coalesce((v_link->>'version')::integer,-1)>coalesce(v_map.item_version,-1) THEN
     -- Explicitly approved refresh of an imported private reference only;
     -- verified catalog papers and user-curated rows are never overwritten.
     UPDATE project_papers SET private_title=atlas_private.validate_text(v_rec->>'title',1000),reference_metadata=v_rec,
      version=version+1,updated_at=now() WHERE id=v_pp.id;
     v_outcome:='UPDATED';
    END IF;
   ELSE
    -- 4. New to this project: a project-private reference. The global
    --    catalog is neither consulted nor written (no cross-tenant signal).
    INSERT INTO artifacts(id,organization_id,workspace_id,project_id,kind)
     VALUES(gen_random_uuid(),v_project.organization_id,v_project.workspace_id,v_project.id,'PAPER') RETURNING id INTO v_artifact;
    INSERT INTO project_papers(id,organization_id,workspace_id,project_id,artifact_id,private_title,reference_metadata,added_by_id,updated_at)
     VALUES(gen_random_uuid(),v_project.organization_id,v_project.workspace_id,v_project.id,v_artifact,
      atlas_private.validate_text(v_rec->>'title',1000),v_rec,actor,now()) RETURNING * INTO v_pp;
    v_outcome:='CREATED';
   END IF;
   IF v_link IS NOT NULL THEN
    INSERT INTO reference_import_links(id,organization_id,workspace_id,project_id,project_paper_id,source,library,item_key,item_version,record_hash,imported_by_id)
     VALUES(gen_random_uuid(),v_project.organization_id,v_project.workspace_id,v_project.id,v_pp.id,v_link->>'source',
      v_link->>'library',v_link->>'key',(v_link->>'version')::integer,v_link->>'recordHash',actor)
     ON CONFLICT (project_id,source,library,item_key) DO UPDATE SET
      item_version=CASE WHEN v_outcome='UPDATED' THEN EXCLUDED.item_version ELSE reference_import_links.item_version END,
      record_hash=CASE WHEN v_outcome='UPDATED' THEN EXCLUDED.record_hash ELSE reference_import_links.record_hash END,
      updated_at=now();
   END IF;
   v_results:=v_results||jsonb_build_object('index',v_index,'id',v_pp.id,'outcome',v_outcome);
   v_index:=v_index+1;
  END LOOP;
  v_target:=v_project.id; v_org:=v_project.organization_id;
  v_result:=atlas_private.research_remember(actor,v_key,cmd,v_hash,jsonb_build_object('id',v_project.id,'results',v_results));

 ELSIF cmd='zotero.connect' THEN
  -- The application validated the key with Zotero and encrypted it; one
  -- active connection per user, replacing (and wiping) any previous one.
  IF coalesce(input->>'externalUserId','') !~ '^[0-9]{1,20}$' OR jsonb_typeof(input->'access')<>'object' THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  UPDATE external_connections SET revoked_at=now(),credential_ciphertext=NULL,updated_at=now()
   WHERE profile_id=actor AND provider='ZOTERO' AND revoked_at IS NULL;
  INSERT INTO external_connections(id,profile_id,provider,external_user_id,display_name,access,credential_ciphertext)
   VALUES(gen_random_uuid(),actor,'ZOTERO',input->>'externalUserId',left(nullif(btrim(input->>'displayName'),''),200),input->'access',input->>'ciphertext')
   RETURNING * INTO v_conn;
  v_target:=v_conn.id; v_result:=jsonb_build_object('id',v_conn.id);
 ELSIF cmd='zotero.disconnect' THEN
  UPDATE external_connections SET revoked_at=now(),credential_ciphertext=NULL,updated_at=now()
   WHERE id=(input->>'id')::uuid AND profile_id=actor AND revoked_at IS NULL RETURNING * INTO v_conn;
  IF v_conn.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  v_target:=v_conn.id; v_result:=jsonb_build_object('id',v_conn.id);
 ELSE RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;

 -- Safe audit metadata only: action, resource ID, request ID; never content.
 INSERT INTO audit_events(id,organization_id,actor_id,action,resource_id,request_id)
  VALUES(gen_random_uuid(),v_org,actor,cmd,v_target,request_id);
 RETURN v_result;
END $$;

-- Extend the single command boundary without editing reviewed functions.
ALTER FUNCTION atlas_private.mutate(text,jsonb,uuid) RENAME TO mutate_phase_04;
REVOKE EXECUTE ON FUNCTION atlas_private.mutate_phase_04(text,jsonb,uuid) FROM atlas_runtime;
CREATE FUNCTION atlas_private.mutate(command text,input jsonb,request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF command IN ('reference.import','zotero.connect','zotero.disconnect') THEN
  RETURN atlas_private.mutate_references(command,input,request_id);
 END IF;
 RETURN atlas_private.mutate_phase_04(command,input,request_id);
END $$;

REVOKE ALL ON FUNCTION atlas_private.mutate_references(text,jsonb,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION atlas_private.mutate(text,jsonb,uuid) FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON FUNCTION atlas_private.mutate(text,jsonb,uuid),atlas_private.mutate_references(text,jsonb,uuid) FROM %I',r);
  END IF;
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION atlas_private.mutate(text,jsonb,uuid) TO atlas_runtime;
