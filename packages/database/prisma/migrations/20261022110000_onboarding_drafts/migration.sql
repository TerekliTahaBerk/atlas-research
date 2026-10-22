ALTER TABLE profiles ADD COLUMN onboarding_draft jsonb NOT NULL DEFAULT '{}';
ALTER TABLE profiles ADD CONSTRAINT onboarding_draft_size CHECK (octet_length(onboarding_draft::text)<=8192);
-- Preserve the reviewed mutation boundary; wrap only the onboarding-draft operation.
ALTER FUNCTION atlas_private.mutate(text,jsonb,uuid) RENAME TO mutate_core;
REVOKE EXECUTE ON FUNCTION atlas_private.mutate_core(text,jsonb,uuid) FROM atlas_runtime;
CREATE FUNCTION atlas_private.mutate(command text,input jsonb,request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid:=atlas_private.actor(); draft jsonb; result jsonb;
BEGIN
 IF command<>'onboarding.save' THEN RETURN atlas_private.mutate_core(command,input,request_id); END IF;
 IF actor IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 PERFORM pg_advisory_xact_lock(71001,1);
 draft:=input->'draft';
 IF jsonb_typeof(draft)<>'object' OR octet_length(draft::text)>8192 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 INSERT INTO profiles(id,display_name,onboarding_draft,updated_at) VALUES(actor,atlas_private.validate_name(draft->>'displayName'),draft,now())
 ON CONFLICT(id) DO UPDATE SET onboarding_draft=excluded.onboarding_draft,updated_at=now()
 WHERE profiles.onboarding_completed_at IS NULL AND profiles.deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 INSERT INTO audit_events(id,actor_id,action,resource_id,request_id) VALUES(gen_random_uuid(),actor,command,actor,request_id);
 RETURN jsonb_build_object('id',actor);
END $$;
REVOKE ALL ON FUNCTION atlas_private.mutate(text,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION atlas_private.mutate(text,jsonb,uuid) TO atlas_runtime;
