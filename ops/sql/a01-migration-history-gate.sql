-- Read-only assertion gate, not remediation. Execute with ON_ERROR_STOP.
-- Run only after independently verifying the target and migration owner.
DO $gate$
DECLARE browser_role text; privilege text; history oid := 'public._prisma_migrations'::regclass;
BEGIN
 IF current_setting('server_version_num')::integer < 170000 THEN
  RAISE EXCEPTION 'A01 requires PostgreSQL 17 or newer';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=history AND relrowsecurity AND NOT relforcerowsecurity) THEN
  RAISE EXCEPTION 'Migration history requires RLS without FORCE';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=history) THEN
  RAISE EXCEPTION 'Migration history must not have policies';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=history AND relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) THEN
  RAISE EXCEPTION 'Run the gate as the verified migration-history owner';
 END IF;
 FOREACH browser_role IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=browser_role) THEN
   RAISE EXCEPTION 'Required browser role missing: %',browser_role;
  END IF;
  FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
   IF has_table_privilege(browser_role,history,privilege) THEN
    RAISE EXCEPTION 'Unsafe effective migration-history table privilege: % %',browser_role,privilege;
   END IF;
  END LOOP;
  FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
   IF has_any_column_privilege(browser_role,history,privilege) THEN
    RAISE EXCEPTION 'Unsafe effective migration-history column privilege: % %',browser_role,privilege;
   END IF;
  END LOOP;
  IF EXISTS (
   SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
   WHERE d.defaclrole=(SELECT oid FROM pg_roles WHERE rolname=current_user)
    AND d.defaclnamespace IN (0,'public'::regnamespace)
    AND d.defaclobjtype IN ('r','S')
    AND CASE WHEN a.grantee=0 THEN true ELSE pg_has_role(browser_role,a.grantee,'USAGE') END
  ) THEN
   RAISE EXCEPTION 'Unsafe effective future table/sequence default for %',browser_role;
  END IF;
 END LOOP;
END $gate$;
