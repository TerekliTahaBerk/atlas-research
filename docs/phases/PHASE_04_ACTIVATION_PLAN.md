# Phase 04 activation plan

Status: prepared; **no hosted migration, hosted data change, paid AI request or deployment is authorized or was performed**.

Phase 04 is local code readiness only. Hosted activation depends on the unresolved earlier gates and must follow this order:

1. Complete [Phase 02 activation](PHASE_02_ACTIVATION_PLAN.md) (migration-history exposure remediation, browser privilege checks, protected Free-plan-compatible backup and isolated restore rehearsal, research schema, private Storage, scanner) and [Phase 03 activation](PHASE_03_ACTIVATION_PLAN.md) (AI schema, worker role, extractor, provider approval). Phase 04's migration references `ai_runs` and must be applied after the Phase 03 migrations.
2. Reconfirm the approved development target identity and migration checksums. Take and verify a fresh encrypted recovery snapshot (procedure in the Phase 03 plan) immediately before applying Phase 04.
3. Apply `20261024090000_documents_tasks` with `prisma migrate deploy` through the reviewed migration connection only. It is additive; it drops and recreates only the `artifact_kind` CHECK (widening it) and renames `atlas_private.mutate` to `mutate_phase_02` before creating the wrapping dispatcher in the same transaction. No reset, `db push` or history rewrite.
4. Verify (read-only): RLS enabled on the five new tables; `atlas_runtime` has SELECT only and EXECUTE on `mutate`, `can_assign`, `is_participant`, `participant_names`, `project_participants`; `anon`/`authenticated` have no table or function privileges (including via Data API HTTP probes); `mutate_phase_02` and helper functions are not executable by the runtime; composite FKs and the link matrix CHECK exist; the immutability trigger exists; existing paper artifacts are unchanged (`count(*)` and IDs before/after).
5. Run two-account behavioral probes against the hosted development app: document create/save/conflict/restore/export, forged citation and cross-project link rejection, viewer and revoked-member denial, assignment eligibility, search isolation. Capture redacted evidence only.
6. AI proposals stay inert unless the Phase 03 provider gate is approved; `ATLAS_AI_PAID_REQUESTS` remains unapproved. Documents/tasks do not require AI.

Rollback: disable the live Documents/Tasks routes by deployment rollback; do not drop tables or delete versions. Data-bearing reversal requires a separately reviewed migration and restore authorization.

Hosted readiness: **BLOCKED** (dependent gates open). Code readiness: see the [implementation report](PHASE_04_IMPLEMENTATION_REPORT.md).

## Phase 04.1 read-only recheck — 24 October 2026

Confirmed through the connected Supabase catalog on **Atlas Research**, `hgngonpirctrwbckhbmy`, Seoul, PostgreSQL `17.11.0.003`, active/healthy. This is the existing approved development identity; the dashboard production label does not authorize production changes. Existing counts remain one Auth account, one profile and one project; only aggregate counts and security metadata were read.

**BLOCKED**: installed Prisma history still contains only `20261021181359_foundation`, `20261022100000_core_platform`, `20261022110000_onboarding_drafts` (finished, no rollbacks). `_prisma_migrations` remains owned by `postgres`, RLS disabled, no policies. Both `anon` and `authenticated` have all eight effective table privileges (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN), plus effective column privileges. `postgres` public table/sequence defaults still grant browser roles ALL. All ten domain tables have RLS. The development login `atlas_app_dev` is non-superuser/non-BYPASSRLS and belongs only to `atlas_runtime`. No `documents`, `tasks`, `ai_runs`, Atlas PDF buckets or Storage object policies exist. No hosted rows, grants, migrations, accounts, buckets or settings were changed. A new HTTP Data API probe and signed-in browser-role probe were **NOT RUN**; the effective catalog grants alone are sufficient to keep activation blocked.

Exact repository migration order (all ten applied successfully to disposable local PostgreSQL):

1. `20261021181359_foundation` — already hosted.
2. `20261022100000_core_platform` — already hosted.
3. `20261022110000_onboarding_drafts` — already hosted.
4. `20261023090000_migration_history_security` — first pending remediation; no FORCE RLS.
5. `20261023100000_research_library`.
6. `20261023120000_scanner_fencing`.
7. `20261023150000_ai_research`.
8. `20261023160000_ai_retention`.
9. `20261023170000_ai_stream_authorization`.
10. `20261024090000_documents_tasks`.

The three installed checksums match the repository. No new migration is needed for the Phase 04.1 UI fixes. `tests/integration/database-security.test.ts` passed actual browser-role SELECT/INSERT/UPDATE/DELETE/TRUNCATE denial, eight effective privilege probes, owner access and future table/sequence default probes after reproducing unsafe browser defaults on a disposable database; subsequent migrations also succeeded. The existing remediation SQL was not edited.

Before hosted execution, retain the Phase 02/03 encrypted backup and isolated restore requirements: a fresh protected DB/role/ACL/Auth/Storage metadata export, encrypted outside Git with separately held decryption material, checksum/time/owner/retention evidence, private object-byte coverage, and verified restoration into a separate PostgreSQL 17/Supabase-compatible target. Neither an encrypted hosted backup nor a hosted-snapshot restore drill was executed here. Preserve all existing accounts/projects; verify their counts and grants before and after authorized activation. No database reset, paid plan upgrade, provider traffic or production deployment is authorized by this report.

Open gates: explicit hosted remediation/activation approval; verified encrypted recovery plus isolated restore; effective catalog and HTTP browser denial; additive migrations; private buckets; separately approved scanner/extractor/worker deployment; two-account hosted workflow tests; provider consent/cost/security evaluation before paid AI. Code PR readiness and hosted activation are separate decisions. Full evidence: [implementation report](PHASE_04_IMPLEMENTATION_REPORT.md).
