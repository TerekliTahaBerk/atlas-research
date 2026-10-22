# Atlas design system · Phase 00.5A

Phase 00.5A implements the Claude Design handoff (`Atlas.dc.html` plus the _Atlas Handoff_ notes) in the existing Next.js, Tailwind v4 and Radix stack. It replaces the Phase 00.5 "V2" visual language. The architecture is unchanged. The screen-by-screen mapping is in [design/PHASE_00_5A_REFERENCE_MAP.md](design/PHASE_00_5A_REFERENCE_MAP.md), and the evidence is in [design/PHASE_00_5A_IMPLEMENTATION_REPORT.md](design/PHASE_00_5A_IMPLEMENTATION_REPORT.md).

## One theme system

The tokens live in `apps/web/src/styles/globals.css`.

- **Dark is the default.** It is defined on `:root`, `[data-theme='dark']` and `.theme-dark`. Light is defined on `[data-theme='light']` and `.theme-light`.
- **next-themes** writes both the `class` and `data-theme` attributes on `<html>`, with `defaultTheme="dark"` and `enableSystem`.
- **Tailwind** `dark:` is a custom variant on `[data-theme='dark']`.
- **shadcn compatibility.** The shadcn semantic variables (`--background`, `--primary`, `--muted-foreground`, `--ring`, …) are aliases of the handoff tokens. `@atlas/ui` components and Atlas features therefore resolve to the same values. There is no second palette.
- **Tailwind names.** `@theme inline` exposes every handoff token as a colour utility (`bg-canvas`, `text-tx3`, `border-bd2`, `bg-acb`, `bg-aiin`, `text-actx`, `bg-code`, `bg-pdfbg`, …).

Persisted in the browser, and nothing else:

- `theme`, written by next-themes.
- `atlas-sidebar-collapsed`.

| Role                  | Token           | Dark                        | Light                       |
| --------------------- | --------------- | --------------------------- | --------------------------- |
| Sidebar               | `--sb`          | #171817                     | #f2f1eb                     |
| Canvas                | `--bg`          | #232423                     | #faf9f6                     |
| Card                  | `--card`        | #1c1d1c                     | #f2f1eb                     |
| Elevated              | `--el`          | #2b2d2b                     | #fffdf9                     |
| Popover               | `--pop`         | #1d1f1d                     | #ffffff                     |
| Hover                 | `--hov`         | #343734                     | #e9e7e0                     |
| Border / hairline     | `--bd/bd2`      | #383b38 / #2e302e           | #e2e0d8 / #eae8e1           |
| Text / 2 / 3          | `--tx/2/3`      | #f1f1ec / #a7aca6 / #9fa59e | #242622 / #5a5f57 / #64695f |
| Accent (non-text)     | `--ac`          | #329a53                     | #399b5a                     |
| Filled button         | `--acb`         | #2b7d46                     | #2d7f48                     |
| Green text            | `--actx`        | #7ccb95                     | #2d7445                     |
| AI input / border     | `--aiin/aiib`   | #24382a / #2f5b3c           | #e4eedf / #bfd8ba           |
| Code / PDF background | `--code/pdfbg`  | #1a1b1a                     | #fffdf9 / #eeece6           |
| Danger / warning      | `--danger/warn` | #ee8178 / #d3a548           | #ae3d36 / #8a600f           |
| Presence              | `--presence`    | #c9a06a                     | #b08550                     |

The syntax colours (`--syn-k/b/e/c/n/m/t`), highlight, selection, dim and shadows follow the handoff exactly.

**The green accent is kept.** The Classical design-system gold was not adopted.

### WCAG AA adjustments

Some handoff values failed AA for small text, so they were darkened or lightened. The full table is in `features/system/tokens.ts`; it is rendered at `/app/design-system` and asserted by a unit test against the stylesheet.

| Token        | Theme | Handoff value | Now     |
| ------------ | ----- | ------------- | ------- |
| `--tx3`      | Dark  | #7a817a       | #9fa59e |
| `--tx2`      | Light | #696e66       | #5a5f57 |
| `--tx3`      | Light | #8e938b       | #64695f |
| `--danger`   | Dark  | #e5685f       | #ee8178 |
| `--danger`   | Light | #c24a40       | #ae3d36 |
| `--warn`     | Light | #a9781e       | #8a600f |
| `--presence` | Light | #9c7442       | #b08550 |

`--acb` is new. White text on the handoff's filled green was only 3.5:1, so filled controls use `--acb`, and `--ac` stays for non-text accents. Axe runs on 17 routes in both themes with no violations.

## Typography

The fonts are self-hosted through Fontsource, so no network request is made at runtime:

| Font                    | Variable       | Use                                     |
| ----------------------- | -------------- | --------------------------------------- |
| Geist Variable          | `--font-sans`  | UI                                      |
| Cormorant Garamond      | `--font-serif` | Display and page titles (30–42px)       |
| Lora Variable           | `--font-read`  | Reading and document body (15.5–16.5px) |
| JetBrains Mono Variable | `--font-mono`  | Code, LaTeX, IDs                        |

Named sizes:

- `text-meta`: 11.5px.
- `text-ctl`: 12.5px, for controls.
- `text-ui`: 13px, for rows.

`cn()` in `@atlas/ui` registers these with tailwind-merge. Without that, `text-ctl` is read as a colour and drops classes such as `text-white`.

## Dimensions (handoff §3)

| Element                     | Size                      |
| --------------------------- | ------------------------- |
| Sidebar                     | 216px                     |
| Mobile drawer (under 900px) | 280px                     |
| Topbar                      | 48px                      |
| Navigation rows             | 30px (36px in the drawer) |
| Icon buttons                | 28px                      |
| Buttons                     | ~28px                     |
| Inputs                      | 32px                      |
| Composer                    | 42px, radius 10           |
| Canvas                      | inset 6px, radius 10      |
| Share popover               | 380px                     |
| Inbox popover               | 420px                     |
| Search palette              | 580px                     |
| Version history             | 920×600                   |
| Pricing                     | 960px                     |
| Atlas panel                 | 380px                     |

The floating composer reflows by container query on the canvas (`container: canvas`):

- **Compact** sits at the top centre, at most 620px wide, between the topbar controls.
- **Stacked** applies when the canvas is under 800px, or under 1160px on screens using `reserve="wide"` (documents, experiments). The composer moves under the topbar and content shifts down by `--aic`.

## Motion and states

The `atlas-*` keyframes (in, fade, expand, collapse, rise, pulse, shimmer, blink, ring) last 120–260ms. Under `prefers-reduced-motion`:

- Animation and transition durations collapse.
- Atlas preview sequences show their final state immediately.

Shared states are in `components/atlas/states.tsx`:

- `EmptyState`.
- `ErrorBanner` (`role="alert"`).
- `SkeletonLines`.

Toasts are a single polite `role="status"` region. Every toast for an unavailable action says what did **not** happen.

## Components

Atlas primitives are in `apps/web/src/components/atlas/`. They are built on Radix through the `radix-ui` package and `class-variance-authority`. See [COMPONENT_INVENTORY.md](COMPONENT_INVENTORY.md).

Focus:

- Focus is visible on every control through a global 2px `--ac` `:focus-visible` outline (offset 1px).
- Radix dialogs trap focus and restore it.
- The sidebar toggle restores focus when the drawer closes.
