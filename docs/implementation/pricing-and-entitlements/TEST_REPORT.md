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

## 6. Security and performance

RLS, editor/viewer separation, paid seat race denial, verified-email token redemption, operator authorization, resource isolation and cross-workspace exclusions were tested against separate runtime roles. Idempotency and concurrent capacity reservation were exercised. Providers, private file streams and worker queues have independent permissions. Index usage aggregates small per-version counters. The scope lock serializes competing reservations without taking a global lock on unrelated ordinary workspaces. The program enrollment and AI cost ceilings have their own global locks. No production load benchmark was run.

## 7. Integration boundary

No paid call or payment provider interaction was used in acceptance. AI provider responses were synthetic at the external API boundary. External billing, jurisdictional taxes and live checkout remain unavailable. Production vendor billing reconciliation and advanced automation execution are also pending. Compute still requires qualification of the target Docker host. The app uses private storage volumes and authenticated range reads. A production S3 integration was outside the verified runtime.

## 8. Environment

The test harness uses loopback PostgreSQL, SMTP and a local synthetic model adapter. The commercial runtime, public intake and Founding mail switches default to off. AI requires catalog pricing and the existing provider, consent and workspace budget setup. The production Next build and static Compose validation also ran independently from Docker. A separate local VM was used for engine and recovery tests.

## 9. Operator workflow

Provision an authorized billing operator through the restricted database procedure in the rollout guide. Then open `/admin/resources`. Review a submitted application, reserve its cohort place, manually issue a one-time link and review activation, extension or revocation from the audit. Record an institutional domain with an official verification source before reviewing applicant enrollment. Credit adjustments require a reason and expiry. Review provider spend, index jobs and subscription state in the same console.

## 10. Rollout and rollback

Follow [rollout and rollback](ROLLOUT_AND_ROLLBACK.md). Snapshot first, ship web and workers at the same schema revision, then enable metering explicitly. Keep historical receipts and research content during rollback.

## 11. Production gates

Before live use, review data retention, confirm quota overage handling against real existing workspace counts, run backup/restore on the target Docker release, approve the real provider budget and measure invoice reconciliation. Wire signed payment events and jurisdictional tax collection before enabling checkout. Qualify the target Docker host for the isolated runner and configured hardware limits before exposing execution. Authorize any live Founding mailing separately.
