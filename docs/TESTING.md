# Testing strategy

## Executable checks

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm db:validate`, `pnpm format:check`; then `pnpm exec playwright install chromium` once and `pnpm test:e2e`. Containers that ship a different Chromium can set `PLAYWRIGHT_CHROMIUM_EXECUTABLE`; CI leaves it unset. Playwright launches a production app on 127.0.0.1:3100; it must be built first. Standard CI runs all checks. Browser plugin is not installed in this session, so regular Playwright Chromium is the recorded browser QA path.

## Conventions

Unit `*.test.ts` tests pure validation/error/contract behavior. Component `*.test.tsx` uses Testing Library, role/name queries, user-event and jest-dom. Prefer observable semantics over implementation snapshots; mock only external boundaries (Next navigation, provider SDKs) and keep deterministic fixtures. Tests must assert behavior/failure paths, never just truth or class implementation. Fixture IDs, sample labels and UTC timestamps are fixed; tests do not call paid services.

Integration tests use a new isolated Postgres DB and real constraints/transactions. `tests/database/constraints.sql` rolls back synthetic data and checks cross-org/workspace membership rejection, unique grants, restricted deletion and RLS denial. Run only against an explicitly disposable target. Phase 01 adds real actor policy tests, Auth callback/session tests and pooler isolation tests. Portable Phase 00 RLS default-deny is not a production policy suite.

E2E `*.spec.ts` tests browser → Next route → rendered response. Phase 00.5A specs are `foundation`, `phase-00-5` and `phase-00-5a`, with shared helpers in `tests/e2e/helpers.ts`; the theme is pinned through `localStorage` because the default is dark. They cover: entry to sample overview, active navigation, theme persistence/system, navigation search keyboard interactions, focus trap/Escape restore, notifications, selectors, mobile drawer and responsive overflow, unknown route/ID/module, axe accessibility on 17 routes in light and dark, the 1440/1280/1024/768/390 overflow matrix, the five Atlas AI modes, mention/slash context, share, version history, home grid/list, manuscript layouts, narrow drawers and sheets, and no-fake-functionality checks (compile, download, invite, restore, checkout, auth). No API/data boundary exists in the preview; do not pretend it was tested. Browser console runtime errors fail the smoke check.

Accessibility: every control has a name, keyboard-only reachability, visible focus, correct landmark/headings, aria-current navigation, modal focus management, reduced motion and AA text contrast. Axe covers detectable WCAG A/AA violations; human screen-reader usability remains a beta requirement. Test mobile 390px and desktop 1440px; manual screenshot review verifies composition and dark/light tokens.

CI failure is a release blocker. Add a regression for repaired defects at the lowest useful level, rerun affected checks, and broaden only when the change crosses boundaries. Keep traces/screenshots on failure without auth secrets or private research content. Standard tests contain no network/provider mocks masquerading as production implementation. Live provider/paid tests are explicit opt-in future work. Coverage targets focus on authorization and data integrity rather than line counts.
