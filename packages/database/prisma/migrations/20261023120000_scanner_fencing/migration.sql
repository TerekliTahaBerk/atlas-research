-- Fence every verdict to its exact claim attempt, including retries.
BEGIN;
DROP FUNCTION atlas_private.complete_scan(uuid,text,text,text,text);
DROP FUNCTION atlas_private.scan_job_source(uuid);
CREATE TABLE public.scan_object_cleanup (
 object_key text PRIMARY KEY,
 job_id uuid NOT NULL REFERENCES public.ingestion_jobs(id) ON DELETE RESTRICT,
 attempt integer NOT NULL CHECK (attempt BETWEEN 1 AND 5),
 created_at timestamptz(3) NOT NULL DEFAULT now()
);
ALTER TABLE public.scan_object_cleanup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scan_object_cleanup FROM PUBLIC, atlas_runtime;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON public.scan_object_cleanup FROM %I',r);
  END IF;
 END LOOP;
END $$;
CREATE FUNCTION atlas_private.scan_job_source(job uuid, expected_attempt integer)
RETURNS TABLE(project_id uuid, source_version_id uuid, quarantine_key text, sha256 text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT s.project_id,s.id,s.quarantine_key::text,s.sha256::text FROM ingestion_jobs j JOIN source_versions s ON s.id=j.source_version_id
 WHERE j.id=job AND j.kind='SCAN' AND j.state='RUNNING' AND j.attempts=expected_attempt AND j.locked_until>=statement_timestamp() AND atlas_private.allowed(s.created_by_id,'project',s.project_id,'project.write')
$$;
-- Commit the cleanup reservation BEFORE any Storage copy. Crashes, failed
-- commits and losing completions leave a durable record, never an orphan.
CREATE FUNCTION atlas_private.reserve_scan_copy(job uuid, expected_attempt integer, key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE j ingestion_jobs%ROWTYPE; s source_versions%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(71001,1);
 PERFORM pg_advisory_xact_lock(71004,1);
 SELECT * INTO j FROM ingestion_jobs WHERE id=job FOR UPDATE;
 IF j.id IS NULL OR j.kind<>'SCAN' OR j.state<>'RUNNING' OR j.attempts IS DISTINCT FROM expected_attempt OR j.locked_until<clock_timestamp() THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 SELECT * INTO s FROM source_versions WHERE id=j.source_version_id;
 IF NOT coalesce(atlas_private.allowed(s.created_by_id,'project',s.project_id,'project.write'),false) THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 IF key IS NULL OR key !~ ('^accepted/'||s.project_id::text||'/'||s.id::text||'/[A-Za-z0-9_-]{32}\.pdf$') THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 INSERT INTO scan_object_cleanup(object_key,job_id,attempt) VALUES(key,job,expected_attempt);
END $$;
CREATE FUNCTION atlas_private.complete_scan(job uuid, expected_attempt integer, verdict text, measured_sha256 text, scanner text, accepted_key text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE j ingestion_jobs%ROWTYPE; s source_versions%ROWTYPE; outcome text;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(71001,1);
 PERFORM pg_advisory_xact_lock(71004,1);
 SELECT * INTO j FROM ingestion_jobs WHERE id=job FOR UPDATE;
 IF j.id IS NULL OR j.state<>'RUNNING' OR j.attempts IS DISTINCT FROM expected_attempt OR j.locked_until<clock_timestamp() THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 SELECT * INTO s FROM source_versions WHERE id=j.source_version_id FOR UPDATE;
 IF verdict NOT IN ('CLEAN','INFECTED','INVALID','ERROR') OR scanner IS NULL OR length(scanner) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 IF NOT coalesce(atlas_private.allowed(s.created_by_id,'project',s.project_id,'project.write'),false) THEN verdict:='INVALID'; END IF;
 -- The accepted object must be bound to this exact project and version.
 IF verdict='CLEAN' AND (measured_sha256 IS DISTINCT FROM s.sha256 OR accepted_key IS NULL
  OR accepted_key !~ ('^accepted/'||s.project_id::text||'/'||s.id::text||'/[A-Za-z0-9_-]{32}\.pdf$')) THEN
  verdict:='INVALID';
 END IF;
 IF verdict='CLEAN' AND NOT EXISTS(SELECT 1 FROM scan_object_cleanup WHERE object_key=accepted_key AND job_id=job AND attempt=expected_attempt) THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 IF verdict='CLEAN' THEN
  UPDATE source_versions SET state='READY',object_key=accepted_key,scanned_by=scanner,scan_completed_at=now(),ready_at=now(),updated_at=now() WHERE id=s.id;
  UPDATE ingestion_jobs SET state='SUCCEEDED',locked_until=NULL,last_error=NULL,updated_at=now() WHERE id=j.id;
  DELETE FROM scan_object_cleanup WHERE object_key=accepted_key;
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

-- A one-hour grace exceeds the maximum 15-minute lease and bounded copy
-- deadline. Exclude active jobs and referenced objects even on recovery.
CREATE FUNCTION atlas_private.scan_cleanup_candidates()
RETURNS TABLE(object_key text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT c.object_key FROM scan_object_cleanup c JOIN ingestion_jobs j ON j.id=c.job_id
 WHERE c.created_at < statement_timestamp()-interval '1 hour'
 AND (j.state<>'RUNNING' OR j.locked_until<statement_timestamp())
 AND NOT EXISTS(SELECT 1 FROM source_versions s WHERE s.object_key=c.object_key)
 ORDER BY c.created_at LIMIT 20
$$;
CREATE FUNCTION atlas_private.ack_scan_cleanup(key text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 DELETE FROM scan_object_cleanup c WHERE c.object_key=key
 AND NOT EXISTS(SELECT 1 FROM source_versions s WHERE s.object_key=c.object_key)
$$;
REVOKE ALL ON FUNCTION atlas_private.scan_job_source(uuid,integer),atlas_private.reserve_scan_copy(uuid,integer,text),atlas_private.complete_scan(uuid,integer,text,text,text,text),atlas_private.scan_cleanup_candidates(),atlas_private.ack_scan_cleanup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION atlas_private.scan_job_source(uuid,integer),atlas_private.reserve_scan_copy(uuid,integer,text),atlas_private.complete_scan(uuid,integer,text,text,text,text),atlas_private.scan_cleanup_candidates(),atlas_private.ack_scan_cleanup(text) TO atlas_runtime;
CREATE OR REPLACE FUNCTION atlas_private.claim_scan_jobs(maximum integer, lease_seconds integer)
RETURNS TABLE(job_id uuid, source_version_id uuid, quarantine_key text, sha256 text, byte_size bigint, attempt integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock_shared(71001,1);
 PERFORM pg_advisory_xact_lock(71004,1);
 IF maximum NOT BETWEEN 1 AND 10 OR lease_seconds NOT BETWEEN 30 AND 900 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 UPDATE source_versions s SET state='FAILED',failure='Upload authorization is no longer active.',updated_at=now() FROM ingestion_jobs j WHERE j.source_version_id=s.id AND j.kind='SCAN' AND j.state IN ('QUEUED','RETRYABLE','RUNNING') AND NOT coalesce(atlas_private.allowed(s.created_by_id,'project',s.project_id,'project.write'),false);
 UPDATE ingestion_jobs j SET state='FAILED',locked_until=NULL,last_error='authorization revoked',updated_at=now() FROM source_versions s WHERE j.source_version_id=s.id AND j.kind='SCAN' AND j.state IN ('QUEUED','RETRYABLE','RUNNING') AND s.state='FAILED';
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
COMMIT;
