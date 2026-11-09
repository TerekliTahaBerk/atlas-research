# Phase 01 handoff

Status: **G01 OPEN**. Application and local operations evidence exist; live Coolify acceptance is pending. Do not interpret this document as a production completion claim. The latest user instruction limits external changes to new Atlas resources in **yula.co** and forbids changes to existing server/other-project settings.

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
| `npm run verify` | PASS; type/lint, 4 unit, 6 real PostgreSQL integration, production build, real Chromium/SMTP flows |
| `npm run format:check`, `git diff --check` | PASS on the verified application slice; repeat for final candidate |
| `npm run verify:compose` | PASS; documented Coolify-only health keys normalized; no daemon mutation |
| Docker web/mail/migrator builds | PASS locally, rootless ARM64; no build DB/secret |
| `npm run test:operations` | PASS; restart, live/ready outage behavior, encrypted synthetic backup, fresh-cluster restore/file hash and compatible metadata-image rollback |
| `npm run verify:release` | Final clean-candidate record written under ignored .atlas-local when run; not a live gate |
| External SMTP/TLS/Coolify deployment/restart, independent remote backup/restore/live rollback | NOT RUN |
| Screen reader/native 200% zoom, other browser engines | NOT RUN |

G01 evidence mapping:

| Criterion | Local evidence | Remaining live requirement |
| --- | --- | --- |
| Non-university accounts, verification/login, unique W0 | Real controlled SMTP + PostgreSQL/browser accounts | Two controlled externally delivered accounts |
| A creates P1, B accepts once and sees project | Browser journey + wrong/expired/replayed/issuer-revoked integration | Real deployed invitation/mail |
| A01–A13 applicable access | Teams A/C, D governance-only, V viewer, B revocation; runtime SQL, pool, FK, final-owner races | Deployed negative smoke; later-module cases remain out of phase |
| Image/role/schema/readiness/restart | Local Docker and 6 DB integration tests | Observe remote architecture, health, actual caps and Atlas-only restart |
| Synthetic restore and rollback | Fresh cluster with preserved ownership/RLS; file SHA-256; same-schema metadata image switch | Independent destination roundtrip and Coolify image rollback |
| Responsive accessible shell | 48 captures at 390/768/1024/1440 in both themes; keyboard/Escape/focus, actual-token contrast, 320px reflow, real retry/loading | Assistive technology/manual zoom assessment remains open |
| Paid Actions/runner requirement absent | No workflow, no production runner; local release gate | Preserve during deployment |

Known limits: SMTP at-least-once can duplicate after a crash; auth and encrypted enqueue are not claimed as one Better Auth transaction (invitations are atomic); old accepted invitations cannot undo revocation; pre-migration-004 app images are not approved rollback targets. No production PDF/file feature exists; the operations file fixture is a synthetic text only. Local restore timing is not a production capacity/RTO guarantee.

Coolify target was confirmed read-only in the user's open Chrome. There were no shared variables at yula.co/environment/team scopes and zero S3 destinations. A new Atlas Research draft application was created and pinned to the candidate; it is not deployed. No existing server/proxy/other-project setting was changed. Domain, operational SMTP and independent backup must be resolved before promotion; never insert fake success/configuration. No new paid service is authorized.

Next phase is only prepared: after G01 actually passes, Phase 02 can begin from its separate spec with source/version/citation identity and the same authorization tests. No discovery, PDF, editor, tasks, discussions, AI, embeddings, LaTeX or Python execution has been implemented.
