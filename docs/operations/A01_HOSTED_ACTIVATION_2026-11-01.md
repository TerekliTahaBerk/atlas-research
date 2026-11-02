# A01 hosted activation verification — 1 November 2026

**2 November 2026 continuation:** see [A01 G1–G3 activation result](A01_G1_G3_ACTIVATION_RESULT.md). G1 remains `OPEN — VALID AUTHENTICATED SESSION REQUIRED`; this session had no authorized access to the target (connector permission denied), so no hosted check, export, write or migration ran. G2 and G3 remain `NOT RUN — APPROVAL REQUIRED`. All ten repository migration hashes are unchanged at `c26096b`; A02 added no migration. The authenticated probe is now scripted in `ops/g1/authenticated-probe.mjs`.

Core hosted evidence collected **18:25–18:32 UTC / 21:25–21:32 Europe/Istanbul**; supplementary compatibility counts and local plan validation completed through 18:45 UTC. Repository baseline: `f5d60a558c207ded08aaf51a648972489b7237a6`; dedicated branch `test/a01-hosted-g1-g2`. Latest master [run 41335396362](https://github.com/TerekliTahaBerk/atlas-research/actions/runs/41335396362) passed quality, isolated-auth and offline-engines. No open PRs were returned at preflight.

Authorization: this session permits named-project read-only verification and repository preparation only. **No hosted export, DDL/DML, remediation, migration, user/session creation, token refresh, restore, resource purchase/provisioning or deployment was performed.** No database passwords, session tokens, response bodies or personal row contents are retained here. Earlier A01 observations remain historical evidence.

## Status register

| Classification    | Result                                                                                                                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VERIFIED          | Project identity/health/plan, counts, three installed migration checksums, history RLS/owner, effective privileges/memberships/defaults, anonymous HTTP denial, seven pending migrations                                                     |
| FAILED            | No failure observed in completed G1 history-security checks; missing evidence is not a pass                                                                                                                                                  |
| NOT RUN           | Authenticated HTTP probe; real backup/object export, restore and recovery validation; hosted Prisma deployment; two-actor hosted writes                                                                                                      |
| BLOCKED           | **G1 remains OPEN**: no already authorized valid Atlas development access session available. G2 lacks destination, recipients, retention, custodians and exact export/test scope. G3 depends on closed G1, accepted G2 and separate approval |
| APPROVAL REQUIRED | G2 source/export scope, destination/provisioning, encryption recipients/key custody, retention/cleanup, restore writes and destination-only test identities; G3 exact migration batch after G2                                               |

## G1 evidence

| Observation              | Fresh result                                                                                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Exact target             | Atlas Research, `hgngonpirctrwbckhbmy`, organization `atlasresearch` / `chtmbnvkvyokessljprm`                                                                                                                                                                      |
| Platform                 | **ACTIVE_HEALTHY**, Free, `ap-northeast-2`, platform PG `17.11.0.003`; SQL server `17.11`                                                                                                                                                                          |
| SQL identity/transport   | `current_user=session_user=postgres`, database `postgres`, current backend `ssl=true` through the connector. This does not re-certify a future CLI service file/CA                                                                                                 |
| Existing records         | Auth users **1**, public profiles **1**, public projects **1**; counts only                                                                                                                                                                                        |
| History                  | Owner `postgres`; RLS **true**, FORCE **false**, policies **0**                                                                                                                                                                                                    |
| Table privileges         | Both `anon`/`authenticated`: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN all **false** (16 checks)                                                                                                                                     |
| Column privileges        | SELECT, INSERT, UPDATE, REFERENCES all **false** for both roles (8 aggregate checks); exhaustive individual-column exposure count **0**                                                                                                                            |
| PUBLIC history grants    | **0** effective raw PUBLIC table ACL entries; column access is included in exhaustive checks                                                                                                                                                                       |
| Browser roles            | NOLOGIN, INHERIT, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE; no direct or transitive parent memberships                                                                                                                                                   |
| Current creator defaults | `postgres`, global + public table/sequence browser/PUBLIC/inherited exposure count **0**; owner/service_role defaults retained                                                                                                                                     |
| Anonymous HTTP control   | Existing active publishable key, `GET /auth/v1/settings`: **200**                                                                                                                                                                                                  |
| Anonymous history probe  | Same key, no user bearer token, `GET /rest/v1/_prisma_migrations?select=id&limit=0`: **401**. Only status recorded; no response body logged                                                                                                                        |
| Authenticated probe      | **NOT RUN / BLOCKED**. Browser inventory had a Supabase management dashboard but no Atlas application development session. Dashboard OAuth is not an Atlas Auth session. SQL counts show three Auth sessions; their credentials were not read, refreshed or reused |

The local web/root environment files are absent. The first local-config HTTP attempt was BLOCKED before sending requests; the successful anonymous check used the connector's existing public project key over non-echoing process input, never in command arguments/output or a saved credential file. No new key was issued.

The exact committed [read-only evidence SQL](../../ops/sql/a01-hosted-g1-verification.sql) was executed on the named target. It uses `BEGIN READ ONLY`, SELECTs and COMMIT; it does not run the remediation or attempt destructive authorization probes. All eight/four privilege types and actual owner defaults are explicit. Compare catalog results, not just ACL strings or empty HTTP data.

**Residual scope limits:** `postgres` still has explicit public-function EXECUTE defaults for `anon`/`authenticated`; managed `supabase_admin` public table/sequence/function browser defaults and managed Storage defaults also remain. These are outside the existing history/current-Prisma-creator table/sequence correction and were not changed. No browser-callable public SECURITY DEFINER function was found (count 0); browser USAGE on `atlas_private` is false. Future functions/other creators require explicit ACL review; this is not a blanket certification of the entire Data API.

### Close G1 without a write

1. Re-run the read-only file and checksum comparison immediately before closing the gate. Every recorded installed entry must be completed and unrolled-back; unexpected/missing/changed history stops the process.
2. With an **already authorized unexpired development access token**, verify `/auth/v1/user` against this exact project (SDK `getUser`, no refresh/sign-in). Internally require a valid nonanonymous development user; retain only validation success/HTTP status, never identity payload or token.
3. Using that same bearer token and valid public key, send the same zero-row history GET. Record status only. Require permission denial (401/403) and internally distinguish a database permission error from a gateway/expired-token error; repeat user validation afterward if token validity could have changed. Never classify an invalid token, network failure or an empty 200 as denial.
4. If no valid session is available, leave G1 OPEN. Creating/logging in/refreshing a session requires separate authorization and is not part of this task. Do not read tokens from Auth tables, browser credential stores or management sessions.
5. **Do not reapply remediation while the catalog contract passes.** If it regresses, stop and prepare fresh exact-target/SQL approval; this prompt grants none.

## Migration evidence and G3 batch

Checksums were computed from exact repository bytes and compared programmatically with hosted history. All three installed entries match, are finished and have no rollback marker. No extra entry exists.

| State             | Migration                                   | SHA-256                                                            |
| ----------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| Installed / match | `20261021181359_foundation`                 | `890a973c27f733518e92ff4522a15b9becb7802dc839b9fd8c671951c333954e` |
| Installed / match | `20261022100000_core_platform`              | `0346eebe78c8eb6a3b25c26f7e4852ee1a6d5087c5186159faf520cf888e62fd` |
| Installed / match | `20261022110000_onboarding_drafts`          | `0f658c7fe0fb65e666c29c18c8faf99ba8f710e04890521fbc9bd5736ba0d088` |
| Pending 1         | `20261023090000_migration_history_security` | `658461b473b04c550c12ecb4aad35a39a448f875207aeb00ad38b0873bd03dd0` |
| Pending 2         | `20261023100000_research_library`           | `c2132489d09eb4c72667ab4c1168046d3975eddd22f4624b0f302eac81c4c5ce` |
| Pending 3         | `20261023120000_scanner_fencing`            | `bd1e3f3d857fc9e97bd67ddcf46c31bb8dc187597022d58017d12cb58fa26e12` |
| Pending 4         | `20261023150000_ai_research`                | `8771ec88815f66b1c4ec93f4d301f4013de0d173cadbd62f2c04d773fb047b33` |
| Pending 5         | `20261023160000_ai_retention`               | `56306700bde555997ff9c493f5aa7c98b8fa7c1a1a031bc3fb6cc5f8a639e26a` |
| Pending 6         | `20261023170000_ai_stream_authorization`    | `52408a6125d8f5428bf35ac4ebd939b4cffcfe1c53a21672b33bbc97e4e5250b` |
| Pending 7         | `20261024090000_documents_tasks`            | `ec011da8b0c2c5342009bf1f1aa3fdcf6afae39ec5f0fc64738f6e1a009a73ce` |

The first pending migration's **effects** match current security catalogs, but its **Prisma history row is absent**. Its unchanged SQL enables RLS (not FORCE), revokes existing browser/PUBLIC table privileges and executing creator defaults; repeat execution under the same verified owner is idempotent and preserves application rows/owner access. Once G2 passes and G3 is approved, normal Prisma deployment may execute it again and record the exact checksum before the remaining six migrations. Do not `migrate resolve`, insert a history row manually, skip the file or reapply it as part of this read-only G1 task. Disposable full-chain/repeat-deploy evidence remains in the A01 report/CI; no hosted deploy occurred here.

### Controlled G3 execution after G1/G2 approval

1. Approve the exact seven-file list above at a pinned repository head, development/staging classification, source role, maintenance window, operator and fresh accepted G2 backup/restore evidence. No production-labelled branch write is inferred from this checklist.
2. Reverify health/identity, verified TLS/session pooler, owner, runtime isolation, all current counts/hashes/history/defaults, no unfinished migrations and no concurrent migration process. Freeze application/job writes only under the approved maintenance action. Recompute all ten file hashes. Halt on drift.
3. Verify destination-tested pgvector availability in `extensions` before deployment. Current hosted vector is absent; Supabase selects its supported default extension version, so record actual installed version/operators afterward. Never force an unsupported version or alter an unexpected existing namespace.
4. Secret manager injects only the exact Atlas migration `DIRECT_URL` with verify-full/approved CA into an operator-only process. Do not print it, write it to source, or reuse it in web/worker processes. From repository root, run the following **only after G3 approval**:

   ```sh
   pnpm --filter @atlas/database exec prisma migrate status
   pnpm --filter @atlas/database exec prisma migrate deploy
   pnpm --filter @atlas/database exec prisma migrate status
   pnpm --filter @atlas/database exec prisma migrate deploy
   ```

5. Require ten completed matching history entries, no pending work on repeat deploy, unchanged existing account/profile/project IDs/counts/content hashes and all preexisting grants/constraints. Run the G1 evidence file, `ops/sql/phase-02-security-audit.sql`, `ops/sql/phase-03-verification.sql` and Phase 04 activation checks. Verify actual extension namespace/operators, 25 MiB PDF-only private buckets, no browser object policies, all RLS/composite FKs, fixed function owners/search paths and narrow runtime/worker EXECUTE. Creation of schema/buckets by reviewed migrations does not approve brokers, hosted workflow writes or paid AI.
6. On error, stop deployment/dispatch and preserve redacted error/category plus request/job IDs; inspect transactional state and actual history before a reviewed forward repair. Never reset, `db push`, rewrite/resolve history or perform destructive down-migrations. Restore only to the independently approved recovery target under incident authorization; preserve source/version/citation identity. G4–G7 stay separate.

## G2 current recovery inputs

Observed: public schema contains 11 tables including Prisma history, all RLS-enabled and owned by `postgres`; `atlas_private` supplies functions/policies. Exactly one Auth identity and three sessions/refresh-token records exist (counts only). `atlas_app_dev` is LOGIN, non-owner/elevated-role-free and granted only `atlas_runtime`; `atlas_runtime` is NOLOGIN. No `atlas_ai_worker` exists yet. No Atlas research/AI/document tables, vector extension, buckets or objects exist; managed Storage vector bucket/index counts were separately checked and are both zero. All 45 current FKs in public/auth/storage use MATCH SIMPLE and are validated.

Installed extensions: `pg_stat_statements` 1.11, `pgcrypto` 1.3 and `uuid-ossp` 1.1 in `extensions`; `plpgsql` 1.0 in `pg_catalog`; managed `supabase_vault` 0.3.1 in `vault`. Vault key/secret contents were not read. Repository migrations contain no Vault/pgsodium dependency. A destination-compatible extension/configuration review remains required; extension presence does not prove secrets can be recovered.

The executable, approval-gated [G2 procedure](A01_G2_RECOVERY_PROCEDURE.md) covers application + Auth/Storage recovery, encryption, destination isolation, two actors, validation, retention and cleanup. **No real recovery export or restore has run.** The earlier 36-table synthetic CI drill does not close G2.

## Next approval decision

G1 can close only after valid-session authenticated HTTP denial is evidenced. G2 preparation is ready for review, but execution requires all fields in the [approval manifest](A01_APPROVAL_MANIFEST.md#g2) and the recovery procedure's approval record: exact fresh destination/region/platform/budget, encrypted storage path/provider, age recipients and separately protected identities, data scope (including sensitive Auth records), retention/expiry, named operators/custodians/verifier, source consistency method and destination-only test/cleanup permissions. **No destination or encryption recipient is currently approved.** G3 remains separately unapproved even after G2 approval.

## Repository verification and release boundary

- The committed G1 evidence SQL was executed read-only against the exact Atlas target; all history-contract checks passed.
- The future G2 fingerprint SQL was executed **only** on the existing synthetic local PG17 metadata fixture (`127.0.0.1:55439`, `atlas_p01_test_a01_security`): 12 valid JSON records and a 64-character SHA-256 table fingerprint. The cluster was stopped afterward. This is syntax/fixture validation, not a hosted export or recovery rehearsal.
- All three recovery shell blocks passed `bash -n`; no capture/decryption/restore command was executed. Documentation relative links and branch-specific Vercel JSON checks passed. Age commands/keys and target-specific restore compatibility remain NOT RUN/BLOCKED.
- `apps/web/vercel.json` disables automatic deployment for **only** `test/a01-hosted-g1-g2`, following [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration). Existing hosted settings were not changed. No deployment command or automatic merge is run. Master retains its existing Git behavior: before a later human merge, separately decide how to prevent/approve any Git-triggered deployment; repository approval alone is not hosted-operation approval.
- Local PASS: `pnpm lint`, `pnpm typecheck`, `pnpm test` (253), `pnpm db:validate`, `ATLAS_MODE=preview pnpm build`, `ATLAS_MODE=preview pnpm test:e2e` (101) and `pnpm format:check`. No hosted runtime credentials were loaded; local environment files are absent. Full integration/Auth/engine reruns use the existing disposable PR CI, not hosted Atlas.
- G1 SQL file SHA-256: `0f6a130ee3725fe55cf550454daa9d472e73db989adbcb5f0690c0e9238919e3`; future G2 baseline file SHA-256: `590b38635b7ba4e7dd0b8d77d2edd879e179cbd832782e5d05a9ae0956576893`. Hashes pin the exact reviewed scripts; only the first ran hosted.
- Final PR-head CI status is recorded in the dedicated PR checks; no later result is inferred from the historical master run.

Verdict: **G1 OPEN; G2 EXECUTION BLOCKED; G3 APPROVAL REQUIRED.**
