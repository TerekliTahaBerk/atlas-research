-- READ ONLY. Run after the reviewed Phase 02/03 migration sequence on the
-- explicitly identified Atlas development target. Empty findings are required.
-- This inspects configuration, not backup restoration or deployed worker behavior.
BEGIN READ ONLY;
SELECT current_database() AS database, current_user AS audit_role, version();
SELECT migration_name,finished_at,rolled_back_at FROM public._prisma_migrations ORDER BY migration_name;
SELECT n.nspname AS schema,e.extname,e.extversion FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname IN('vector','pgcrypto');
SELECT n.nspname,o.oprname FROM pg_operator o JOIN pg_namespace n ON n.oid=o.oprnamespace WHERE n.nspname='extensions' AND o.oprname='<=>';
-- Expected: no public application/migration table lacking RLS.
SELECT c.relname AS missing_rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p') AND NOT c.relrowsecurity;
-- Effective browser privileges, including PUBLIC and inherited/column grants.
SELECT r.rolname,c.relname AS browser_access FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE r.rolname IN('anon','authenticated') AND n.nspname='public' AND c.relkind IN('r','p')
AND (has_table_privilege(r.rolname,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(r.rolname,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'));
SELECT r.rolname,p.oid::regprocedure AS browser_function FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE r.rolname IN('anon','authenticated') AND n.nspname='atlas_private' AND has_function_privilege(r.rolname,p.oid,'EXECUTE');
SELECT n.nspname,r.rolname AS browser_create FROM pg_namespace n CROSS JOIN pg_roles r WHERE n.nspname IN('public','atlas_private') AND r.rolname IN('anon','authenticated') AND has_schema_privilege(r.rolname,n.oid,'CREATE');
-- Expected: no elevated/owner role inherited by the approved web/worker role.
SELECT base.rolname,privileged.rolname AS unsafe_membership FROM pg_roles base CROSS JOIN pg_roles privileged
WHERE base.rolname IN('atlas_runtime','atlas_ai_worker') AND pg_has_role(base.oid,privileged.oid,'MEMBER')
AND (privileged.rolsuper OR privileged.rolbypassrls OR privileged.rolcreaterole OR privileged.rolcreatedb OR privileged.rolreplication OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relowner=privileged.oid));
SELECT pg_has_role('atlas_runtime','atlas_ai_worker','MEMBER') AS web_has_worker_role; -- false
SELECT r.rolname,c.relname AS worker_table_access FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE r.rolname='atlas_ai_worker' AND n.nspname='public' AND c.relkind IN('r','p') AND has_table_privilege(r.rolname,c.oid,'SELECT,INSERT,UPDATE,DELETE');
-- Expected: evidence/reference helpers are invoker functions, fixed search paths.
SELECT p.oid::regprocedure,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='atlas_private' AND p.proname IN('ai_evidence_visible','ai_references_visible','ai_bind_context','ai_update','ai_claim','ai_index');
SELECT tablename,policyname,roles,cmd,qual FROM pg_policies WHERE schemaname='public' AND tablename IN('ai_runs','ai_conversations','source_chunks','paper_annotations');
SELECT conrelid::regclass,conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid IN('public.ai_runs'::regclass,'public.ai_citations'::regclass,'public.source_chunks'::regclass) ORDER BY conrelid,conname;
-- A missing storage schema is itself a blocker; do not create it with this script.
SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id IN('atlas-quarantine','atlas-sources'); -- exactly 2 private PDF buckets
SELECT policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='storage' AND tablename='objects'; -- review every policy for Atlas path access
ROLLBACK;
