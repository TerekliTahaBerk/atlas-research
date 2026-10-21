# Atlas shared agent instructions

[AGENTS.md](AGENTS.md) is the canonical operational contract and applies in full, including all hard requirements. Read it before making changes; update it rather than adding conflicting rules here.

Atlas is a modular monolith: Next.js web application → domain services → Prisma/PostgreSQL. Supabase owns future identity/storage/realtime; Inngest owns future durable jobs. Shared UI, core contracts, provider-neutral AI contracts, and database are independent workspace packages. Tenant hierarchy is Organization → Workspace → Project; personal researchers use personal organizations. Composite tenant keys and server authorization are mandatory.

Start with [MASTER_PLAN](docs/MASTER_PLAN.md), [ARCHITECTURE](docs/ARCHITECTURE.md), [SECURITY](docs/SECURITY.md), and the active [phase plan](docs/phases). Follow strict typing, validation, authorization, secret hygiene, safe migrations, honest UI boundaries, meaningful tests, and evidence-based completion reporting exactly as required by AGENTS.md. No Scholara reuse, no unrelated refactoring, no mock production behavior, and no future-phase implementation without authorization.
