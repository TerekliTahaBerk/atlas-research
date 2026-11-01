-- Read-only Atlas G1 evidence. No row contents, tokens, passwords or history logs.
-- Target identity/approval must be checked before connecting. Use ON_ERROR_STOP.
BEGIN READ ONLY;
SELECT jsonb_build_object(
 'identity',jsonb_build_object('current_user',current_user,'session_user',session_user,
   'database',current_database(),'server',current_setting('server_version'),
   'ssl',(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid())),
 'history',(SELECT jsonb_build_object('owner',pg_get_userbyid(relowner),
   'rls',relrowsecurity,'force_rls',relforcerowsecurity,
   'policy_count',(SELECT count(*) FROM pg_policy WHERE polrelid=c.oid))
   FROM pg_class c WHERE oid='public._prisma_migrations'::regclass),
 'migrations',(SELECT jsonb_agg(jsonb_build_object('name',migration_name,
   'checksum',checksum,'finished',finished_at IS NOT NULL,
   'rolled_back',rolled_back_at IS NOT NULL) ORDER BY migration_name)
   FROM public._prisma_migrations),
 'table_privileges',(SELECT jsonb_agg(jsonb_build_object('role',r.rolname,
   'privilege',p,'allowed',has_table_privilege(r.oid,'public._prisma_migrations',p))
   ORDER BY r.rolname,p) FROM pg_roles r
   CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
   WHERE r.rolname IN ('anon','authenticated')),
 'column_privileges',(SELECT jsonb_agg(jsonb_build_object('role',r.rolname,
   'privilege',p,'allowed',has_any_column_privilege(r.oid,'public._prisma_migrations',p))
   ORDER BY r.rolname,p) FROM pg_roles r
   CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) p
   WHERE r.rolname IN ('anon','authenticated')),
 'column_exposures',(SELECT count(*) FROM pg_roles r CROSS JOIN pg_attribute c
   CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) p
   WHERE r.rolname IN ('anon','authenticated')
   AND c.attrelid='public._prisma_migrations'::regclass AND c.attnum>0 AND NOT c.attisdropped
   AND has_column_privilege(r.oid,c.attrelid,c.attnum,p)),
 'public_history_acl',(SELECT count(*) FROM pg_class c
   CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
   WHERE c.oid='public._prisma_migrations'::regclass AND a.grantee=0),
 'browser_memberships',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'browser',b.rolname,'reachable_role',r.rolname,
   'inherited',pg_has_role(b.oid,r.oid,'USAGE'),
   'superuser',r.rolsuper,'bypassrls',r.rolbypassrls))
   FROM pg_roles b CROSS JOIN pg_roles r WHERE b.rolname IN ('anon','authenticated')
   AND r.oid<>b.oid AND pg_has_role(b.oid,r.oid,'MEMBER')),'[]'::jsonb),
 'owner_defaults',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'creator',pg_get_userbyid(d.defaclrole),'schema',coalesce(n.nspname,'GLOBAL'),
   'kind',d.defaclobjtype,'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
   'privilege',a.privilege_type)) FROM pg_default_acl d
   LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
   CROSS JOIN LATERAL aclexplode(d.defaclacl) a
   WHERE d.defaclrole=(SELECT relowner FROM pg_class WHERE oid='public._prisma_migrations'::regclass)
   AND d.defaclnamespace IN (0,'public'::regnamespace)),'[]'::jsonb),
 'unsafe_owner_table_sequence_defaults',(SELECT count(*) FROM pg_default_acl d
   CROSS JOIN LATERAL aclexplode(d.defaclacl) a CROSS JOIN pg_roles b
   WHERE b.rolname IN ('anon','authenticated')
   AND d.defaclrole=(SELECT relowner FROM pg_class WHERE oid='public._prisma_migrations'::regclass)
   AND d.defaclnamespace IN (0,'public'::regnamespace) AND d.defaclobjtype IN ('r','S')
   AND CASE WHEN a.grantee=0 THEN true ELSE pg_has_role(b.oid,a.grantee,'USAGE') END)
) AS g1_evidence;
COMMIT;
