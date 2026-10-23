# Phase 02 development activation plan

Status: prepared; **no hosted changes authorized or applied in this hardening session**.
Target: **Atlas Research**, `hgngonpirctrwbckhbmy`, organization `atlasresearch`, Seoul, PostgreSQL 17.11. The dashboard's `main / PRODUCTION` label does not override the previously approved development identity. No other project is in scope.

## Observed preflight — 23 October 2026

- GitHub PR #7 is merged at `5882ff5`; hardening starts from that `master` commit.
- Prisma history contains exactly the three foundation/core/onboarding migrations, each finished, none rolled back. Their SHA-256 checksums match the repository.
- There is one existing Auth account, profile and project. Preserve all existing accounts, grants and research containers.
- `_prisma_migrations` is owned by `postgres`, RLS disabled. Effective `anon` and `authenticated` privileges include SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER (and PostgreSQL 17 MAINTAIN). No separate column ACLs were found. Anonymous HTTP `GET /rest/v1/_prisma_migrations?select=id&limit=0` returns **200**; no history rows or logs were fetched over HTTP. The same probe on `projects` returns 401.
- The approved runtime `atlas_app_dev` is only a member of `atlas_runtime`, not a table owner or BYPASSRLS role. Migration owner `postgres` has BYPASSRLS. Existing Phase 01 RLS, deny-DML and composite FKs remain installed.
- Actual `postgres` default privileges in `public` automatically grant browser roles ALL on future tables and sequences. Managed `supabase_admin` defaults also exist; these are outside the Prisma creator change.
- No Phase 02 tables or `atlas-quarantine` / `atlas-sources` buckets exist. No `storage.objects` policies were found.
- Signed-in Chrome dashboard: **Free Plan does not include project backups**. No backup, PITR or restore point is available. A recovery snapshot and isolated restore check are an activation prerequisite; a paid upgrade is not authorized.

## Priority 0: independently applicable remediation

Reviewed SQL: `packages/database/prisma/migrations/20261023090000_migration_history_security/migration.sql`.

It enables RLS without FORCE and without browser policies; revokes ALL table privileges from PUBLIC and existing browser roles; and revokes browser/PUBLIC defaults on future public tables/sequences created by the executing Prisma role. It does not revoke owner privileges, alter role membership, grant new access, change existing domain policies, or change auth/storage/managed-role defaults. `service_role` access is retained; this request targets browser roles. Future schema creators other than the approved Prisma role need their own reviewed defaults.

RLS alone cannot stop TRUNCATE or protect migration metadata from all existing privileges. Effective table and column privilege probes are mandatory. Do not FORCE RLS: Prisma must continue to read/write its history through the approved owner. Disposable tests exercise actual browser-role SELECT/INSERT/UPDATE/DELETE/TRUNCATE denial, all eight privilege probes, future table/sequence defaults, and a subsequent Prisma migration after hardening.

After explicit authorization, this idempotent SQL can be applied alone using `postgres` over the verified session pooler. It does not create a Prisma history row when applied directly. Later `prisma migrate deploy` safely re-executes it and records its checksum. Do not use Supabase migration history as a substitute for Prisma's history.

Immediately verify `ops/sql/phase-02-security-audit.sql`: browser table/column privilege results must all be false for history; RLS true, FORCE false, no policies. Repeat the anonymous zero-row HTTP probe: require 401/403, not merely an empty 200. Verify signed-in `authenticated` denial with a real development session when available. Do not perform destructive browser-role DML probes on hosted history; those belong only in the disposable regression.

## Priority 1: additive activation after recovery readiness

1. Reconfirm project, current user `postgres`, hostname, session port 5432, database `postgres`, verified TLS/approved CA, migration checksums, completed history and existing counts. Never print connection values. Root `.env` is migration-only; preserve the separate non-owner web runtime.
2. Capture a protected recovery snapshot of public/atlas_private schema and data, migration history, role/ACL definitions (without passwords), and necessary Auth/Storage metadata using the approved connection. Encrypt it outside the repository and keep its decryption key in an approved secret store. Record timestamp, checksum and retention owner. Database backups do not back up Storage object bytes; these buckets currently contain no objects because they do not exist.
3. Restore the snapshot into a fresh isolated PostgreSQL 17 environment with the required schemas/roles. Compare table counts, history checksums, constraints and effective grants. Never restore over the hosted project. Stop activation if snapshot or restore verification fails. Recovery uses the protected snapshot under separate incident approval; there is no automatic destructive down-migration.
4. Apply Priority 0 first if still pending, and verify effective denial.
5. Review and apply the existing **unchanged** additive `20261023100000_research_library` and new `20261023120000_scanner_fencing` via Prisma `migrate deploy` using only the approved migration role. No reset, db push, resolve-as-applied shortcut or account deletion. The original migration creates private PDF-only 25 MiB buckets conditionally when Storage exists; verify the actual limits as well as privacy.
6. Run Prisma `migrate status`, repeat deploy (no pending migrations), and compare pre/post account/project counts. Run the committed read-only audit: all public tables RLS-enabled, browser domain/history grants denied, approved runtime SELECT/function grants only, composite FKs intact, old unfenced scanner functions absent, internal cleanup table inaccessible, buckets private with exact size/MIME limits, and no browser object policies.
7. Run `tests/hosted/connectivity.test.ts` explicitly with `ATLAS_APPROVED_DEV_PROJECT=hgngonpirctrwbckhbmy`. The repository's broad `test:hosted` script also discovers the separately opt-in provider tests; it is unchanged. These checks never create users or mutate domain data.
8. Hosted workflow smoke testing needs a verified real session, an approved test project/paper/upload, a server-only Storage service credential, and the deployed scanner integration. Use only synthetic public metadata and a harmless test PDF. Verify search → save/reload → collection/tag → quarantine → real scan → READY → reader/annotation/export, plus denied cross-account access and direct Storage listing. This workflow writes test records and therefore requires explicit approval too; do not claim a read-only catalog audit proves it.

## Priority 3: scanner deployment approval

`ops/scanner/compose.yml` is a concrete development integration, not a deployed service. It separates a credentialed HMAC broker from a secret-free, Internet-isolated ClamAV/qpdf validator and a separate definition updater. See [scanner deployment](../library/SCANNER_DEPLOYMENT.md). Approval must identify the host, HTTPS Atlas **live-mode** origin, mounted HMAC secret, server-only Storage credential, log policy and available resources. No hosting purchase, production deployment or secret issuance is implicit.

Apply the scanner-fencing migration and server code together before starting the worker: completions now require the exact claim `attempt`. Old clients must fail closed. Configure fresh definitions and verify clean/malformed/encrypted/EICAR/oversized/timeout cases before processing real files. An unavailable validator or missing/stale signatures must never yield READY. Retry and cleanup depend on the broker continuing to poll; operators must monitor failed jobs and durable cleanup backlog.

## Approval requested only after local review

Authorize, separately if desired: (A) Priority 0 security SQL on the named development project; (B) protected backup + isolated restore, followed by additive Phase 02 activation only if recovery verification succeeds; (C) the identified development scanner host/origin/secret configuration and synthetic hosted workflow smoke writes. No production promotion, merge, paid upgrade or unrelated project is included.
