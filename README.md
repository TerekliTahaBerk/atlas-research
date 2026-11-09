# Atlas Research

Atlas is a connected workspace for individual researchers and small research teams.

**Status:** clean restart prepared on 9 November 2026. Phase 00 has not started. There is no application, installed toolchain, database or deployment in this branch.

## Start here

- [Agent contract](AGENTS.md)
- [Roadmap and beta boundary](docs/ROADMAP.md)
- [Restart and recovery record](docs/RESTART.md)
- [Design reference](docs/design/REFERENCE.md)
- [Deployment and database decision](docs/decisions/0001-deployment-and-database.md)
- [Phase 00 execution prompt](docs/prompts/PHASE_00.md)
- [Contribution and branch policy](CONTRIBUTING.md)

## Product direction

Create a project → discover or add sources → read and annotate → write source-linked notes/documents → assign tasks → discuss with collaborators → ask evidence-grounded AI.

The beta targets individual researchers and small teams of 2–10. Personal accounts must not require a university affiliation.

## Infrastructure direction

Deploy with Docker on Coolify. Use self-hosted PostgreSQL as the application database, with Prisma as the planned ORM. No hosted database subscription is required by this decision. Authentication, file storage, background work and backups must be designed explicitly in Phase 00. Nothing has been provisioned.

## Repository state

- `main`: canonical integration branch; future Coolify deployment source.
- `feat/phase-00-foundation`: prepared working branch for Phase 00.
- `archive/pre-restart-2026-11-09`: legacy source and every original branch tip.
- Short-lived `feat/*`, `fix/*`, `chore/*` and `docs/*` branches merge through pull requests.
- Old code, migrations, dependencies, workflows and reports are absent from the active tree. Git history remains recoverable.
- This documentation-only baseline has no build or test commands. Phase 00 defines the implementation toolchain and verification plan.

The repository remains public. Never commit private research data, credentials or proprietary design assets.
