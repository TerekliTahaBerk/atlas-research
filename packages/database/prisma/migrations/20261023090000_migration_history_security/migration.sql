-- Prisma metadata is internal. Keep the owner/migration role's privileges
-- and owner RLS bypass; never FORCE RLS or grant browser policies here.
BEGIN;
ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public._prisma_migrations FROM PUBLIC;
DO $$ DECLARE browser_role text; BEGIN
 FOREACH browser_role IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=browser_role) THEN
   EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public._prisma_migrations FROM %I',browser_role);
   -- Defaults belong to the actual Prisma creator (postgres on Atlas dev).
   -- Do not change Supabase-managed creators or auth/storage schemas.
   EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I',browser_role);
   EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I',browser_role);
  END IF;
 END LOOP;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
COMMIT;
