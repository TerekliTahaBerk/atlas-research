BEGIN;

CREATE TABLE ops.compute_jobs (
  id uuid PRIMARY KEY,
  "workspaceId" uuid NOT NULL,
  "projectId" uuid NOT NULL,
  "actorId" text NOT NULL,
  "sessionId" text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('python','latex')),
  resource text NOT NULL CHECK (resource IN ('pythonMilliseconds','latexCompiles')),
  "sourceHash" text NOT NULL CHECK ("sourceHash" ~ '^[0-9a-f]{64}$'),
  source text CHECK (octet_length(source) BETWEEN 1 AND 32768),
  "timeoutMs" integer NOT NULL CHECK ("timeoutMs" BETWEEN 100 AND 900000),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed','timed_out','canceled','abandoned','output_limit')),
  "leaseToken" uuid,
  "leaseUntil" timestamptz(3),
  "cancelRequestedAt" timestamptz(3),
  "elapsedMs" integer CHECK ("elapsedMs" BETWEEN 0 AND "timeoutMs"),
  stdout text NOT NULL DEFAULT '' CHECK (octet_length(stdout) <= 32768),
  stderr text NOT NULL DEFAULT '' CHECK (octet_length(stderr) <= 32768),
  pdf bytea CHECK (octet_length(pdf) BETWEEN 5 AND 4194304),
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "completedAt" timestamptz(3),
  "outputExpiresAt" timestamptz(3),
  FOREIGN KEY ("workspaceId","projectId") REFERENCES app.projects("workspaceId",id) ON DELETE RESTRICT,
  FOREIGN KEY ("workspaceId",id,resource) REFERENCES app.billing_usage_reservations("workspaceId","operationId",resource) ON DELETE RESTRICT,
  CHECK ((kind='python' AND resource='pythonMilliseconds') OR (kind='latex' AND resource='latexCompiles' AND "timeoutMs"<=30000)),
  CHECK ((status='running')=("leaseUntil" IS NOT NULL)),
  CHECK ((status IN ('queued','running'))=("completedAt" IS NULL)),
  CHECK ((status IN ('queued','running'))=(source IS NOT NULL)),
  CHECK (pdf IS NULL OR (kind='latex' AND status='succeeded'))
);
CREATE INDEX compute_queue ON ops.compute_jobs ("createdAt",id) WHERE status='queued';
CREATE INDEX compute_running_lease ON ops.compute_jobs ("leaseUntil",id) WHERE status='running';
CREATE INDEX compute_project_history ON ops.compute_jobs ("workspaceId","projectId","actorId","createdAt" DESC,id);
CREATE INDEX compute_workspace_active ON ops.compute_jobs ("workspaceId",kind) WHERE status IN ('queued','running');
CREATE INDEX compute_workspace_pdf ON ops.compute_jobs ("workspaceId","outputExpiresAt") WHERE pdf IS NOT NULL;
CREATE INDEX compute_output_expiry ON ops.compute_jobs ("outputExpiresAt",id) WHERE "outputExpiresAt" IS NOT NULL;

ALTER TABLE ops.compute_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.compute_jobs FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON ops.compute_jobs TO atlas_runtime;
GRANT SELECT ON ops.compute_jobs TO atlas_backup;
GRANT SELECT,UPDATE,DELETE ON ops.compute_jobs TO atlas_policy;

CREATE POLICY own_compute_read ON ops.compute_jobs FOR SELECT TO atlas_runtime USING (
  "actorId"=app.actor_id() AND app.can_read_research("workspaceId","projectId")
);
CREATE POLICY own_compute_enqueue ON ops.compute_jobs FOR INSERT TO atlas_runtime WITH CHECK (
  "actorId"=app.actor_id() AND "sessionId"=current_setting('app.session_id',true)
  AND app.can_write_research("workspaceId","projectId")
  AND status='queued' AND "leaseToken" IS NULL AND "leaseUntil" IS NULL AND "cancelRequestedAt" IS NULL
  AND "outputExpiresAt" IS NULL AND "elapsedMs" IS NULL AND stdout='' AND stderr='' AND pdf IS NULL
  AND EXISTS (SELECT 1 FROM app.billing_usage_reservations h WHERE h."workspaceId"=compute_jobs."workspaceId"
    AND h."operationId"=compute_jobs.id AND h.resource=compute_jobs.resource AND h."actorId"=compute_jobs."actorId"
    AND h.status='held' AND h.requested=CASE WHEN compute_jobs.kind='python' THEN compute_jobs."timeoutMs" ELSE 1 END)
);

GRANT CREATE ON SCHEMA ops,app TO atlas_policy;
GRANT SELECT ON ops.service_heartbeat TO atlas_policy;

CREATE FUNCTION app.compute_ready(rev text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM ops.service_heartbeat WHERE service='compute' AND revision=rev AND "checkedAt">now()-interval '20 seconds')
$$;
ALTER FUNCTION app.compute_ready(text) OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION app.compute_ready(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.compute_ready(text) TO atlas_runtime;

CREATE FUNCTION app.compute_queue_depth(w uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT count(*)::integer FROM ops.compute_jobs WHERE "workspaceId"=w AND status IN ('queued','running') AND app.is_workspace_member(w)
$$;
ALTER FUNCTION app.compute_queue_depth(uuid) OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION app.compute_queue_depth(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.compute_queue_depth(uuid) TO atlas_runtime;

-- This check is called only with the issuer and session obtained from a leased row.
CREATE FUNCTION ops.compute_authorized(w uuid,p uuid,a text,s text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM set_config('app.user_id',a,true),set_config('app.session_id',s,true),set_config('app.resources_enabled','1',true);
 RETURN app.can_write_research(w,p);
END $$;
ALTER FUNCTION ops.compute_authorized(uuid,uuid,text,text) OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION ops.compute_authorized(uuid,uuid,text,text) FROM PUBLIC;

CREATE FUNCTION ops.claim_compute_job(lease uuid)
 RETURNS TABLE (id uuid, kind text, source text, "timeoutMs" int)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE job ops.compute_jobs%ROWTYPE;
 BEGIN
  SELECT * INTO job FROM ops.compute_jobs j WHERE j.status='queued'
    AND j."createdAt">now()-interval '30 minutes'
    ORDER BY j."createdAt",j.id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE ops.compute_jobs j SET status='running',"leaseToken"=lease,
    "leaseUntil"=now()+(job."timeoutMs"+45000)*interval '1 millisecond' WHERE j.id=job.id;
  RETURN QUERY SELECT job.id,job.kind,
    CASE WHEN ops.compute_authorized(job."workspaceId",job."projectId",job."actorId",job."sessionId") THEN job.source ELSE NULL END,
    job."timeoutMs";
 END
$$;
ALTER FUNCTION ops.claim_compute_job(uuid) OWNER TO atlas_policy;

CREATE FUNCTION ops.compute_job_control(j uuid,lease uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE job ops.compute_jobs%ROWTYPE;
 BEGIN
  SELECT * INTO job FROM ops.compute_jobs WHERE id=j AND status='running' AND "leaseToken"=lease AND "leaseUntil">clock_timestamp();
  IF NOT FOUND THEN RETURN 'lost'; END IF;
  IF job."cancelRequestedAt" IS NOT NULL THEN RETURN 'cancel'; END IF;
  IF NOT ops.compute_authorized(job."workspaceId",job."projectId",job."actorId",job."sessionId") THEN RETURN 'revoked'; END IF;
  RETURN 'active';
 END
$$;
ALTER FUNCTION ops.compute_job_control(uuid,uuid) OWNER TO atlas_policy;

CREATE FUNCTION ops.finish_compute_job(j uuid,lease uuid, final text, measured int, ran boolean, out_text text, err_text text, output_pdf bytea)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE job ops.compute_jobs%ROWTYPE; w uuid; units bigint; h app.billing_usage_reservations%ROWTYPE;
 BEGIN
  IF final NOT IN ('succeeded','failed','timed_out','canceled','abandoned','output_limit') OR measured<0 THEN RETURN false; END IF;
  SELECT "workspaceId" INTO w FROM ops.compute_jobs WHERE id=j;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('atlas.usage:'||w::text,0));
  SELECT * INTO job FROM ops.compute_jobs WHERE id=j FOR UPDATE;
  IF NOT FOUND OR job.status NOT IN ('queued','running') OR job."leaseToken" IS DISTINCT FROM lease THEN RETURN false; END IF;
  IF job.status='queued' AND final NOT IN ('canceled','abandoned') THEN RETURN false; END IF;
  IF job."leaseUntil"<=clock_timestamp() AND final NOT IN ('canceled','abandoned') THEN RETURN false; END IF;
  measured := LEAST(measured,job."timeoutMs");
  IF job."cancelRequestedAt" IS NOT NULL THEN final := 'canceled'; END IF;
  IF final NOT IN ('abandoned','canceled') AND NOT ops.compute_authorized(job."workspaceId",job."projectId",job."actorId",job."sessionId") THEN
    final := 'abandoned';
  END IF;
  IF final IN ('abandoned','canceled') THEN out_text := ''; err_text := ''; END IF;
  IF final<>'succeeded' OR job.kind<>'latex' THEN output_pdf := NULL; END IF;
  IF final='succeeded' AND job.kind='latex' AND output_pdf IS NULL THEN final := 'failed'; END IF;
  IF output_pdf IS NOT NULL AND octet_length(output_pdf)+(SELECT coalesce(sum(octet_length(pdf)),0)
      FROM ops.compute_jobs WHERE "workspaceId"=w AND pdf IS NOT NULL AND "outputExpiresAt">now())>67108864 THEN
    final := 'output_limit'; output_pdf := NULL;
    err_text := 'This workspace has reached its temporary PDF output capacity.';
  END IF;
  units := CASE WHEN NOT ran OR job.status='queued' THEN 0 WHEN job.kind='latex' THEN 1 ELSE GREATEST(1,measured) END;
  UPDATE app.billing_usage_reservations SET charged=units,
    status=CASE WHEN units=0 THEN 'released' ELSE 'settled' END,"closedAt"=now()
    WHERE "workspaceId"=w AND "operationId"=j AND resource=job.resource AND status='held'
    RETURNING * INTO h;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO app.billing_usage_entries(id,"workspaceId","operationId",resource,"actorId",action,quantity)
    VALUES(gen_random_uuid(),w,j,job.resource,job."actorId",CASE WHEN units=0 THEN 'release' ELSE 'settle' END,
      CASE WHEN units=0 THEN h.requested ELSE units END);
  UPDATE ops.compute_jobs SET status=final,source=NULL,"leaseUntil"=NULL,"completedAt"=now(),
    "elapsedMs"=CASE WHEN ran THEN measured END,stdout=out_text,stderr=err_text,pdf=output_pdf,
    "outputExpiresAt"=CASE WHEN out_text<>'' OR err_text<>'' OR output_pdf IS NOT NULL THEN now()+interval '24 hours' END
    WHERE id=j;
  RETURN true;
 END
$$;
ALTER FUNCTION ops.finish_compute_job(uuid,uuid,text,integer,boolean,text,text,bytea) OWNER TO atlas_policy;

CREATE FUNCTION app.cancel_compute_job(w uuid,p uuid,j uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE job ops.compute_jobs%ROWTYPE;
 BEGIN
  IF NOT app.can_read_research(w,p) THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('atlas.usage:'||w::text,0));
  SELECT * INTO job FROM ops.compute_jobs WHERE id=j AND "workspaceId"=w AND "projectId"=p AND "actorId"=app.actor_id() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF job.status='queued' THEN RETURN ops.finish_compute_job(j,NULL,'canceled',0,false,'','',NULL); END IF;
  IF job.status='running' AND job."cancelRequestedAt" IS NULL THEN
   UPDATE ops.compute_jobs SET "cancelRequestedAt"=now() WHERE id=j;
  END IF;
  RETURN true;
 END
$$;
ALTER FUNCTION app.cancel_compute_job(uuid,uuid,uuid) OWNER TO atlas_policy;

CREATE FUNCTION ops.reap_compute_jobs() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE job record;
 BEGIN
  FOR job IN
   SELECT id,"workspaceId","leaseToken" FROM ops.compute_jobs
   WHERE (status='queued' AND "createdAt"<=now()-interval '30 minutes') OR (status='running' AND "leaseUntil"<=now())
   ORDER BY "workspaceId",id LIMIT 25
  LOOP
   IF pg_try_advisory_xact_lock(hashtextextended('atlas.usage:'||job."workspaceId"::text,0)) THEN
    PERFORM ops.finish_compute_job(job.id,job."leaseToken",'abandoned',0,false,'','',NULL);
   END IF;
  END LOOP;
  UPDATE ops.compute_jobs SET stdout='',stderr='',pdf=NULL,"outputExpiresAt"=NULL
   WHERE id IN (SELECT id FROM ops.compute_jobs WHERE "outputExpiresAt"<=now() ORDER BY "outputExpiresAt" LIMIT 25 FOR UPDATE SKIP LOCKED);
 END
$$;
ALTER FUNCTION ops.reap_compute_jobs() OWNER TO atlas_policy;

REVOKE ALL ON FUNCTION ops.claim_compute_job(uuid),ops.compute_job_control(uuid,uuid),
 ops.finish_compute_job(uuid,uuid,text,integer,boolean,text,text,bytea),ops.reap_compute_jobs(),app.cancel_compute_job(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.claim_compute_job(uuid),ops.compute_job_control(uuid,uuid),
 ops.finish_compute_job(uuid,uuid,text,integer,boolean,text,text,bytea),ops.reap_compute_jobs() TO atlas_queue;
GRANT EXECUTE ON FUNCTION app.cancel_compute_job(uuid,uuid,uuid) TO atlas_runtime;

REVOKE CREATE ON SCHEMA ops,app FROM atlas_policy;
UPDATE ops.schema_revision SET revision='202611240104_compute_jobs' WHERE id=1;
COMMIT;
