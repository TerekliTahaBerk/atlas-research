# Atlas agent contract

## Scope and authority

1. Read README.md, docs/ROADMAP.md, docs/RESTART.md, docs/design/REFERENCE.md, and the current phase specification/prompt before editing.
2. This is a clean restart. Historical implementations are archived references, not current requirements or production evidence.
3. Never read, copy, depend on or modify Scholara code, credentials, data, deployments or services.
4. Respect the requested phase. Phase 00 is product, design and architecture preparation; do not implement Phase 01 or provision infrastructure without a new user instruction.
5. Preserve unrelated work. Never use destructive Git operations to hide conflicts or discard user changes.

## Git and delivery

- Canonical branch and PR base: main. Phase 00 branch: feat/phase-00-foundation.
- Use scoped short-lived branches; use squash merging. No permanent develop or staging branch is needed.
- Never change archive/pre-restart-2026-11-09, rewrite old history, or delete archival references.
- Do not invent required status checks before an actual check exists. Keep CI compatible with the user's preference to avoid paid GitHub Actions usage.
- Do not claim that a push, merge, check, migration or deployment succeeded without observing it.
- Record completed work, verification, limitations and remaining work precisely.

## Product and design

- Preserve the connected research workflow and beta boundary in docs/ROADMAP.md.
- The current Atlas.dc.html reference supersedes old screenshots and theme decisions. Inspect it before deriving tokens or layouts; do not invent exact values from a prose summary.
- If the exact source is unavailable, finish independent planning and mark source-dependent design measurements as pending. Do not claim pixel parity.
- Design references describe the full product; visible future modules do not expand beta scope.
- Keep demo fixtures visibly separate from real data. Never describe local UI state as saved collaboration, real AI or functioning authentication.
- Require keyboard access, focus handling, meaningful labels, responsive behavior, light/dark contrast and recoverable error states.

## Architecture direction

- Docker/Coolify deployment and self-hosted PostgreSQL; planned Next.js/React/TypeScript and Prisma.
- Start with a modular monolith. Add workers when needed; avoid speculative microservices and mandatory Redis.
- Plan personal/shared workspaces, project permissions, stable source/version/citation identifiers and same-project links.
- Every private read, write, export, job and AI retrieval must recheck identity and resource access server-side. IDs are not authorization.
- Separate runtime and migration database privileges; document the tenancy enforcement strategy and its tests.
- No secrets, private PDFs, personal data or provider responses in commits, fixtures, screenshots or logs.
- Do not provision, migrate, restart, remove or reconfigure existing infrastructure during repository preparation or Phase 00.
