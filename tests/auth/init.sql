-- Public, disposable test-only passwords. No application or cloud credentials.
CREATE ROLE atlas_test_auth LOGIN PASSWORD 'atlas_auth_test_only';
CREATE SCHEMA auth AUTHORIZATION atlas_test_auth;
ALTER ROLE atlas_test_auth SET search_path=auth,public;
GRANT CONNECT ON DATABASE atlas_auth_test TO atlas_test_auth;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE atlas_auth_runtime LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD 'atlas_runtime_test_only';
