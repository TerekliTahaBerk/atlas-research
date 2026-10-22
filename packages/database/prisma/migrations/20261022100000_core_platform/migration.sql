-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "avatar_reference" VARCHAR(500),
ADD COLUMN     "onboarding_completed_at" TIMESTAMPTZ(3),
ADD COLUMN     "research_interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "research_role" VARCHAR(120);

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "personal_owner_id" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "organization_memberships" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "personal_owner_id" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "workspace_memberships" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "created_by_id" UUID,
ADD COLUMN     "creation_key" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "project_memberships" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "scope" VARCHAR(20) NOT NULL,
    "role" VARCHAR(10) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "inviter_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "resource_id" UUID,
    "request_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_buckets" (
    "key" VARCHAR(128) NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_buckets_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_organization_id_created_at_id_idx" ON "invitations"("organization_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "audit_events_organization_id_created_at_id_idx" ON "audit_events"("organization_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "rate_buckets_expires_at_idx" ON "rate_buckets"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_personal_owner_id_key" ON "organizations"("personal_owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_personal_owner_id_key" ON "workspaces"("personal_owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_created_by_id_creation_key_key" ON "projects"("created_by_id", "creation_key");


-- Additional relational invariants not expressible by Prisma.
ALTER TABLE organizations ADD CONSTRAINT personal_owner_fk FOREIGN KEY (personal_owner_id) REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE organizations ADD CONSTRAINT personal_owner_kind CHECK (personal_owner_id IS NULL OR personal);
ALTER TABLE workspaces ADD CONSTRAINT personal_workspace_owner_fk FOREIGN KEY (personal_owner_id) REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE projects ADD CONSTRAINT project_creator_fk FOREIGN KEY (created_by_id) REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE invitations ADD CONSTRAINT invitation_org_fk FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE invitations ADD CONSTRAINT invitation_workspace_fk FOREIGN KEY (organization_id,workspace_id) REFERENCES workspaces(organization_id,id) ON DELETE RESTRICT;
ALTER TABLE invitations ADD CONSTRAINT invitation_project_fk FOREIGN KEY (organization_id,workspace_id,project_id) REFERENCES projects(organization_id,workspace_id,id) ON DELETE RESTRICT;
ALTER TABLE invitations ADD CONSTRAINT invitation_inviter_fk FOREIGN KEY (inviter_id) REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE invitations ADD CONSTRAINT invitation_scope_check CHECK (
 (scope='organization' AND workspace_id IS NULL AND project_id IS NULL AND role IN ('ADMIN','MEMBER')) OR
 (scope='workspace' AND workspace_id IS NOT NULL AND project_id IS NULL AND role IN ('ADMIN','MEMBER','VIEWER')) OR
 (scope='project' AND workspace_id IS NOT NULL AND project_id IS NOT NULL AND role IN ('OWNER','EDITOR','VIEWER'))
);
ALTER TABLE invitations ADD CONSTRAINT invitation_hash_check CHECK (token_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE profiles ADD CONSTRAINT profile_interests_bound CHECK (cardinality(research_interests)<=20);
-- Portable local migrations; on Supabase bind to the actual identity table.
DO $$ BEGIN
 IF to_regclass('auth.users') IS NOT NULL THEN
  ALTER TABLE public.profiles ADD CONSTRAINT profile_auth_identity_fk FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE RESTRICT;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='atlas_runtime') THEN
  CREATE ROLE atlas_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
END $$;
CREATE SCHEMA atlas_private;
REVOKE ALL ON SCHEMA atlas_private FROM PUBLIC;
GRANT USAGE ON SCHEMA atlas_private, public TO atlas_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

CREATE FUNCTION atlas_private.actor() RETURNS uuid LANGUAGE sql STABLE
 SET search_path=pg_catalog AS $$ SELECT nullif(current_setting('atlas.actor_id',true),'')::uuid $$;

-- Definer helpers read memberships without recursively invoking their RLS.
CREATE FUNCTION atlas_private.allowed(a uuid, kind text, target uuid, capability text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE org uuid; ws uuid; pr projects%ROWTYPE; orgrole text; wsrole text; prrole text; gone boolean;
BEGIN
 IF a IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=a AND deleted_at IS NULL) THEN RETURN false; END IF;
 IF kind='organization' THEN
  SELECT id,deleted_at IS NOT NULL INTO org,gone FROM organizations WHERE id=target;
 ELSIF kind='workspace' THEN
  SELECT organization_id,id,deleted_at IS NOT NULL INTO org,ws,gone FROM workspaces WHERE id=target;
 ELSIF kind='project' THEN
  SELECT * INTO pr FROM projects WHERE id=target;
  org:=pr.organization_id; ws:=pr.workspace_id; gone:=pr.deleted_at IS NOT NULL;
 ELSE RETURN false; END IF;
 IF org IS NULL OR NOT EXISTS(SELECT 1 FROM organizations WHERE id=org AND deleted_at IS NULL) THEN RETURN false; END IF;
 SELECT role::text INTO orgrole FROM organization_memberships WHERE organization_id=org AND profile_id=a;
 IF orgrole IS NULL THEN RETURN false; END IF;
 IF kind='organization' THEN
  IF gone THEN RETURN false; END IF;
  RETURN CASE capability
   WHEN 'organization.read' THEN true
   WHEN 'organization.update' THEN orgrole IN ('OWNER','ADMIN')
   WHEN 'organization.members.manage' THEN orgrole IN ('OWNER','ADMIN')
   WHEN 'organization.archive' THEN orgrole='OWNER' AND NOT EXISTS(SELECT 1 FROM organizations WHERE id=org AND personal)
   WHEN 'workspace.create' THEN orgrole IN ('OWNER','ADMIN')
   ELSE false END;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM workspaces WHERE id=ws AND organization_id=org AND deleted_at IS NULL) THEN RETURN false; END IF;
 SELECT role::text INTO wsrole FROM workspace_memberships WHERE workspace_id=ws AND profile_id=a AND organization_id=org;
 IF kind='workspace' THEN
  RETURN CASE capability
   WHEN 'workspace.read' THEN wsrole IS NOT NULL OR orgrole IN ('OWNER','ADMIN')
   WHEN 'workspace.update' THEN wsrole='ADMIN' OR orgrole IN ('OWNER','ADMIN')
   WHEN 'workspace.members.manage' THEN wsrole='ADMIN' OR orgrole IN ('OWNER','ADMIN')
   WHEN 'workspace.archive' THEN (wsrole='ADMIN' OR orgrole IN ('OWNER','ADMIN')) AND NOT EXISTS(SELECT 1 FROM workspaces WHERE id=ws AND personal_owner_id IS NOT NULL)
   WHEN 'project.create' THEN wsrole IN ('ADMIN','MEMBER')
   ELSE false END;
 END IF;
 IF wsrole IS NULL THEN RETURN false; END IF;
 SELECT role::text INTO prrole FROM project_memberships WHERE project_id=target AND profile_id=a AND organization_id=org AND workspace_id=ws;
 IF capability='project.restore' THEN RETURN gone AND prrole='OWNER'; END IF;
 IF gone THEN RETURN false; END IF;
 RETURN CASE capability
  WHEN 'project.read' THEN prrole IS NOT NULL OR pr.visibility='WORKSPACE'
  WHEN 'project.write' THEN prrole IN ('OWNER','EDITOR')
  WHEN 'project.update' THEN prrole='OWNER'
  WHEN 'project.members.manage' THEN prrole='OWNER'
  WHEN 'project.archive' THEN prrole='OWNER'
  ELSE false END;
END $$;
CREATE FUNCTION atlas_private.can(kind text,target uuid,capability text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(atlas_private.allowed(atlas_private.actor(),kind,target,capability),false)
$$;
CREATE FUNCTION atlas_private.capabilities(kind text,target uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(array_agg(c),ARRAY[]::text[]) FROM unnest(ARRAY[
 'organization.read','organization.update','organization.members.manage','organization.archive','workspace.create',
 'workspace.read','workspace.update','workspace.members.manage','workspace.archive','project.create',
 'project.read','project.write','project.update','project.members.manage','project.archive','project.restore']) c
 WHERE atlas_private.can(kind,target,c)
$$;

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_buckets ENABLE ROW LEVEL SECURITY;
-- Runtime is read-only outside the bounded mutation function; no raw write grants.
GRANT SELECT ON profiles,organizations,organization_memberships,workspaces,workspace_memberships,projects,project_memberships,invitations,audit_events TO atlas_runtime;
CREATE POLICY profile_self ON profiles FOR SELECT TO atlas_runtime USING (id=(SELECT atlas_private.actor()) AND deleted_at IS NULL);
CREATE POLICY organization_read ON organizations FOR SELECT TO atlas_runtime USING (atlas_private.can('organization',id,'organization.read'));
CREATE POLICY organization_members_read ON organization_memberships FOR SELECT TO atlas_runtime USING (atlas_private.can('organization',organization_id,'organization.read'));
CREATE POLICY workspace_read ON workspaces FOR SELECT TO atlas_runtime USING (atlas_private.can('workspace',id,'workspace.read'));
CREATE POLICY workspace_members_read ON workspace_memberships FOR SELECT TO atlas_runtime USING (atlas_private.can('workspace',workspace_id,'workspace.read'));
CREATE POLICY project_read ON projects FOR SELECT TO atlas_runtime USING (atlas_private.can('project',id,'project.read') OR atlas_private.can('project',id,'project.restore'));
CREATE POLICY project_members_read ON project_memberships FOR SELECT TO atlas_runtime USING (atlas_private.can('project',project_id,'project.read'));
CREATE POLICY invitations_manage ON invitations FOR SELECT TO atlas_runtime USING (atlas_private.can(scope,coalesce(project_id,workspace_id,organization_id),scope||'.members.manage'));
CREATE POLICY audit_read ON audit_events FOR SELECT TO atlas_runtime USING (actor_id=(SELECT atlas_private.actor()));
-- Explicit deny policies retain default-deny even if someone accidentally grants DML.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['profiles','organizations','organization_memberships','workspaces','workspace_memberships','projects','project_memberships','invitations','audit_events','rate_buckets'] LOOP
  EXECUTE format('CREATE POLICY deny_insert ON public.%I FOR INSERT TO atlas_runtime WITH CHECK (false)',t);
  EXECUTE format('CREATE POLICY deny_update ON public.%I FOR UPDATE TO atlas_runtime USING (false) WITH CHECK (false)',t);
  EXECUTE format('CREATE POLICY deny_delete ON public.%I FOR DELETE TO atlas_runtime USING (false)',t);
 END LOOP;
END $$;

CREATE FUNCTION atlas_private.take_rate(bucket text, maximum integer, window_seconds integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE n integer;
BEGIN
 IF maximum<1 OR maximum>1000 OR window_seconds<1 OR window_seconds>86400 OR length(bucket)>128 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 INSERT INTO rate_buckets(key,hits,expires_at) VALUES(bucket,1,clock_timestamp()+make_interval(secs=>window_seconds))
 ON CONFLICT (key) DO UPDATE SET hits=CASE WHEN rate_buckets.expires_at<=clock_timestamp() THEN 1 ELSE rate_buckets.hits+1 END,
 expires_at=CASE WHEN rate_buckets.expires_at<=clock_timestamp() THEN clock_timestamp()+make_interval(secs=>window_seconds) ELSE rate_buckets.expires_at END
 RETURNING hits INTO n;
 -- Bounded cleanup; entries hold only keyed digests/operation names.
 DELETE FROM rate_buckets WHERE key IN (SELECT key FROM rate_buckets WHERE expires_at<clock_timestamp()-interval '1 day' LIMIT 100);
 RETURN n<=maximum;
END $$;

CREATE FUNCTION atlas_private.require_cap(kind text,target uuid,cap text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF NOT atlas_private.can(kind,target,cap) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
END $$;
CREATE FUNCTION atlas_private.validate_name(v text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$ BEGIN
 IF v IS NULL OR length(btrim(v)) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 RETURN btrim(v);
END $$;

-- One bounded command interface, no dynamic SQL/table/actor input.
CREATE FUNCTION atlas_private.mutate(command text, input jsonb, request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 actor uuid:=atlas_private.actor(); result jsonb; org uuid; ws uuid; target uuid; subject uuid;
 orgrow organizations%ROWTYPE; wsrow workspaces%ROWTYPE; pr projects%ROWTYPE; inv invitations%ROWTYPE;
 scope text; wanted text; previous text; v integer; setup_name text; key uuid; owner_count integer;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 IF jsonb_typeof(input)<>'object' OR octet_length(input::text)>32768 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 -- Serialize hierarchy mutations, including parent revoke versus descendant owner changes.
 PERFORM pg_advisory_xact_lock(71001,1);
 IF command='bootstrap' THEN
  setup_name:=atlas_private.validate_name(input->>'displayName');
  IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=actor) THEN
   INSERT INTO profiles(id,display_name,updated_at) VALUES(actor,setup_name,now());
  END IF;
  IF EXISTS(SELECT 1 FROM profiles WHERE id=actor AND deleted_at IS NOT NULL) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO orgrow FROM organizations WHERE personal_owner_id=actor;
  IF orgrow.id IS NULL THEN
   INSERT INTO organizations(id,name,personal,personal_owner_id,updated_at) VALUES(gen_random_uuid(),'Personal Research',true,actor,now()) RETURNING * INTO orgrow;
   INSERT INTO organization_memberships(organization_id,profile_id,role,updated_at) VALUES(orgrow.id,actor,'OWNER',now());
  END IF;
  SELECT * INTO wsrow FROM workspaces WHERE personal_owner_id=actor;
  IF wsrow.id IS NULL THEN
   INSERT INTO workspaces(id,organization_id,name,personal_owner_id,updated_at) VALUES(gen_random_uuid(),orgrow.id,atlas_private.validate_name(coalesce(input->>'workspaceName','My Research')),actor,now()) RETURNING * INTO wsrow;
   INSERT INTO workspace_memberships(organization_id,workspace_id,profile_id,role,updated_at) VALUES(orgrow.id,wsrow.id,actor,'ADMIN',now());
  END IF;
  IF (SELECT onboarding_completed_at FROM profiles WHERE id=actor) IS NULL THEN
   IF input ? 'projectName' AND length(btrim(input->>'projectName'))>0 THEN
    INSERT INTO projects(id,organization_id,workspace_id,name,created_by_id,updated_at) VALUES(gen_random_uuid(),orgrow.id,wsrow.id,atlas_private.validate_name(input->>'projectName'),actor,now()) RETURNING * INTO pr;
    INSERT INTO project_memberships(organization_id,workspace_id,project_id,profile_id,role,updated_at) VALUES(orgrow.id,wsrow.id,pr.id,actor,'OWNER',now());
   END IF;
   UPDATE profiles SET display_name=setup_name,research_role=left(input->>'researchRole',120),
    research_interests=ARRAY(SELECT jsonb_array_elements_text(coalesce(input->'researchInterests','[]'))),onboarding_completed_at=now(),updated_at=now() WHERE id=actor;
  END IF;
  org:=orgrow.id;target:=wsrow.id;
  result:=jsonb_build_object('workspaceId',wsrow.id,'organizationId',orgrow.id,'projectId',pr.id);
 ELSE
  IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=actor AND deleted_at IS NULL) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF command='profile.update' THEN
   UPDATE profiles SET display_name=atlas_private.validate_name(input->>'displayName'),research_role=left(input->>'researchRole',120),research_interests=ARRAY(SELECT jsonb_array_elements_text(coalesce(input->'researchInterests','[]'))),updated_at=now() WHERE id=actor;
   target:=actor;result:=jsonb_build_object('id',actor);
  ELSIF command='organization.create' THEN
   INSERT INTO organizations(id,name,updated_at) VALUES(gen_random_uuid(),atlas_private.validate_name(input->>'name'),now()) RETURNING * INTO orgrow;
   INSERT INTO organization_memberships(organization_id,profile_id,role,updated_at) VALUES(orgrow.id,actor,'OWNER',now());
   org:=orgrow.id;target:=org;result:=jsonb_build_object('id',org);
  ELSIF command IN ('organization.update','organization.archive') THEN
   target:=(input->>'id')::uuid;org:=target;
   PERFORM atlas_private.require_cap('organization',target,command);
   SELECT * INTO orgrow FROM organizations WHERE id=target FOR UPDATE;
   IF orgrow.version IS DISTINCT FROM (input->>'expectedVersion')::integer THEN RAISE EXCEPTION 'CONFLICT'; END IF;
   UPDATE organizations SET name=CASE WHEN command='organization.update' THEN atlas_private.validate_name(input->>'name') ELSE name END,
    deleted_at=CASE WHEN command='organization.archive' THEN now() ELSE deleted_at END,version=version+1,updated_at=now() WHERE id=target;
   result:=jsonb_build_object('id',target);
  ELSIF command='workspace.create' THEN
   org:=(input->>'organizationId')::uuid;
   PERFORM atlas_private.require_cap('organization',org,'workspace.create');
   INSERT INTO workspaces(id,organization_id,name,updated_at) VALUES(gen_random_uuid(),org,atlas_private.validate_name(input->>'name'),now()) RETURNING * INTO wsrow;
   target:=wsrow.id;
   INSERT INTO workspace_memberships(organization_id,workspace_id,profile_id,role,updated_at) VALUES(org,target,actor,'ADMIN',now());
   result:=jsonb_build_object('id',target);
  ELSIF command IN ('workspace.update','workspace.archive') THEN
   target:=(input->>'id')::uuid;
   PERFORM atlas_private.require_cap('workspace',target,command);
   SELECT * INTO wsrow FROM workspaces WHERE id=target FOR UPDATE;org:=wsrow.organization_id;
   IF wsrow.version IS DISTINCT FROM (input->>'expectedVersion')::integer THEN RAISE EXCEPTION 'CONFLICT'; END IF;
   UPDATE workspaces SET name=CASE WHEN command='workspace.update' THEN atlas_private.validate_name(input->>'name') ELSE name END,
    deleted_at=CASE WHEN command='workspace.archive' THEN now() ELSE deleted_at END,version=version+1,updated_at=now() WHERE id=target;
   result:=jsonb_build_object('id',target);
  ELSIF command='project.create' THEN
   ws:=(input->>'workspaceId')::uuid;
   PERFORM atlas_private.require_cap('workspace',ws,'project.create');
   SELECT organization_id INTO org FROM workspaces WHERE id=ws;
   key:=(input->>'idempotencyKey')::uuid;
   IF key IS NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   SELECT * INTO pr FROM projects WHERE created_by_id=actor AND creation_key=key;
   IF pr.id IS NOT NULL THEN
    IF pr.workspace_id<>ws OR pr.name<>btrim(input->>'name') OR pr.visibility::text<>coalesce(input->>'visibility','PRIVATE') THEN RAISE EXCEPTION 'CONFLICT'; END IF;
    PERFORM atlas_private.require_cap('project',pr.id,'project.read');
   ELSE
    INSERT INTO projects(id,organization_id,workspace_id,name,visibility,created_by_id,creation_key,updated_at)
     VALUES(gen_random_uuid(),org,ws,atlas_private.validate_name(input->>'name'),coalesce(input->>'visibility','PRIVATE')::"ProjectVisibility",actor,key,now()) RETURNING * INTO pr;
    INSERT INTO project_memberships(organization_id,workspace_id,project_id,profile_id,role,updated_at) VALUES(org,ws,pr.id,actor,'OWNER',now());
   END IF;
   target:=pr.id;result:=jsonb_build_object('id',target);
  ELSIF command IN ('project.update','project.archive','project.restore') THEN
   target:=(input->>'id')::uuid;
   PERFORM atlas_private.require_cap('project',target,command);
   SELECT * INTO pr FROM projects WHERE id=target FOR UPDATE;org:=pr.organization_id;
   IF pr.version IS DISTINCT FROM (input->>'expectedVersion')::integer THEN RAISE EXCEPTION 'CONFLICT'; END IF;
   UPDATE projects SET name=CASE WHEN command='project.update' THEN atlas_private.validate_name(input->>'name') ELSE name END,
    visibility=CASE WHEN command='project.update' THEN coalesce(input->>'visibility',visibility::text)::"ProjectVisibility" ELSE visibility END,
    deleted_at=CASE WHEN command='project.archive' THEN now() WHEN command='project.restore' THEN NULL ELSE deleted_at END,
    version=version+1,updated_at=now() WHERE id=target;
   result:=jsonb_build_object('id',target);
  ELSIF command='invitation.create' THEN
   scope:=input->>'scope';target:=(input->>'scopeId')::uuid;wanted:=input->>'role';
   PERFORM atlas_private.require_cap(scope,target,scope||'.members.manage');
   IF scope='organization' THEN
    org:=target;
    IF wanted NOT IN ('ADMIN','MEMBER') OR (wanted='ADMIN' AND NOT EXISTS(SELECT 1 FROM organization_memberships WHERE organization_id=org AND profile_id=actor AND role='OWNER')) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
   ELSIF scope='workspace' THEN
    SELECT organization_id,id INTO org,ws FROM workspaces WHERE id=target;
    IF wanted NOT IN ('ADMIN','MEMBER','VIEWER') THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   ELSIF scope='project' THEN
    SELECT organization_id,workspace_id INTO org,ws FROM projects WHERE id=target;
    IF wanted NOT IN ('OWNER','EDITOR','VIEWER') THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   ELSE RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   IF length(input->>'email') NOT BETWEEN 3 AND 254 OR (input->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   INSERT INTO invitations(id,organization_id,workspace_id,project_id,scope,role,email,inviter_id,token_hash,expires_at)
    VALUES(gen_random_uuid(),org,ws,CASE WHEN scope='project' THEN target END,scope,wanted,lower(btrim(input->>'email')),actor,input->>'tokenHash',now()+interval '7 days') RETURNING * INTO inv;
   target:=inv.id;result:=jsonb_build_object('id',target,'expiresAt',inv.expires_at);
  ELSIF command='invitation.revoke' THEN
   SELECT * INTO inv FROM invitations WHERE id=(input->>'id')::uuid FOR UPDATE;
   IF inv.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
   PERFORM atlas_private.require_cap(inv.scope,coalesce(inv.project_id,inv.workspace_id,inv.organization_id),inv.scope||'.members.manage');
   UPDATE invitations SET revoked_at=now() WHERE id=inv.id AND accepted_at IS NULL;
   target:=inv.id;org:=inv.organization_id;result:=jsonb_build_object('id',target);
  ELSIF command='invitation.accept' THEN
   SELECT * INTO inv FROM invitations WHERE token_hash=input->>'tokenHash' FOR UPDATE;
   IF inv.id IS NULL OR inv.revoked_at IS NOT NULL OR inv.accepted_at IS NOT NULL OR inv.expires_at<=now() OR inv.email<>lower(nullif(current_setting('atlas.actor_email',true),'')) OR nullif(current_setting('atlas.actor_email',true),'') IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
   IF atlas_private.allowed(inv.inviter_id,inv.scope,coalesce(inv.project_id,inv.workspace_id,inv.organization_id),inv.scope||'.members.manage') IS NOT TRUE THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
   IF inv.scope='organization' AND inv.role='ADMIN' AND NOT EXISTS(SELECT 1 FROM organization_memberships WHERE organization_id=inv.organization_id AND profile_id=inv.inviter_id AND role='OWNER') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
   org:=inv.organization_id;ws:=inv.workspace_id;
   INSERT INTO organization_memberships(organization_id,profile_id,role,updated_at) VALUES(org,actor,CASE WHEN inv.scope='organization' THEN inv.role::"OrganizationRole" ELSE 'MEMBER' END,now()) ON CONFLICT DO NOTHING;
   IF ws IS NOT NULL THEN
    INSERT INTO workspace_memberships(organization_id,workspace_id,profile_id,role,updated_at) VALUES(org,ws,actor,CASE WHEN inv.scope='workspace' THEN inv.role::"WorkspaceRole" ELSE 'MEMBER' END,now()) ON CONFLICT DO NOTHING;
   END IF;
   IF inv.project_id IS NOT NULL THEN
    INSERT INTO project_memberships(organization_id,workspace_id,project_id,profile_id,role,updated_at) VALUES(org,ws,inv.project_id,actor,inv.role::"ProjectRole",now()) ON CONFLICT DO NOTHING;
   END IF;
   UPDATE invitations SET accepted_at=now() WHERE id=inv.id;
   target:=inv.id;result:=jsonb_build_object('organizationId',org,'workspaceId',ws,'projectId',inv.project_id);
  ELSIF command IN ('membership.set','membership.remove') THEN
   scope:=input->>'scope';target:=(input->>'scopeId')::uuid;subject:=(input->>'profileId')::uuid;wanted:=input->>'role';
   PERFORM atlas_private.require_cap(scope,target,scope||'.members.manage');
   IF scope='organization' THEN
    org:=target;SELECT role::text,version INTO previous,v FROM organization_memberships WHERE organization_id=org AND profile_id=subject;
    IF previous IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF v IS DISTINCT FROM (input->>'expectedVersion')::integer THEN RAISE EXCEPTION 'CONFLICT'; END IF;
    IF NOT EXISTS(SELECT 1 FROM organization_memberships WHERE organization_id=org AND profile_id=actor AND role='OWNER') AND (previous IN ('OWNER','ADMIN') OR wanted IN ('OWNER','ADMIN')) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    IF EXISTS(SELECT 1 FROM organizations WHERE id=org AND personal_owner_id=subject) AND (command='membership.remove' OR wanted<>'OWNER') THEN RAISE EXCEPTION 'CONFLICT'; END IF;
    IF previous='OWNER' AND (command='membership.remove' OR wanted<>'OWNER') AND (SELECT count(*) FROM organization_memberships WHERE organization_id=org AND role='OWNER')<=1 THEN RAISE EXCEPTION 'CONFLICT'; END IF;
   ELSIF scope='workspace' THEN
    ws:=target;SELECT organization_id,role::text,version INTO org,previous,v FROM workspace_memberships WHERE workspace_id=ws AND profile_id=subject;
    IF previous IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF v IS DISTINCT FROM (input->>'expectedVersion')::integer THEN RAISE EXCEPTION 'CONFLICT'; END IF;
    IF EXISTS(SELECT 1 FROM workspaces WHERE id=ws AND personal_owner_id=subject) AND (command='membership.remove' OR wanted<>'ADMIN') THEN RAISE EXCEPTION 'CONFLICT'; END IF;
   ELSIF scope='project' THEN
    SELECT organization_id,workspace_id,role::text,version INTO org,ws,previous,v FROM project_memberships WHERE project_id=target AND profile_id=subject;
    IF previous IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF v IS DISTINCT FROM (input->>'expectedVersion')::integer THEN RAISE EXCEPTION 'CONFLICT'; END IF;
    IF previous='OWNER' AND (command='membership.remove' OR wanted<>'OWNER') AND (SELECT count(*) FROM project_memberships WHERE project_id=target AND role='OWNER')<=1 THEN RAISE EXCEPTION 'CONFLICT'; END IF;
   ELSE RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   IF command='membership.remove' AND scope IN ('organization','workspace') THEN
    -- Parent removal must not strand an active descendant project without an eligible owner.
    IF EXISTS(SELECT 1 FROM projects p JOIN project_memberships m ON m.project_id=p.id AND m.profile_id=subject AND m.role='OWNER'
     WHERE p.organization_id=org AND (ws IS NULL OR p.workspace_id=ws) AND p.deleted_at IS NULL
     AND NOT EXISTS(SELECT 1 FROM project_memberships other WHERE other.project_id=p.id AND other.role='OWNER' AND other.profile_id<>subject)) THEN RAISE EXCEPTION 'CONFLICT'; END IF;
    DELETE FROM project_memberships WHERE organization_id=org AND (ws IS NULL OR workspace_id=ws) AND profile_id=subject;
    DELETE FROM workspace_memberships WHERE organization_id=org AND (ws IS NULL OR workspace_id=ws) AND profile_id=subject;
   END IF;
   IF scope='organization' THEN
    IF command='membership.remove' THEN DELETE FROM organization_memberships WHERE organization_id=org AND profile_id=subject;
    ELSE UPDATE organization_memberships SET role=wanted::"OrganizationRole",version=version+1,updated_at=now() WHERE organization_id=org AND profile_id=subject; END IF;
   ELSIF scope='workspace' THEN
    IF command='membership.remove' THEN NULL;
    ELSE UPDATE workspace_memberships SET role=wanted::"WorkspaceRole",version=version+1,updated_at=now() WHERE workspace_id=ws AND profile_id=subject; END IF;
   ELSE
    IF command='membership.remove' THEN DELETE FROM project_memberships WHERE project_id=target AND profile_id=subject;
    ELSE UPDATE project_memberships SET role=wanted::"ProjectRole",version=version+1,updated_at=now() WHERE project_id=target AND profile_id=subject; END IF;
   END IF;
   result:=jsonb_build_object('id',target);
  ELSE RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 END IF;
 INSERT INTO audit_events(id,organization_id,actor_id,action,resource_id,request_id) VALUES(gen_random_uuid(),org,actor,command,target,request_id);
 RETURN result;
END $$;

-- No public execution, including helpers created with PostgreSQL's default PUBLIC grant.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA atlas_private FROM PUBLIC;
GRANT EXECUTE ON FUNCTION atlas_private.actor(),atlas_private.can(text,uuid,text),atlas_private.capabilities(text,uuid),atlas_private.take_rate(text,integer,integer),atlas_private.mutate(text,jsonb,uuid) TO atlas_runtime;
-- Supabase browser roles must never receive actor-context or mutation privileges.
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON public.profiles,public.organizations,public.organization_memberships,public.workspaces,public.workspace_memberships,public.projects,public.project_memberships,public.invitations,public.audit_events,public.rate_buckets FROM %I',r);
   EXECUTE format('REVOKE ALL ON SCHEMA atlas_private FROM %I',r);
  END IF;
 END LOOP;
END $$;
