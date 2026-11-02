# Atlas development activation — 2 November 2026 execution

This execution record supersedes earlier G1/G2 access and approval blockers. The user explicitly classified `hgngonpirctrwbckhbmy` as development/staging and approved the sensitive G2 capture and local restore. G3 was explicitly approved by the user and **PASS** at 16:24:22 UTC / 19:24:22 Europe/Istanbul. G4/G5 remain unexecuted; paid AI and production are outside authorization.

PR #21 merged to master `6b9e9754d17269a965f81911ed4b0fe948b6205a`. [Master CI](https://github.com/TerekliTahaBerk/atlas-research/actions/runs/41420047829): quality, isolated-auth and offline-engines PASS. Working branch: `test/a01-hosted-activation-execution`; operator scripts/documentation currently uncommitted. No historical migration SQL changed.

## G1 — PASS

Direct connection: `db.hgngonpirctrwbckhbmy.supabase.co`, postgres/postgres, PG17.11, verify-full with official Supabase CA; backend TLS true. Read-only catalog and asserting history gate PASS: RLS enabled, FORCE false, no policies/browser privileges/memberships/PUBLIC history grant/unsafe table-sequence defaults. Three installed migrations match the first three hashes below.

Normal user-authorized email login, without extracting tokens from storage/database: getUser 200 → history GET 403 / SQLSTATE 42501 → getUser 200. Anonymous control: Auth settings 200, history 401. One transient Auth-settings 522 was retried successfully. No history correction SQL was reapplied. Existing database password entered only through a nonce/origin-protected loopback form; no password reset occurred.

## G2 — PASS at 10:40:19 UTC

Approved source: Atlas development project above. Destination: `/Users/berk.terekli/AtlasRecovery/2026-11-02/capture-20261102T100423Z`, FileVault Mac, owner-only files. Six initial age-encrypted exports streamed directly from one held repeatable-read, read-only snapshot. Age identity resides separately in this user's macOS Keychain; ciphertext custody/decryption tested. No source role passwords exported. Scope includes application/history, role/security metadata and explicitly approved sensitive Auth records. Storage inventory zero buckets/objects, Vault secrets zero. No offsite copy; incremental cost $0.

Capture: 154.9 seconds. Capture cutoff to accepted application/security validation: 2,156.1 seconds (35m56s), including target preparation and compatibility investigation; this is an operator wall-time observation, not a guaranteed RTO. Snapshot timestamp 10:04:23 UTC; no continuous backup/PITR or incident RPO guarantee.

Isolated official `supabase/postgres:17.11.0.003@sha256:7374d196da7e301512cc5329e18040e0f7bb856287b323777cdadecccbc6c7e4`, GoTrue v2.197.0, Storage v1.79.32. Internal service network; only gateway binds 127.0.0.1 ports 54322/55434. Distinct destination passwords and signing secret; no outbound email/provider dispatch. Actual network bindings verified.

- 44 original content/count hashes match exactly before approved clone-session sanitization. Auth/Storage bootstrap history tables are separately compared, with original encrypted history retained as reference. Original Prisma history matches exactly.
- 48 actual FK orphan probes pass, including replica-loaded managed data. Original constraints, all 8 triggers, 157 indexes, 433 columns, functions/owners/security-definer settings/ACLs, RLS, policies, relation/column/default grants, application role flags and extension versions verified. Equivalent invitation CHECK parsing was verified by reparsing the exact source expression in an empty temporary table, preserving all predicates.
- Local bootstrap's extra public browser/default grants removed to match source. Four source platform Auth indexes restored. No source alteration.
- Auth bootstrap versions: exact 82/82. Storage source 75 versus public local 74: cloud-only `unlock-object-versioning` function/trigger restored locally and dark-launch constraint removed. Vendor checksum differences pinned at IDs 2 and 62; original vendor histories retained, never overwritten/fabricated. Every source column/index/trigger/function/constraint verified independently. Two empty local-only iceberg tables have RLS and no browser grants. These are expected local bootstrap differences, not identical platform deployment claims.
- After exact Auth hashes passed, clone sessions/refresh/flow/one-time records invalidated on destination only. Normal isolated email delivery/verification authenticated the restored actor; actual Atlas `/me` and existing-project reads returned 200. A synthetic outsider got 404; anonymous got 401. Web login `atlas_auth_runtime` is non-owner, no superuser/BYPASSRLS/DB/role creation or history SELECT. Real local Storage API returned empty inventory.

Backup expiry: 2 December 2026 10:04:23 UTC. Isolated restore expiry: 9 November 2026 10:04:23 UTC. Approval authorizes cleanup only of these copies at expiry; no scheduled deletion is claimed. Keys and local protected credentials stay outside Git/logs. Same-Mac encrypted backup does not protect against loss of the Mac.

Receipt SHA-256: `72073f79b8944c81a19893c2fab32897e80444f81c1c66bd567ce8ba571fe960`. Protected receipt and redacted acceptance JSON reside beside encrypted archives; private source content, passwords and sessions are excluded from this report.

## G3 — approved and executed

Target only `hgngonpirctrwbckhbmy`, user-approved development/staging, migration owner postgres over direct verify-full TLS. Baseline master `6b9e9754d17269a965f81911ed4b0fe948b6205a`. First three installed; exactly nine pending, in order below. Approval window proposed: immediately after user approval in this execution session, operator Codex on this Mac, incremental cost $0.

Normal Prisma status → deploy → status → repeat deploy, then all 12 exact completed checksums, original application data preservation, G1 and relevant SQL audits. Changes add research/library/scanner/AI/documents/tasks/interoperability schema and permissions, including pgvector; no paid AI call or production promotion. No reset, history rewrite/resolve or destructive rollback. Stop on drift/failure; preserve source and encrypted backup, review forward repair. Worker/runtime deployment and synthetic hosted writes are separate later gates.

| State     | Migration                                   | SHA-256                                                            |
| --------- | ------------------------------------------- | ------------------------------------------------------------------ |
| Installed | `20261021181359_foundation`                 | `890a973c27f733518e92ff4522a15b9becb7802dc839b9fd8c671951c333954e` |
| Installed | `20261022100000_core_platform`              | `0346eebe78c8eb6a3b25c26f7e4852ee1a6d5087c5186159faf520cf888e62fd` |
| Installed | `20261022110000_onboarding_drafts`          | `0f658c7fe0fb65e666c29c18c8faf99ba8f710e04890521fbc9bd5736ba0d088` |
| Pending 1 | `20261023090000_migration_history_security` | `658461b473b04c550c12ecb4aad35a39a448f875207aeb00ad38b0873bd03dd0` |
| Pending 2 | `20261023100000_research_library`           | `c2132489d09eb4c72667ab4c1168046d3975eddd22f4624b0f302eac81c4c5ce` |
| Pending 3 | `20261023120000_scanner_fencing`            | `bd1e3f3d857fc9e97bd67ddcf46c31bb8dc187597022d58017d12cb58fa26e12` |
| Pending 4 | `20261023150000_ai_research`                | `8771ec88815f66b1c4ec93f4d301f4013de0d173cadbd62f2c04d773fb047b33` |
| Pending 5 | `20261023160000_ai_retention`               | `56306700bde555997ff9c493f5aa7c98b8fa7c1a1a031bc3fb6cc5f8a639e26a` |
| Pending 6 | `20261023170000_ai_stream_authorization`    | `52408a6125d8f5428bf35ac4ebd939b4cffcfe1c53a21672b33bbc97e4e5250b` |
| Pending 7 | `20261024090000_documents_tasks`            | `ec011da8b0c2c5342009bf1f1aa3fdcf6afae39ec5f0fc64738f6e1a009a73ce` |
| Pending 8 | `20261102120000_reference_interop`          | `f37cfec83fed1505ef49d5462a850b476ef6aada57700313549edacbc213cc14` |
| Pending 9 | `20261102130000_zotero_throttle`            | `423a3d5186989f6c2739b5766d9fddae5dcd6729ca7352ee759c764d4e46cdcc` |

G3 execution: exact restored-data rehearsal passed status → deploy → status → repeat deploy in 4.37 seconds, all 12 checksums correct. The initial local rehearsal identified the database-owner/`pg_database_owner` mapping difference (source database owner postgres; vendor local bootstrap owner supabase_admin). Both local database ownership and public schema ownership were aligned with the source; a separate fresh rehearsal copy was used, preserving the original restore. No migration history repair/reset/resolve was used.

Hosted sequence completed status 1 (the exact nine pending names) → deploy 0 → status 0 → deploy 0, 98.79 seconds for deployment/post-check sequence. All 12 installed names/checksums complete and unrolled-back; original 10 application table content/count hashes preserved. RLS missing 0; browser table/column access 0; browser private-function access 0; web-to-worker membership false; worker direct table access 0; pgvector 0.8.2.

Direct IPv6 timed out before writes. Migration used the same project's verified Supabase session pooler 5432 as postgres. Native checks used verify-full; Prisma used `require`, `sslaccept=strict` and the official single Supabase Root 2021 CA. macOS native TLS rejected both the CA bundle and single root, so the approved deployment ran in a pinned official Node 24.21.0 Linux image with OpenSSL 3.0.22, exact Prisma 7.10.1 engine hash `d1b3f377ca835d73fd50954a5e22128b9ebdd6b8`, verified official compressed-engine SHA-256 `aee61c23442accf150d3b253d3b829c15085ea810fd690c5f38944cd64f9cb0e`. Strict TLS was never disabled. Initial local CLI/path/TLS failures did not execute hosted migration SQL.

Encrypted G3 before/after baselines, Prisma outputs and G1/Phase02/Phase03 audits are retained under the approved recovery directory; redacted `g3-result.json` records ciphertext hashes. G1 catalog/asserting history gate passed after deployment. A fresh authenticated HTTP probe after migration is pending the approved synthetic hosted identity stage; the valid normal-user G1 HTTP result above preceded migration and is not misrepresented as a fresh post-migration login.

G4/G5 are not yet operational. No source runtime login/secret issuance, hosted synthetic test data, live web configuration or persistent hosted brokers have been activated by G3. No paid AI call or production promotion.

G3 also created the two reviewed private PDF buckets (`atlas-quarantine`, `atlas-sources`, 25 MiB/PDF-only) through the exact pinned research migration; pre-G2 Storage was empty. This schema configuration is not proof that the scanner/upload pipeline is operational.

Validation of the operator changes: lint, typecheck, schema validation and formatting PASS; 308 unit tests PASS; build PASS; 101 preview browser tests PASS. Initial sandbox-only unit execution failed loopback EPERM and was rerun successfully with the required socket permission, without weakening tests. After adding only the public CA trace configuration, build PASS again: 23 server traces, including API routes, include the approved CA. The actual Node pg runtime connected with verify-full and that relative CA path; TLS peer authorization true. No source app rows were read in that TLS check (identity only). Current operational branch remains separate from master; no new merge is claimed.
