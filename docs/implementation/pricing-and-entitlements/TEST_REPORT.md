# Commercial implementation and acceptance report

## 1. Phase delivery

R00 audit, R01 catalog, R02 reviewed academic eligibility, R03 workspace entitlements and seats, R04 AI credit accounting, R07 Founding access and R08 application and activation are implemented locally. R05 covers project, upload, private PDF storage and indexing quotas. The Compute follow-up adds isolated Python execution and PDF-producing LaTeX compilation with quota settlement. R06 covers signed sandbox subscription, purchase and refund state. R09 delivers Pricing, Subscription and Usage. R10 delivers an operator console and scoped service metrics. R11–R13 cover authorization, concurrency tests, migration verification and rollout documents.

## 2. Modules

The commercial module extends the canonical Next.js, Better Auth, Prisma and PostgreSQL application. It uses the existing workspace and project IDs, transaction-local identity, existing mail outbox and file worker. Pricing and quota resolution share one typed catalog. The public intake, subscription, usage and operator interfaces are connected to real database-backed routes.

## 3. Migrations

- `202611230101_pricing_entitlements`: subscriptions, operator scopes, academic verification and Founding grants, idempotent holds and ledger, and current editor seat enforcement.
- `202611230102_resource_metering`: private file deletion markers, index job holds and per-version indexed byte backfill.
- `202611230103_ai_credit_metering`: versioned provider cost evidence, stale reservation recovery, operations reports and spend protection.
- `202611240104_compute_jobs`: project-scoped jobs, private results, leases, and atomic runtime settlement.

The migrations are additive for existing data and run transactionally. All 18 migrations were applied to disposable PostgreSQL with the same independent migration/runtime/identity/queue privileges.

## 4. Effective limits

The API, PostgreSQL RLS and workers enforce active projects, editor seats, per-file size, storage bytes, monthly uploads, indexed UTF-8 bytes, credit availability, daily operations and shared member caps when metering is enabled. Python applies monthly milliseconds, a per-run deadline and a concurrency cap. LaTeX applies compile count and a 30-second ceiling. Both run through the optional isolated profile. Custom automations retain ledger limits and have no execution capability.

The baseline lacks a defined Team per-file limit. Version 1 uses the Pro ceiling of 100 decimal MB. The initial catalog stores USD cents and catalog version, and historical events record their version or provider price revision.

## 5. Verification

- TypeScript and lint.
- 18 unit tests covering catalog arithmetic, provider prices and existing product primitives.
- 15 PostgreSQL integration tests using isolated PostgreSQL 17.10, verified test users, loopback SMTP, and the real Poppler extractor.
- Next.js production build, worker compilation and Compose configuration/credential separation.
- The complete production-build browser suite passed. It exercised desktop and 390 px pricing, authenticated academic and usage reads, synthetic Founding submission with no email, three verified sign-ins, project invitation acceptance, viewer isolation and session revocation. Legacy journeys ran at four widths and in both themes.
- The focused AI browser suite passed with exactly one call to the loopback provider adapter. It confirmed the upfront credit ceiling, settled credit and measured USD, evidence links, the proposal dialog and undo, plus the 390 px focus flow.
- The follow-up tested real Python and pdfLaTeX in a separate Linux ARM64 Docker profile. It verified sandbox boundary checks, successful execution, PDF attachment, quota exhaustion, both engine deadlines, cancellation, lease expiry, output retention and the 390 px editor.
- Docker recovery passed for source `e540b29a900fd36fd69308694fe7d4164e87b483` and schema `202611240104_compute_jobs` on PostgreSQL 18.6. A backup-only database role produced the custom dump. The AES-256-GCM bundle restored to a fresh database and files volume. File manifests, private research artifacts, the Compute PDF hash, cleared source, reserve/settle receipts and owner-only access were checked. The small synthetic fresh-restore and compatible-image rollback interval was 6,034 ms. The Compute broker image also built from the same application commit. Docker verified the entrypoint and health probe as the non-root runtime user.
- Docker image builds used the vendor SHA-256-verified Prisma Linux schema engine as a temporary build input after TLS failed inside the isolated VM. The committed Dockerfile and source were unchanged. The isolated Docker profile preserved certificate and artifact verification.

### Coolify staging acceptance, 24 November 2026

- The separate **Atlas Research Compute Staging** resource in `yula.co / staging` deployed Git commit `7960477e0063550bd17962978d45ef39dbc8b042` and its own PostgreSQL and private files volumes. [HTTPS readiness](https://pgovi9zdf5jeuzzqtl70nsce.91.99.118.96.sslip.io/health/ready) returned HTTP 200 and schema `202611240104_compute_jobs`. The separate web, broker, and runner containers started. The authenticated Compute endpoint reported a live worker heartbeat. [Coolify deployment record](https://panel.digiones.com/project/ldx87p1f2babwdjm7uohievw/environment/vuqwtxw10s7s1ccdhbw19kih/application/hudamfwefkwcaeic3tspia7r/deployment/mzuxyptpfr8zjnetwxydj0s9)
- A disposable synthetic account signed in over the public HTTPS route and created a personal Free project through the normal API. Python returned `42`, stopped at 400 ms, rejected a 61-second request with HTTP 429 `RESOURCE_QUOTA`, and deducted measured time from the 20-minute monthly balance. Resubmitting the same request returned the same job and left usage unchanged. The full 20-minute Python balance was not consumed during staging acceptance.
- LaTeX produced an authenticated PDF with a valid signature, and a request without a session received HTTP 401. A 400 ms compile timed out, a request above 30 seconds was rejected, and the actual monthly count reached zero after 20 compile attempts. The 21st attempt received HTTP 429 `RESOURCE_QUOTA`.
- Invitation creation for a synthetic recipient returned HTTP 503 `MAIL_DISABLED`. The external payment and sandbox paths remained closed, as did Founding mail. The synthetic sign-in credential was retired after testing. The staging database retains only the synthetic acceptance records created for this run.
- Coolify's first deployment initially used automatic Dockerfile argument injection. The final staging deployment disabled automatic Dockerfile declarations and cross-resource host discovery for builds. Coolify still logged that it passed arguments to its custom Compose build command. The first staging environment view showed generated credentials in the administrative tool output. Their scope was this new staging resource and they were not rotated during acceptance.

### Staging credential rotation acceptance, 24 November 2026

- Staging-only commit `e2297ea92713db2bfcb487206271103f5e4d3dcc` deployed in the existing Coolify resource and returned HTTP 200 with schema `202611240104_compute_jobs`. Bootstrap reported `operation=rotated`, `newLogins=6`, and `oldLoginsRejected=6`. The acceptance worker verified a new Better Auth session and confirmed that the identical active token signed with the old key received HTTP 401. [Coolify deployment](https://panel.digiones.com/project/ldx87p1f2babwdjm7uohievw/environment/vuqwtxw10s7s1ccdhbw19kih/application/hudamfwefkwcaeic3tspia7r/deployment/4qxdzauceb7cfbovq6urfyzf)
- Disposable PostgreSQL 17 verified all six new logins and all six expected old-login failures, termination of an old connection, preservation of existing rows, safe retries, and rejection of a different target. Compose isolation, lint, typecheck, 18 unit tests and the local PostgreSQL Compute integration test passed. The local Compute test used synthetic runner transport.
- Post-rotation HTTPS acceptance passed with the real staging runners. Python returned `42`, timed out at 400 ms, recorded measured usage once, and rejected a request above the Free 60-second maximum. LaTeX produced a private PDF, timed out at 400 ms, rejected a request above the 30-second maximum, and rejected compile 21 after exhausting the Free monthly count. Checkout and invitations remained disabled. Roll back images only with the new role passwords after the database rotates.

### Production rollout and runner acceptance, 24 November 2026

- Production deployed commit `01a0938dff2d9a7a1b35a13e9626a0fa68fdbbef`, which has the same tree as `7960477` and retains the existing production parent. The staging-only key rotation program was excluded. Bootstrap and migrations completed and the app returned HTTPS readiness at schema `202611240104_compute_jobs`. Coolify reused the existing production PostgreSQL and private file volumes. The initial deploy used the prior release label, which was corrected and verified on the subsequent deploy. [Coolify deployment](https://panel.digiones.com/project/ldx87p1f2babwdjm7uohievw/environment/u8znu2tc3to7n3paxczyc3wc/application/lcj5rqwtuautouw34e5ldhva/deployment/o9w2ysxs2sdx4uqdvzh42rar)
- The production broker heartbeat matched the deployed schema. An authenticated internal runner probe matched the production commit and runner fingerprint. Python returned `42` and timed out at 400 ms. LaTeX returned a valid PDF and timed out at 400 ms. Workspace quota enforcement through normal application requests awaits a signed-in production account. The direct runner checks do not exercise workspace metering.
- The public capabilities endpoint reported `emailDelivery=disabled` and pricing confirmed closed checkout. Founding mail and intake flags remained off. No new encrypted production backup was taken in this rollout; automatic review rejected the restricted direct PostgreSQL terminal and new recovery-key operations. Prior disposable encrypted recovery evidence remains recorded above.

### Finalization regression and recovery

- Typecheck, lint, the optimized build, 18 unit tests, 15 PostgreSQL integration tests, and the full baseline Chromium acceptance passed locally. Browser cases used a disposable database and loopback SMTP, including registration and verified sign-in, workspace creation, invitations, viewer isolation, revocation, focus recovery, four widths and both themes.
- The focused Documents journey passed in Chromium through formatted writing, math, a library citation with an exact PDF locator, checkpoint restoration, idempotent retry, two-session conflict recovery, Markdown export and a linked task. Viewer, anonymous and foreign project access checks passed.
- The focused Tasks and Inbox journeys passed. A PDF note produced a linked task, board ordering and list edits persisted, retry produced no extra notification, and the assignee opened the exact task from Inbox. The suites also checked replies and mentions, read state, revoked access, pagination, settings persistence and the 390 px view.
- The connected research journey passed against live Crossref discovery through a disposable library, exact PDF locator, cited document, linked task, second-account discussion reply and Inbox return to the original PDF note. Reload, private access denial, project search, and desktop and 390 px surfaces passed. Only public bibliographic query data was sent to Crossref.
- The local pilot concurrency pass used 10 synthetic sessions for 50 reads, 50 acknowledged writes and 11 access denial checks, with zero lost acknowledged edits. The same browser suite used one synthetic AI provider response. Real model quality and pilot adoption have separate acceptance criteria and remain pending.
- The focused real Linux Docker runner integration and Chromium tests passed. They verified Python and LaTeX results, timeouts, metering, cancellation, expired jobs, authenticated reload, viewer isolation and the 390 px layout.
- The isolated full Docker recovery drill passed in 6,687 ms with synthetic data. It restored the database and file volume, checked file hashes, document versions, citations, task and discussion links, two-team RLS, private Compute output and ledger entries. The compatible-image rehearsal stays separate from live exact-image rollback.
- The new operator-facing recovery CLI passed an independent local encrypted copy and PostgreSQL restore test. It checked read-only capture, schema identity, file hashes, refusal to overwrite and tamper rejection. [Recovery procedure](../../operations/RECOVERY.md)

## 6. Security and performance

RLS, editor/viewer separation, paid seat race denial, verified-email token redemption, operator authorization, resource isolation and cross-workspace exclusions were tested against separate runtime roles. Idempotency and concurrent capacity reservation were exercised. Providers, private file streams and worker queues have independent permissions. Index usage aggregates small per-version counters. The scope lock serializes competing reservations without taking a global lock on unrelated ordinary workspaces. The program enrollment and AI cost ceilings have their own global locks. No production load benchmark was run.

## 7. Integration boundary

No paid call or payment provider interaction was used in acceptance. AI provider responses were synthetic at the external API boundary. External billing, jurisdictional taxes and live checkout remain unavailable. Production vendor billing reconciliation and advanced automation execution are also pending. Compute passed runner qualification on staging and production. Live workspace quota acceptance still needs an authorized session. The app uses private storage volumes and authenticated range reads. A production S3 integration was outside the verified runtime.

## 8. Environment

The test harness uses loopback PostgreSQL, SMTP and a local synthetic model adapter. The commercial runtime, public intake and Founding mail switches default to off. AI requires catalog pricing and the existing provider, consent and workspace budget setup. The production Next build and static Compose validation also ran independently from Docker. A separate local VM was used for engine and recovery tests.

## 9. Operator workflow

Provision an authorized billing operator through the restricted database procedure in the rollout guide. Then open `/admin/resources`. Review a submitted application, reserve its cohort place, manually issue a one-time link and review activation, extension or revocation from the audit. Record an institutional domain with an official verification source before reviewing applicant enrollment. Credit adjustments require a reason and expiry. Review provider spend, index jobs and subscription state in the same console.

## 10. Rollout and rollback

Follow [rollout and rollback](ROLLOUT_AND_ROLLBACK.md). Snapshot first, ship web and workers at the same schema revision, then enable metering explicitly. Keep historical receipts and research content during rollback.

## 11. Production gates

Before live use, review data retention, confirm quota overage handling against real existing workspace counts, run backup/restore on the target Docker release, approve the real provider budget and measure invoice reconciliation. Wire signed payment events and jurisdictional tax collection before enabling checkout. Qualify the target Docker host for the isolated runner and configured hardware limits before exposing execution. Authorize any live Founding mailing separately.
