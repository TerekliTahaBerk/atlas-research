-- Additive hardening: invoker functions retain caller RLS. No authorization cache.
CREATE OR REPLACE FUNCTION atlas_private.ai_evidence_visible(items jsonb) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(items) e WHERE NOT coalesce(CASE e->>'kind'
 WHEN 'full-text' THEN EXISTS(
  SELECT 1 FROM source_chunks c JOIN source_versions s ON s.id=c.source_version_id AND s.project_id=c.project_id AND s.state='READY' AND s.sha256=c.source_sha256
  JOIN project_papers p ON p.id=c.project_paper_id AND p.project_id=c.project_id AND p.archived_at IS NULL
  WHERE c.id=(e->>'id')::uuid AND c.project_id=(e->>'projectId')::uuid AND c.project_paper_id=(e->>'projectPaperId')::uuid
   AND c.source_version_id=(e->>'sourceVersionId')::uuid AND c.page=(e->>'page')::integer AND c.start_offset=(e->>'startOffset')::integer
   AND c.text=e->>'text' AND c.source_sha256=e->>'checksum')
 WHEN 'annotation' THEN EXISTS(
  SELECT 1 FROM paper_annotations n JOIN project_papers p ON p.id=n.project_paper_id AND p.project_id=n.project_id AND p.archived_at IS NULL
  JOIN source_versions s ON s.id=n.source_version_id AND s.project_id=n.project_id AND s.state='READY'
  WHERE 'annotation:'||n.id::text=e->>'id' AND n.project_id=(e->>'projectId')::uuid AND n.project_paper_id=(e->>'projectPaperId')::uuid
   AND n.source_version_id=(e->>'sourceVersionId')::uuid AND n.deleted_at IS NULL AND left(n.body,4000)=e->>'text'
   AND e->>'page' IS NULL AND (e->>'startOffset')::integer=0
   AND encode(sha256(convert_to(left(n.body,4000),'UTF8')),'hex')=e->>'checksum')
 WHEN 'abstract' THEN EXISTS(
  SELECT 1 FROM project_papers p WHERE p.id=(e->>'projectPaperId')::uuid AND p.project_id=(e->>'projectId')::uuid AND p.archived_at IS NULL
   AND 'metadata:'||p.id::text=e->>'id' AND p.metadata->>'abstract' IS NOT NULL
   AND e->>'sourceVersionId' IS NULL AND e->>'page' IS NULL AND (e->>'startOffset')::integer=0
   AND left(p.metadata->>'abstract',4000)=e->>'text'
   AND encode(sha256(convert_to(left(p.metadata->>'abstract',4000),'UTF8')),'hex')=e->>'checksum')
 WHEN 'metadata' THEN EXISTS(
  SELECT 1 FROM project_papers p WHERE p.id=(e->>'projectPaperId')::uuid AND p.project_id=(e->>'projectId')::uuid AND p.archived_at IS NULL
   AND 'metadata:'||p.id::text=e->>'id' AND p.metadata->>'abstract' IS NULL
   AND e->>'sourceVersionId' IS NULL AND e->>'page' IS NULL AND (e->>'startOffset')::integer=0
   AND left(coalesce(p.private_title,p.metadata->>'title','Untitled'),4000)=e->>'text'
   AND encode(sha256(convert_to(left(coalesce(p.private_title,p.metadata->>'title','Untitled'),4000),'UTF8')),'hex')=e->>'checksum')
 ELSE false END,false))
$$;
CREATE FUNCTION atlas_private.ai_references_visible(pid uuid,items jsonb) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT atlas_private.can('project',pid,'project.read') AND NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(items) e WHERE NOT coalesce(
   (e->>'projectId')::uuid=pid AND CASE e->>'kind'
    WHEN 'project' THEN true
    WHEN 'paper' THEN EXISTS(SELECT 1 FROM project_papers p WHERE p.id=(e->>'projectPaperId')::uuid AND p.project_id=pid AND p.archived_at IS NULL)
    WHEN 'source-version' THEN EXISTS(SELECT 1 FROM source_versions s JOIN project_papers p ON p.id=s.project_paper_id AND p.archived_at IS NULL WHERE s.id=(e->>'sourceVersionId')::uuid AND s.project_paper_id=(e->>'projectPaperId')::uuid AND s.project_id=pid AND s.state='READY')
    WHEN 'selection' THEN EXISTS(SELECT 1 FROM source_versions s JOIN project_papers p ON p.id=s.project_paper_id AND p.archived_at IS NULL WHERE s.id=(e->>'sourceVersionId')::uuid AND s.project_paper_id=(e->>'projectPaperId')::uuid AND s.project_id=pid AND s.state='READY')
    WHEN 'annotation' THEN EXISTS(SELECT 1 FROM paper_annotations n JOIN source_versions s ON s.id=n.source_version_id AND s.state='READY' JOIN project_papers p ON p.id=n.project_paper_id AND p.archived_at IS NULL WHERE n.id=(e->>'annotationId')::uuid AND n.project_id=pid AND n.project_paper_id=(e->>'projectPaperId')::uuid AND n.source_version_id=(e->>'sourceVersionId')::uuid AND n.deleted_at IS NULL)
    ELSE false END,false))
$$;
REVOKE ALL ON FUNCTION atlas_private.ai_evidence_visible(jsonb),atlas_private.ai_references_visible(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION atlas_private.ai_evidence_visible(jsonb),atlas_private.ai_references_visible(uuid,jsonb) TO atlas_runtime;
-- Follow-up answers remain dependent on every protected passage used through history.
ALTER TABLE ai_runs ADD COLUMN context_json jsonb NOT NULL DEFAULT '{"evidence":[],"references":[]}';
ALTER TABLE ai_runs ADD CONSTRAINT ai_context_bounds CHECK(jsonb_typeof(context_json)='object' AND jsonb_array_length(context_json->'evidence')<=120 AND jsonb_array_length(context_json->'references')<=60);
CREATE FUNCTION atlas_private.ai_bind_context(r uuid,context jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v ai_runs; BEGIN
 PERFORM pg_advisory_xact_lock_shared(71001,1);
 SELECT * INTO v FROM ai_runs WHERE id=r AND actor_id=atlas_private.actor() FOR UPDATE;
 IF v.id IS NULL OR NOT atlas_private.can('project',v.project_id,'project.read') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF v.state<>'RESERVED' THEN RETURN false; END IF;
 IF context->'evidence' IS NULL OR context->'references' IS NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 UPDATE ai_runs SET context_json=context WHERE id=r;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION atlas_private.ai_bind_context(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION atlas_private.ai_bind_context(uuid,jsonb) TO atlas_runtime;
-- Existing erasure/retention commands also erase the added historical provenance snapshot.
CREATE FUNCTION atlas_private.ai_erase_context() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$ BEGIN
 IF NEW.prompt='[deleted]' THEN NEW.context_json:='{"evidence":[],"references":[]}'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION atlas_private.ai_erase_context() FROM PUBLIC,anon,authenticated,atlas_runtime;
CREATE TRIGGER ai_context_erasure BEFORE UPDATE ON ai_runs FOR EACH ROW EXECUTE FUNCTION atlas_private.ai_erase_context();
DROP POLICY read_scope ON ai_runs;
CREATE POLICY read_scope ON ai_runs FOR SELECT TO atlas_runtime USING(
 actor_id=atlas_private.actor() AND atlas_private.ai_references_visible(project_id,references_json) AND atlas_private.ai_evidence_visible(evidence_json)
 AND atlas_private.ai_references_visible(project_id,context_json->'references') AND atlas_private.ai_evidence_visible(context_json->'evidence'));
