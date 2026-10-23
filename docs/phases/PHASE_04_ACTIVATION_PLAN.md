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
