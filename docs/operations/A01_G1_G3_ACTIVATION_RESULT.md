# A01 G1–G3 activation result — 2 November 2026

**Later closure evidence, 2 November 2026:** [Final consolidation](../phases/A01_A02_A03_FINAL_CLOSURE_REPORT.md) supersedes earlier access/state observations below. Read-only target access is available; catalog and anonymous history denial pass. G1 authenticated denial and G2–G5 approvals remain open. The final repository has 12 migrations, with 9 pending on hosted Atlas. No hosted write/export was executed.

**Verdict: `A01 PARTIAL — APPROVAL REQUIRED`.** G1 `OPEN — VALID AUTHENTICATED SESSION REQUIRED`; G2 `NOT RUN — APPROVAL REQUIRED`; G3 `NOT RUN — APPROVAL REQUIRED` (also blocked by G1 and G2). No hosted read, export, write, credential, session, restore, migration, provisioning or setting change happened in this session.

Repository head reviewed: `master` at `c26096b45cf8b1346fd686b6ab2925c4bddd80c9` (PR #18 merged). Latest master CI [run 41347215306](https://github.com/TerekliTahaBerk/atlas-research/actions/runs/41347215306) passed quality, isolated-auth and offline-engines; the earlier A02 task-test failure on `0837835` was a separate application defect fixed by PR #18 and is not an A01 gate result.

## 1. Project metadata — not re-verified this session

The Supabase connector available to this session **cannot access** the Atlas target: `get_project`/`list_branches` for `hgngonpirctrwbckhbmy` returned “You do not have permission to perform this action”, and the only project the connected account lists is an unrelated product, which was not accessed further. The last verified metadata stays the [1 November evidence](A01_HOSTED_ACTIVATION_2026-11-01.md#g1-evidence) (Atlas Research, `hgngonpirctrwbckhbmy`, org `atlasresearch`, `ap-northeast-2`, Free, PG `17.11.0.003`, ACTIVE_HEALTHY at 18:25–18:32 UTC). It is historical, not current. The `main / PRODUCTION` designation has **not** been reclassified as development/staging by any approver; that classification is a required approval field below.

## 2. G1 — evidence and outcome

| Check                                                                                                | Result this session                                                                                                     |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Read-only catalog file `ops/sql/a01-hosted-g1-verification.sql` (SHA-256 `0f6a130e…19e3`, unchanged) | **NOT RUN** — no authorized connector/database access to the target                                                     |
| Hosted migration names/checksums/completion                                                          | **NOT RUN** (repository side recomputed, §6)                                                                            |
| Authenticated `getUser` + zero-row history GET                                                       | **NOT RUN** — no already-authorized valid Atlas development session available; none was created, refreshed or extracted |
| Security SQL reapplication                                                                           | Not performed (not needed; the last observed contract passed)                                                           |

Outcome: **`G1 OPEN — VALID AUTHENTICATED SESSION REQUIRED`.** The 1 November catalog/anonymous-401 evidence is unchanged but must be re-run immediately before closure.

**New closure tool.** `ops/g1/authenticated-probe.mjs` (types in `.d.mts`, 6 unit tests) makes the closing step reproducible: target pinned to `https://hgngonpirctrwbckhbmy.supabase.co`; token accepted **only on stdin**, refused in argv/env; sequence `GET /auth/v1/user` → `GET /rest/v1/_prisma_migrations?select=id&limit=0` → `GET /auth/v1/user` with the same bearer; prints only statuses and the PostgREST error code. `DENIED` (exit 0) requires a valid non-anonymous user before **and** after and HTTP 401/403 with SQLSTATE `42501`. An empty 200 is `EXPOSED` (exit 3); expired/gateway/anonymous/network outcomes are `INCONCLUSIVE_*` (exit 2) and never close G1. It does not sign in, refresh or store anything.

Operator closure sequence (requires an authorized operator with target access and an existing authorized development session):

1. Run the read-only G1 SQL file on the exact target; require RLS true / FORCE false / 0 policies, all 16 table + 8 column checks false, 0 column exposures, 0 PUBLIC ACL, no browser memberships, 0 unsafe owner defaults, and the 3 installed checksums in §6 finished and not rolled back.
2. Re-run the anonymous control (Auth settings 200, history 401).
3. `ATLAS_G1_PUBLISHABLE_KEY=<public key> node ops/g1/authenticated-probe.mjs` with the access token piped from the authorized session; accept only `DENIED`. Record the JSON (statuses/codes only).

## 3. G2 — approval status: `G2 NOT RUN — APPROVAL REQUIRED`

Current Supabase documentation ([backups](https://supabase.com/docs/guides/platform/backups), [restore to self-hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform)) confirms for this plan: Free projects have **no managed daily backups** — Supabase recommends regular `supabase db dump` exports kept off-site; backups contain Storage **metadata only**, not object bytes; custom role passwords are not included (destination roles need new credentials); `supabase db dump` filters Supabase internals whereas raw `pg_dump` includes them and can fail on restore; a destination with a different JWT secret invalidates cloned Auth sessions; PG17-only settings and newer Auth/Storage tables can mismatch older destinations. These constraints are already reflected in the [G2 procedure](A01_G2_RECOVERY_PROCEDURE.md); the procedure's export tool choice must be confirmed against the destination type at approval time.

Approval packet — every field is **UNSET**; no default is assumed:

| #   | Mandatory field                                                                                                                                 | Value |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | Exact source project + development/staging classification (overriding `main / PRODUCTION`)                                                      | UNSET |
| 2   | Source export scope (schemas, Prisma history, roles/ACLs without passwords)                                                                     | UNSET |
| 3   | Sensitive Auth records, password hashes, sessions/refresh tokens — include or exclude                                                           | UNSET |
| 4   | Backup destination (provider/account/path)                                                                                                      | UNSET |
| 5   | Destination region and access principals/controls                                                                                               | UNSET |
| 6   | Isolated restore environment (exact new PG17 + Auth + Storage target; never the source)                                                         | UNSET |
| 7   | Provisioning action and spending ceiling                                                                                                        | UNSET |
| 8   | Encryption recipients and public-key fingerprints                                                                                               | UNSET |
| 9   | Private-key custodian (separate from operator)                                                                                                  | UNSET |
| 10  | Retention period and rehearsal expiry                                                                                                           | UNSET |
| 11  | Maintenance / write-freeze procedure and window                                                                                                 | UNSET |
| 12  | Named execution operator (and verifier)                                                                                                         | UNSET |
| 13  | Recovery verification scope (counts/hashes, history, FKs, RLS, privileges, versions, Auth/Storage, object bytes, two actors, sessions, RTO/RPO) | UNSET |
| 14  | Cleanup/deletion policy and authority                                                                                                           | UNSET |

Execution, acceptance criteria and cleanup follow the existing procedure §1–§5 unchanged. An export alone never yields `G2 PASS`; any failed recovery check is `G2 FAIL` and stops G3.

## 4. Backup and restore evidence

None — not authorized, not executed.

## 5. G3 — approval status: `G3 NOT RUN — APPROVAL REQUIRED`

Blocked until G1 is accepted, G2 isolated restoration is accepted, and the exact target/batch below is separately approved. Approval must name: pinned commit (proposed `c26096b45cf8b1346fd686b6ab2925c4bddd80c9`), exact target and classification, migration owner over verified TLS, maintenance window/operator, accepted G2 evidence reference, and confirm pgvector availability on the target. Execution sequence is unchanged from the [1 November checklist](A01_HOSTED_ACTIVATION_2026-11-01.md#controlled-g3-execution-after-g1g2-approval): `prisma migrate status` → `deploy` → `status` → repeat `deploy` from `packages/database`, followed by the G1 file, Phase 02/03 audits and Phase 04 checks. No reset, `db push`, `migrate resolve`, history edit or down-migration.

## 6. Migration hashes (repository, recomputed at `c26096b`)

All ten files are byte-identical to the 1 November record; **no migration was added by A02 or its hardening (PR #17, #18)**, so the batch is unchanged. Hosted history was not re-read this session.

| State (as of 1 Nov) | Migration                                   | SHA-256                                                            |
| ------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| Installed           | `20261021181359_foundation`                 | `890a973c27f733518e92ff4522a15b9becb7802dc839b9fd8c671951c333954e` |
| Installed           | `20261022100000_core_platform`              | `0346eebe78c8eb6a3b25c26f7e4852ee1a6d5087c5186159faf520cf888e62fd` |
| Installed           | `20261022110000_onboarding_drafts`          | `0f658c7fe0fb65e666c29c18c8faf99ba8f710e04890521fbc9bd5736ba0d088` |
| Pending 1           | `20261023090000_migration_history_security` | `658461b473b04c550c12ecb4aad35a39a448f875207aeb00ad38b0873bd03dd0` |
| Pending 2           | `20261023100000_research_library`           | `c2132489d09eb4c72667ab4c1168046d3975eddd22f4624b0f302eac81c4c5ce` |
| Pending 3           | `20261023120000_scanner_fencing`            | `bd1e3f3d857fc9e97bd67ddcf46c31bb8dc187597022d58017d12cb58fa26e12` |
| Pending 4           | `20261023150000_ai_research`                | `8771ec88815f66b1c4ec93f4d301f4013de0d173cadbd62f2c04d773fb047b33` |
| Pending 5           | `20261023160000_ai_retention`               | `56306700bde555997ff9c493f5aa7c98b8fa7c1a1a031bc3fb6cc5f8a639e26a` |
| Pending 6           | `20261023170000_ai_stream_authorization`    | `52408a6125d8f5428bf35ac4ebd939b4cffcfe1c53a21672b33bbc97e4e5250b` |
| Pending 7           | `20261024090000_documents_tasks`            | `ec011da8b0c2c5342009bf1f1aa3fdcf6afae39ec5f0fc64738f6e1a009a73ce` |

Script hashes: G1 SQL `0f6a130ee3725fe55cf550454daa9d472e73db989adbcb5f0690c0e9238919e3`; history gate `6bf18f39ef64ef72186fdd7e8d95aaa567d1692908f91dcb322e6f2ef5faed43`; G2 baseline `590b38635b7ba4e7dd0b8d77d2edd879e179cbd832782e5d05a9ae0956576893`; Phase 02 audit `a26cd4729a590c536ae5b028261161abe51aa643f433ec981ea20b4dc17fa3d3`; Phase 03 verification `1441673efbdafe87255fbb2c59d5604106b3a024b8164b9e5f262af9c81171df`.

## 7–8. Data integrity, security and Auth validation

Hosted: none this session. Local/disposable (no hosted credentials loaded): see the PR for the repository check matrix; the full ten-migration chain, repeat deploy and the A01 history gate pass on disposable PG17 in CI and locally. These do not substitute for hosted evidence.

## 9. Remaining blockers

G1 authenticated denial; G2 complete approval packet and execution; G3 approval and execution; G4 Storage/scanner/extractor/worker deployment; G5 synthetic hosted workflow; G6 paid AI; G7 production. G4–G7 are unchanged and remain blocked.

## 10. Operator decisions required

1. Grant this workflow (or a named operator) authorized, read-only access to `hgngonpirctrwbckhbmy`; this session's connector cannot reach it.
2. Classify the target as development/staging explicitly, or name another target.
3. Provide an already-authorized Atlas development session for the G1 probe (or separately authorize creating one).
4. Fill and approve all 14 G2 fields.
5. After G2 acceptance, approve the G3 batch at a pinned commit.
