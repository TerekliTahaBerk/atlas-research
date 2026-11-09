# Restart record — 9 November 2026

## Authorized scope

Historical scope of the repository-preparation task: prepare a clean repository and branch/settings baseline, then stop and hand over the Phase 00 prompt. That task did not authorize Phase 00, deployment, database provisioning or external-service changes. A subsequent user instruction authorized the documentation-only [Phase 00 work](PHASE_00_HANDOFF.md); this record remains the preparation/recovery history, not the current execution instruction.

## Legacy checkpoint

Original default branch: master.
Original master head: 5163f12f0844b1cfefdb001b0b285aaf281f064f.
Original master tree: 2e9a116d0c12657a77fb4b8f057460606842960c.
Archive branch: archive/pre-restart-2026-11-09.
Archive checkpoint: 25b9b583172dcfda60f701d7afefef7b00ab719e.

The archival checkpoint retains the exact original master tree. Its 25 parents preserve all 25 original branch tips, including unmerged work. It is an archival merge, not a claim that those branches were integrated or tested together.

The full original branch-to-SHA mapping is in repository/legacy-refs.json. Only after verifying all tips are retained may obsolete active branch names be removed.

Legacy PR #24 was closed without merging because it is superseded by the clean restart. Its branch tip is preserved in the archive manifest.

## New baseline

A documentation/configuration-only tree replaces the old application on main. No old source, package manifests, lockfiles, migrations, UI fixtures, generated reports or CI workflows carry forward. Original Git history is retained; this is not an irreversible history wipe.

Phase 00 starts from feat/phase-00-foundation. Nothing in the baseline claims that Phase 00 or any product feature is implemented.

## Recovery

Find the original branch in repository/legacy-refs.json and create a new recovery branch at its exact SHA. For example:

```sh
git fetch origin archive/pre-restart-2026-11-09
git switch -c recovery/legacy-master 5163f12f0844b1cfefdb001b0b285aaf281f064f
```

Archive every original tip; never force-push the checkpoint. The archive remains reachable independently of main.

## External state

This preparation does not remove old databases, deployments, domains, secrets, GitHub Apps or webhooks. One targeted exception: the old Vercel project named web was disconnected from this Git repository after a paused-project deployment produced a failing commit status. Its settings and existing deployments were preserved. Other external services must be inventoried separately before later deployment; do not assume they have stopped running.

New deployment target: Coolify. New database decision: self-hosted PostgreSQL. Neither is created in this step.
