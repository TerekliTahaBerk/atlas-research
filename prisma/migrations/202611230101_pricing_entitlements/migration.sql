BEGIN;

-- CreateTable
CREATE TABLE "app"."billing_subscriptions" (
    "workspaceId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "planVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "unitAmountMinor" INTEGER NOT NULL,
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "billing_subscriptions_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "app"."billing_workspace_settings" (
    "workspaceId" UUID NOT NULL,
    "memberAiPercent" INTEGER NOT NULL DEFAULT 40,
    "legacySeats" INTEGER NOT NULL DEFAULT 1,
    "quotaOverrides" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "billing_workspace_settings_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "app"."billing_resource_grants" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "resource" TEXT NOT NULL,
    "quantity" BIGINT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "validFrom" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "billing_resource_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."billing_usage_reservations" (
    "workspaceId" UUID NOT NULL,
    "operationId" UUID NOT NULL,
    "resource" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "requested" BIGINT NOT NULL,
    "charged" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'held',
    "allocations" JSONB NOT NULL,
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMPTZ(3),

    CONSTRAINT "billing_usage_reservations_pkey" PRIMARY KEY ("workspaceId","operationId","resource")
);

-- CreateTable
CREATE TABLE "app"."billing_usage_entries" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "operationId" UUID NOT NULL,
    "resource" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "quantity" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_usage_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."billing_events" (
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "workspaceId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("provider","eventId")
);

-- CreateTable
CREATE TABLE "ops"."billing_operators" (
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_operators_pkey" PRIMARY KEY ("actorId")
);

-- CreateTable
CREATE TABLE "ops"."billing_audit" (
    "id" UUID NOT NULL,
    "actorId" TEXT NOT NULL,
    "workspaceId" UUID,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops"."founding_applications" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT,
    "researchArea" TEXT NOT NULL,
    "applicantType" TEXT NOT NULL,
    "teamSize" INTEGER NOT NULL,
    "tools" TEXT[],
    "motivation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "profile" TEXT,
    "tokenHash" TEXT,
    "tokenExpiresAt" TIMESTAMPTZ(3),
    "queueId" UUID,
    "overrides" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "founding_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."founding_grants" (
    "workspaceId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "profile" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "emailOwnerId" TEXT NOT NULL,
    "quotaOverrides" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "extensionDays" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "founding_grants_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "ops"."academic_institutions" (
    "domain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "verificationUrl" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "academic_institutions_pkey" PRIMARY KEY ("domain")
);

-- CreateTable
CREATE TABLE "app"."academic_eligibility" (
    "actorId" TEXT NOT NULL,
    "institutionDomain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedAt" TIMESTAMPTZ(3) NOT NULL,
    "verifiedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),

    CONSTRAINT "academic_eligibility_pkey" PRIMARY KEY ("actorId")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_subscriptions_providerId_key" ON "app"."billing_subscriptions"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "billing_resource_grants_sourceKey_key" ON "app"."billing_resource_grants"("sourceKey");

-- CreateIndex
CREATE INDEX "billing_resource_grants_workspaceId_resource_expiresAt_idx" ON "app"."billing_resource_grants"("workspaceId", "resource", "expiresAt");

-- CreateIndex
CREATE INDEX "billing_usage_reservations_workspaceId_resource_periodStart_idx" ON "app"."billing_usage_reservations"("workspaceId", "resource", "periodStart");

-- CreateIndex
CREATE INDEX "billing_usage_reservations_workspaceId_resource_actorId_cre_idx" ON "app"."billing_usage_reservations"("workspaceId", "resource", "actorId", "createdAt");

-- CreateIndex
CREATE INDEX "billing_usage_entries_workspaceId_createdAt_idx" ON "app"."billing_usage_entries"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "billing_usage_entries_workspaceId_operationId_resource_acti_key" ON "app"."billing_usage_entries"("workspaceId", "operationId", "resource", "action");

-- CreateIndex
CREATE INDEX "billing_events_workspaceId_createdAt_idx" ON "app"."billing_events"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "billing_audit_createdAt_idx" ON "ops"."billing_audit"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "founding_applications_email_key" ON "ops"."founding_applications"("email");

-- CreateIndex
CREATE UNIQUE INDEX "founding_applications_tokenHash_key" ON "ops"."founding_applications"("tokenHash");

-- CreateIndex
CREATE INDEX "founding_applications_status_createdAt_idx" ON "ops"."founding_applications"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "founding_grants_applicationId_key" ON "app"."founding_grants"("applicationId");

-- CreateIndex
CREATE INDEX "founding_grants_profile_endsAt_idx" ON "app"."founding_grants"("profile", "endsAt");


-- Existing content and permissions remain in the canonical app schemas.
ALTER TABLE app.billing_subscriptions ADD CHECK (currency='USD' AND "unitAmountMinor">=0 AND seats BETWEEN 1 AND 10000
 AND revision>0 AND "periodEnd">"periodStart" AND interval IN ('month','year','contract')
 AND status IN ('active','trialing','past_due','cancelled','incomplete'));
ALTER TABLE app.billing_workspace_settings ADD CHECK ("memberAiPercent" BETWEEN 1 AND 100 AND "legacySeats">0);
ALTER TABLE app.billing_resource_grants ADD CHECK (quantity>0 AND "expiresAt">"validFrom"
 AND resource IN ('aiCredits','pythonMilliseconds','storageBytes','teamSeats'));
ALTER TABLE app.billing_usage_reservations ADD CHECK (requested>0 AND charged>=0 AND charged<=requested AND "periodEnd">"periodStart"
 AND resource IN ('aiCredits','pythonMilliseconds','latexCompiles','automations') AND status IN ('held','settled','released','expired')
 AND (status='held')=("closedAt" IS NULL));
ALTER TABLE app.billing_usage_entries ADD CHECK (quantity>=0 AND action IN ('reserve','settle','release','expire'));
ALTER TABLE app.founding_grants ADD CHECK (profile IN ('RES_FOUNDING_STUDENT','RES_FOUNDING_RESEARCHER','RES_FOUNDING_TEAM','RES_FOUNDING_LAB')
 AND seats IN (1,5,10) AND "extensionDays" BETWEEN 0 AND 30 AND "endsAt">"startedAt");
ALTER TABLE ops.founding_applications ADD CHECK (email=lower(btrim(email)) AND status IN ('pending','approved','invited','activated','rejected','revoked','expired')
 AND ("tokenHash" IS NULL OR "tokenHash" ~ '^[a-f0-9]{64}$') AND "teamSize" BETWEEN 1 AND 1000);
ALTER TABLE app.academic_eligibility ADD CHECK (status IN ('pending','verified','rejected'));

ALTER TABLE app.billing_subscriptions ADD FOREIGN KEY ("workspaceId") REFERENCES app.workspaces(id) ON DELETE RESTRICT;
ALTER TABLE app.billing_workspace_settings ADD FOREIGN KEY ("workspaceId") REFERENCES app.workspaces(id) ON DELETE RESTRICT;
ALTER TABLE app.billing_resource_grants ADD FOREIGN KEY ("workspaceId") REFERENCES app.workspaces(id) ON DELETE RESTRICT;
ALTER TABLE app.billing_usage_reservations ADD FOREIGN KEY ("workspaceId") REFERENCES app.workspaces(id) ON DELETE RESTRICT;
ALTER TABLE app.billing_usage_entries ADD FOREIGN KEY ("workspaceId","operationId",resource)
 REFERENCES app.billing_usage_reservations("workspaceId","operationId",resource) ON DELETE RESTRICT;
ALTER TABLE app.billing_events ADD FOREIGN KEY ("workspaceId") REFERENCES app.workspaces(id) ON DELETE RESTRICT;
ALTER TABLE app.founding_grants ADD FOREIGN KEY ("workspaceId") REFERENCES app.workspaces(id) ON DELETE RESTRICT;
ALTER TABLE app.founding_grants ADD FOREIGN KEY ("applicationId") REFERENCES ops.founding_applications(id) ON DELETE RESTRICT;
ALTER TABLE ops.billing_operators ADD FOREIGN KEY ("actorId") REFERENCES identity.users(id) ON DELETE RESTRICT;
ALTER TABLE app.academic_eligibility ADD FOREIGN KEY ("actorId") REFERENCES identity.users(id) ON DELETE RESTRICT;
ALTER TABLE app.academic_eligibility ADD FOREIGN KEY ("institutionDomain") REFERENCES ops.academic_institutions(domain) ON DELETE RESTRICT;

GRANT CREATE ON SCHEMA app TO atlas_policy;
GRANT USAGE ON SCHEMA ops,identity TO atlas_policy;
GRANT SELECT ON identity.users TO atlas_policy;
GRANT SELECT ON app.workspaces,app.workspace_members,app.projects,app.project_members TO atlas_policy;
GRANT SELECT ON ops.billing_operators,ops.founding_applications,ops.academic_institutions TO atlas_policy;
GRANT SELECT,INSERT,UPDATE ON app.billing_workspace_settings,app.billing_usage_reservations TO atlas_policy;
GRANT SELECT ON app.billing_subscriptions,app.billing_resource_grants,app.founding_grants TO atlas_policy;
GRANT INSERT ON app.billing_usage_entries TO atlas_policy;
GRANT INSERT ON ops.founding_applications TO atlas_policy;

-- Keep a capacity floor for existing shared workspaces when turning on metering.
SET LOCAL ROLE atlas_policy;
INSERT INTO app.billing_workspace_settings("workspaceId","legacySeats")
 SELECT w.id,GREATEST(1,(SELECT COUNT(*)::integer FROM app.workspace_members wm
 WHERE wm."workspaceId"=w.id AND wm.active AND (wm.role IN ('owner','admin') OR EXISTS(
   SELECT 1 FROM app.project_members pm JOIN app.projects p ON p.id=pm."projectId"
   WHERE pm."workspaceId"=w.id AND pm."userId"=wm."userId" AND pm.active AND pm.role<>'viewer' AND p."deletedAt" IS NULL))))
 FROM app.workspaces w WHERE w.kind='shared';
RESET ROLE;

CREATE FUNCTION app.billing_operator() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT app.is_active_actor() AND EXISTS(SELECT 1 FROM ops.billing_operators WHERE "actorId"=app.actor_id())
$$;
ALTER FUNCTION app.billing_operator() OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION app.billing_operator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_operator() TO atlas_runtime;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['billing_subscriptions','billing_workspace_settings','billing_resource_grants','billing_usage_reservations','billing_usage_entries','billing_events','founding_grants'] LOOP
   EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
   EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
   EXECUTE format('GRANT SELECT ON app.%I TO atlas_runtime,atlas_backup',t);
   EXECUTE format('CREATE POLICY scoped_read ON app.%I FOR SELECT TO atlas_runtime USING (app.billing_operator() OR app.is_workspace_member("workspaceId"))',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['billing_subscriptions','billing_workspace_settings','billing_resource_grants','billing_events','founding_grants'] LOOP
   EXECUTE format('GRANT INSERT ON app.%I TO atlas_runtime',t);
   EXECUTE format('CREATE POLICY operator_insert ON app.%I FOR INSERT TO atlas_runtime WITH CHECK (app.billing_operator())',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['billing_subscriptions','billing_workspace_settings','billing_resource_grants','founding_grants'] LOOP
   EXECUTE format('GRANT UPDATE ON app.%I TO atlas_runtime',t);
   EXECUTE format('CREATE POLICY operator_update ON app.%I FOR UPDATE TO atlas_runtime USING (app.billing_operator()) WITH CHECK (app.billing_operator())',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['billing_audit','founding_applications','academic_institutions'] LOOP
   EXECUTE format('ALTER TABLE ops.%I ENABLE ROW LEVEL SECURITY',t);
   EXECUTE format('ALTER TABLE ops.%I FORCE ROW LEVEL SECURITY',t);
   EXECUTE format('GRANT SELECT ON ops.%I TO atlas_runtime,atlas_backup',t);
   EXECUTE format('CREATE POLICY operator_read ON ops.%I FOR SELECT TO atlas_runtime USING (app.billing_operator())',t);
 END LOOP;
END $$;

GRANT UPDATE ON ops.founding_applications TO atlas_runtime;
CREATE POLICY operator_review ON ops.founding_applications FOR UPDATE TO atlas_runtime USING (app.billing_operator()) WITH CHECK (app.billing_operator());
GRANT INSERT ON ops.billing_audit TO atlas_runtime;
CREATE POLICY operator_audit ON ops.billing_audit FOR INSERT TO atlas_runtime WITH CHECK (app.billing_operator() AND "actorId"=app.actor_id());
GRANT INSERT,UPDATE ON ops.academic_institutions TO atlas_runtime;
CREATE POLICY operator_institution ON ops.academic_institutions TO atlas_runtime USING (app.billing_operator()) WITH CHECK (app.billing_operator());
GRANT SELECT ON ops.billing_operators TO atlas_backup;
GRANT SELECT,INSERT,UPDATE ON app.academic_eligibility TO atlas_runtime;
GRANT SELECT ON app.academic_eligibility TO atlas_policy,atlas_backup;
ALTER TABLE app.academic_eligibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.academic_eligibility FORCE ROW LEVEL SECURITY;
CREATE POLICY academic_status ON app.academic_eligibility FOR SELECT TO atlas_runtime USING (app.billing_operator() OR (app.is_active_actor() AND "actorId"=app.actor_id()));
CREATE POLICY academic_decision ON app.academic_eligibility FOR UPDATE TO atlas_runtime USING (app.billing_operator()) WITH CHECK (app.billing_operator());
GRANT SELECT,INSERT,UPDATE ON app.academic_eligibility TO atlas_policy;

GRANT INSERT,UPDATE ON app.billing_usage_reservations TO atlas_runtime;
GRANT INSERT ON app.billing_usage_entries TO atlas_runtime;
CREATE POLICY usage_hold_write ON app.billing_usage_reservations FOR INSERT TO atlas_runtime
 WITH CHECK (app.is_active_actor() AND "actorId"=app.actor_id() AND app.is_workspace_member("workspaceId"));
CREATE POLICY usage_hold_close ON app.billing_usage_reservations FOR UPDATE TO atlas_runtime
 USING (app.is_active_actor() AND "actorId"=app.actor_id() AND app.is_workspace_member("workspaceId"))
 WITH CHECK (app.is_active_actor() AND "actorId"=app.actor_id() AND app.is_workspace_member("workspaceId"));
CREATE POLICY usage_append ON app.billing_usage_entries FOR INSERT TO atlas_runtime
 WITH CHECK (app.is_active_actor() AND "actorId"=app.actor_id() AND app.is_workspace_member("workspaceId"));

CREATE FUNCTION app.billing_descriptor_unchecked(w uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object(
 'planCode',coalesce(s."planCode",CASE WHEN g.profile IN ('RES_FOUNDING_TEAM','RES_FOUNDING_LAB') THEN 'TEAM' WHEN g.profile IS NOT NULL THEN 'PRO' ELSE 'FREE' END),
 'planVersion',s."planVersion",
 'foundingProfile',CASE WHEN s."workspaceId" IS NULL THEN g.profile END,
 'seats',GREATEST(coalesce(s.seats,g.seats,c."legacySeats",1),1)+CASE WHEN s."planCode"='TEAM' THEN coalesce(addons.seats,0) ELSE 0 END,
 'memberAiPercent',coalesce(c."memberAiPercent",40),
 'periodStart',coalesce(s."periodStart",g."startedAt"),
 'periodEnd',coalesce(s."periodEnd",g."endsAt"),
 'endsAt',coalesce(s."periodEnd",g."endsAt"),
 'source',CASE WHEN s."workspaceId" IS NOT NULL THEN 'subscription' WHEN g."workspaceId" IS NOT NULL THEN 'founding' ELSE 'free' END,
 'billingInterval',s.interval,
 'overrides',coalesce(c."quotaOverrides",'{}'::jsonb) || coalesce(g."quotaOverrides",'{}'::jsonb),
 'addOnStorageBytes',coalesce(addons.storage,0)
 )
 FROM app.workspaces a LEFT JOIN app.billing_workspace_settings c ON c."workspaceId"=a.id
 LEFT JOIN app.billing_subscriptions s ON s."workspaceId"=a.id AND s.status IN ('active','trialing','past_due','cancelled')
   AND s."periodStart"<=now() AND s."periodEnd">now()
 LEFT JOIN app.founding_grants g ON g."workspaceId"=a.id AND g."revokedAt" IS NULL AND g."startedAt"<=now() AND g."endsAt">now()
 LEFT JOIN LATERAL (
  SELECT sum(quantity) FILTER(WHERE resource='storageBytes') storage, sum(quantity) FILTER(WHERE resource='teamSeats') seats
  FROM app.billing_resource_grants WHERE "workspaceId"=a.id AND "revokedAt" IS NULL AND "expiresAt">now() AND "validFrom"<=now()
 ) addons ON s."workspaceId" IS NOT NULL
 WHERE a.id=w
$$;
ALTER FUNCTION app.billing_descriptor_unchecked(uuid) OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION app.billing_descriptor_unchecked(uuid) FROM PUBLIC;

CREATE FUNCTION app.billing_descriptor(w uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT app.billing_descriptor_unchecked(w) WHERE session_user='atlas_queue' OR app.is_workspace_member(w) OR app.billing_operator()
$$;
ALTER FUNCTION app.billing_descriptor(uuid) OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION app.billing_descriptor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_descriptor(uuid) TO atlas_runtime,atlas_queue;

CREATE FUNCTION app.set_billing_ai_percent(w uuid, pct integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT app.has_workspace_role(w,ARRAY['owner','admin']) OR pct NOT BETWEEN 1 AND 100 THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('atlas.usage:'||w::text,0));
 IF app.billing_descriptor_unchecked(w)->>'planCode' <> 'TEAM' THEN RETURN false; END IF;
 INSERT INTO app.billing_workspace_settings("workspaceId","memberAiPercent") VALUES(w,pct)
 ON CONFLICT ("workspaceId") DO UPDATE SET "memberAiPercent"=excluded."memberAiPercent";
 RETURN true;
END $$;
ALTER FUNCTION app.set_billing_ai_percent(uuid,integer) OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION app.set_billing_ai_percent(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.set_billing_ai_percent(uuid,integer) TO atlas_runtime;

CREATE FUNCTION app.expire_usage_reservation(w uuid, op uuid, res text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE r app.billing_usage_reservations%ROWTYPE;
 BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('atlas.usage:'||w::text,0));
  UPDATE app.billing_usage_reservations SET status='expired',"closedAt"=now()
   WHERE "workspaceId"=w AND "operationId"=op AND resource=res AND status='held' RETURNING * INTO r;
  IF FOUND THEN
   INSERT INTO app.billing_usage_entries(id,"workspaceId","operationId",resource,"actorId",action,quantity)
    VALUES(gen_random_uuid(),w,op,res,r."actorId",'expire',r.requested);
  END IF;
 END
$$;
ALTER FUNCTION app.expire_usage_reservation(uuid,uuid,text) OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION app.expire_usage_reservation(uuid,uuid,text) FROM PUBLIC;

CREATE FUNCTION app.workspace_editing_seats_unchecked(w uuid, excluded text DEFAULT NULL) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT count(*)::integer FROM app.workspace_members wm WHERE wm."workspaceId"=w AND wm.active
 AND wm."userId" IS DISTINCT FROM excluded AND (wm.role IN ('owner','admin') OR EXISTS(
 SELECT 1 FROM app.project_members pm JOIN app.projects p ON p.id=pm."projectId" WHERE pm."workspaceId"=w
 AND pm."userId"=wm."userId" AND pm.active AND pm.role<>'viewer' AND p."deletedAt" IS NULL))
$$;
ALTER FUNCTION app.workspace_editing_seats_unchecked(uuid,text) OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION app.workspace_editing_seats_unchecked(uuid,text) FROM PUBLIC;

CREATE FUNCTION app.workspace_editing_seats(w uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT app.workspace_editing_seats_unchecked(w) WHERE app.is_workspace_member(w) OR app.billing_operator()
$$;
ALTER FUNCTION app.workspace_editing_seats(uuid) OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION app.workspace_editing_seats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.workspace_editing_seats(uuid) TO atlas_runtime;

CREATE FUNCTION app.guard_editing_seat() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE w uuid := NEW."workspaceId"; u text := NEW."userId"; cap integer;
 BEGIN
  IF current_setting('app.resources_enabled',true) IS DISTINCT FROM '1' OR NOT NEW.active OR
   (TG_TABLE_NAME='workspace_members' AND NEW.role NOT IN ('owner','admin')) OR
   (TG_TABLE_NAME='project_members' AND NEW.role='viewer') THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.active AND ((TG_TABLE_NAME='workspace_members' AND OLD.role IN ('owner','admin')) OR
   (TG_TABLE_NAME='project_members' AND OLD.role<>'viewer')) THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('atlas.usage:'||w::text,0));
  IF app.workspace_editing_seats_unchecked(w)<>app.workspace_editing_seats_unchecked(w,u) THEN RETURN NEW; END IF;
  cap := (app.billing_descriptor_unchecked(w)->>'seats')::integer;
  IF app.workspace_editing_seats_unchecked(w)>=cap THEN RAISE EXCEPTION 'seat_capacity' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END
$$;
ALTER FUNCTION app.guard_editing_seat() OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION app.guard_editing_seat() FROM PUBLIC;
CREATE TRIGGER zz_project_editing_seats BEFORE INSERT OR UPDATE OF role,active ON app.project_members FOR EACH ROW EXECUTE FUNCTION app.guard_editing_seat();
CREATE TRIGGER zz_workspace_editing_seats BEFORE INSERT OR UPDATE OF role,active ON app.workspace_members FOR EACH ROW EXECUTE FUNCTION app.guard_editing_seat();

CREATE FUNCTION app.request_academic_eligibility(d text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT app.is_active_actor() OR NOT EXISTS (SELECT 1 FROM identity.users WHERE id=app.actor_id() AND "emailVerified" AND split_part(lower(email),'@',2)=d)
    OR NOT EXISTS(SELECT 1 FROM ops.academic_institutions WHERE domain=d AND active) THEN RETURN false; END IF;
 INSERT INTO app.academic_eligibility("actorId","institutionDomain",status,"requestedAt") VALUES(app.actor_id(),d,'pending',now())
 ON CONFLICT ("actorId") DO UPDATE SET "institutionDomain"=d,"requestedAt"=now(),
 status=CASE WHEN academic_eligibility.status='verified' AND academic_eligibility."institutionDomain"=d AND academic_eligibility."expiresAt">now() THEN 'verified' ELSE 'pending' END,
 "verifiedAt"=CASE WHEN academic_eligibility."institutionDomain"=d AND academic_eligibility."expiresAt">now() THEN academic_eligibility."verifiedAt" END,
 "expiresAt"=CASE WHEN academic_eligibility."institutionDomain"=d AND academic_eligibility."expiresAt">now() THEN academic_eligibility."expiresAt" END
 WHERE app.academic_eligibility.status<>'verified' OR app.academic_eligibility."institutionDomain"<>d OR app.academic_eligibility."expiresAt"<=now()+interval '30 days';
 RETURN true;
END $$;
ALTER FUNCTION app.request_academic_eligibility(text) OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION app.request_academic_eligibility(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.request_academic_eligibility(text) TO atlas_runtime;

CREATE FUNCTION app.submit_founding_application(i uuid,e text,n text,inst text,a text,t text,s integer,uses text[],m text)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 INSERT INTO ops.founding_applications(id,email,name,institution,"researchArea","applicantType","teamSize",tools,motivation,"updatedAt")
 VALUES (i,e,n,inst,a,t,s,uses,m,now()) ON CONFLICT (email) DO NOTHING
$$;
ALTER FUNCTION app.submit_founding_application(uuid,text,text,text,text,text,integer,text[],text) OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION app.submit_founding_application(uuid,text,text,text,text,text,integer,text[],text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.submit_founding_application(uuid,text,text,text,text,text,integer,text[],text) TO atlas_runtime;

GRANT UPDATE ON ops.founding_applications TO atlas_policy;
GRANT INSERT ON app.founding_grants,ops.billing_audit TO atlas_policy;

CREATE FUNCTION app.activate_founding(w uuid,h text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE candidate ops.founding_applications%ROWTYPE; ws app.workspaces%ROWTYPE; expected text; editors integer;
BEGIN
 IF NOT app.is_active_actor() OR h !~ '^[a-f0-9]{64}$' OR NOT app.has_workspace_role(w,ARRAY['owner']) THEN RETURN false; END IF;
 SELECT * INTO ws FROM app.workspaces WHERE id=w AND "archivedAt" IS NULL FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('atlas.founding.enrollment',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('atlas.usage:'||w::text,0));
 SELECT * INTO candidate FROM ops.founding_applications
 WHERE "tokenHash"=h AND status='invited' AND "tokenExpiresAt">now()
 AND email=(SELECT lower(email) FROM identity.users WHERE id=app.actor_id() AND "emailVerified")
 FOR UPDATE;
 IF NOT FOUND OR EXISTS (SELECT 1 FROM app.founding_grants WHERE "workspaceId"=w) OR
   app.billing_descriptor_unchecked(w)->>'source'<>'free' THEN RETURN false; END IF;
 expected := CASE candidate.profile WHEN 'RES_FOUNDING_TEAM' THEN 'shared' WHEN 'RES_FOUNDING_LAB' THEN 'shared' ELSE 'personal' END;
 editors := CASE candidate.profile WHEN 'RES_FOUNDING_TEAM' THEN 5 WHEN 'RES_FOUNDING_LAB' THEN 10 ELSE 1 END;
 IF ws.kind<>expected OR app.workspace_editing_seats_unchecked(w)>editors THEN RETURN false; END IF;
 INSERT INTO app.founding_grants("workspaceId","applicationId",profile,seats,"emailOwnerId","quotaOverrides","startedAt","endsAt")
 VALUES(w,candidate.id,candidate.profile,editors,app.actor_id(),candidate.overrides,now(),now()+interval '2160 hours');
 UPDATE ops.founding_applications SET status='activated',"tokenHash"=NULL,"tokenExpiresAt"=NULL,"updatedAt"=now() WHERE id=candidate.id;
 INSERT INTO ops.billing_audit(id,"actorId","workspaceId",kind,"targetId",details)
 VALUES(gen_random_uuid(),app.actor_id(),w,'founding_activated',candidate.id::text,jsonb_build_object('profile',candidate.profile));
 RETURN true;
END $$;
ALTER FUNCTION app.activate_founding(uuid,text) OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION app.activate_founding(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.activate_founding(uuid,text) TO atlas_runtime;

CREATE FUNCTION app.founding_invitation_sendable(i uuid,h text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT app.billing_operator() AND EXISTS(SELECT 1 FROM ops.founding_applications
 WHERE id=i AND "tokenHash"=h AND status='invited' AND "tokenExpiresAt">now())
$$;
ALTER FUNCTION app.founding_invitation_sendable(uuid,text) OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION app.founding_invitation_sendable(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.founding_invitation_sendable(uuid,text) TO atlas_runtime;

CREATE FUNCTION app.academic_identity_current(u text,d text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT (app.billing_operator() OR (app.is_active_actor() AND app.actor_id()=u)) AND
 EXISTS(SELECT 1 FROM identity.users WHERE id=u AND "emailVerified" AND split_part(lower(email),'@',2)=d) AND
 EXISTS(SELECT 1 FROM ops.academic_institutions WHERE domain=d AND active)
$$;
ALTER FUNCTION app.academic_identity_current(text,text) OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION app.academic_identity_current(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.academic_identity_current(text,text) TO atlas_runtime;

CREATE FUNCTION app.academic_owner(w uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT "personalOwnerId" FROM app.workspaces WHERE id=w AND app.billing_operator() AND kind='personal'
$$;
ALTER FUNCTION app.academic_owner(uuid) OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION app.academic_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.academic_owner(uuid) TO atlas_runtime;

CREATE FUNCTION app.billing_workspace_kind(w uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT kind FROM app.workspaces WHERE id=w AND app.billing_operator() AND "archivedAt" IS NULL
$$;
ALTER FUNCTION app.billing_workspace_kind(uuid) OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION app.billing_workspace_kind(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_workspace_kind(uuid) TO atlas_runtime;

CREATE FUNCTION app.billing_workspace_distribution() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_object_agg(source,n),'{}') FROM (
  SELECT app.billing_descriptor_unchecked(id)->>'source' source,count(*) n FROM app.workspaces
  WHERE "archivedAt" IS NULL AND app.billing_operator() GROUP BY 1
 ) stats
$$;
ALTER FUNCTION app.billing_workspace_distribution() OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION app.billing_workspace_distribution() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_workspace_distribution() TO atlas_runtime;

-- Reads, exports and existing project data remain accessible after a downgrade.
CREATE FUNCTION app.has_editing_capacity(w uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT current_setting('app.resources_enabled',true) IS DISTINCT FROM '1' OR EXISTS(
  SELECT 1 FROM app.workspaces WHERE id=w AND kind='personal'
 ) OR EXISTS (
  SELECT 1 FROM (
   SELECT wm."userId" FROM app.workspace_members wm
   WHERE wm."workspaceId"=w AND wm.active AND (wm.role IN ('owner','admin') OR EXISTS(
    SELECT 1 FROM app.project_members pm JOIN app.projects p ON p.id=pm."projectId"
    WHERE pm."workspaceId"=w AND pm."userId"=wm."userId" AND pm.active AND pm.role<>'viewer' AND p."deletedAt" IS NULL
   ))
   ORDER BY CASE wm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,wm."createdAt",wm."userId"
   LIMIT (app.billing_descriptor_unchecked(w)->>'seats')::integer
  ) eligible WHERE eligible."userId"=app.actor_id()
 )
$$;
ALTER FUNCTION app.has_editing_capacity(uuid) OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION app.has_editing_capacity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.has_editing_capacity(uuid) TO atlas_runtime,atlas_lifecycle;

CREATE OR REPLACE FUNCTION app.can_write_research(w uuid,p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT app.has_project_role(w,p,ARRAY['owner','admin','editor']) AND app.has_editing_capacity(w) AND
 EXISTS(SELECT 1 FROM app.projects p1 JOIN app.workspaces w1 ON w1.id=p1."workspaceId"
 WHERE p1."workspaceId"=w AND p1.id=p AND p1."archivedAt" IS NULL AND p1."deletedAt" IS NULL AND w1."archivedAt" IS NULL)
$$;

CREATE FUNCTION app.billing_academic_queue() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(filtered)),'[]'::jsonb)
 FROM (SELECT a."actorId",a."institutionDomain",a.status,a."expiresAt",a."requestedAt",
   u.name,u.email,coalesce(a."requestedAt">a."verifiedAt",false) AS "renewalPending"
 FROM app.academic_eligibility a JOIN identity.users u ON u.id=a."actorId"
 WHERE app.billing_operator() ORDER BY a."requestedAt" DESC LIMIT 80) filtered
$$;
ALTER FUNCTION app.billing_academic_queue() OWNER TO atlas_policy;
REVOKE ALL ON FUNCTION app.billing_academic_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.billing_academic_queue() TO atlas_runtime;

REVOKE CREATE ON SCHEMA app FROM atlas_policy;
UPDATE ops.schema_revision SET revision='202611230101_pricing_entitlements' WHERE id=1;
COMMIT;
