-- Read-only. Run as the verified Atlas development migration role.
BEGIN READ ONLY;
SELECT current_user, session_user, current_database();
SELECT c.relname, pg_get_userbyid(c.relowner) AS owner,
 c.relrowsecurity, c.relforcerowsecurity
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname;
-- Effective grants include inherited/PUBLIC privileges, unlike raw ACLs.
SELECT r.rolname,c.relname,p AS privilege,
 has_table_privilege(r.rolname,c.oid,p) AS allowed
 FROM pg_roles r CROSS JOIN pg_class c
 CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
 WHERE r.rolname IN ('anon','authenticated','atlas_runtime')
 AND c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p')
 ORDER BY c.relname,r.rolname,p;
SELECT r.rolname,p AS privilege,has_any_column_privilege(r.rolname,'public._prisma_migrations',p) AS allowed
 FROM pg_roles r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) p
 WHERE r.rolname IN ('anon','authenticated');
SELECT pg_get_userbyid(defaclrole) AS creator,
 coalesce(n.nspname,'GLOBAL') AS schema,defaclobjtype,defaclacl
 FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
 WHERE d.defaclrole=(SELECT oid FROM pg_roles WHERE rolname=current_user);
SELECT migration_name,checksum,finished_at,rolled_back_at
 FROM public._prisma_migrations ORDER BY started_at;
SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint
 WHERE connamespace='public'::regnamespace AND contype='f' ORDER BY conname;
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check
 FROM pg_policies WHERE schemaname IN ('public','storage');
SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets
 WHERE id IN ('atlas-quarantine','atlas-sources');
COMMIT;
