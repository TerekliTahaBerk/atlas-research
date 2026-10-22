# ADR 0013: Verified actor context and constrained database mutations

Status: accepted for Phase 01 implementation; hosted release verification pending.

The server verifies Supabase identity with `auth.getUser()` on every protected request. It sets `atlas.actor_id` and verified `atlas.actor_email` with transaction-local `set_config` on the same Prisma interactive transaction as protected queries. No browser ID, metadata role, URL tenant, preference or request body controls this context. Browser clients use SSR cookies; Prisma does not assume `auth.uid()` is populated.

The normal SQL login is a dedicated non-owner, NOSUPERUSER, NOBYPASSRLS role, a member only of `atlas_runtime`. It has SELECT via scoped RLS and EXECUTE on explicitly granted mutation entry points. Direct INSERT/UPDATE/DELETE is denied. Security-definer policy helpers use fixed search paths to avoid recursive membership RLS. Mutation routines are a deliberate privileged boundary owned by the migration principal: they resolve scope, check live capabilities, validate invariants and atomically append audit events. They accept no actor ID or SQL. Internal helpers are not executable by runtime.

The SQL capability evaluator is authoritative for mutation guards and UI projections. Metadata admins receive no implicit private-project capability. Hierarchy mutations use a transaction advisory lock to serialize owner changes, parent removal, provisioning and invitation acceptance. This conservative global lock trades write throughput for a simple cross-level owner proof; revisit on measured contention before large-scale rollout. Reads remain concurrent. Revocation applies on the next protected transaction; an already-rendered browser view is not proof of continuing access.

PostgreSQL stores atomic expiring rate buckets shared across server instances. Supabase provider limits are additional defenses. Anonymous Auth requests use bounded global and keyed email-digest quotas, never a client-controlled forwarded IP as their sole limit. Rate-store failure closes the operation.

The runtime credential is trusted server infrastructure: possession permits setting actor context. Never grant it to browsers or Supabase Data API roles. This defends against tenant mistakes and raw SQL without an actor, not compromise of the trusted web server or migration principal. Hosted pooler/role/schema exposure/cookie/provider behavior require separate release verification.

Preview is a separate environment mode with no database access, unsuitable for private research. Live mode rejects sample IDs. Research processing, AI, compilation, messaging and asset storage remain later-phase work.
