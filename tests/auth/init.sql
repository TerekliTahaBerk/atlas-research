-- Public, disposable test-only passwords. No application or cloud credentials.
-- GoTrue migrations grant to the conventional postgres role even on plain Postgres.
CREATE ROLE postgres NOLOGIN;
CREATE ROLE atlas_test_auth LOGIN PASSWORD 'atlas_auth_test_only';
CREATE SCHEMA auth AUTHORIZATION atlas_test_auth;
ALTER ROLE atlas_test_auth SET search_path=auth,public;
GRANT CONNECT ON DATABASE atlas_auth_test TO atlas_test_auth;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
GRANT CREATE ON DATABASE atlas_auth_test TO atlas_test_auth;
CREATE ROLE atlas_auth_runtime LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD 'atlas_runtime_test_only';
-- Supabase Storage API roles for the disposable harness (as on Supabase).
CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
CREATE ROLE supabase_storage_admin LOGIN NOINHERIT CREATEROLE PASSWORD 'atlas_storage_test_only';
GRANT anon, authenticated, service_role TO supabase_storage_admin;
GRANT CREATE, CONNECT ON DATABASE atlas_auth_test TO supabase_storage_admin;
-- Mirror Supabase's bootstrap: the storage schema exists before the Storage
-- API migrates it, API roles have USAGE and default table privileges, and
-- storage.objects RLS (with no Atlas policies) still denies browser roles.
CREATE SCHEMA storage AUTHORIZATION supabase_storage_admin;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_storage_admin IN SCHEMA storage GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_storage_admin IN SCHEMA storage GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_storage_admin IN SCHEMA storage GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
