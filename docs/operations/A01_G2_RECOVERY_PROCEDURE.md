# G2 recovery procedure — prepared 1 November 2026

**Execution update, 3 November 2026:** [Current evidence](A01_HOSTED_EXECUTION_2026-11-02.md) supersedes earlier gate blockers: G1–G3 PASS; all 12 migrations are installed. Approved G4 development Storage/scanner and isolated extraction services are running; G5 non-AI hosted journeys and the loopback Zotero fixture passed, and all test identities/content were cleaned. Automatic AI indexing, paid AI, live Zotero credentials and production remain outside this verification.

**PREPARATION ONLY. All capture/restore commands below are NOT RUN and require explicit G2 approval.** Stop before the first export until the approval record is complete. Source is only Atlas `hgngonpirctrwbckhbmy`, PG17.11, Free, Seoul. Never restore over source, use another product's environment, or provision/purchase a destination implicitly. [Current observations and hashes](A01_HOSTED_ACTIVATION_2026-11-01.md) and [approval gates](A01_APPROVAL_MANIFEST.md) govern this procedure.

## Approval record — currently incomplete

| Required field          | Current value                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source and purpose      | Named Atlas project, read-only recovery capture; development/staging classification and maintenance approval still must be recorded for execution                                                                   |
| Fresh destination       | **UNSET**: new Supabase-compatible PG17/Auth/Storage environment, exact reference/host/region, isolation controls, service/image versions, owner and cost ceiling                                                   |
| Backup storage          | **UNSET**: approved encrypted filesystem/object storage outside Git/CI artifacts, exact location/account/region and access principals                                                                               |
| Encryption recipients   | **UNSET**: verified age public recipients/fingerprints, independently stored private identities/key custodian, successful custody/decryption check                                                                  |
| Export scope            | **UNAPPROVED**: all public/atlas_private schema and rows including Prisma history; custom role/ACL metadata without role passwords; required Auth/Storage data and managed-schema/configuration dependency metadata |
| Sensitive Auth scope    | Explicit approval needed for password hashes, identities, existing sessions/refresh-token records in encrypted backup; never fetch or print them during preparation                                                 |
| Consistency             | Approve source write/dispatch freeze or coordinated exported-snapshot + Storage cutoff; define maintenance operator/window and maximum freeze duration                                                              |
| Retention/cleanup       | **UNSET**: backup retention days, rehearsal lifetime/expiry timestamp, deletion authority, access audit and incident/legal-hold exception owner                                                                     |
| People                  | **UNSET**: capture/restore operator, backup custodian, separate key custodian, verifier and incident decision owner                                                                                                 |
| Destination test writes | **UNAPPROVED**: two actors, test runtime credentials, synthetic user/role/membership fixtures, destination-only session invalidation and post-test cleanup                                                          |
| Acceptance              | Agree RPO/RTO targets and tolerated downtime; prior 24h/4h values are hypotheses, not guarantees                                                                                                                    |

Required tools: reviewed PostgreSQL **17** client binaries, psql, age and SHA-256 tooling. PG17 tools exist locally; age is not installed/configured here. No tool installation, key generation or secret issuance is implicit. Check versions/help and verify official distributions before the approved run. Supabase CLI is not installed here; this recipe uses explicit PG client tools, not a guessed CLI default. Official [Supabase restore guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) informs managed-schema handling; [backup guidance](https://supabase.com/docs/guides/platform/backups) explains off-site Free-plan exports and separate Storage bytes. [age](https://github.com/FiloSottile/age) supplies authenticated encryption.

## 1. Target and consistency preflight

An operator configures mode-0600 `PGSERVICEFILE` and protected password facility outside the repo, with distinct services `atlas_a01_source` and `atlas_a01_restore`. Both use explicit host/database/user, `sslmode=verify-full` and approved CA. No passwords/URLs in process arguments, terminal history or logs. Destination must be newly provisioned under approval, have no original personal/research data and have different host/project identity from source. Protect destination access, disable outbound email/webhooks/provider dispatch, keep paid AI unset, and retain distinct Auth signing keys; never reuse source runtime/provider/signing secrets.

Read and record redacted source/destination identities, server/extension/service versions, locale/collation, current backend TLS, owners, migration history and baseline counts. Require compatible PG17, Auth/Storage schemas and required extensions/namespaces on destination. Source's `supabase_vault` extension alone is not a recoverable root key: do not export Vault/pgsodium secrets, settings secrets or encrypted managed content outside the approved scope. If a required encryption dependency is discovered, STOP for an explicit key-recovery plan/approval. No secret retrieval is authorized now.

Recheck **all** source Storage buckets/objects, not only Atlas bucket names. Current counts are zero/zero. This concrete batch approves zero object bytes only if reconfirmed at capture; a nonzero inventory is a scope change and stops capture until the object list/export channel is approved. For an approved nonempty batch, enumerate bucket/key/version/size/checksum, download each immutable object through an approved server identity over TLS, compute SHA-256, encrypt bytes immediately, and retain an encrypted object manifest. Never log signed URLs or make buckets public. Restore bytes via the approved Storage import channel with original object identity and compare every checksum; metadata alone never substitutes for bytes.

Use one consistent source snapshot for application and managed data. In a protected interactive psql session on `atlas_a01_source`, the operator holds:

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT pg_export_snapshot();
-- Keep this session open until every capture/baseline consumer finishes.
```

The snapshot identifier is entered as `ATLAS_SNAPSHOT` into capture terminals; it is not a credential or approval. Baseline SQL consumers start `REPEATABLE READ READ ONLY`, `SET TRANSACTION SNAPSHOT '<identifier>'` before their first SELECT, and use UTC. Capture must finish before the exporting session commits. A snapshot does not freeze Storage bytes or role/configuration changes: approve a coordinated write/configuration freeze/cutoff. If source changes cannot be bounded consistently, STOP; do not claim point-in-time recovery.

## 2. Capture after approval — stream straight into encryption

`ATLAS_RECOVERY_DIR` is an approved absolute directory on protected encrypted storage **outside** the repository; `ATLAS_RECIPIENTS_FILE` lists approved public age recipients. These variables must be supplied, not copied from examples. Operator validates paths/permissions and records approval ID before running. Do not enable shell tracing. Use a new empty directory; partial or failed ciphertext is never a valid backup.

```bash
set -euo pipefail
umask 077
: "${PGSERVICEFILE:?approved protected service file required}"
: "${ATLAS_RECOVERY_DIR:?approved absolute directory outside Git required}"
: "${ATLAS_RECIPIENTS_FILE:?approved age public recipients file required}"
: "${ATLAS_SNAPSHOT:?live exported snapshot required}"
cd "$ATLAS_RECOVERY_DIR"

pg_dump --dbname='service=atlas_a01_source' --format=custom \
  --snapshot="$ATLAS_SNAPSHOT" --schema=public --schema=atlas_private \
  | age --encrypt --recipients-file "$ATLAS_RECIPIENTS_FILE" --output application.dump.age

pg_dump --dbname='service=atlas_a01_source' --format=custom --data-only \
  --snapshot="$ATLAS_SNAPSHOT" --schema=auth --schema=storage \
  --exclude-table-data=storage.buckets_vectors --exclude-table-data=storage.vector_indexes \
  --exclude-table-data=auth.schema_migrations --exclude-table-data=storage.migrations \
  | age --encrypt --recipients-file "$ATLAS_RECIPIENTS_FILE" --output managed-data.dump.age

pg_dump --dbname='service=atlas_a01_source' --schema-only \
  --snapshot="$ATLAS_SNAPSHOT" --schema=auth --schema=storage \
  | age --encrypt --recipients-file "$ATLAS_RECIPIENTS_FILE" --output managed-schema-reference.sql.age

# Preserve service bootstrap history as evidence, never blindly replay it.
pg_dump --dbname='service=atlas_a01_source' --format=custom --data-only \
  --snapshot="$ATLAS_SNAPSHOT" --table=auth.schema_migrations --table=storage.migrations \
  | age --encrypt --recipients-file "$ATLAS_RECIPIENTS_FILE" --output managed-bootstrap-reference.dump.age

# Use an absolute, reviewed repository path: capture runs outside the repo.
: "${ATLAS_REPO_DIR:?absolute reviewed Atlas checkout required}"
psql 'service=atlas_a01_source' -X -q -A -t --set=ON_ERROR_STOP=1 \
  --set=atlas_snapshot="$ATLAS_SNAPSHOT" --file="$ATLAS_REPO_DIR/ops/sql/a01-recovery-baseline.psql" \
  | age --encrypt --recipients-file "$ATLAS_RECIPIENTS_FILE" --output source-baseline.jsonl.age

pg_dumpall --database='service=atlas_a01_source' --roles-only --no-role-passwords \
  | age --encrypt --recipients-file "$ATLAS_RECIPIENTS_FILE" --output roles-reference.sql.age

shasum -a 256 application.dump.age managed-data.dump.age \
  managed-schema-reference.sql.age managed-bootstrap-reference.dump.age \
  source-baseline.jsonl.age roles-reference.sql.age > ciphertext.sha256
```

This split captures **all application tables/data and SQL-managed policies, functions, ownership, constraints, indexes, ACLs and Prisma history**, while keeping managed schema definitions as a reference rather than blindly replaying them. Auth and Storage **data** include their metadata; service-owned `auth.schema_migrations`/`storage.migrations` are captured separately as encrypted reference and excluded from data replay because a compatible fresh service already bootstraps them. Compare their version identities/schema compatibility rather than source installation timestamps; any approved expected difference is explicit in the destination review. Do not overwrite managed migration history. Source managed migrations/service versions must match destination before data import. Current storage vector tables are empty and vector is absent; explicitly verify excluded tables remain empty/nonapplicable or STOP for revised scope. Source role definitions include managed roles as reference only; never blindly apply them to a new Supabase project. Role passwords are excluded; Auth password hashes are confidential data requiring the approval above. Snapshot sharing does not cover role catalogs, so record freeze/time and compare role ACL state immediately before/after capture.

Also capture, privately review and encrypt: per-table counts/canonical content hashes at the same snapshot, migration names/checksums/completion, all schema/column/table/sequence/function grants and memberships/defaults, policy definitions, function ownership/search paths, FK/CHECK/index/trigger metadata, extension namespace/version list and Auth/Storage service/schema versions. Hash application and Auth/Storage rows in UTC using `to_jsonb(row)::text`, stable primary-key or C-collation ordering and SHA-256. Do not print rows or digest manifests to public CI. The [synthetic rehearsal](../../tests/database/rehearse_restore.py) demonstrates canonical fingerprints and PostgreSQL CHECK reparsing; it is not a hosted recovery command.

Record exact Auth Site URL/redirect allowlists, confirmation/recovery/OAuth flags, JWT expiry/issuer and provider names, SMTP configuration references, custom Auth/Storage triggers/policies, bucket privacy/size/MIME limits, Realtime publications, Storage backend/import method and environment/CA references. Redact configuration reports; actual provider/SMTP/signing credentials stay in the separately approved secret store. An existing account's password hashes do not restore external OAuth/SMTP configuration. These configuration settings were **not** verified in this session.

Produce an encrypted Storage inventory even when empty, with capture time, bucket/object totals and cutoff. Once all consumers finish, commit the held snapshot session; record capture end. Copy only completed ciphertext/checksum manifests to the approved off-site location, enforce access/retention and verify transport checksums. No Git artifacts, mailbox exports or public logs.

## 3. Isolated restore after destination approval

Decrypt only onto an approved encrypted work volume, mode 0700, with a private identity file supplied by the key custodian. Keep that file outside both backup storage and the work directory; never log/copy it. Verify ciphertext hashes before decrypting; require successful age authentication. Verify the work path is empty and distinct from source/backup storage. No source-target variable is reused.

```bash
set -euo pipefail
umask 077
: "${ATLAS_RECOVERY_DIR:?approved ciphertext directory required}"
: "${ATLAS_RESTORE_WORK_DIR:?approved empty encrypted work directory required}"
: "${ATLAS_IDENTITY_FILE:?separately protected age identity required}"
cd "$ATLAS_RECOVERY_DIR"
shasum -a 256 --check ciphertext.sha256
for name in application.dump managed-data.dump managed-schema-reference.sql managed-bootstrap-reference.dump source-baseline.jsonl roles-reference.sql; do
  age --decrypt --identity "$ATLAS_IDENTITY_FILE" \
    --output "$ATLAS_RESTORE_WORK_DIR/$name" "$name.age"
done
pg_restore --list "$ATLAS_RESTORE_WORK_DIR/application.dump" > "$ATLAS_RESTORE_WORK_DIR/application.toc"
pg_restore --list "$ATLAS_RESTORE_WORK_DIR/managed-data.dump" > "$ATLAS_RESTORE_WORK_DIR/managed-data.toc"
```

Before applying anything: privately review TOCs and managed-schema differences, extensions, owners and source customizations against the exact pristine destination. Prepare and approve a destination-specific role/ownership/customization patch. Current Atlas custom roles needed are `atlas_runtime` (NOLOGIN, NOINHERIT) and `atlas_app_dev` (LOGIN, only `atlas_runtime`, no elevated attributes/ownership). For this exact baseline, the destination role patch (only when those roles are absent) is:

```sql
CREATE ROLE atlas_runtime NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE atlas_app_dev LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT atlas_runtime TO atlas_app_dev WITH INHERIT TRUE, SET TRUE;
```

These statements are **NOT RUN**, destination-only and contingent on G2 role-patch approval; unexpected existing roles stop execution. Provision fresh destination runtime credentials through the approved secret manager; never restore/reuse source passwords or grant owner/migration privileges to runtime. Managed roles/extensions/Auth/Storage objects come from the compatible destination template; do not recreate/drop them indiscriminately or automatically comment out failures. Existing source customizations require explicit compatible destination SQL before data restoration. Permission/ownership/schema mismatch means STOP.

Only after that patch and a second identity/TLS/destination-empty check, run:

```bash
pg_restore --exit-on-error --section=pre-data \
  --dbname='service=atlas_a01_restore' "$ATLAS_RESTORE_WORK_DIR/application.dump"

# Destination only: approved trigger suppression follows Supabase's restore
# procedure. Both psql commands run inside ONE explicit restore transaction.
pg_restore --exit-on-error --data-only --file=- "$ATLAS_RESTORE_WORK_DIR/managed-data.dump" \
  | psql 'service=atlas_a01_restore' -X --single-transaction \
      --set=ON_ERROR_STOP=1 --command='SET LOCAL session_replication_role=replica' --file=-

pg_restore --exit-on-error --section=data \
  --dbname='service=atlas_a01_restore' "$ATLAS_RESTORE_WORK_DIR/application.dump"
pg_restore --exit-on-error --section=post-data \
  --dbname='service=atlas_a01_restore' "$ATLAS_RESTORE_WORK_DIR/application.dump"
```

Use `set -euo pipefail` for this block too. Exact application TOC and ownership mapping must be approved first; this block is not permission to bypass managed-schema errors. Trigger suppression is confined to the destination data transaction and resets on commit/rollback; never use it on source. It does **not** skip validation afterward. Recreate separately reviewed custom managed triggers/policies/grants and supported publications; check they reference restored roles/resources. No G3 migration deployment is part of G2. Keep destination offline/protected until verification completes.

## 4. Recovery acceptance — no export-only success

Generate a destination baseline by piping `psql` with `ops/sql/a01-recovery-baseline.psql` (omit `atlas_snapshot`) straight into age encryption; compare privately by named schema/object/grantee, not database-specific OIDs or aggregate row order. Re-capture roles/defaults/memberships as credential-free encrypted references. Compare pre-sanitization destination with encrypted source baselines: all application/Auth/Storage table counts and canonical hashes, all three Prisma names/checksums/completion, extensions/namespace/service compatibility, table/column/function/sequence privileges and defaults, owners/search paths, RLS flags/policies, CHECKs/FKs/indexes/immutable triggers and object manifests. Normalize equivalent CHECK deparsing using the same archive's schema-reference roundtrip as in the synthetic rehearsal; never delete predicates or ignore validation differences. Inspect managed customizations separately. Application and Auth user/identity/session data hashes must be exact. Managed bootstrap migration references use the explicitly reviewed version/schema comparison above; destination-specific keys/configuration and later approved session sanitization have separately recorded expected differences. Every other changed/missing table, hash, grant or object blocks acceptance. Never broaden privileges or restore unsafe managed defaults merely to force equality with source: stricter fresh-template differences require explicit review/expected-difference approval while application/history/browser denial remains mandatory.

Because managed data import uses replica mode, verify every FK by actual orphan probes, **including constraints already marked validated**. Current 45 FKs are MATCH SIMPLE. The following destination-only read-only psql generator checks those; any unsupported match type or nonzero count blocks acceptance:

```sql
BEGIN READ ONLY;
SELECT conname,confmatchtype FROM pg_constraint
 WHERE contype='f' AND connamespace IN (SELECT oid FROM pg_namespace WHERE nspname IN ('public','auth','storage'))
 AND confmatchtype<>'s';
-- Require zero rows above. Review generated identifiers/queries, then execute.
SELECT format('SELECT %L AS constraint_name,count(*) AS violations FROM %s child WHERE %s AND NOT EXISTS (SELECT 1 FROM %s parent WHERE %s)',
 c.conname,c.conrelid::regclass,
 string_agg(format('child.%I IS NOT NULL',ca.attname),' AND ' ORDER BY k.i),
 c.confrelid::regclass,
 string_agg(format('child.%I = parent.%I',ca.attname,pa.attname),' AND ' ORDER BY k.i))
 FROM pg_constraint c CROSS JOIN LATERAL generate_subscripts(c.conkey,1) k(i)
 JOIN pg_attribute ca ON ca.attrelid=c.conrelid AND ca.attnum=c.conkey[k.i]
 JOIN pg_attribute pa ON pa.attrelid=c.confrelid AND pa.attnum=c.confkey[k.i]
 WHERE c.contype='f' AND c.confmatchtype='s'
 AND c.connamespace IN (SELECT oid FROM pg_namespace WHERE nspname IN ('public','auth','storage'))
 GROUP BY c.oid,c.conname,c.conrelid,c.confrelid
 ORDER BY c.conrelid::regclass::text,c.conname
\gexec
COMMIT;
```

Require all 45 (or the fresh captured exact count) probes, zero violations, complete composite key mapping and no missing constraint. No silent exclusion of failed queries. Current object count zero means encrypted manifests and API/SQL inventory must both be empty; any nonempty approved batch additionally requires every object SHA-256, metadata association, privacy/size/MIME and application source/reference consistency to match.

After initial comparison, separately approved **destination-only** sanitization invalidates cloned sessions/refresh tokens before exposing Auth, preserves users/identities, keeps outbound delivery off and uses distinct signing keys. Record expected count/hash deltas for this step; do not hide them as restore mismatches. Never revoke source sessions, send source-user email, reuse source keys or change source users/projects.

Exercise the actual application against destination using a non-owner runtime: restored actor A can authenticate with an independently authorized destination session, list their restored workspace/project and read existing data; actor B (approved synthetic destination-only identity) cannot read it, gain private-project access through an organization/workspace admin role, or use foreign IDs. Verify raw SQL and HTTP denial, actor-context pool reuse, revocation and restored history owner access. A viewer/editor role matrix requires explicitly approved destination fixtures/membership changes; no source writes. Re-test private Storage listing/access denial and any approved object reads. Phase 02–04/AI workflows remain unavailable at this three-migration snapshot and are not called operational. If a valid restored login or second actor is unavailable, mark application/two-actor acceptance BLOCKED, not PASS.

Record monotonic capture, decryption, schema/data restore, object restore and validation durations separately; record wall-clock snapshot cutoff and evidence timestamps. Actual RPO = incident/simulated-cutoff time minus captured consistent data cutoff; actual RTO = approved start through **successful application/security/object validation**, not pg_restore exit. Compare agreed targets, document missing external configuration and operator bottlenecks, and obtain verifier sign-off. The earlier 26–36 second synthetic DB-only CI drill is not this measurement.

## 5. Retention and secure cleanup

The approved record must name backup/key custodians, allowed principals, encrypted backup expiry, rehearsal destruction deadline and deletion approver. Keep keys in a separately protected location, audit access and decryption, test recovery of the key without bundling it with ciphertext, and retain only the approved number of encrypted copies. No automatic indefinite retention.

On failed verification: keep source untouched, suspend activation, retain protected/redacted failure evidence and repair only the isolated target under explicit approval; do not restore into source or drop research data. On accepted rehearsal: remove decrypted temporary material from the encrypted work volume through the approved crypto-erasure/storage cleanup process (ordinary unlink is not guaranteed secure erasure on SSD/COW media); revoke destination test credentials and destroy only the named rehearsal environment when its separate cleanup approval permits. Preserve approved encrypted backups and separately held keys until expiry/hold review. Record cleanup receipts and any exception. **No deletion, credential change or infrastructure cleanup is authorized/executed by this preparation task.**
