# Foundation architecture and maintainability review

Reviewed after implementation against the Phase 00 request, separately from construction. No subagents or other product repositories were used.

## Findings fixed

- Strict optional callback mismatch in Next Link: optional callbacks are invoked through concrete handlers; exactOptionalPropertyTypes remains enabled.
- Root test package resolution: shared UI is an explicit root test dependency and App Router test context is deterministic. Actual routing/theme behavior remains in real-browser tests.
- Next streaming sent 200 for unknown resources: statically enumerate sample project/workspace/module/settings routes and reject other params before streaming. Eight unknown-path regressions assert HTTP 404 and recovery UI.
- Mobile dialog retained centered-dialog translate utilities and clipped its upper/left half: use zero translate utilities with explicit drawer layout; test actual (0,0) bounds and 300px width.
- Multiple search instances could register competing global keyboard handlers: AppShell now owns a single search dialog/controller with focus restoration, and both sidebar triggers use it. Mobile search closes both dialogs after following a result.
- CLI generated a redundant cn package import: all shared UI components use the single clsx/tailwind-merge utility; redundant dependency removed.
- Prisma latest was a prerelease: use stable 7.10.1 with ESM and pg adapter. ESLint 10 had unsupported peer ranges in Next's React/import/a11y plugins: use compatible 9.39.5 with explicit maintenance debt in ADR 0012 and no peer conflicts.
- Generated Next environment type files caused formatter churn: next-env.d.ts and build outputs remain generated/ignored. Next's managed app AGENTS block links back to canonical root rules.

## Boundary/integrity review

No web imports of database or AI packages; no browser service clients or live product endpoints. Core and AI contracts have no UI/database dependencies. No explicit any in handwritten source. Shared UI exports resolve and compile; database generated source is ignored and created during build/typecheck. Workspace dependencies are exact-pinned and lockfile is reproducible. No unnecessary async runner, provider SDK, microservice/event bus, graph store, or empty package was installed.

Seven real SQL checks passed in the isolated new PostgreSQL cluster: cross-org grant rejection, cross-workspace mismatch rejection, duplicate membership rejection, restricted parent deletion, RLS enabled on all seven tables, non-owner reads denied, non-owner writes denied. Migration status was current and Prisma diff found no drift. SQL policies are deny-by-default only; real Auth and runtime RLS remain Phase 01 release gates.

Visual review compared the saved concept with browser-rendered light/dark desktop and mobile surfaces. Navigation, typography, tokens and content hierarchy are cohesive; the clipped drawer defect was corrected and rechecked. Axe light/dark checks reported no WCAG A/AA violations on the overview. Manual screen-reader testing and deployed-service behavior were not tested.

Secret-pattern scan found only localhost example/CI/offline database URLs and URL-prefix validation, no credentials. No Scholara files/services were read or changed. Future DB documentation explicitly separates public bibliographic metadata from unpublished private source records and defines scoped role delegation.

## Remaining gates

Human approval for a new protected Vercel project; hosted Actions run after a future push; real Supabase Auth/Storage/Realtime and policy tests in Phase 01/02/05; provider evaluation/AI consent in Phase 03; backup/restore/security/pilot evidence before beta. ESLint 9's deprecated support status should be revisited as soon as the upstream plugin tree supports 10. None of these is described as implemented production capability.
