-- Run ONLY in an identified disposable database, as migration owner. Everything rolls back.
BEGIN;
INSERT INTO profiles (id,display_name,updated_at) VALUES ('00000000-0000-4000-8000-000000000001','Synthetic researcher',now());
INSERT INTO organizations (id,name,updated_at) VALUES ('10000000-0000-4000-8000-000000000001','Synthetic A',now()),('10000000-0000-4000-8000-000000000002','Synthetic B',now());
INSERT INTO organization_memberships (organization_id,profile_id,role,updated_at) VALUES ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','OWNER',now());
INSERT INTO workspaces (id,organization_id,name,updated_at) VALUES ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Workspace A',now()),('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Workspace B',now()),('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Workspace A2',now());
INSERT INTO workspace_memberships (organization_id,workspace_id,profile_id,role,updated_at) VALUES ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','ADMIN',now());
INSERT INTO projects (id,organization_id,workspace_id,name,updated_at) VALUES ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Project A',now()),('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','Project A2',now());
INSERT INTO project_memberships (organization_id,workspace_id,project_id,profile_id,role,updated_at) VALUES ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','OWNER',now());
DO $$ BEGIN
 BEGIN
  INSERT INTO workspace_memberships (organization_id,workspace_id,profile_id,updated_at) VALUES ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',now());
  RAISE EXCEPTION 'FAIL: cross-organization grant accepted';
 EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: cross-organization grant rejected'; END;
 BEGIN
  INSERT INTO project_memberships (organization_id,workspace_id,project_id,profile_id,updated_at) VALUES ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',now());
  RAISE EXCEPTION 'FAIL: mismatched project workspace accepted';
 EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: mismatched workspace rejected'; END;
 BEGIN
  INSERT INTO project_memberships (organization_id,workspace_id,project_id,profile_id,updated_at) VALUES ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',now());
  RAISE EXCEPTION 'FAIL: duplicate membership accepted';
 EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: duplicate membership rejected'; END;
 BEGIN
  DELETE FROM workspaces WHERE id='20000000-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'FAIL: research container deletion allowed';
 EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: parent deletion restricted'; END;
 IF (SELECT count(*) FROM pg_class WHERE relname IN ('profiles','organizations','organization_memberships','workspaces','workspace_memberships','projects','project_memberships') AND relrowsecurity)=7 THEN
 RAISE NOTICE 'PASS: RLS enabled for all foundation tables'; ELSE RAISE EXCEPTION 'FAIL: RLS missing'; END IF;
END $$;
CREATE ROLE atlas_phase00_rls_probe NOLOGIN;
GRANT USAGE ON SCHEMA public TO atlas_phase00_rls_probe;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO atlas_phase00_rls_probe;
SET LOCAL ROLE atlas_phase00_rls_probe;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM projects) OR EXISTS(SELECT 1 FROM profiles) THEN RAISE EXCEPTION 'FAIL: non-owner read bypassed RLS'; ELSE RAISE NOTICE 'PASS: RLS denies non-owner reads'; END IF;
 BEGIN
  INSERT INTO profiles (id,display_name,updated_at) VALUES ('00000000-0000-4000-8000-000000000002','RLS write probe',now());
  RAISE EXCEPTION 'FAIL: non-owner write bypassed RLS';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: RLS denies non-owner writes'; END;
END $$;
RESET ROLE;
ROLLBACK;
