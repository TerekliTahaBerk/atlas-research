BEGIN;

ALTER TABLE app.ai_runs
  DROP CONSTRAINT IF EXISTS ai_runs_model_check,
  ADD COLUMN "pricingVersion" text,
  ADD COLUMN "reservedCredits" integer NOT NULL DEFAULT 0 CHECK ("reservedCredits" >= 0),
  ADD COLUMN "chargedCredits" integer NOT NULL DEFAULT 0 CHECK ("chargedCredits" BETWEEN 0 AND "reservedCredits"),
  ADD COLUMN "providerCostState" text NOT NULL DEFAULT 'legacy'
    CHECK ("providerCostState" IN ('legacy','reserved','released','actual','uncertain')),
  ADD COLUMN founding boolean NOT NULL DEFAULT false,
  ADD COLUMN "cachedInputTokens" integer,
  ADD COLUMN "cacheWrite30mTokens" integer,
  ADD COLUMN "cacheWrite12hTokens" integer,
  ADD CONSTRAINT ai_run_pricing_shape CHECK (
    length(model) BETWEEN 1 AND 160 AND
    ("pricingVersion" IS NOT NULL OR (
      "providerCostState" = 'legacy' AND "reservedCredits" = 0 AND NOT founding
    ))
  ),
  ADD CONSTRAINT ai_run_cache_tokens CHECK (
    coalesce("cachedInputTokens", 0) >= 0 AND coalesce("cacheWrite30mTokens", 0) >= 0
    AND coalesce("cacheWrite12hTokens", 0) >= 0 AND
    coalesce("cachedInputTokens", 0) + coalesce("cacheWrite30mTokens", 0) +
      coalesce("cacheWrite12hTokens", 0) <= coalesce("inputTokens", 0)
  );

CREATE INDEX ai_founding_provider_period ON app.ai_runs("createdAt") WHERE founding;

ALTER POLICY run_parent ON app.ai_runs WITH CHECK (
  state='queued' AND result IS NULL AND "dispatchedAt" IS NULL AND "chargedMicros"=0 AND "chargedCredits"=0
  AND "providerCostState"=CASE WHEN "pricingVersion" IS NULL THEN 'legacy' ELSE 'reserved' END
  AND EXISTS(
    SELECT 1 FROM app.ai_contexts c WHERE c.id="contextId"
      AND c."conversationId"=ai_runs."conversationId" AND c."userId"=app.actor_id()
  )
);

CREATE OR REPLACE FUNCTION app.guard_ai_state() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE mutable_run_fields text[] := ARRAY[
  'state','error','chargedMicros','inputTokens','outputTokens','result','dispatchedAt','completedAt',
  'chargedCredits','providerCostState','cachedInputTokens','cacheWrite30mTokens','cacheWrite12hTokens'
];
BEGIN
  IF TG_TABLE_NAME='ai_conversations' THEN
    IF EXISTS(SELECT 1 FROM unnest(NEW."versionIds") v WHERE NOT EXISTS(
      SELECT 1 FROM app.source_versions sv WHERE sv.id=v
        AND sv."workspaceId"=NEW."workspaceId" AND sv."projectId"=NEW."projectId"
    )) THEN RAISE EXCEPTION 'invalid AI scope' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='ai_runs' THEN
    IF current_user='atlas_policy' AND OLD."providerCostState"='uncertain'
      AND NEW."providerCostState"='actual' AND OLD.state NOT IN ('queued','running')
      AND (to_jsonb(NEW)-ARRAY['chargedMicros','providerCostState']) =
        (to_jsonb(OLD)-ARRAY['chargedMicros','providerCostState'])
      THEN RETURN NEW;
    END IF;
    IF (to_jsonb(NEW)-mutable_run_fields) IS DISTINCT FROM (to_jsonb(OLD)-mutable_run_fields)
      OR OLD.state NOT IN ('queued','running') OR (OLD.state='running' AND NEW.state='queued')
      THEN RAISE EXCEPTION 'immutable AI identity or terminal state' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='ai_proposals' THEN
    IF (to_jsonb(NEW)-ARRAY['appliedRevision','previousVersionId','undoRevision']) IS DISTINCT FROM
        (to_jsonb(OLD)-ARRAY['appliedRevision','previousVersionId','undoRevision'])
      THEN RAISE EXCEPTION 'immutable proposal' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.ai_usage(w uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT CASE WHEN app.is_active_actor() AND app.is_workspace_member(w) THEN jsonb_build_object(
    'activeWorkspace',(SELECT count(*)::int FROM app.ai_runs WHERE "workspaceId"=w AND state IN ('queued','running') AND "expiresAt">now()),
    'activeUser',(SELECT count(*)::int FROM app.ai_runs WHERE "userId"=app.actor_id() AND state IN ('queued','running') AND "expiresAt">now()),
    'requests',(SELECT count(*)::int FROM app.ai_runs WHERE "workspaceId"=w AND "userId"=app.actor_id() AND "createdAt">=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),
    'spentMicros',(SELECT coalesce(sum("chargedMicros"),0) FROM app.ai_runs WHERE "workspaceId"=w AND "createdAt">=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),
    'heldMicros',(SELECT coalesce(sum("reservedMicros"),0) FROM app.ai_runs WHERE "workspaceId"=w AND state IN ('queued','running') AND "createdAt">=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
  ) ELSE NULL END
$$;

CREATE FUNCTION ops.expire_ai_runs_for_workspace(w uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE expired record; affected integer := 0;
BEGIN
  FOR expired IN
    UPDATE app.ai_runs SET
      state=CASE WHEN "dispatchedAt" IS NULL THEN 'cancelled' ELSE 'provider_error' END,
      error='INTERRUPTED',
      "chargedMicros"=CASE WHEN "dispatchedAt" IS NULL THEN 0 ELSE greatest("chargedMicros","reservedMicros") END,
      "providerCostState"=CASE WHEN "pricingVersion" IS NULL THEN 'legacy'
        WHEN "dispatchedAt" IS NULL THEN 'released' ELSE 'uncertain' END,
      "completedAt"=now()
    WHERE "workspaceId"=w AND state IN ('queued','running') AND "expiresAt"<now()
    RETURNING id,"reservedCredits"
  LOOP
    IF expired."reservedCredits">0 THEN
      PERFORM app.expire_usage_reservation(w,expired.id,'aiCredits');
    END IF;
    affected := affected + 1;
  END LOOP;
  RETURN affected;
END $$;

REVOKE ALL ON FUNCTION ops.expire_ai_runs_for_workspace(uuid) FROM PUBLIC,atlas_runtime,atlas_queue,atlas_auth;

CREATE OR REPLACE FUNCTION app.expire_ai_runs(w uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT app.is_active_actor() OR NOT app.is_workspace_member(w) THEN RETURN 0; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(w::text,17404));
  RETURN ops.expire_ai_runs_for_workspace(w);
END $$;
REVOKE ALL ON FUNCTION app.expire_ai_runs(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.expire_ai_runs(uuid) TO atlas_runtime;

CREATE FUNCTION ops.sweep_expired_ai_runs() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE w uuid; affected integer := 0;
BEGIN
  FOR w IN SELECT "workspaceId" FROM app.ai_runs WHERE state IN ('queued','running') AND "expiresAt"<now()
    GROUP BY "workspaceId" ORDER BY min("expiresAt"),"workspaceId" LIMIT 32
  LOOP
    IF pg_try_advisory_xact_lock(hashtextextended(w::text,17404)) THEN
      affected := affected + ops.expire_ai_runs_for_workspace(w);
    END IF;
  END LOOP;
  RETURN affected;
END $$;
REVOKE ALL ON FUNCTION ops.sweep_expired_ai_runs() FROM PUBLIC,atlas_runtime,atlas_auth;
GRANT EXECUTE ON FUNCTION ops.sweep_expired_ai_runs() TO atlas_queue;

-- A global lock serializes reservations across founding workspaces. No actor, project or content leaves RLS.
CREATE FUNCTION ops.founding_ai_budget_values(required integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  cap constant integer := 180000000;
  from_time timestamptz := date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  actual bigint;
  uncertain bigint;
  held bigint;
BEGIN
  IF required>0 THEN PERFORM pg_advisory_xact_lock(20261123,180); END IF;
  SELECT
    coalesce(sum("chargedMicros") FILTER (WHERE "providerCostState"='actual'),0),
    coalesce(sum("chargedMicros") FILTER (WHERE "providerCostState"='uncertain'),0),
    coalesce(sum("reservedMicros") FILTER (WHERE state IN ('queued','running')
      AND ("dispatchedAt" IS NOT NULL OR "expiresAt">now())),0)
  INTO actual,uncertain,held
  FROM app.ai_runs WHERE founding AND "createdAt">=from_time AND "createdAt"<from_time+interval '1 month';

  RETURN jsonb_build_object(
    'capMicros',cap,'actualMicros',actual,'uncertainMicros',uncertain,'heldMicros',held,
    'warning',actual+uncertain+held>=cap*8/10,
    'allowed',CASE WHEN required=0 THEN actual+uncertain+held<cap ELSE actual+uncertain+held+required<=cap END
  );
END $$;

CREATE FUNCTION app.founding_ai_budget(w uuid, required integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE report jsonb;
BEGIN
  IF NOT app.is_active_actor() OR NOT app.is_workspace_member(w) OR required IS NULL OR required<0 OR NOT EXISTS(
    SELECT 1 FROM app.founding_grants WHERE "workspaceId"=w AND "revokedAt" IS NULL
      AND "startedAt"<=now() AND "endsAt">now()
  ) THEN RETURN NULL; END IF;
  report := ops.founding_ai_budget_values(required);
  RETURN jsonb_build_object('warning',report->'warning','allowed',report->'allowed');
END $$;

CREATE FUNCTION app.billing_ai_cost_report() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
WITH period AS (
  SELECT date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS "start"
),
scoped AS (
  SELECT r.* FROM app.ai_runs r CROSS JOIN period WHERE r."createdAt">=period.start
    AND r."createdAt"<period.start+interval '1 month' AND r."pricingVersion" IS NOT NULL
),
models AS (
  SELECT split_part("pricingVersion",'-',1) AS provider, model, "pricingVersion",
    count(*) AS runs,
    coalesce(sum("chargedMicros") FILTER (WHERE "providerCostState"='actual'),0) AS "actualMicros",
    coalesce(sum("chargedMicros") FILTER (WHERE "providerCostState"='uncertain'),0) AS "uncertainMicros",
    coalesce(sum("reservedMicros") FILTER (WHERE state IN ('queued','running')
      AND ("dispatchedAt" IS NOT NULL OR "expiresAt">now())),0) AS "heldMicros",
    coalesce(sum("chargedCredits"),0) AS credits,
    coalesce(sum("inputTokens"),0) AS "inputTokens",coalesce(sum("outputTokens"),0) AS "outputTokens",
    coalesce(sum("cachedInputTokens"),0) AS "cachedInputTokens",
    coalesce(sum("cacheWrite30mTokens"),0) AS "cacheWrite30mTokens",
    coalesce(sum("cacheWrite12hTokens"),0) AS "cacheWrite12hTokens"
  FROM scoped GROUP BY 1,2,3
),
cost_candidates AS (
  SELECT id,"workspaceId",model,"createdAt","providerCostState" AS "costState",
    CASE WHEN "providerCostState"='actual' THEN "chargedMicros" ELSE 0 END AS "actualMicros",
    CASE WHEN "providerCostState"='uncertain' THEN "chargedMicros"
      WHEN state IN ('queued','running') AND ("dispatchedAt" IS NOT NULL OR "expiresAt">now())
        THEN "reservedMicros" ELSE 0 END AS "heldMicros"
  FROM scoped WHERE "chargedMicros">0 OR state IN ('queued','running')
),
high_cost_runs AS (
  SELECT * FROM cost_candidates WHERE greatest("actualMicros","heldMicros")>0
  ORDER BY greatest("actualMicros","heldMicros") DESC,id LIMIT 20
)
SELECT CASE WHEN app.billing_operator() THEN jsonb_build_object(
  'periodStart',(SELECT "start" FROM period),'founding',ops.founding_ai_budget_values(0),
  'models',(SELECT coalesce(jsonb_agg(models ORDER BY "actualMicros" DESC,model),'[]') FROM models),
  'highCostRuns',(SELECT coalesce(jsonb_agg(high_cost_runs ORDER BY greatest("actualMicros","heldMicros") DESC,id),'[]') FROM high_cost_runs)
) ELSE NULL END
$$;

-- Cost-only operations access. Existing rows remain legacy estimates.
CREATE TABLE ops.ai_provider_reconciliations(
  "runId" uuid PRIMARY KEY REFERENCES app.ai_runs(id),
  reference text NOT NULL CHECK (reference ~ '^[A-Za-z0-9_.:-]{3,100}$'),
  "previousMicros" integer NOT NULL CHECK ("previousMicros">=0),
  "actualMicros" integer NOT NULL CHECK ("actualMicros">=0),
  actor text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON ops.ai_provider_reconciliations FROM PUBLIC,atlas_runtime,atlas_queue,atlas_auth;
GRANT USAGE ON SCHEMA ops TO atlas_policy;
GRANT SELECT,INSERT ON ops.ai_provider_reconciliations TO atlas_policy;
GRANT CREATE ON SCHEMA app,ops TO atlas_policy;

CREATE FUNCTION ops.reconcile_ai_provider_cost(r uuid, receipt_reference text, actual integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior integer;
BEGIN
  IF actual IS NULL OR actual<0 OR actual>100000000 OR receipt_reference IS NULL
    OR receipt_reference !~ '^[A-Za-z0-9_.:-]{3,100}$' THEN RETURN false;
  END IF;
  PERFORM pg_advisory_xact_lock(20261123,180);
  SELECT "chargedMicros" INTO prior FROM app.ai_runs WHERE id=r AND "providerCostState"='uncertain' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN EXISTS(SELECT 1 FROM ops.ai_provider_reconciliations
      WHERE "runId"=r AND reference=receipt_reference AND "actualMicros"=actual);
  END IF;
  UPDATE app.ai_runs SET "chargedMicros"=actual,"providerCostState"='actual' WHERE id=r;
  INSERT INTO ops.ai_provider_reconciliations("runId",reference,"previousMicros","actualMicros",actor)
    VALUES(r,receipt_reference,prior,actual,session_user);
  RETURN true;
END $$;

CREATE VIEW ops.ai_provider_costs AS
SELECT "pricingVersion", model, founding, "providerCostState", ("createdAt" AT TIME ZONE 'UTC')::date AS day,
  count(*) AS runs, sum("chargedMicros") AS "providerMicros", sum("chargedCredits") AS credits,
  sum("reservedMicros") FILTER (WHERE state IN ('queued','running')) AS "reservedMicros",
  sum("inputTokens") AS "inputTokens", sum("outputTokens") AS "outputTokens",
  sum("cachedInputTokens") AS "cachedInputTokens", sum("cacheWrite30mTokens") AS "cacheWrite30mTokens",
  sum("cacheWrite12hTokens") AS "cacheWrite12hTokens"
FROM app.ai_runs GROUP BY 1,2,3,4,5;
ALTER VIEW ops.ai_provider_costs OWNER TO atlas_policy;
REVOKE ALL ON ops.ai_provider_costs FROM PUBLIC,atlas_runtime,atlas_queue,atlas_auth;
GRANT SELECT ON ops.ai_provider_costs TO atlas_backup;
ALTER FUNCTION ops.founding_ai_budget_values(integer) OWNER TO atlas_policy;
ALTER FUNCTION ops.expire_ai_runs_for_workspace(uuid) OWNER TO atlas_policy;
ALTER FUNCTION ops.sweep_expired_ai_runs() OWNER TO atlas_policy;
ALTER FUNCTION app.founding_ai_budget(uuid,integer) OWNER TO atlas_policy;
ALTER FUNCTION app.billing_ai_cost_report() OWNER TO atlas_policy;
ALTER FUNCTION ops.reconcile_ai_provider_cost(uuid,text,integer) OWNER TO atlas_policy;
REVOKE CREATE ON SCHEMA app,ops FROM atlas_policy;
REVOKE ALL ON FUNCTION ops.founding_ai_budget_values(integer),app.founding_ai_budget(uuid,integer),
  app.billing_ai_cost_report(),ops.reconcile_ai_provider_cost(uuid,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.founding_ai_budget(uuid,integer),app.billing_ai_cost_report() TO atlas_runtime;
GRANT EXECUTE ON FUNCTION ops.reconcile_ai_provider_cost(uuid,text,integer) TO atlas_migrator;

UPDATE ops.schema_revision SET revision='202611230103_ai_credit_metering' WHERE id=1;
COMMIT;
