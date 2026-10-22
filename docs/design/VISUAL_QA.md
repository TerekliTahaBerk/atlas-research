# Phase 00.5 visual QA

> Superseded for the current UI by [PHASE_00_5A_IMPLEMENTATION_REPORT.md](PHASE_00_5A_IMPLEMENTATION_REPORT.md). The Phase 00.5 screenshots below are kept as historical evidence; the 00.5A set is in `qa/00-5a/`.

Date: 2026-10-22 (Europe/Istanbul). Application tested locally from the optimized Next.js production output; no deployment is claimed. Browser plugin/skill was not available, so the repository’s Playwright Chromium was used. Sandbox process/port restrictions required the elevated local tool path for browser/server processes and a supported Webpack production-build fallback.

## Automated evidence

- `pnpm test:e2e`: **58 PASS**. Original 16 browser tests remain unchanged; 42 new tests cover the UI foundation.
- `pnpm test`: **24 PASS**. Original 16 unit/component tests retained; eight new interaction/provenance tests.
- Layout matrix: **1440, 1280, 1024, 768, 390px**, both **light and dark**, 1000px test height. Twelve route surfaces at each combination: Home, Inbox, Research, Library, Documents, Tasks, Channels, AI, Manuscripts, Experiments, Sign in, Onboarding. Document root scroll width is asserted against viewport width on every route.
- Axe WCAG 2 A/AA and 2.1 AA: overview plus Research, Library, Documents, Tasks, Channels, AI, Manuscripts, Experiments, Inbox, Sign in, Onboarding in both themes. No violations in the checked states. This is not a screen-reader or all-browser certification.
- Additional paths: system theme follows OS and persists; compact sidebar persists; search keyboard and focus restore; mobile drawer position/focus/link/search closure; no-resource 404s; reference/command keyboard behavior; source expansion; cancel/error/retry/proposal states; local editor formatting and draft reset; focus mode; comparison/reader controls; task status/reset; channel message/thread; creation focus restoration; optional onboarding and no authentication POST.
- Mobile assistant with long titles stays within page bounds. Escape dismisses its picker before closing the panel. Mobile picker bounds and the offscreen keyboard-selected option are explicitly asserted.
- Screenshot capture listens for page errors and console errors. No errors or horizontal overflow were reported in the captured production views. Capture waits for load/network idle before screenshots, avoiding pre-hydration screenshot DOM mutation.

## Screenshots retained for review

Paths are relative to this document. Screenshots are actual browser output, not generated concepts. The full-page height may exceed the viewport; fixed dialogs and the assistant still occupy only their viewport region and scroll internally.

| Screenshot                                                | Viewport / theme | Inspected focus                                            |
| --------------------------------------------------------- | ---------------- | ---------------------------------------------------------- |
| [Home](qa/home-light-1440.png)                            | 1440×1000, light | Concept composition, typography, cards and gutters         |
| [Home dark](qa/home-dark-1440.png)                        | 1440×1000, dark  | Intentional charcoal surfaces, readable actions/metadata   |
| [Home mobile](qa/home-light-390.png)                      | 390×844, light   | Stacking, long-page reading, toolbar wrapping              |
| [Research](qa/research-light-1440.png)                    | 1440×1000, light | Query, local filters, academic paper anatomy               |
| [Library](qa/library-dark-1440.png)                       | 1440×1000, dark  | Collection rail, tabs and source metadata                  |
| [Documents](qa/documents-light-1440.png)                  | 1440×1000, light | Tree, toolbar, title and writing measure                   |
| [Focus mode](qa/document-focus-light-1280.png)            | 1280×1000, light | Distraction-free centered writing and exit control         |
| [Expanded AI](qa/ai-expanded-light-1440.png)              | 1440×1000, light | Reserved context column, sample answer, source disclosure  |
| [Mention picker](qa/ai-picker-dark-390.png)               | 390×844, dark    | Menu stays within viewport, composer remains visible       |
| [Tasks](qa/tasks-dark-1024.png)                           | 1024×1000, dark  | Three columns, text/icon statuses and task density         |
| [Channels](qa/channels-light-768.png)                     | 768×1000, light  | Research references, readable conversation, local composer |
| [Manuscripts](qa/manuscripts-dark-1440.png)               | 1440×1000, dark  | Files/source/static page; unavailable compiler disclosure  |
| [Experiments](qa/experiments-light-1280.png)              | 1280×1000, light | Inert code/output and environment context                  |
| [Onboarding choices](qa/onboarding-choices-light-390.png) | 390×844, light   | Selected radio card, progress and optional flow            |
| [Sign in](qa/login-dark-390.png)                          | 390×844, dark    | Labeled fields, password control and preview disclosure    |
| [Mobile drawer](qa/mobile-drawer-light-390.png)           | 390×844, light   | Anchored drawer, long navigation scroll and close          |
| [Reader](qa/reader-light-1280.png)                        | 1280×1000, light | Outline/page/context and bounded modal                     |
| [Search](qa/search-dark-1280.png)                         | 1280×1000, dark  | Navigation-only dialog, labels and focus hierarchy         |
| [Slash commands](qa/slash-light-1440.png)                 | 1440×1000, light | Contextual command list and explicit preview               |
| [Library empty](qa/library-empty-light-390.png)           | 390×844, light   | Filter-empty explanation and reset                         |
| [Channel thread](qa/channel-thread-light-1440.png)        | 1440×1000, light | Conversation/thread split and local reply                  |
| [Creation](qa/creation-light-390.png)                     | 390×844, light   | Compact named dialog and bounded form                      |

## Concept comparison

The [ImageGen concept](phase-00-5-concept.png) and latest [rendered Home](qa/home-light-1440.png) were both inspected with `view_image`, at native 1440-style desktop proportions. Compared directly: (1) neutral left rail and separated navigation groups; (2) minimal contextual topbar; (3) editorial welcome and subtitle; (4) sage composer and restrained research shortcuts; (5) two continuation note cards; (6) project/task pair; (7) connected-artifact footer; (8) warm canvas/borders, restrained radius and icon stroke.

The implementation faithfully preserves the concept’s hierarchy, palette, component family and section order, with documented functional refinements rather than a pixel-copy claim. Above-the-fold copy check: welcome heading/subtitle, composer heading/placeholder and three quick actions retained. “New” becomes the more concrete “New document”; “Interactive preview” becomes “Grounded · preview” with mode selection; fictional project counts/people and a real-paper-looking task title were replaced with explicit synthetic metadata. The original compass differs intentionally from the generated asterisk/reference branding. The narrower 230px sidebar and 42px gutters fit actual browser controls. No material unresolved design mismatch was found in the inspected screens after repairs.

## Defects repaired

1. Composer metadata in light mode initially had 4.46:1 contrast on sage. Darkened the shared muted token; axe now passes.
2. Inactive research tabs inherited foreground opacity with insufficient contrast. Replaced it with semantic muted foreground in the shared Tabs primitive; both themes pass.
3. Mobile drawer inherited centered-dialog zoom and momentarily shifted off the left edge. Removed that animation and anchored transform/translation; original geometry/focus test passes.
4. Shared empty-state titles were plain divs. Added heading semantics; filtered-empty recovery is discoverable by heading.
5. Full AI page plus roaming panel could share control/source IDs. Added instance-specific IDs.
6. Compact navigation needed explicit accessible names and an intact avatar. Added names/tooltips and corrected the compact avatar selector.
7. Manual screenshot inspection found a mobile mention menu clipped above the viewport despite page-overflow checks passing. The picker now measures available space, chooses above/below, constrains height and scrolls the active option into view. A dedicated bounds/keyboard regression passes; the replacement screenshot was inspected.

## Remaining limits

Only Chromium is exercised. No real mobile keyboard/device, screen reader, real PDF, provider failure, tenant membership, network stream, compiler or notebook runtime is available in this phase. The plain-text editor has local warnings and an unload guard but no rich-text/CRDT or persisted navigation recovery. The default `pnpm build` Turbopack CSS worker is environment-blocked (`EPERM`); `pnpm build --webpack` passes and produces the tested optimized output. No database migration or deployment occurred.
