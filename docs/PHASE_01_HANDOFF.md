# Phase 01 handoff

Subsequent owner decision (9 November 2026): comprehensive G01 reviews are deferred to the [pre-beta backlog](BETA_REVIEW_BACKLOG.md) and do not block Phase 02. Integration/merging PR #31 after short checks is distinct from full live acceptance. Evidence below describes the Phase 01 delivery; deferred live conditions are not converted into PASS by local tests or a merge.

Status: **G01 OPEN**. The owner-selected no-email preview is deployed in **yula.co / production**; full live acceptance remains open. Do not interpret this document as a production completion claim. External changes are limited to new Atlas resources; existing server/other-project settings remain unchanged.

| Slice | Delivery | Evidence |
| --- | --- | --- |
| P01-1 | [PR #27](https://github.com/TerekliTahaBerk/atlas-research/pull/27), squash `365ab6bf74b0d684ffc191e7d373841b577a3843` | [Pinned runtime](implementation/P01-1.md) |
| P01-2 | [PR #28](https://github.com/TerekliTahaBerk/atlas-research/pull/28), squash `5b32556c5022b1248d5f8e2c3e4f8d128f28072a` | [Real identity/SMTP/session](implementation/P01-2.md) |
| P01-3 | [PR #29](https://github.com/TerekliTahaBerk/atlas-research/pull/29), squash `00426a5b49396d23efe47fbd88c8063ad18af7f6` | [RLS/tenancy/lifecycle](implementation/P01-3.md) |
| P01-4 | [PR #30](https://github.com/TerekliTahaBerk/atlas-research/pull/30), squash `90bd0e663c9021f6d2b7d9da89a5e3fb79f877e8` | [UI/browser/fidelity](implementation/P01-4.md) |
| P01-5 | [Draft PR #31](https://github.com/TerekliTahaBerk/atlas-research/pull/31); feat/phase-01-5-operations; not closed | [Operations evidence](implementation/P01-5.md), [runbook](operations/COOLIFY_RUNBOOK.md) |

Delivered locally: real Better Auth accounts/verification/login/logout/reset/DB sessions; own profile/session revocation; idempotent personal and shared workspaces; private projects and explicit roles; invitation acceptance/revocation, owner transfer, archive/deletion recovery; default-deny server authorization + FORCE RLS; light/dark responsive shell without demo data/future modules; separate web/mail/migration/backup credentials; Docker standalone and local recovery drill.

Exact runtime: Node 24.21.0, npm 11.19.0, Next/eslint-config-next 16.4.5, React/ReactDOM 19.3.1, TypeScript 6.0.3, Prisma/client/adapter 7.10.1, Better Auth 1.7.18, pg 8.23.1, Nodemailer 10.4.0, PostgreSQL 18.6. All direct pins/lockfile are committed; Docker index/platform references are in ops/images.json. Dev tools: ESLint 10.14.0, Playwright 1.65.0/CLI 0.1.23, Prettier 3.9.10. OpenSSL 3.0.22 was observed in the Linux ARM64 build. The Next lint plugins' outdated ESLint peer declarations are an open tooling limitation; actual lint passes. No license for the overall repository was selected.

| Command / acceptance evidence | Result |
| --- | --- |
| `npm ci --loglevel=error --fetch-retries=1 --fetch-timeout=30000` | PASS; zero known audit vulnerabilities |
| `npm run verify` | PASS on `166b721`; type/lint, 6 unit, 8 real PostgreSQL integration, production build, real Chromium/SMTP flows and disabled-mail profile |
| `npm run format:check`, `git diff --check` | PASS on the final application candidate; documentation-only final check recorded in PR |
| `npm run verify:compose` | PASS; documented Coolify health keys normalized; simulated global env-file injection verifies five process secret boundaries; no daemon mutation |
| Docker web/mail/migrator builds | PASS locally, rootless ARM64; no build DB/secret |
| `npm run test:operations` | PASS; restart, live/ready outage behavior, encrypted synthetic backup, fresh-cluster restore/file hash and compatible metadata-image rollback |
| `npm run verify:release` | PASS on clean `166b7210259b14e869b3d453f81eb9408a5a88ce`, 2026-11-09 12:53:08 UTC; exact local image IDs in P01-5 |
| Live Coolify deployment/TLS | PASS on `166b721`; public `/health/live` and `/health/ready` 200 with revision `202611090004_operations`; capabilities report disabled mail |
| Live anonymous/origin/disabled-mail smoke | PASS: private APIs 401, foreign-origin auth 403, registration/reset/resend 503; signup UI explicitly unavailable |
| Live owner-requested initial identity | PASS: normal Better Auth sign-in; initially empty personal workspace; no message sent; temporary setup values cleared and redeployed |
| Live Atlas-only stop/start and persistence | PASS: stopped readiness 503, restarted readiness 200, same personal workspace/session; later isolation deployment also preserved the account |
| Live web/mail roles, limits and environment | PASS: ARM64, UID 1000; web 512 MiB/1 CPU, mail 256 MiB/0.5 CPU; zero nonempty forbidden fields; auth/runtime/queue are not superuser/BYPASSRLS/CREATEDB/CREATEROLE; runtime without actor sees zero workspaces |
| External SMTP, independent backup/restore, live image rollback | NOT RUN, owner deferred email/S3; full two-account invitation/collaboration and deployed revocation matrix remain open |
| Live cookie-flag/header-overwrite audit, remote image IDs and PostgreSQL cap inspection | NOT RUN; local cookie/config and Compose caps evidence are separate |
| Screen reader/native 200% zoom, other browser engines | NOT RUN |

G01 evidence mapping:

| Criterion | Local evidence | Remaining live requirement |
| --- | --- | --- |
| Non-university accounts, verification/login, unique W0 | Real controlled SMTP + PostgreSQL/browser accounts | Two controlled externally delivered accounts |
| A creates P1, B accepts once and sees project | Browser journey + wrong/expired/replayed/issuer-revoked integration | Real deployed invitation/mail |
| A01–A13 applicable access | Teams A/C, D governance-only, V viewer, B revocation; runtime SQL, pool, FK, final-owner races | Deployed negative smoke; later-module cases remain out of phase |
| Image/role/schema/readiness/restart | Local Docker and 8 DB integration tests; live ARM64/UID/role flags/web-mail caps/readiness and Atlas-only restart | Remote image identifiers and PostgreSQL cap inspection remain open |
| Synthetic restore and rollback | Fresh cluster with preserved ownership/RLS; file SHA-256; same-schema metadata image switch | Independent destination roundtrip and Coolify image rollback |
| Responsive accessible shell | 48 captures at 390/768/1024/1440 in both themes; keyboard/Escape/focus, actual-token contrast, 320px reflow, real retry/loading | Assistive technology/manual zoom assessment remains open |
| Paid Actions/runner requirement absent | No workflow, no production runner; local release gate | Preserve during deployment |

Known limits: SMTP at-least-once can duplicate after a crash; auth and encrypted enqueue are not claimed as one Better Auth transaction (invitations are atomic); old accepted invitations cannot undo revocation; pre-migration-004 app images are not approved rollback targets. No production PDF/file feature exists; the operations file fixture is a synthetic text only. Local restore timing is not a production capacity/RTO guarantee.

Coolify **Atlas Research** was deployed through the user's Chrome in yula.co/production. Read-only inventory observed ARM64, 8 CPU cores, 15.2 GB total memory, Docker 27.5.1 and Compose 2.32.4; this is not a measurement of spare capacity. Application build arguments are managed in the Dockerfile, builds use the Atlas custom parallel limit, automatic deployment is off and predefined cross-resource networking is off. No existing server/proxy/other-project setting was changed. There were no shared variables at project/environment/team scopes and zero S3 destinations. No SMTP credential was opened/copied and no paid service purchased.

Preview URL: [Atlas Research](https://om2lefhyk80lxthwkqe2qi3f.91.99.118.96.sslip.io/sign-in). Source branch is `feat/phase-01-5-operations`, pinned to verified application commit `166b7210259b14e869b3d453f81eb9408a5a88ce`; later handoff-only commits do not change that tested application. PR #31 stays draft while G01 is open; canonical main promotion is deferred. HTTPS validation succeeded in Chrome and the Node TLS client without an exception. Only web has a domain (internal port 3000); PostgreSQL has no host port in Compose. The owner-requested initial login was provisioned once and its normal browser login succeeded. Temporary setup values were cleared and a later Atlas-only stop/start preserved identity, session and the same personal workspace. Its operator assertion is distinct from email verification evidence. No personal address/password or owner-created project content is recorded here.

The live environment audit caught Coolify 4.6's global env-file injection before final acceptance. The final Compose masking expressions and production guard were tested locally and then inspected in actual web/mail containers: forbidden nonempty fields were zero, and mail had no auth credential. Existing server/proxy settings and other applications were not modified; no server-wide Docker cleanup was run. Only Atlas containers were stopped/recreated. The final public smoke was repeated after the isolation fix.

Next phase is only prepared: after G01 actually passes, Phase 02 can begin from its separate spec with source/version/citation identity and the same authorization tests. No discovery, PDF, editor, tasks, discussions, AI, embeddings, LaTeX or Python execution has been implemented.

Owner steering: use a temporary Coolify HTTPS address, send no email for now and do not use S3 for now. The live preview therefore sets MAIL_DELIVERY=disabled. HTTP registration/reset/resend and new invitation mail are denied explicitly; existing verified users keep normal sign-in/authorization. The worker never enqueues/dispatches mail in this mode and only expires stale encrypted payloads. Public capability data lets the UI show unavailable actions honestly. The explicitly requested operator first identity is the only manual assertion; no public verification bypass or demo authentication is introduced. External-mail and independent-backup G01 criteria remain deferred/open by this choice. Controlled SMTP/local recovery tests remain separate evidence.
