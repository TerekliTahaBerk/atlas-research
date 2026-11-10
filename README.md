# Atlas Research

Atlas is a connected workspace for individual researchers and small research teams.

**Phase 05 preparation:** readiness/hardening is merged in [PR #39](https://github.com/TerekliTahaBerk/atlas-research/pull/39) and deployed as `33169e1` (same code, source-label revision B); no participants or support owner are assigned, and closed-beta acceptance stays OPEN. See the [preparation handoff](docs/PHASE_05_HANDOFF.md) and [pilot kit](docs/pilot/README.md). Paid AI, email and S3 stay disabled.

**Phase 04:** grounded-AI implementation, immutable evidence previews, private conversations, clickable locators, reviewed document proposals and usage reservations are squash merged in [PR #37](https://github.com/TerekliTahaBerk/atlas-research/pull/37) and deployed as `91a78f9` to the existing Coolify app; observed deployment evidence is recorded in the handoff. Calls remain **disabled**: the owner prohibits paid calls and has not selected a budget. Real-model G04 acceptance is OPEN; see the [Phase 04 handoff](docs/PHASE_04_HANDOFF.md) and [provider/accounting decision](docs/decisions/0006-grounded-ai.md). Email/S3 stay off; Phase 05 preparation now follows with its release gates open.

**Phase 03:** source-linked math documents, acknowledged autosave/recovery/history, tasks, project discussions and recipient Inbox are squash merged in [PR #35](https://github.com/TerekliTahaBerk/atlas-research/pull/35) and deployed as `4a013d2`; [handoff and release evidence](docs/PHASE_03_HANDOFF.md). Email/S3 remain disabled.

**Previous release:** Phase 00 and Phase 01 P01-1–5 are squash merged (PR #31 → `8c9f6d5`). Phase 02 is squash merged (PR #32 → `d186819`) and deployed with real discovery, private PDF reading and persistent annotations; see the [Phase 02 handoff](docs/PHASE_02_HANDOFF.md). The owner-requested visual alignment is tracked in [PR #34](https://github.com/TerekliTahaBerk/atlas-research/pull/34) and the [reference comparison](docs/design/REFERENCE_AUDIT.md). The existing Coolify **yula.co** preview keeps email/S3 disabled. Comprehensive G01/G02 acceptance is deferred [before the Phase 05 beta](docs/BETA_REVIEW_BACKLOG.md), not marked complete.

**Library experience:** project Library and Discover are unified, with complete organization, filtering, bulk actions and source details. See the [Library delivery record](docs/implementation/LIBRARY_EXPERIENCE.md) for behavior, data preservation and verification boundaries.

**PDF Reader experience:** continuous private PDF reading, search, anchored highlights/notes, quoted document/task connections and per-version reading positions. See the [Reader delivery record](docs/implementation/READER_EXPERIENCE.md) for verification, design decisions and remaining limits.

**Documents experience:** searchable project writing, focused source/math editing, acknowledged recovery/history and current-revision Markdown export. See the [Documents delivery record](docs/implementation/DOCUMENTS_EXPERIENCE.md).

**Tasks experience:** title-only capture, persistent Board order, inline List editing, combined filters and source-linked task details with recipient Inbox. See the [Tasks delivery record](docs/implementation/TASKS_EXPERIENCE.md).

**Dynamic AI island:** shared compact/floating/focus/docked conversation surface, authorized research context snapshots and reviewed proposals. See the [implementation and verification boundary](docs/implementation/AI_ISLAND.md).

**Discussions experience:** searchable topics, source-linked messages, retained drafts, recipient Inbox and cursor-paged history. See the [delivery and verification record](docs/implementation/DISCUSSIONS_EXPERIENCE.md).

**Home and Project Overview:** personal opened-work history, assigned/upcoming tasks and paged projects are separate from a project’s research purpose, content, priorities and recent changes. See the [delivery record and verification limits](docs/implementation/HOME_OVERVIEW_EXPERIENCE.md).

**Inbox and auxiliary Settings:** recipient updates have exact research targets, type filters, stable paged history and acknowledged read state; profile, browser appearance, in-app event preferences and scoped administration stay separate. See the [delivery and verification record](docs/implementation/INBOX_SETTINGS_EXPERIENCE.md).

## Start here

- [Agent contract](AGENTS.md)
- [Roadmap and beta boundary](docs/ROADMAP.md)
- [Restart and recovery record](docs/RESTART.md)
- [Design reference](docs/design/REFERENCE.md)
- [Deployment and database decision](docs/decisions/0001-deployment-and-database.md)
- [Phase 00 execution prompt](docs/prompts/PHASE_00.md)
- [Product specification](docs/PRODUCT_SPEC.md), [user flows](docs/USER_FLOWS.md) and [screen map](docs/SCREEN_MAP.md)
- [Design system](docs/design/DESIGN_SYSTEM.md) and [reference audit](docs/design/REFERENCE_AUDIT.md)
- [Architecture](docs/ARCHITECTURE.md), [data model](docs/DATA_MODEL.md) and [authorization](docs/AUTHORIZATION.md)
- [AI and source contract](docs/AI_AND_SOURCE_CONTRACT.md)
- [Coolify plan](docs/COOLIFY_PLAN.md) and [verification plan](docs/VERIFICATION_PLAN.md)
- [Phase 00–05 entry point](docs/phases/PHASE_00.md)
- [Contribution and branch policy](CONTRIBUTING.md)

## Product direction

Create a project → discover or add sources → read and annotate → write source-linked notes/documents → assign tasks → discuss with collaborators → ask evidence-grounded AI.

The beta targets individual researchers and small teams of 2–10. Personal accounts must not require a university affiliation.

## Infrastructure direction

Deploy with Docker on Coolify. Use self-hosted PostgreSQL as the application database, with Prisma as the ORM. Phase 00 selects self-hosted Better Auth, private file volumes with authorized access, PostgreSQL-backed jobs and independent backups. Decisions and alternatives are linked from the architecture document. No hosted database subscription is required. The [operations evidence](docs/implementation/P01-5.md) separates local recovery from the live preview and deferred production acceptance.

## Repository state

- `main`: canonical integration and release branch.
- `feat/phase-00-foundation`: historical Phase 00 delivery branch (PR #26 merged).
- `feat/phase-02-research-library`: Phase 02 delivery branch; functional PR #32 is merged, with a documentation follow-up recording observed live evidence.
- `archive/pre-restart-2026-11-09`: legacy source and every original branch tip.
- Short-lived `feat/*`, `fix/*`, `chore/*` and `docs/*` branches merge through pull requests.
- Old code, migrations, dependencies, workflows and reports are absent from the active tree. Git history remains recoverable.
- `npm ci` installs the pinned toolchain; `npx playwright install chromium` installs the pinned browser. `npm run verify` runs type/lint/unit, disposable PostgreSQL integration, production build and real browser/SMTP flows. Docker is required for integration tests; they never use your current database URL.
- `npm run verify:release` requires a clean candidate and also builds labelled Docker images and rehearses synthetic restart/restore/rollback. Local evidence is ignored under .atlas-local; live evidence is separate.
- `python3 scripts/verify_phase00.py --historical` preserves the original Phase 00 checks against its frozen Git tree. Its no-app rule is not a Phase 01 gate.

The repository remains public. Never commit private research data, credentials or proprietary design assets.

The owner-selected live preview uses a temporary Coolify HTTPS address with email delivery disabled and S3 deferred. New registration/password recovery/email invitations are explicitly unavailable. The owner-requested first identity was provisioned once through the migration process; normal identity and access checks remain enforced. Full G01 remains open.
