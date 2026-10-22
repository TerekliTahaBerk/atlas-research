# Phase 01 implementation report

Status: implementation, disposable-environment verification and hosted database activation delivered; hosted callback approval/email journeys remain pending. Production release and Phase 02 are not approved by this report.

## Delivered platform

Supabase SSR provides real registration, confirmation, login/logout, verified server identity, PKCE callbacks, safe return destinations and password recovery. The existing approved auth/onboarding UI calls these services. Profiles, saved onboarding drafts, idempotent personal environments, shared organizations, workspaces, projects, invitations and memberships use real PostgreSQL transactions. Home/sidebar/settings receive authorized DTOs; live projects never contain synthetic research. Future research/AI/messaging/compilation/execution remain unavailable. Google is integration-ready but disabled without approved provider configuration; avatars have no upload implementation.

The final implementation revision is `1087d3b53fa83e03cef1d5a596853f46977ab6c1`; the handoff documentation commit follows it on `feat/phase-01-core-platform`. Starting revision and baseline evidence appear below. Final branch/PR state must be checked when reviewing; no automatic merge or deployment was performed.

## Entry gate

Starting commit: `3003a2af46dc79d4cc9e71980981bcd0c571c3f5`, latest fetched `origin/master`; initial tree clean. Branch: `feat/phase-01-core-platform`. Node 24.21.0, pnpm 11.25.0, macOS Chromium. GitHub master CI run [39747560388](https://github.com/TerekliTahaBerk/atlas-research/actions/runs/39747560388) failed six screenshot comparisons; 95 other browser tests passed. All six Linux actual images were inspected against the approved composition. Retain macOS images and add reviewed Linux platform baselines; no tolerance or geometry/accessibility assertion was weakened. No application feature was changed to correct this platform mismatch.

Baseline install, format, lint, typecheck, 47 unit tests, schema validation, build and foundation SQL constraints: PASS. Full browser rerun: PASS, 101/101 in 43.4s. First run: 100/101; the context-transition test sent a global Enter during dialog focus restoration. Waiting for the mention option and sending Enter to the composer fixes the test focus race without changing the application or removing assertions. Restricted sandbox initially blocked loopback listeners/shared memory and Turbopack worker startup; reruns use authorized local process permissions. A pre-existing server occupies 3100, so this run uses 3101.

Environment: fresh disposable PostgreSQL 17 cluster in `/private/tmp/atlas-p01-postgres`, loopback 55431, database `atlas_p01_test`; no existing or hosted data target. Docker is unavailable. No Scholara resource accessed.

## Identity, data and collaboration

- `auth.getUser()` supplies verified UUID/email on each protected operation; anonymous/unverified users fail. Proxy refreshes cookies and preserves validated deep links; every page/API/service independently checks identity and scope. Recovery requires a signed short-lived HttpOnly marker bound to the verified actor and signs out after a successful password change.
- Profile IDs match verified Auth identity. Personal-owner uniqueness and one transaction create exactly one personal organization/OWNER and default workspace/ADMIN, plus an optional private project/OWNER. Saved drafts survive interruption. Tests cover simultaneous retries and rollback after late failure.
- Shared organization/workspace creation, authorized metadata updates, scoped lists/members, context switching and safe archiving are implemented. Projects default private, grant their creator ownership transactionally, support idempotent create, rename/visibility/version checks, archive and owner recovery. Signed actor/scope cursors cover growing directories, projects, members and invitations.
- Navigation preferences contain only actor/workspace/project IDs in an HttpOnly cookie. They confer no permission; loaders reauthorize hints, omit revoked recent projects and fall back from inaccessible workspaces. Returning to Home preserves the recent project; a workspace switch clears it. No onboarding text, drafts, prompts or messages enter browser storage.
- Invitations use 256-bit random tokens, SHA-256 storage, seven-day expiry, verified recipient email, current inviter authority, role ceilings and atomic single consumption. Concurrent acceptance/replay/revocation/expiry tests pass. Existing membership roles are retained; explicit role changes use versions. Parent removals cannot strand the last active project owner. Ownership transfer grants another eligible owner before removal.
- Production invitation creation deliberately fails closed without approved transactional delivery. One-time development links work only on loopback `next dev`, with an explicit flag and accurate no-email feedback. Supabase Auth email is a separate channel. New invitees register/verify/onboard and reopen the original fragment link; the token is not persisted.

## Authorization and database boundary

`atlas_private.allowed/can/capabilities` centralize the role/action matrix used by policies, mutations and UI projections. Organization/workspace metadata admins have no automatic private-project access. Workspace visibility provides read-only access; project writes require explicit membership. Active parent memberships and non-archived ancestors are checked again at each transaction.

The dedicated runtime is a non-owner member of `atlas_runtime`, without superuser, BYPASSRLS, role/database creation or replication privileges, including inherited privileged roles. Every transaction checks this and rejects ownership of any public base table. A regression temporarily changes project ownership inside an always-rolled-back test transaction and proves the guard rejects it.

Prisma sets verified actor/email through transaction-local `set_config` on the same connection as protected queries. It never assumes `auth.uid()` is populated. Real reused-connection tests alternate actors and assert that queries outside a transaction see no actor. This proves the local driver boundary; hosted Supavisor behavior is a separate check. See [ADR 0013](../decisions/0013-phase-01-actor-context.md).

Runtime SELECT uses scoped RLS. Raw DML is ungranted and has explicit deny INSERT/UPDATE/DELETE policies. Fixed-command security-definer mutations resolve scope, authorize, enforce composite keys/versions/invariants and append audit records atomically. Fixed search paths, revoked PUBLIC execution and private-schema restrictions constrain that privileged boundary. Browser `anon/authenticated` roles have no domain/private-function grants. The trusted runtime credential can set actor context; a compromised server/credential is outside the tenant-isolation proof.

One advisory transaction lock serializes hierarchy mutations to make owner/parent-removal races safe. This conservative throughput tradeoff needs measurement before wider rollout. PostgreSQL-backed atomic global/keyed rate buckets work across instances and fail closed if unavailable. Same-origin mutations, a 32 KiB streamed body cap, strict Zod inputs, no-store responses, normalized errors and redacted UUID request IDs protect HTTP boundaries. Live pages use nonce CSP and HTTPS HSTS. Hosted access-log redaction remains an activation requirement.

## Migrations and environment state

The existing foundation migration remains intact. Additive `20261022100000_core_platform` adds profile attributes/completion, personal identities, versions, creator/idempotency keys, invitations, audit events, rate buckets, role/policy/functions and relational checks. `20261022110000_onboarding_drafts` adds bounded drafts and the constrained save command. The Auth identity FK is added when `auth.users` exists. No research-data cascade or destructive migration was added. Existing personal rows are not guessed/backfilled; data-bearing upgrades need an explicit audit and backup/restore plan.

Fresh deployment and migration history were verified on `atlas_p01_test_v2`. Foundation constraints and 27 integration tests use a separate non-owner runtime; admin is fixture-only. No existing database was reset. The CI Auth database applies migrations after actual GoTrue creates `auth.users`, exercising the real identity FK with provider-issued users.

The user opened the existing hosted **Atlas Research / atlasresearch** project, reference `hgngonpirctrwbckhbmy`, and explicitly confirmed it is the empty development target. Read-only dashboard/SQL checks found PostgreSQL 17.11, zero public tables, zero Auth users, no Prisma history, email confirmation enabled, anonymous login disabled, Google disabled, default localhost Site URL and no callback allowlist. The correct Atlas GitHub repository is linked. This is inspection evidence, not hosted Auth success.

The Direct Connection panel was initially rejected by automatic approval review because it could expose a database secret. After explicit user approval it was inspected with redacted output. The user entered the existing password directly into ignored mode-0600 root `.env`; a proposed local entry helper was never started. No password reset occurred. All three Prisma migrations were applied to this approved development target. Dedicated `atlas_app_dev` runtime credentials/signing secrets were generated locally into ignored mode-0600 `apps/web/.env.local`, separate from migration credentials.

Hosted checks confirmed three completed migrations, the real Auth identity FK, ten RLS-enabled tables, no browser domain SELECT/private-schema usage, no raw runtime write/internal mutation grant and no runtime ownership/privileged-role membership. PSQL passed 24 commit/rollback/context assertions on each actual Supavisor port (5432/6543). The new explicit opt-in `pnpm test:hosted` passed three checks through actual Prisma on both modes, including TLS/hostname verification, actor cleanup and no-actor read denial, plus actual Auth settings and Data API 401/406 exclusions. It creates no users or domain records and sends no mail.

Actual hosted verification exposed a cold-acquisition defect: the SQL-backed anonymous limiter used Prisma's default two-second acquisition deadline while hosted TLS could take longer. The factory now bounds connect/acquisition at ten seconds and interactive work at fifteen seconds. A real local saturated-pool regression reproduces the old deadline. The official dashboard-linked Supabase public CA is installed locally and URLs use `sslmode=verify-full`; certificate verification was never disabled. The live application now returns 403 for disabled Google after reaching the SQL limiter, 401 for actual invalid login, 401 for signed-out private APIs and 403 for CSRF, with private/no-store responses.

The proposed local Site URL `http://127.0.0.1:3104` and `/auth/callback**` allowlist are prepared but await action-time browser approval. Hosted registration/email confirmation/recovery and OAuth remain **NOT RUN**. No new cloud project, billing resource, production migration or Vercel deployment/promotion was created. Existing Vercel configuration is preserved.

## Verification evidence

| Check                                                    | Result            | Evidence / limit                                                                       |
| -------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------- |
| Frozen install                                           | PASS              | pnpm 11.25.0; lockfile unchanged after final install                                   |
| Format / lint / strict typecheck                         | PASS              | Required local gates; CI quality job also passed at the UI verification revision       |
| Unit/component tests                                     | PASS              | 65 tests                                                                               |
| Schema validation                                        | PASS              | Prisma 7.10.1                                                                          |
| Production build                                         | PASS              | Next.js 16.4.2; preview mode, no database secret required                              |
| Existing UI E2E                                          | PASS              | 101 Chromium tests, both themes, screenshot/geometry/interaction/axe checks            |
| Reviewed migrations                                      | PASS              | Fresh local PostgreSQL, ephemeral Auth CI and approved empty hosted development target |
| Foundation SQL constraints                               | PASS              | Composite keys, unique grants, restrictive deletion, default denial; rollback fixtures |
| Tenant/transaction/HTTP integration                      | PASS              | 27 tests: 19 real PostgreSQL plus 8 explicitly mocked-SDK HTTP/session tests           |
| Actual Auth browser journeys                             | PASS              | Three journeys against disposable GoTrue/PostgreSQL/Mailpit/nginx, not mocked Auth     |
| Hosted database/TLS/poolers/Data API                     | PASS              | Three explicit opt-in checks; both modes and real Prisma, plus role/FK/catalog checks  |
| Hosted Auth email/OAuth journeys                         | BLOCKED / NOT RUN | Callback approval and real email/provider setup; Google intentionally disabled         |
| Production invitation delivery                           | BLOCKED           | No approved application email provider; creation fails closed                          |
| Hosted deploy/backup/restore/manual assistive technology | NOT RUN           | Separate activation/beta gates                                                         |

GitHub [run 39785784685](https://github.com/TerekliTahaBerk/atlas-research/actions/runs/39785784685) at `39c78521dee132b674605faf56f57a7ec67a0889` passed both `quality` and `isolated-auth`. Auth journeys cover registration/actual captured confirmation email/onboarding, persistent create/rename/logout/deep-link login, recent navigation, two-actor invitation/private URL/API/mutation denial, role changes/owner transfer/workspace switching, and actual recovery email/password update/expired callback. Auth screenshots, traces, videos and mailbox uploads are disabled to avoid token leakage. The later runtime-guard, member-pagination/error-retry and cold-acquisition regressions passed locally; the final branch CI result is reported on the follow-up PR.

A later quality job at `371be10001ff42506881f4de8a2ece9873c99302` reached the runner's 20-minute limit while Ubuntu Azure mirrors repeatedly stalled during browser dependency downloads. Its Auth job passed and no application assertion failed; the latest branch run is the final verification target. Earlier failures were retained and fixed: GoTrue required UUID extensions and its conventional `postgres` grant target in the plain PostgreSQL harness; the context-transition browser test needed the requested panel mounted before navigating; Auth status selectors needed the form main landmark; live crumbs duplicated primary headings and now use the existing span variant. No authorization/accessibility assertion was removed. First fixed-selector Auth run passed two journeys and failed the duplicate heading; the next run passed all three.

## Security findings and remaining gates

Diff inspection found no actual secret patterns, unchecked `any`, client database import, core/AI database dependency or preview persistence presented as live behavior. Non-owner RLS, owner/role ceilings, parent constraints, signed cursors, revocation, request normalization, rollback and concurrency have executable evidence. This is a scoped implementation review, not a production security certification.

Hosted development credentials, migrations, FK/grants, private-schema exclusion and real Prisma pooler actor cleanup are verified. Before release, finish callback approval and actual email/OAuth journeys; verify cookie refresh/revocation timing, ingress log redaction, backups/restore and deployment protection. Size rate quotas/global write locking against expected usage. Configure Google only with approved credentials. Add approved application email delivery before production invitations. No unresolved defect is knowingly hidden behind a mocked provider; external checks remain explicitly open.

## Git and Phase 02 handoff

Work is split into baseline, database, identity/API, live UI, tests, security and documentation commits on the requested tracking branch. Original draft [PR #5](https://github.com/TerekliTahaBerk/atlas-research/pull/5) was merged outside this agent at `2026-10-22T09:37:13Z`, while verification continued; the agent did not merge it. Updated `origin/master` was merged into the working branch non-destructively. Remaining fixes/docs are in draft [PR #6](https://github.com/TerekliTahaBerk/atlas-research/pull/6), targeting `master`. It must be reviewed; this agent performs no automatic merge.

Phase 02 code is absent. The core contracts can support later work, but hosted Auth/security/delivery gates remain open. Do not treat a passing disposable harness as authorization to deploy, merge or begin research services.
