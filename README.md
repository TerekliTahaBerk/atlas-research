# Atlas Research

Atlas is a connected workspace for individual researchers and small research teams.

**Status:** Phase 00 product/design/architecture package completed on 9 November 2026 for PR review. See the [handoff and actual verification](docs/PHASE_00_HANDOFF.md). Phase 01 has not started. There is no application, installed application toolchain, database or deployment created by this work.

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

Deploy with Docker on Coolify. Use self-hosted PostgreSQL as the application database, with Prisma as the planned ORM. Phase 00 selects self-hosted Better Auth, private file volumes with authorized access, PostgreSQL-backed jobs and independent backups. Decisions and alternatives are linked from the architecture document. No hosted database subscription is required; nothing has been provisioned.

## Repository state

- `main`: canonical integration branch; future Coolify deployment source.
- `feat/phase-00-foundation`: prepared working branch for Phase 00.
- `archive/pre-restart-2026-11-09`: legacy source and every original branch tip.
- Short-lived `feat/*`, `fix/*`, `chore/*` and `docs/*` branches merge through pull requests.
- Old code, migrations, dependencies, workflows and reports are absent from the active tree. Git history remains recoverable.
- This documentation/reference package has no application build or test commands. Run `python3 scripts/verify_phase00.py` and `git diff --check` for local documentation checks. The implementation toolchain and future tests are planned, not installed.

The repository remains public. Never commit private research data, credentials or proprietary design assets.
