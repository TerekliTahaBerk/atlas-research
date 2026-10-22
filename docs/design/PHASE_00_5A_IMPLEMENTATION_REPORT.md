# Phase 00.5A — implementation report

Date: 2026-10-22. Branch: `feat/phase-00-5a-design-integration` from `master` (01379a4). Scope: the design-to-code integration of the Claude Design handoff. **Phase 01 was not started.** The Scholara repository was not read, copied, depended on or modified.

## 1. Summary

All 15 handoff screens are implemented as React, Tailwind and Radix components on the existing Next.js App Router architecture:

- Home and Overview.
- Documents and Manuscript.
- Research, Library and Reader.
- Tasks and Channels.
- Experiments and Graph.
- Inbox and Settings.
- Two QA views: Design system and Mobile.

Overlays: the search palette, share popover, version history, pricing, the inbox popover, shortcuts, and the auth and onboarding flows.

Atlas AI runs on one shared state with five modes (Compact, Open, Focus, Panel, Inline), context chips, structured `@` mentions and context-sensitive `/` commands. Every response is a labeled sample. Nothing is executed, sent, compiled, charged or stored beyond the theme and sidebar preferences.

The per-screen mapping is in [PHASE_00_5A_REFERENCE_MAP.md](PHASE_00_5A_REFERENCE_MAP.md).

## 2. Sources and constraints followed

Sources read: `README.md`, `chats/chat1.md`, `Atlas Handoff.md`, `Atlas.dc.html`, the `_ds` bundle and styles, and `support.js`. These served as the visual and behavioural reference only:

- The `<x-dc>` runtime was not used.
- No prototype script, style or asset was copied into the app.

The repository's AGENTS and CLAUDE docs were followed: strict TypeScript, synthetic fixtures kept separate, no secrets, and storage limited to appearance and navigation preferences.

Two handoff choices were rejected, as the brief requires:

- The handoff's Classical gold accent was not adopted. **Atlas green remains the accent.**
- The prototype's theme switcher was not reused. There is a single next-themes system.

## 3. Architecture preserved

What stayed the same:

- Server route guards (`generateStaticParams` with `dynamicParams=false`), package boundaries (`@atlas/ui`, `core`, `ai`, `database`), the Prisma schema and the security headers. The one exception is the frame-ancestors change in §11.
- Feature code never imports database, server-environment or provider packages.

What was replaced:

- The old `features/*` Phase 00.5 implementations, which the new design supersedes.
- `/app`, which now redirects to `/app/home`.

New modules: `reader`, `graph`, `/app/design-system` and `/app/design-system/mobile`.

New dependencies (exact pins; see `apps/web/package.json`):

| Purpose           | Packages                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------ |
| Rich documents    | Tiptap 3.32.0 (`react`, `pm`, `starter-kit`, `extensions`)                                 |
| LaTeX editor      | CodeMirror 6 (`state`, `view`, `commands`, `language`, `legacy-modes`), `@lezer/highlight` |
| Split layouts     | `react-resizable-panels` 4.14.8                                                            |
| Radix primitives  | `radix-ui` 1.8.1                                                                           |
| Variants          | `class-variance-authority` 0.7.1                                                           |
| Self-hosted fonts | Fontsource: Geist, Cormorant Garamond, Lora, JetBrains Mono                                |

## 4. Tokens, theme and typography

The handoff tokens are in `globals.css`, with dark as the default. The shadcn semantic variables are aliases of them, so there is one palette.

- **Theme.** next-themes sets both `class` and `data-theme`. Tailwind's `dark:` keys off `[data-theme='dark']`.
- **AA adjustments.** Seven tokens were adjusted, and a new filled-button green `--acb` was added. `tokens.ts` documents them, the `/app/design-system` view renders them, and a unit test asserts the table matches the stylesheet and that every audited pair meets AA. See [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md).
- **Fonts.** All four handoff fonts are self-hosted, so there are no remote font requests.

The browser accessibility checks found a real defect, now fixed. `tailwind-merge` read `text-ctl`, `text-ui` and `text-meta` as colours and dropped `text-white` on filled buttons. `cn()` now registers them as font sizes.

## 5. Shell, navigation and overlays

**Layout.**

- 216px sidebar, 48px topbar, and a 6px canvas inset with radius 10.
- ⌘\\ collapses the sidebar, and the choice persists.
- Below 900px the sidebar becomes a 280px Radix drawer. It traps focus and returns focus to "Open navigation".

**Overlays.**

- ⌘K opens the 580px "Search Atlas" palette, which searches pages and sample items and hands off to Atlas. It closes the mobile drawer rather than stacking on it.
- `?` opens the shortcuts dialog.
- Inbox popover: 420px. Share popover: 380px. Version history: 920×600. Pricing: 960px.

All overlays use Radix focus management.

## 6. Screens

The full table is in the [reference map](PHASE_00_5A_REFERENCE_MAP.md).

- **Documents.** Tiptap with custom nodes: citation, task reference, person mention, comment mark and count, tracked insert/delete, presence, and an Atlas suggestion block. It has BubbleMenu formatting and `/`, `@` and citation menus.
- **Manuscript.** CodeMirror 6 (stex) with a diagnostics gutter, presence and a sync range. It has resizable editor-only, split and PDF-only layouts, a problems panel, and SyncTeX-style preview-to-source jumps over an illustrated sample PDF page.
- **Graph.** A typed, filterable, keyboard-focusable graph with an inspector.

## 7. Atlas AI

| Mode / feature | How it works                                                                           |
| -------------- | -------------------------------------------------------------------------------------- |
| Compact → Open | Clicking or focusing the composer opens it                                             |
| Focus          | ⌘/Ctrl+J, with a dim overlay and 7px blur; Escape returns to Open                      |
| Panel          | 380px, docked; the canvas reflows by `margin-right: 392px`; a bottom sheet under 900px |
| Inline         | `ContextualAITrigger` and `atlas.ask()` from screen content                            |
| Mentions       | Eight entity kinds with structured IDs                                                 |
| Slash commands | Eight commands, filtered by screen                                                     |
| Keyboard       | Arrows, Enter and Escape with `aria-activedescendant`                                  |

Thinking and streaming are **labeled sample animations**: `Preview` tags, "Preview sequence · Ns", and "Sample response" on every reply. They are instant under reduced motion. The user approved this deviation, and it is recorded in [AI_INTERACTION_SPEC.md](../AI_INTERACTION_SPEC.md) and [PHASE_00_5.md §13](../phases/PHASE_00_5.md).

## 8. No fake functionality

| Action                           | What the UI says                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Compile / Recompile              | "Compilation isn't available in this preview — the PDF pane shows a sample illustration"                                            |
| Download PDF                     | "no PDF has been compiled"                                                                                                          |
| Invite (share)                   | "sending is not connected, nobody was invited"                                                                                      |
| Restore version                  | Two-step confirm, then "the current content was not replaced"                                                                       |
| Checkout                         | "Checkout isn't connected — no payment was requested"; plans marked illustrative                                                    |
| Sign in / Create account / Reset | "Preview only — no authentication request was sent" / "no account was created" / "no reset email was sent"; the password is cleared |
| Notebook run                     | Explains that execution is unavailable; no code runs                                                                                |
| Channel send                     | "Stays in this tab · not delivered"                                                                                                 |
| Onboarding                       | "no account, workspace or project is created"; invites "(not sent)"                                                                 |

The E2E suite asserts there is no `/api` request and no non-GET request on the AI, auth, onboarding and checkout paths. It also asserts that localStorage holds only `theme` and `atlas-sidebar-collapsed`, and never draft text.

## 9. Visual QA (real screenshots)

The screenshots were captured from the production build (`next start`) with Playwright Chromium. There are 71 images in [`qa/00-5a/`](qa/00-5a/), each named `<theme>-<width>-<screen>.png`. They cover:

- 1440px: dark and light, every screen.
- 1280px and 1024px: dark and light, key screens.
- 390px: dark and light.

The capture script reported no page errors, console errors or horizontal overflow.

| Screen                         | Dark                                 | Light                                 |
| ------------------------------ | ------------------------------------ | ------------------------------------- |
| Home 1440                      | ![](qa/00-5a/dark-1440-home.png)     | ![](qa/00-5a/light-1440-home.png)     |
| Document 1440                  | ![](qa/00-5a/dark-1440-doc.png)      | ![](qa/00-5a/light-1440-doc.png)      |
| Manuscript 1440                | ![](qa/00-5a/dark-1440-ms.png)       | ![](qa/00-5a/light-1440-ms.png)       |
| Research 1440                  | ![](qa/00-5a/dark-1440-research.png) | ![](qa/00-5a/light-1440-research.png) |
| Graph 1440                     | ![](qa/00-5a/dark-1440-graph.png)    | ![](qa/00-5a/light-1440-graph.png)    |
| Tasks 1440 (detail open)       | ![](qa/00-5a/dark-1440-tasks.png)    | ![](qa/00-5a/light-1440-tasks.png)    |
| Home 1280 / Document 1280      | ![](qa/00-5a/dark-1280-home.png)     | ![](qa/00-5a/light-1280-doc.png)      |
| Manuscript 1024                | ![](qa/00-5a/dark-1024-ms.png)       | ![](qa/00-5a/light-1024-ms.png)       |
| Home 390                       | ![](qa/00-5a/dark-390-home.png)      | ![](qa/00-5a/light-390-home.png)      |
| Document 390                   | ![](qa/00-5a/dark-390-doc.png)       | ![](qa/00-5a/light-390-doc.png)       |
| Mobile QA view / Design system | ![](qa/00-5a/dark-1440-mobile.png)   | ![](qa/00-5a/light-1440-system.png)   |

Defects found and fixed during QA:

1. `tailwind-merge` dropped `text-white`, so button text fell to 3.1:1 contrast.
2. The stacked-composer offset (`--aic`) never applied. A container query cannot style its own container; the rule moved to the canvas children.
3. Library and task detail sheets sat under the composer on phones.
4. The overview title collided with the avatars at 390px.
5. A hydration mismatch (React #418) on Settings and the Design system when Light was stored. Theme-dependent markup is now gated on `useHydrated()`.
6. Contrast: dark `--tx3` on hover rows and the AI input, and the light presence label.
7. The CodeMirror scroller failed the axe scrollable-region rule.
8. The mobile drawer and search palette stacked as two dialogs.

## 10. Test and build results

Run on this branch's final code, with Node v22.22.0 (the repository engine wants ≥24.19, so pnpm only warns):

| Command                          | Result   | Detail                                                                                                                        |
| -------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | **PASS** | Lockfile unchanged                                                                                                            |
| `pnpm format:check`              | **PASS** | All files Prettier-clean                                                                                                      |
| `pnpm lint`                      | **PASS** | ESLint, `--max-warnings=0`, including the React Compiler rules                                                                |
| `pnpm typecheck`                 | **PASS** | Prisma generation, all packages, tools and tests                                                                              |
| `pnpm test`                      | **PASS** | 45 tests in 4 files                                                                                                           |
| `pnpm db:validate`               | **PASS** | Schema valid; no connection made                                                                                              |
| `pnpm build`                     | **PASS** | Default Turbopack build; 33 static pages. Phase 00.5 had to fall back to Webpack in its environment; that was not needed here |
| `pnpm test:e2e`                  | **PASS** | 81 Chromium tests: foundation 16, phase-00-5 53, phase-00-5a 12                                                               |

Unit tests cover:

- Mention keyboard selection, wrap and removal.
- Escape keeping the draft.
- Context-specific commands.
- Entity coverage and ID uniqueness.
- The reduced-motion sample reply and the stoppable preview.
- The local channel send.
- Primitives: disabled button, icon-button naming, modal focus restore, segmented arrows, error banner.
- Not-found.
- Token parity with the stylesheet and the AA audit.

E2E tests cover:

- Navigation and active state.
- Theme persistence (class and `data-theme`, System following the OS).
- ⌘K focus restore.
- The mobile drawer geometry and focus trap.
- 404s.
- The skip link.
- Axe on 17 routes × 2 themes.
- The overflow matrix: 1440, 1280, 1024, 768 and 390px × dark and light.
- The five AI modes.
- The panel sheet.
- Slash context.
- Reduced motion.
- Home grid/list.
- Share.
- Version history.
- Manuscript layouts.
- Pricing.
- Every screen reachable.
- Visible keyboard focus.
- Storage limits.
- No network writes.

Changed assertions, with their intent kept:

- **Old UI names updated.** Assertions now target the new UI: "Search Atlas" instead of "Search navigation", the drawer width 280 instead of 300, and `/app` landing on `/app/home`.
- **Theme pinning.** Theme tests pin the theme via `localStorage`, because the default is now dark.
- **Replaced features.** Tests of retired Phase 00.5 features now cover their 00.5A equivalents, such as the plain-text marker toolbar becoming the Tiptap editor, and the AI state gallery becoming stop, `?demo=errors` and retry.
- **Nothing removed.** No check was dropped or loosened. Axe and overflow now run on more routes than before.

`playwright.config.ts` accepts an optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, for containers that ship a different Chromium build. CI is unaffected.

## 11. Known differences from the prototype

- **CodeMirror instead of Monaco.** The brief allows an equivalent. CodeMirror is smaller, and its decorations fit the diagnostics, presence and sync range.
- **Illustrated PDF.** The PDF pane is an illustrated sample page 1, not a compiled document. Other pages say so.
- **Responsive thresholds.** These are measured by container queries on the canvas rather than the prototype's fixed breakpoints, so the panel and the collapsed sidebar reflow correctly. Document presence avatars hide below 1500px so the topbar never collides with the composer.
- **Task drag and drop.** HTML5 drag-and-drop works with a pointer. The keyboard equivalent is the Status menu in task detail.
- **Framing.** The Mobile QA view frames live routes, which needed `X-Frame-Options: SAMEORIGIN` plus `frame-ancestors 'self'` instead of `DENY`. Cross-origin framing is still refused.
- **Sample author names.** The handoff's sample names, including the manuscript author list, are fixtures. Emails use `.example` domains.

## 12. Open issues for Phase 00.5B, and Phase 01 boundaries

Phase 00.5B candidates:

- Manual screen-reader passes (VoiceOver and NVDA), and Firefox and WebKit runs. Only Chromium plus axe was run here.
- Suggesting mode in documents is a labeled mode switch. Real tracked-change authoring is not wired.
- Graph pan and zoom, and a keyboard alternative to task drag beyond the status menu.
- Bundle-size review for Tiptap and CodeMirror; both load per route.
- Run the gate on Node 24 to match the repository engine.

Phase 01 boundaries, which are unchanged and must be kept:

- Replace the auth previews with verified sessions. Do not wrap them with a bypass.
- Replace the fixture IDs with server-authorized DTOs validated by Zod.
- Keep the non-leaking 404s.
- Keep browser storage limited to preferences.
- Every Atlas action that writes must be backed by an authenticated, authorized and idempotent service before its "Sample" labels are removed.

## 13. Git and PR status

See the PR description for the final commit hash and PR link. Nothing is merged. The PR targets `master` and is not set to auto-merge.
