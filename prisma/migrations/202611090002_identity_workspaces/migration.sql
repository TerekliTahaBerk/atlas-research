-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app";

-- CreateTable
CREATE TABLE "identity"."mail_outbox" (
    "id" UUID NOT NULL,
    "payload" TEXT,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."workspaces" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "personalOwnerId" TEXT,
    "createdBy" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."workspace_members" (
    "workspaceId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("workspaceId","userId")
);

-- CreateIndex
CREATE INDEX "mail_outbox_state_nextAttemptAt_idx" ON "identity"."mail_outbox"("state", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_personalOwnerId_key" ON "app"."workspaces"("personalOwnerId");

-- AddForeignKey
ALTER TABLE "app"."workspaces" ADD CONSTRAINT "workspaces_personalOwnerId_fkey" FOREIGN KEY ("personalOwnerId") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."workspaces" ADD CONSTRAINT "workspaces_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."workspace_members" ADD CONSTRAINT "workspace_members_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "app"."workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."workspace_members" ADD CONSTRAINT "workspace_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Explicit identity/content boundary. Only the migration role may own schema objects.
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO atlas_runtime, atlas_policy;
GRANT CREATE ON SCHEMA app TO atlas_policy;
GRANT USAGE ON SCHEMA identity TO atlas_policy;
GRANT SELECT(id,"emailVerified") ON identity.users TO atlas_policy;
GRANT SELECT(id,"userId","expiresAt") ON identity.sessions TO atlas_policy;
GRANT SELECT ON app.workspaces,app.workspace_members TO atlas_policy;
GRANT SELECT,INSERT,UPDATE,DELETE ON app.workspaces,app.workspace_members TO atlas_runtime;

ALTER TABLE app.workspaces ADD CONSTRAINT workspace_kind CHECK (kind IN ('personal','shared'));
ALTER TABLE app.workspaces ADD CONSTRAINT personal_owner_required CHECK ((kind='personal')=("personalOwnerId" IS NOT NULL));
ALTER TABLE app.workspace_members ADD CONSTRAINT workspace_member_role CHECK (role IN ('owner','admin','member'));

CREATE FUNCTION app.actor_id() RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog
AS $$ SELECT nullif(current_setting('app.user_id',true),'') $$;
CREATE FUNCTION app.is_active_actor() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT EXISTS(SELECT 1 FROM identity.users u JOIN identity.sessions s ON s."userId"=u.id
 WHERE u.id=app.actor_id() AND u."emailVerified" AND s.id=nullif(current_setting('app.session_id',true),'') AND s."expiresAt">now()) $$;
CREATE FUNCTION app.is_workspace_member(w uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT EXISTS(SELECT 1 FROM app.workspace_members m WHERE m."workspaceId"=w AND m."userId"=app.actor_id() AND m.active) $$;
CREATE FUNCTION app.can_bootstrap_personal(w uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT EXISTS(SELECT 1 FROM app.workspaces WHERE id=w AND kind='personal' AND "personalOwnerId"=app.actor_id() AND "createdBy"=app.actor_id()) $$;

ALTER FUNCTION app.actor_id() OWNER TO atlas_policy;
ALTER FUNCTION app.is_active_actor() OWNER TO atlas_policy;
ALTER FUNCTION app.is_workspace_member(uuid) OWNER TO atlas_policy;
ALTER FUNCTION app.can_bootstrap_personal(uuid) OWNER TO atlas_policy;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.actor_id(),app.is_active_actor(),app.is_workspace_member(uuid),app.can_bootstrap_personal(uuid) TO atlas_runtime;
REVOKE CREATE ON SCHEMA app FROM atlas_policy;

ALTER TABLE app.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE app.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workspace_members FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_read ON app.workspaces FOR SELECT TO atlas_runtime USING (app.is_active_actor() AND app.is_workspace_member(id));
CREATE POLICY personal_create ON app.workspaces FOR INSERT TO atlas_runtime WITH CHECK (app.is_active_actor() AND kind='personal' AND "personalOwnerId"=app.actor_id() AND "createdBy"=app.actor_id());
CREATE POLICY membership_read ON app.workspace_members FOR SELECT TO atlas_runtime USING (app.is_active_actor() AND "userId"=app.actor_id() AND active);
CREATE POLICY personal_first_owner ON app.workspace_members FOR INSERT TO atlas_runtime WITH CHECK (app.is_active_actor() AND "userId"=app.actor_id() AND role='owner' AND active AND app.can_bootstrap_personal("workspaceId"));
