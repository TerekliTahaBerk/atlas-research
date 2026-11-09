-- CreateTable
CREATE TABLE "app"."projects" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."project_members" (
    "workspaceId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("workspaceId","projectId","userId")
);

-- CreateTable
CREATE TABLE "app"."invitations" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "originSessionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedBy" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."audit_events" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "projectId" UUID,
    "actorId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "targetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_workspaceId_id_key" ON "app"."projects"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_tokenHash_key" ON "app"."invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "invitations_workspaceId_projectId_email_idx" ON "app"."invitations"("workspaceId", "projectId", "email");

-- CreateIndex
CREATE INDEX "audit_events_workspaceId_projectId_createdAt_idx" ON "app"."audit_events"("workspaceId", "projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "app"."projects" ADD CONSTRAINT "projects_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "app"."workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."projects" ADD CONSTRAINT "projects_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."project_members" ADD CONSTRAINT "project_members_workspaceId_projectId_fkey" FOREIGN KEY ("workspaceId", "projectId") REFERENCES "app"."projects"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."project_members" ADD CONSTRAINT "project_members_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "app"."workspace_members"("workspaceId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."invitations" ADD CONSTRAINT "invitations_workspaceId_projectId_fkey" FOREIGN KEY ("workspaceId", "projectId") REFERENCES "app"."projects"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."invitations" ADD CONSTRAINT "invitations_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."invitations" ADD CONSTRAINT "invitations_acceptedBy_fkey" FOREIGN KEY ("acceptedBy") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Roles are provisioned separately; neither runtime connection can assume them.
GRANT USAGE ON SCHEMA app,identity TO atlas_lifecycle;
GRANT CREATE ON SCHEMA app TO atlas_policy,atlas_lifecycle;
GRANT SELECT ON app.projects,app.project_members,app.invitations TO atlas_policy;
GRANT SELECT("createdAt") ON identity.sessions TO atlas_policy;
GRANT SELECT(id,email) ON identity.users TO atlas_lifecycle;
GRANT SELECT ON app.workspaces,app.workspace_members,app.projects,app.project_members,app.invitations TO atlas_lifecycle;
GRANT INSERT,UPDATE ON app.workspace_members,app.project_members TO atlas_lifecycle;
GRANT UPDATE("acceptedAt","acceptedBy","revokedAt") ON app.invitations TO atlas_lifecycle;
GRANT INSERT ON app.audit_events TO atlas_lifecycle;
GRANT SELECT,INSERT,UPDATE ON app.projects,app.project_members,app.invitations TO atlas_runtime;
GRANT SELECT,INSERT ON app.audit_events TO atlas_runtime;
GRANT USAGE ON SCHEMA identity TO atlas_runtime;
GRANT INSERT ON identity.mail_outbox TO atlas_runtime;

ALTER TABLE app.project_members ADD CONSTRAINT project_member_role CHECK (role IN ('owner','admin','editor','viewer'));
ALTER TABLE app.invitations ADD CONSTRAINT invitation_role CHECK (role IN ('admin','editor','viewer'));
ALTER TABLE app.invitations ADD CONSTRAINT invitation_normalized CHECK (email=lower(btrim(email)) AND "tokenHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE app.audit_events ADD CONSTRAINT audit_workspace_fk FOREIGN KEY ("workspaceId") REFERENCES app.workspaces(id);
ALTER TABLE app.audit_events ADD CONSTRAINT audit_project_fk FOREIGN KEY ("workspaceId","projectId") REFERENCES app.projects("workspaceId",id);
ALTER TABLE app.audit_events ADD CONSTRAINT audit_actor_fk FOREIGN KEY ("actorId") REFERENCES identity.users(id);
CREATE UNIQUE INDEX pending_project_invite ON app.invitations("projectId",email) WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

CREATE FUNCTION app.has_workspace_role(w uuid, roles text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT app.is_active_actor() AND EXISTS(SELECT 1 FROM app.workspace_members WHERE "workspaceId"=w AND "userId"=app.actor_id() AND active AND role=ANY(roles)) $$;
CREATE FUNCTION app.has_project_role(w uuid,p uuid,roles text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT app.is_active_actor() AND app.is_workspace_member(w) AND EXISTS(SELECT 1 FROM app.project_members WHERE "workspaceId"=w AND "projectId"=p AND "userId"=app.actor_id() AND active AND role=ANY(roles)) $$;
CREATE FUNCTION app.fresh_actor() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT app.is_active_actor() AND EXISTS(SELECT 1 FROM identity.sessions WHERE id=nullif(current_setting('app.session_id',true),'') AND "userId"=app.actor_id() AND "createdAt">now()-interval '5 minutes') $$;
CREATE FUNCTION app.bootstrap_workspace(w uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT EXISTS(SELECT 1 FROM app.workspaces WHERE id=w AND "createdBy"=app.actor_id()) AND NOT EXISTS(SELECT 1 FROM app.workspace_members WHERE "workspaceId"=w) $$;
CREATE FUNCTION app.bootstrap_project(w uuid,p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT app.is_workspace_member(w) AND EXISTS(SELECT 1 FROM app.projects WHERE id=p AND "workspaceId"=w AND "createdBy"=app.actor_id()) AND NOT EXISTS(SELECT 1 FROM app.project_members WHERE "projectId"=p) $$;
CREATE FUNCTION app.can_manage_member(w uuid,p uuid,u text,proposed text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT app.has_project_role(w,p,ARRAY['owner']) OR (app.has_project_role(w,p,ARRAY['admin']) AND proposed=ANY(ARRAY['editor','viewer']) AND EXISTS(SELECT 1 FROM app.project_members WHERE "workspaceId"=w AND "projectId"=p AND "userId"=u AND role=ANY(ARRAY['editor','viewer']))) $$;
CREATE FUNCTION app.can_invite(w uuid,p uuid,r text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT EXISTS(SELECT 1 FROM app.projects p1 JOIN app.workspaces w1 ON w1.id=p1."workspaceId" WHERE p1.id=p AND p1."workspaceId"=w AND p1."archivedAt" IS NULL AND p1."deletedAt" IS NULL AND w1.kind='shared' AND w1."archivedAt" IS NULL)
 AND (app.has_project_role(w,p,ARRAY['owner']) OR (r=ANY(ARRAY['editor','viewer']) AND app.has_project_role(w,p,ARRAY['admin']))) $$;

ALTER FUNCTION app.has_workspace_role(uuid,text[]) OWNER TO atlas_policy;
ALTER FUNCTION app.has_project_role(uuid,uuid,text[]) OWNER TO atlas_policy;
ALTER FUNCTION app.fresh_actor() OWNER TO atlas_policy;
ALTER FUNCTION app.bootstrap_workspace(uuid) OWNER TO atlas_policy;
ALTER FUNCTION app.bootstrap_project(uuid,uuid) OWNER TO atlas_policy;
ALTER FUNCTION app.can_manage_member(uuid,uuid,text,text) OWNER TO atlas_policy;
ALTER FUNCTION app.can_invite(uuid,uuid,text) OWNER TO atlas_policy;

DROP POLICY personal_create ON app.workspaces;
DROP POLICY personal_first_owner ON app.workspace_members;
DROP POLICY membership_read ON app.workspace_members;
CREATE POLICY workspace_create ON app.workspaces FOR INSERT TO atlas_runtime WITH CHECK (app.is_active_actor() AND "createdBy"=app.actor_id() AND ((kind='personal' AND "personalOwnerId"=app.actor_id()) OR (kind='shared' AND "personalOwnerId" IS NULL)));
CREATE POLICY workspace_update ON app.workspaces FOR UPDATE TO atlas_runtime USING (app.has_workspace_role(id,ARRAY['owner','admin'])) WITH CHECK (app.has_workspace_role(id,ARRAY['owner','admin']));
CREATE POLICY membership_read ON app.workspace_members FOR SELECT TO atlas_runtime USING (app.is_active_actor() AND (("userId"=app.actor_id() AND active) OR app.has_workspace_role("workspaceId",ARRAY['owner','admin'])));
CREATE POLICY first_workspace_owner ON app.workspace_members FOR INSERT TO atlas_runtime WITH CHECK (app.is_active_actor() AND "userId"=app.actor_id() AND role='owner' AND active AND app.bootstrap_workspace("workspaceId"));
CREATE POLICY workspace_member_update ON app.workspace_members FOR UPDATE TO atlas_runtime USING (app.has_workspace_role("workspaceId",ARRAY['owner']) OR (role='member' AND app.has_workspace_role("workspaceId",ARRAY['admin']))) WITH CHECK (active AND (app.has_workspace_role("workspaceId",ARRAY['owner']) OR (role='member' AND app.has_workspace_role("workspaceId",ARRAY['admin']))));

ALTER TABLE app.projects ENABLE ROW LEVEL SECURITY; ALTER TABLE app.projects FORCE ROW LEVEL SECURITY;
ALTER TABLE app.project_members ENABLE ROW LEVEL SECURITY; ALTER TABLE app.project_members FORCE ROW LEVEL SECURITY;
ALTER TABLE app.invitations ENABLE ROW LEVEL SECURITY; ALTER TABLE app.invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE app.audit_events ENABLE ROW LEVEL SECURITY; ALTER TABLE app.audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY project_read ON app.projects FOR SELECT TO atlas_runtime USING (app.has_project_role("workspaceId",id,ARRAY['owner','admin','editor','viewer']) AND ("deletedAt" IS NULL OR app.has_project_role("workspaceId",id,ARRAY['owner'])));
CREATE POLICY project_create ON app.projects FOR INSERT TO atlas_runtime WITH CHECK (app.is_active_actor() AND "createdBy"=app.actor_id() AND app.is_workspace_member("workspaceId") AND EXISTS(SELECT 1 FROM app.workspaces WHERE id="workspaceId" AND "archivedAt" IS NULL));
CREATE POLICY project_update ON app.projects FOR UPDATE TO atlas_runtime USING (app.has_project_role("workspaceId",id,ARRAY['owner','admin'])) WITH CHECK (app.has_project_role("workspaceId",id,ARRAY['owner','admin']));
CREATE POLICY project_members_read ON app.project_members FOR SELECT TO atlas_runtime USING (app.has_project_role("workspaceId","projectId",ARRAY['owner','admin','editor','viewer']));
CREATE POLICY first_project_owner ON app.project_members FOR INSERT TO atlas_runtime WITH CHECK (app.is_active_actor() AND "userId"=app.actor_id() AND role='owner' AND active AND app.bootstrap_project("workspaceId","projectId"));
CREATE POLICY project_members_update ON app.project_members FOR UPDATE TO atlas_runtime USING (app.can_manage_member("workspaceId","projectId","userId",role)) WITH CHECK (app.can_manage_member("workspaceId","projectId","userId",role));
CREATE POLICY invitations_read ON app.invitations FOR SELECT TO atlas_runtime USING (app.has_project_role("workspaceId","projectId",ARRAY['owner','admin']));
CREATE POLICY invitations_create ON app.invitations FOR INSERT TO atlas_runtime WITH CHECK (app.can_invite("workspaceId","projectId",role) AND "acceptedAt" IS NULL AND "acceptedBy" IS NULL AND "revokedAt" IS NULL AND "createdBy"=app.actor_id() AND "originSessionId"=current_setting('app.session_id',true) AND "expiresAt">now() AND "expiresAt"<=now()+interval '7 days');
CREATE POLICY invitations_revoke ON app.invitations FOR UPDATE TO atlas_runtime USING (app.has_project_role("workspaceId","projectId",ARRAY['owner']) OR (role IN ('editor','viewer') AND app.has_project_role("workspaceId","projectId",ARRAY['admin']))) WITH CHECK (app.has_project_role("workspaceId","projectId",ARRAY['owner']) OR (role IN ('editor','viewer') AND app.has_project_role("workspaceId","projectId",ARRAY['admin'])));
CREATE POLICY audit_read ON app.audit_events FOR SELECT TO atlas_runtime USING (("projectId" IS NULL AND app.has_workspace_role("workspaceId",ARRAY['owner','admin'])) OR app.has_project_role("workspaceId","projectId",ARRAY['owner','admin']));
CREATE POLICY audit_create ON app.audit_events FOR INSERT TO atlas_runtime WITH CHECK (app.is_active_actor() AND "actorId"=app.actor_id() AND (("projectId" IS NULL AND app.is_workspace_member("workspaceId")) OR app.has_project_role("workspaceId","projectId",ARRAY['owner','admin','editor','viewer'])));

CREATE FUNCTION app.guard_workspace() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF (NEW.id,NEW.kind,NEW."personalOwnerId",NEW."createdBy") IS DISTINCT FROM (OLD.id,OLD.kind,OLD."personalOwnerId",OLD."createdBy") THEN RAISE EXCEPTION 'immutable_scope' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION app.guard_project() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF (NEW.id,NEW."workspaceId",NEW."createdBy") IS DISTINCT FROM (OLD.id,OLD."workspaceId",OLD."createdBy") THEN RAISE EXCEPTION 'immutable_scope' USING ERRCODE='23514'; END IF;
 IF NEW."deletedAt" IS DISTINCT FROM OLD."deletedAt" AND NOT app.has_project_role(OLD."workspaceId",OLD.id,ARRAY['owner']) THEN RAISE EXCEPTION 'unavailable' USING ERRCODE='42501'; END IF;
 IF OLD."deletedAt" IS NOT NULL AND NEW."deletedAt" IS NULL AND OLD."deletedAt"<now()-interval '30 days' THEN RAISE EXCEPTION 'restore_expired' USING ERRCODE='23514'; END IF;
 IF (NEW.name,NEW.description) IS DISTINCT FROM (OLD.name,OLD.description) AND (OLD."archivedAt" IS NOT NULL OR EXISTS(SELECT 1 FROM app.workspaces WHERE id=OLD."workspaceId" AND "archivedAt" IS NOT NULL)) THEN RAISE EXCEPTION 'archived' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION app.guard_membership() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE private_owner boolean;
BEGIN
 IF TG_TABLE_NAME='workspace_members' THEN
  IF (NEW."workspaceId",NEW."userId") IS DISTINCT FROM (OLD."workspaceId",OLD."userId") THEN RAISE EXCEPTION 'immutable_scope' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM app.workspaces WHERE id=OLD."workspaceId" FOR UPDATE;
  IF EXISTS(SELECT 1 FROM app.workspaces WHERE id=OLD."workspaceId" AND kind='personal') AND (NOT NEW.active OR NEW.role<>'owner') THEN RAISE EXCEPTION 'personal_owner' USING ERRCODE='23514'; END IF;
  IF OLD.active AND OLD.role='owner' AND (NOT NEW.active OR NEW.role<>'owner') AND NOT EXISTS(SELECT 1 FROM app.workspace_members WHERE "workspaceId"=OLD."workspaceId" AND "userId"<>OLD."userId" AND active AND role='owner') THEN RAISE EXCEPTION 'last_owner' USING ERRCODE='23514'; END IF;
 ELSE
  IF (NEW."workspaceId",NEW."projectId",NEW."userId") IS DISTINCT FROM (OLD."workspaceId",OLD."projectId",OLD."userId") THEN RAISE EXCEPTION 'immutable_scope' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM app.projects WHERE id=OLD."projectId" AND "workspaceId"=OLD."workspaceId" FOR UPDATE;
  IF OLD.active AND OLD.role='owner' AND (NOT NEW.active OR NEW.role<>'owner') AND NOT EXISTS(SELECT 1 FROM app.project_members m JOIN app.workspace_members w ON (w."workspaceId",w."userId")=(m."workspaceId",m."userId") WHERE m."projectId"=OLD."projectId" AND m."userId"<>OLD."userId" AND m.active AND w.active AND m.role='owner') THEN RAISE EXCEPTION 'last_owner' USING ERRCODE='23514'; END IF;
 END IF;
 IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.active IS DISTINCT FROM OLD.active) AND ((NEW.active AND NEW.role='owner') OR (OLD.active AND OLD.role='owner')) AND NOT app.fresh_actor() THEN RAISE EXCEPTION 'fresh_identity_required' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION app.guard_invitation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF (NEW.id,NEW."workspaceId",NEW."projectId",NEW.email,NEW.role,NEW."tokenHash",NEW."createdBy",NEW."originSessionId",NEW."expiresAt") IS DISTINCT FROM (OLD.id,OLD."workspaceId",OLD."projectId",OLD.email,OLD.role,OLD."tokenHash",OLD."createdBy",OLD."originSessionId",OLD."expiresAt") THEN RAISE EXCEPTION 'immutable_invitation' USING ERRCODE='23514'; END IF;
 IF OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS NULL THEN RAISE EXCEPTION 'revocation_final' USING ERRCODE='23514'; END IF;
 IF (NEW."acceptedAt",NEW."acceptedBy") IS DISTINCT FROM (OLD."acceptedAt",OLD."acceptedBy") AND current_user<>'atlas_lifecycle' THEN RAISE EXCEPTION 'use_invitation_accept' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_workspace() OWNER TO atlas_policy;
ALTER FUNCTION app.guard_project() OWNER TO atlas_policy;
ALTER FUNCTION app.guard_membership() OWNER TO atlas_policy;
CREATE TRIGGER immutable_workspace BEFORE UPDATE ON app.workspaces FOR EACH ROW EXECUTE FUNCTION app.guard_workspace();
CREATE TRIGGER immutable_project BEFORE UPDATE ON app.projects FOR EACH ROW EXECUTE FUNCTION app.guard_project();
CREATE TRIGGER valid_workspace_member BEFORE UPDATE ON app.workspace_members FOR EACH ROW EXECUTE FUNCTION app.guard_membership();
CREATE TRIGGER valid_project_member BEFORE UPDATE ON app.project_members FOR EACH ROW EXECUTE FUNCTION app.guard_membership();
CREATE TRIGGER immutable_invitation BEFORE UPDATE ON app.invitations FOR EACH ROW EXECUTE FUNCTION app.guard_invitation();

GRANT UPDATE(id) ON app.workspaces,app.projects TO atlas_policy;
GRANT UPDATE ON app.workspace_members,app.project_members TO atlas_lifecycle;
GRANT UPDATE(id) ON app.workspaces,app.projects TO atlas_lifecycle;

-- Row locks require UPDATE policy visibility in PostgreSQL. Readers instead use
-- narrow boolean helpers; no row data or caller-supplied identity is returned.
CREATE FUNCTION app.lock_workspace(w uuid,exclusive boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT app.is_active_actor() OR NOT app.is_workspace_member(w) THEN RETURN false; END IF;
 IF exclusive THEN
  IF NOT app.has_workspace_role(w,ARRAY['owner','admin']) THEN RETURN false; END IF;
  PERFORM 1 FROM app.workspaces WHERE id=w FOR UPDATE;
 ELSE PERFORM 1 FROM app.workspaces WHERE id=w FOR SHARE;
 END IF;
 RETURN app.is_active_actor() AND app.is_workspace_member(w);
END $$;
CREATE FUNCTION app.lock_project(w uuid,p uuid,exclusive boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT app.lock_workspace(w,false) OR NOT app.has_project_role(w,p,ARRAY['owner','admin','editor','viewer']) THEN RETURN false; END IF;
 IF exclusive THEN
  IF NOT app.has_project_role(w,p,ARRAY['owner','admin']) THEN RETURN false; END IF;
  PERFORM 1 FROM app.projects WHERE id=p AND "workspaceId"=w FOR UPDATE;
 ELSE PERFORM 1 FROM app.projects WHERE id=p AND "workspaceId"=w FOR SHARE;
 END IF;
 RETURN app.has_project_role(w,p,ARRAY['owner','admin','editor','viewer']);
END $$;
ALTER FUNCTION app.lock_workspace(uuid,boolean) OWNER TO atlas_policy;
ALTER FUNCTION app.lock_project(uuid,uuid,boolean) OWNER TO atlas_policy;

-- Narrow lifecycle functions: no caller-supplied actor; context and recipient come from DB.
CREATE FUNCTION app.invitation_preview(h text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',i.id,'projectName',p.name,'workspaceName',w.name,'role',i.role,'expiresAt',i."expiresAt",'accepted',i."acceptedAt" IS NOT NULL)
 FROM app.invitations i JOIN app.projects p ON (p."workspaceId",p.id)=(i."workspaceId",i."projectId") JOIN app.workspaces w ON w.id=i."workspaceId"
 WHERE app.is_active_actor() AND i."tokenHash"=h AND i.email=(SELECT lower(email) FROM identity.users WHERE id=app.actor_id())
 AND i."revokedAt" IS NULL AND i."expiresAt">now() AND p."archivedAt" IS NULL AND p."deletedAt" IS NULL AND w."archivedAt" IS NULL
 AND (i."acceptedAt" IS NULL OR (i."acceptedBy"=app.actor_id() AND app.has_project_role(i."workspaceId",i."projectId",ARRAY['owner','admin','editor','viewer'])))
$$;
CREATE FUNCTION app.accept_invitation(h text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE inv app.invitations%ROWTYPE; issuer_role text; old_role text; target_active boolean;
BEGIN
 IF NOT app.is_active_actor() THEN RAISE EXCEPTION 'unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO inv FROM app.invitations WHERE "tokenHash"=h;
 IF NOT FOUND THEN RAISE EXCEPTION 'unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.workspaces WHERE id=inv."workspaceId" AND kind='shared' AND "archivedAt" IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.projects WHERE id=inv."projectId" AND "workspaceId"=inv."workspaceId" AND "archivedAt" IS NULL AND "deletedAt" IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO inv FROM app.invitations WHERE id=inv.id FOR UPDATE;
 IF inv.email IS DISTINCT FROM (SELECT lower(email) FROM identity.users WHERE id=app.actor_id()) OR inv."revokedAt" IS NOT NULL OR inv."expiresAt"<=now() THEN RAISE EXCEPTION 'unavailable' USING ERRCODE='42501'; END IF;
 IF inv."acceptedAt" IS NOT NULL THEN
  IF inv."acceptedBy"=app.actor_id() AND app.has_project_role(inv."workspaceId",inv."projectId",ARRAY['owner','admin','editor','viewer']) THEN RETURN inv."projectId"; END IF;
  RAISE EXCEPTION 'unavailable' USING ERRCODE='42501';
 END IF;
 SELECT p.role INTO issuer_role FROM app.project_members p JOIN app.workspace_members w ON (w."workspaceId",w."userId")=(p."workspaceId",p."userId")
 WHERE p."workspaceId"=inv."workspaceId" AND p."projectId"=inv."projectId" AND p."userId"=inv."createdBy" AND p.active AND w.active;
 IF issuer_role IS NULL OR NOT (issuer_role='owner' OR (issuer_role='admin' AND inv.role IN ('editor','viewer'))) THEN RAISE EXCEPTION 'unavailable' USING ERRCODE='42501'; END IF;
 SELECT active INTO target_active FROM app.workspace_members WHERE "workspaceId"=inv."workspaceId" AND "userId"=app.actor_id();
 IF FOUND AND NOT target_active THEN RAISE EXCEPTION 'unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO app.workspace_members("workspaceId","userId",role,active,"createdAt") VALUES(inv."workspaceId",app.actor_id(),'member',true,now()) ON CONFLICT DO NOTHING;
 SELECT role INTO old_role FROM app.project_members WHERE "workspaceId"=inv."workspaceId" AND "projectId"=inv."projectId" AND "userId"=app.actor_id();
 IF old_role IN ('owner','admin') AND issuer_role<>'owner' THEN RAISE EXCEPTION 'unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO app.project_members("workspaceId","projectId","userId",role,active,"createdAt") VALUES(inv."workspaceId",inv."projectId",app.actor_id(),inv.role,true,now())
 ON CONFLICT ("workspaceId","projectId","userId") DO UPDATE SET role=excluded.role,active=true;
 UPDATE app.invitations SET "acceptedAt"=now(),"acceptedBy"=app.actor_id() WHERE id=inv.id;
 INSERT INTO app.audit_events(id,"workspaceId","projectId","actorId",event,"targetId","createdAt") VALUES(gen_random_uuid(),inv."workspaceId",inv."projectId",app.actor_id(),'invitation_accepted',inv.id::text,now());
 RETURN inv."projectId";
END $$;
CREATE FUNCTION app.revoke_workspace_member(w uuid,u text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target_role text;
BEGIN
 IF NOT app.is_active_actor() THEN RAISE EXCEPTION 'unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.workspaces WHERE id=w AND kind='shared' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unavailable' USING ERRCODE='42501'; END IF;
 SELECT role INTO target_role FROM app.workspace_members WHERE "workspaceId"=w AND "userId"=u AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unavailable' USING ERRCODE='42501'; END IF;
 IF NOT (u=app.actor_id() OR app.has_workspace_role(w,ARRAY['owner']) OR (target_role='member' AND app.has_workspace_role(w,ARRAY['admin']))) THEN RAISE EXCEPTION 'unavailable' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM app.project_members m WHERE m."workspaceId"=w AND m."userId"=u AND m.role='owner' AND m.active
   AND NOT EXISTS(SELECT 1 FROM app.project_members m2 JOIN app.workspace_members w2 ON (w2."workspaceId",w2."userId")=(m2."workspaceId",m2."userId") WHERE m2."projectId"=m."projectId" AND m2."userId"<>u AND m2.role='owner' AND m2.active AND w2.active)) THEN RAISE EXCEPTION 'ownership_transfer_required' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM app.projects WHERE "workspaceId"=w ORDER BY id FOR UPDATE;
 INSERT INTO app.audit_events(id,"workspaceId","actorId",event,"targetId","createdAt") VALUES(gen_random_uuid(),w,app.actor_id(),'workspace_member_revoked',u,now());
 UPDATE app.project_members SET active=false WHERE "workspaceId"=w AND "userId"=u AND active;
 UPDATE app.workspace_members SET active=false WHERE "workspaceId"=w AND "userId"=u;
END $$;
ALTER FUNCTION app.invitation_preview(text) OWNER TO atlas_lifecycle;
ALTER FUNCTION app.accept_invitation(text) OWNER TO atlas_lifecycle;
ALTER FUNCTION app.revoke_workspace_member(uuid,text) OWNER TO atlas_lifecycle;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.actor_id(),app.is_active_actor(),app.is_workspace_member(uuid),app.can_bootstrap_personal(uuid),app.has_workspace_role(uuid,text[]),app.has_project_role(uuid,uuid,text[]),app.fresh_actor(),app.bootstrap_workspace(uuid),app.bootstrap_project(uuid,uuid),app.can_manage_member(uuid,uuid,text,text),app.can_invite(uuid,uuid,text) TO atlas_runtime,atlas_lifecycle;
GRANT EXECUTE ON FUNCTION app.invitation_preview(text),app.accept_invitation(text),app.revoke_workspace_member(uuid,text) TO atlas_runtime;
GRANT EXECUTE ON FUNCTION app.lock_workspace(uuid,boolean),app.lock_project(uuid,uuid,boolean) TO atlas_runtime;
REVOKE CREATE ON SCHEMA app FROM atlas_policy,atlas_lifecycle;
