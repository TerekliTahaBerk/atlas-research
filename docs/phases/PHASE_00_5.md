# Phase 00.5 — UI/UX master foundation

Status: UI implementation delivered; actual validation and limitations recorded below and in [visual QA](../design/VISUAL_QA.md). This phase is between the Phase 00 architecture foundation and Phase 01 identity/services. It is not a production research service.

## 1. Objective

Make the existing Next.js application a coherent, calm research environment with reusable interaction contracts and honest demonstrations of later workflows. Deliver working React screens, documentation, automated checks and visually inspected browser evidence.

## 2. Dependencies

Existing Phase 00 Next.js App Router/strict TypeScript/pnpm workspace, shared Radix/shadcn UI, themes, static sample routes and quality infrastructure. No account, credentials, database or external provider is required. No dependency was added.

## 3. Scope

Semantic V2 light/dark themes, local system/editorial typography, refined responsive shell, Home/Inbox, compact/sidebar preference, centralized navigation, contextual Atlas AI panel and full workspace, shared references and slash picker, research/library/reader, local notebook, task board/list/detail, channels/thread, future manuscript/experiment layouts, auth/onboarding previews and complete UX documentation.

## 4. Explicitly out of scope

Real authentication, tenant/membership creation, product API routes, persistent research CRUD, scholarly provider search, PDF ingestion, verified citations, model requests, tool execution, realtime delivery, CRDT editing, compilation, Python execution, billing and deployment. No schema or migration changed. No Scholara code, services or credentials were accessed.

## 5. Implemented tasks and decisions

- Reused original server route guards, Radix focus behavior, theme provider, package boundaries and tests.
- Created an original generated full-screen concept; inspected supplied references and the concept before implementing.
- Applied warm ivory/neutral surfaces and intentional charcoal mode; green identifies actionable/contextual elements rather than decorating every module.
- Preserved `/app` and every original sample route. Added `/app/home`, `/app/inbox`, `/app/help`, future module entries, `/login`, `/register`, `/reset-password`, `/onboarding`.
- Centralized destinations in shell navigation; workspace/project labels remain explicit single-sample selectors. Real zero-membership selection is deferred to verified Phase 01 results.
- Reserved a nonmodal AI column; stacked it on mobile. Added named context chips, trailing-token mention/command selection, sample answer/source presentation, action proposals and error/cancel previews. No fake timed research runs.
- Added synthetic fixtures separate from Prisma/core models. Local note/task/message/reading/onboarding state is transient. Only appearance/navigation preferences persist.
- Added inline draft warnings and browser unload warning for modified notes. In-app navigation can still discard drafts and is visibly disclosed.
- Added local paper metadata comparison, three-page reading illustration, highlight/search/zoom, collection/tag filters, task statuses, threads/reactions and safe auth form review.
- Kept future compilation/execution explicitly unavailable. Rich-text engine, arbitrary Markdown parsing and real PDF rendering are not claimed.

## 6. Technical surface

Feature owners: `shell`, `atlas-ai`, `projects`, `research`, `documents`, `tasks`, `channels`, `onboarding`, and typed `preview` fixtures/primitives. Shared UI change: inactive tabs use semantic muted foreground for light-mode contrast. Shared EmptyState titles now have heading semantics. Server pages still validate IDs and dispatch to feature interfaces. No web/UI import entered core, AI or database packages.

## 7. Reusable interaction contracts

See [AI spec](../AI_INTERACTION_SPEC.md), [interaction patterns](../INTERACTION_PATTERNS.md), [screen map](../SCREEN_MAP.md) and [component inventory](../COMPONENT_INVENTORY.md). Reference IDs are presentation identifiers only; source status without provenance cannot show verification. A UI approval proposal never authorizes a real write.

## 8. Testing and acceptance evidence

| Check                  | Result             | Evidence                                                                                                |
| ---------------------- | ------------------ | ------------------------------------------------------------------------------------------------------- |
| `pnpm lint`            | PASS               | Strict ESLint, no warnings                                                                              |
| `pnpm typecheck`       | PASS               | Prisma generation, all workspace packages, tool/test TypeScript                                         |
| `pnpm test`            | PASS               | 24 tests; original 16 retained plus 8 interaction/provenance tests                                      |
| `pnpm db:validate`     | PASS               | Existing Prisma schema validates; offline configuration, no connection                                  |
| `pnpm build`           | FAIL — environment | Turbopack CSS worker cannot bind a local port (`EPERM`), including retry with elevated tool permissions |
| `pnpm build --webpack` | PASS               | Supported alternative bundler; production typecheck and 27 static outputs                               |
| `pnpm test:e2e`        | PASS               | 58 Chromium tests; responsive matrix, axe, keyboard/local-state/preview boundaries                      |
| `pnpm format:check`    | PASS               | Full repository Prettier check                                                                          |

The default build script and assertions were not weakened to hide the Turbopack limitation. The alternative runs the real optimized production build and its output is used for Playwright. This environment limitation remains explicit; CI should run the original default build in its normal runner.

Acceptance:

- [x] Existing package/tenant/security architecture and original routes remain intact.
- [x] Product-wide themes, layout conventions and centralized navigation implemented and documented.
- [x] All ten requested core/future modules have working UI compositions with honest boundaries.
- [x] Contextual AI, removable chips, keyboard @ and / pickers, source states, copy and unexecutable proposals exist.
- [x] Authentication and seven-step optional onboarding are clearly labeled local previews.
- [x] Original tests retained; meaningful regression tests cover interactions and no-service boundaries.
- [x] Final complete responsive/accessibility browser result and 22 retained screenshots recorded.
- [x] Final formatting/diff review complete; Git handoff evidence is reported with delivery.

## 9. Visual QA

[Visual QA](../design/VISUAL_QA.md) records browser, themes, viewport matrix, inspected screenshot paths, concept comparison and defects repaired. Browser plugin was unavailable; configured Playwright Chromium was used. Automated geometry/accessibility checks do not claim assistive-technology or cross-browser certification.

## 10. Phase 01 integration requirements

1. Replace auth previews with verified server sessions, callback/PKCE handling, safe cookies, same-origin mutations and enumeration-resistant errors. Remove local form-review behavior rather than allowing it to coexist as an auth bypass.
2. Replace fixture workspace/project selectors with minimal server-authorized DTOs. Add explicit zero-workspace, zero-project, revoked/denied, pending and recoverable failure views using the shared state primitives.
3. Bootstrap personal organization/workspace/owner transactionally and idempotently. Create private projects with an explicit owner grant; no URL, chip or local preference can select unauthorized scope.
4. Verify organization/workspace membership plus project capability on every read/write, and honor restricted-channel membership later. Recheck at jobs, retrieval, citation rendering and signed downloads.
5. Validate unknown DTOs with Zod. Preserve composite tenant keys, permission-safe 404s, private no-store responses, normalized errors/request IDs and no client database imports.
6. Replace transient drafts with versioned services only when their owning phases ship. Maintain conflict recovery, authorized mentions and exact source/version provenance. Current module links are not production artifact detail URLs.

## 11. Known limitations and revisit conditions

Synthetic papers, people, venues, citation counts and dates are authored design content. No DOI or verified academic claim is fabricated. The reader is reflowing sample text, not a real PDF. The editor is plain text with marker insertion; it has no rich-text parser, autosave or collaborative cursor. Mention detection supports a trailing token rather than arbitrary editor cursor insertion. Local state can be lost on in-app navigation, and current creation review dialogs do not create objects. Workspace selectors do not simulate live membership or no-tenant authorization. No arbitrary code, LaTeX compiler, scholarly provider or model is installed.

Responsive and Chromium/axe checks cover specified preview flows; other browser engines, real screen readers, real tenant state, network failure recovery and backend authorization remain future integration tests. Default local Turbopack build is environment-blocked; Webpack production build is validated. No deployment or migration is performed by this phase.

## 12. Git delivery

Requested branch: `feat/phase-00-5-ui-ux`, based on clean `master`. Canonical PR base remains `master`. Final commit/push/PR evidence is reported at handoff; no merge is authorized. The code and documentation are scoped to Phase 00.5.
