# Atlas agent operating contract

This file is canonical for every coding agent. `CLAUDE.md` points here and must not create alternative rules.

## Before changing code

1. Read README, docs/MASTER_PLAN.md, docs/ARCHITECTURE.md, docs/SECURITY.md, and the active docs/phases/PHASE_XX.md. Read database and API documents when touching those boundaries.
2. Inspect existing code and Git state. Preserve unrelated changes. Never read, copy, depend on, or modify Scholara code, credentials, database, deployments, or services.
3. Respect phase scope. Phases 00 and 00.5 have no authentication or product data service. Phase 00.5 permits explicitly labeled in-memory UI demonstrations, including local text editing, task/message state and AI presentation; it never executes models, searches, compilation or code. Read docs/phases/PHASE_00_5.md and the UX/AI interaction specifications for UI work. Do not implement a later phase without user instruction. Do not turn preview data into a pretend production service.
4. Use `master` as the canonical integration branch and PR base. Create scoped working branches from `master`; `test/phase-00-foundation` is the Phase 00 working branch. Phase 00.5 uses `feat/phase-00-5-ui-ux`. Keep each working branch tracking its matching remote branch.
5. Prefer small reviewable changes/commits. Avoid unrelated refactoring, unnecessary dependencies, empty packages, duplicate utilities, and premature infrastructure.

## Implementation requirements

- TypeScript strict, no unchecked indexing, no `any` without a documented boundary justification. Validate unknown external data with Zod.
- Keep business logic in domain services, outside React components and route handlers. UI composes domain APIs; domains do not import web or UI packages. AI and core have no database dependencies.
- Authenticate sessions server-side; authorize actor, tenant, resource, and capability for every read/write/job/tool/storage request. Never trust a URL tenant ID or hidden button as authorization.
- Preserve composite tenant keys and tenant-scoped queries. Never cache private responses across actors or tenants. Recheck membership at background execution and retrieval time.
- No secrets in source, browser code, logs, screenshots, fixtures, or generated artifacts. Never expose server keys with NEXT_PUBLIC_. Fail required environment validation without printing values.
- Do not silently swallow failures. Normalize public errors, retain redacted request IDs, and keep provider/database details out of client responses.
- Use shared UI and tokens; accessible names, focus, keyboard behavior, responsive states, contrast, and reduced motion are required. Preserve SSR/client boundaries.
- Add meaningful regression tests for new behavior and critical failure paths. Never weaken checks or tests merely to pass.
- Migrations require an explicitly identified development target. Never migrate an unknown or production database from local automation. Use expand/backfill/contract migrations and verified backups for data-bearing changes. Avoid research-data cascades.
- Keep synthetic UI fixtures separate from production domain models. Persist only appearance and navigation preferences; never store preview prompts, drafts, messages or onboarding content in browser storage.
- Keep docs, ADRs, contracts, and phase acceptance criteria aligned with delivered behavior. Record consequential deviations and revisit conditions.

## Completion gate

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`, `pnpm db:validate`, and `pnpm format:check` for foundation changes. Scope additional integration checks to affected behavior. Inspect diff for secrets, imports, boundary violations, obsolete dependencies, and misleading preview claims. Report actual PASS/FAIL/NOT RUN, remaining risks, migration/deployment state, and Git state. Never claim untested features, deployments, pushes, or checks succeeded. A credential blocker does not excuse unfinished independent work.
