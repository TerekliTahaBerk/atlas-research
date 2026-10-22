# Phase 00.5B — independent visual and interaction QA

Date: 2026-10-22. Scope: the public, synthetic Phase 00.5 UI preview. Phase 01 has not started. No Scholara material, credentials, services or deployments were accessed.

## Verdict and baseline

**PASS for the scoped Chromium UI-preview QA.** All 15 screens and five AI modes were audited; 13 reproduced defects were repaired. No unresolved P0/P1 was found in this tested scope. Exact PDF rendering differences and untested assistive technologies/platforms prevent a pixel-identical or full conformance claim. This report supersedes the outstanding QA notes in the Phase 00.5A report, whose PR #3 is now merged.

The starting tree was clean on `master` at `ec8a91f` (merge of PR #3, implementation `ae3ce81`). `origin/master` was fetched before creating `fix/phase-00-5b-visual-qa`. QA used the real production Next.js application, not the prototype as the application.

## Independent source

Original package: `Handoff specification.zip`, found in the user's Downloads directory. Archive SHA-256: `c1a72aabb7db64eb0ff37367db88155ed07aea0b1ea94af39b6e91fdb003cc73`. Original `Atlas.dc.html` SHA-256: `edb5b4edb4e662ae978a4ab9293c7fa25f531262a85cfd6fec5f871d2a75fa03`.

Read `Atlas Handoff.md`, the HTML template and logic, supporting runtime/design-system files, and all nine supplied PNGs. The PNGs depict the earlier reference product (Home, document AI, context menu, Share, pricing, AI Focus, LaTeX split, version history and another Home state). They support geometry and layering; the Atlas HTML and explicit handoff measurements are authoritative for Atlas styling.

The original runtime rendered successfully on a loopback-only server. The QA copy adds one instance handle in `componentDidMount` so the existing `go()` and `setState()` controls can select deterministic states. No template, fixture, token, asset or rendering rule was changed. Nothing was publicly deployed. External React/Babel/font/icon assets required by the original reference are used only by that local prototype. Atlas itself uses self-hosted fonts.

## Method and coverage

Browser path: **Browser plugin unavailable**, so the repository's Playwright Chromium runner was used. Environment: macOS, Node 24.21.0, pnpm 11.25.0. Pinned dependencies were installed with the unchanged lockfile. The pnpm environment override `pnpm_config_verify_deps_before_run=false` avoids the runtime wrapper's automatic dependency reinstallation; it does not skip a repository quality check.

- All 15 reference screens inspected in both themes. Their reference screenshots are captured at 1440×900.
- All 15 implementation screens captured at 1920×1080, 1440×900, 1280×800, 1024×768, 768×1024 and 390×844, in both themes.
- Reference Compact, Open, Focus, Panel, manuscript split, Share and version history captured. Implementation captures additionally cover Inbox popover, search, pricing, paper/task details, document mention/slash menus and the real mobile drawer.
- Fonts and images awaited; reduced motion, normal browser scale, fresh contexts and authored fixture timestamps stabilize captures. Capture scripts do not crop screenshots. First-viewport captures are complemented by interaction/scroll tests.
- Direct side-by-side visual inspection covers layout, hierarchy, typography, controls and overlays. Automated raw RGB comparisons cover sidebar/header/canvas separately. Differences are diagnostic, not a subjective fidelity percentage or an automatic approval criterion.
- Six signature screenshots (Home/Documents/Manuscripts × light/dark) were reviewed against the original reference before acceptance as regression baselines. A 0.2% pixel tolerance permits minor rasterization differences; exact geometry and interaction assertions remain separate.

See [visual matrix](VISUAL_COMPARISON_MATRIX.md), [interaction matrix](INTERACTION_QA_MATRIX.md), [accessibility audit](ACCESSIBILITY_AUDIT.md), and [artifact instructions](qa/00-5b/README.md).

## Defect inventory

All listed defects are fixed. Severity describes the reproduced original issue, not a current release blocker.

| ID  | Severity | Reproduction / expected versus actual                                                                                                | Cause and repair                                                                                                                                                                     | Verification                                                                           |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| B01 | P0       | Open document history, press Cmd/Ctrl+J: focus moves into Atlas behind history. Foreground dialog must own focus.                    | Global AI shortcut ignored other overlays; guard dialog/menu ownership. Cmd/Ctrl+K replaces AI Focus with search and respects other dialogs.                                         | Foreground-dialog regression; overlay axe scans                                        |
| B02 | P1       | Close history or AI Focus: focus could remain on body instead of returning to a useful control.                                      | Controlled dialogs had no Radix Trigger; capture/restore their invoker. Composer cleanup now unregisters only its own instance.                                                      | Exact invoker/composer focus and layered Escape assertions                             |
| B03 | P1       | At 390px, type 34 letters then ` @` in an empty document: picker right edge reaches ~595px.                                          | Article-relative fixed-width menu lacked collision handling. Portal to body; measure, clamp, flip, reposition on scroll/resize; expose active descendant and scroll selected option. | Phone bounds, arrows, insertion, slash-to-heading regression                           |
| B04 | P1       | Open d2 or paper p1: AI still names d1/p2; changing channel/file also leaves defaults. Inline prompt reads previous ambient context. | Static screen defaults and stale send closure. Replace ambient context on resource changes; pass newly attached references directly into sample reply.                               | d1→d2, p1, intro.tex, #general, all eight-module transitions; unit inline-context test |
| B05 | P1       | At 1280px with docked AI, source is ~197px wide.                                                                                     | Split/tree decisions used viewport alone and percentage minimums. Observe canvas width; collapse tree, fall back to editor-only, and enforce 320px source/280px PDF minimums.        | Source typing at 1024/1280/1440/1920; keyboard splitter; no document overflow          |
| B06 | P1       | Reader Notes and selection Note do nothing below 900px. Selection actions can exceed the paper edge.                                 | Notes rendering was gated entirely by desktop width. Reuse panel content in a named mobile Radix dialog with close/focus return; bound and wrap the toolbar.                         | 390px Notes→Outline→Escape, focus return, toolbar bounds and axe                       |
| B07 | P1       | On a phone, graph suggestions extend below the fixed canvas without a scroll path.                                                   | Stacked flex content had no vertical overflow owner. Allow the stacked graph/inspector region to scroll.                                                                             | Scroll final inspector action into viewport and activate it by keyboard                |
| B08 | P1       | Non-neighbour graph labels and inactive filters fade along with their containers.                                                    | Group opacity reduced text contrast despite valid token colors. Keep text opaque; use borders/weight and pressed semantics to indicate relationships/filter state.                   | Graph visual review, route axe in both themes, retained keyboard node list/inspector   |
| B09 | P2       | Main document title omits “in structure prediction,” changing the reference's wrapping and hierarchy.                                | Short sidebar fixture title reused as the display title. Restore the approved full article heading.                                                                                  | Reviewed light/dark document baselines                                                 |
| B10 | P2       | Floating composer is 7px too low; canvas/history use 12/24px radii rather than 10/16px.                                              | Canvas-relative offset included the frame twice; generic radius utilities differed. Correct offset and explicit radii; release stacked composer space when docked.                   | Rendered 14px position, 10px canvas radius, signature/overlay screenshots              |
| B11 | P2       | Project next-step text is cut vertically inside its fixed-height preview.                                                            | Unbounded description and flex shrink consume the excerpt space. Clamp description and truncate the next step with its full text available by title.                                 | Home visual baselines at desktop and responsive capture review                         |
| B12 | P1       | Empty history says versions are saved automatically although edits are transient.                                                    | Prototype empty-state copy carried into preview. Explicitly state no versions/local saving.                                                                                          | Unit empty-history honesty assertion                                                   |
| B13 | P2       | Every project module eagerly imports both editor engines.                                                                            | Shared client dispatcher uses static imports. Split document/manuscript imports with Next dynamic; SSR stays enabled.                                                                | Production build, all-route browser matrix, JS resource capture                        |

Totals: **1 P0, 8 P1, 4 P2, 0 P3** found and fixed. No unresolved P0/P1 was found in the tested scope. This is not a claim that untested assistive technologies or browsers are defect-free.

## Performance and test quality

Editor engines now load only when their modules are rendered. A fresh-context resource check recorded 19 script resources / 280,343 encoded bytes for Tasks, 21 / 433,746 for Documents, and 21 / 403,103 for Manuscripts. Each editor requested two additional chunks absent from Tasks. This is a local resource observation, not a latency benchmark. ResizeObserver and event listeners clean up on unmount. Shell shortcut listeners no longer resubscribe on every sample message update. Graph fixtures are small; no large-graph benchmark or real execution benchmark is claimed.

Existing tests were inspected. Text-only reachability checks remain smoke tests and are now complemented by real route transitions, context replacement, editing, selection, accepted/discarded suggestions, keyboard resizing, overlay focus and screenshot comparisons. Two existing geometry assertions were changed to wait for the **same exact bounds** after animations settle. No test or accessibility rule was deleted, muted or weakened. Initial failing attempts are retained in the QA work log; final status refers to the last complete run.

## Boundaries, remaining differences and limitations

- PDF panes are authored illustrations. They preserve the reading/split composition but differ in exact text scale and source line wrapping from the prototype. No PDF ingestion or compilation is claimed. CodeMirror is the previously approved Monaco equivalent.
- Documents/experiments reserve more topbar room than the prototype to avoid overlapping controls. Sidebar rows retain the specified 30px instead of inheriting prototype flex compression. System-theme selection, local-only disclosures, readable contrast tokens and the expanded token audit are intentional differences.
- The Mobile QA page embeds real routes rather than reproducing a static phone drawing. Actual 390px routes and drawer interactions were tested independently.
- Graph pan/zoom remains unimplemented and has no pretending-to-work controls. Keyboard node selection and linked-item inspection are available. Tracked suggesting remains explicitly illustrative.
- Manual VoiceOver/NVDA, Firefox/WebKit, Linux screenshot rasterization, mobile hardware/virtual keyboards, 200% text scaling and large-user-data performance: **NOT RUN**. These limit accessibility/browser certification and should be verified before external pilot use.
- No research API, auth provider, AI model, search, compiler, payment, invitation delivery, database migration or deployment was added or run. Only preference keys persist. Schema validation does not connect to a database.

## Final verification record

Tested implementation: `04ee12e` (includes `a29c017` plus the final docked-canvas spacing correction). Documentation/evidence is committed separately afterward. The capture manifest records the full source commit, original archive/HTML hashes and screenshot hashes.

| Check                                         | Final result                     | Evidence / limit                                                                                                    |
| --------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`                           | **PASS**                         | All matched files, including final reports/manifests                                                                |
| `pnpm lint`                                   | **PASS**                         | Zero warnings; generated reference artifacts are ignored                                                            |
| `pnpm typecheck`                              | **PASS**                         | All workspace packages and tool/test TypeScript                                                                     |
| `pnpm test`                                   | **PASS**                         | 47 tests in four files                                                                                              |
| `pnpm db:validate`                            | **PASS**                         | Schema only; no database connection or migration                                                                    |
| `pnpm build`                                  | **PASS**                         | Default Turbopack production build; 33 static routes                                                                |
| `pnpm test:e2e`                               | **PASS**                         | 101 Chromium tests; final complete run 41.0s                                                                        |
| `pnpm qa:visual`                              | **PASS**                         | 246 captures, 30 independent regional comparisons; no app page/console errors or document-level horizontal overflow |
| Extended interaction spots                    | **PASS**                         | Long document retains width/scroll/real formatting controls; source scroll retained through PDF zoom/pages          |
| Diff/boundary review                          | **PASS**                         | No new dependency, schema/backend/provider/credential changes; only synthetic screenshots                           |
| Remote CI                                     | **NOT RUN in this local report** | Check the PR workflow separately; Linux screenshot rasterization not locally verified                               |
| Manual screen reader / other engines          | **NOT RUN**                      | Explicit accessibility/browser limits above                                                                         |
| Database integration / migration / deployment | **NOT RUN**                      | No identified target needed or used for this UI-only change                                                         |

Recommendation: ready for review and Phase 01 UI integration planning, with the documented manual/browser checks carried forward. This does not authorize or implement Phase 01, real research processing or production release. All seven required local commands pass; only a code-review merge should integrate the work. Do not auto-merge.

Git: scoped QA branch `fix/phase-00-5b-visual-qa` based on integrated `master`. Implementation commits `a29c017` and `04ee12e`; evidence/report commit follows. Push/PR state is recorded in the final handoff. No migration or deployment was performed.
