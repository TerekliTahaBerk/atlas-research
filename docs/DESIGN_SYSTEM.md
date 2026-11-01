# Atlas design system

The current visual language comes from the second Claude Design handoff (`Atlas.dc.html` plus the _Atlas Handoff_ notes): neutral greys, an indigo accent and Geist throughout. It replaces the Phase 00.5A green/Cormorant palette; layout, dimensions, components, AI modes and motion are unchanged. Where the handoff notes and the prototype disagree, the prototype's CSS variables win; the conflicts and how each was resolved are in [ADR 0018](decisions/0018-neutral-indigo-design-system.md). The original 00.5A mapping and evidence remain in [design/PHASE_00_5A_REFERENCE_MAP.md](design/PHASE_00_5A_REFERENCE_MAP.md) and [design/PHASE_00_5A_IMPLEMENTATION_REPORT.md](design/PHASE_00_5A_IMPLEMENTATION_REPORT.md).

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

| Role                  | Token           | Dark              | Light             |
| --------------------- | --------------- | ----------------- | ----------------- |
| Sidebar               | `--sb`          | #181818           | #f7f7f5           |
| Canvas                | `--bg`          | #212121           | #ffffff           |
| Card                  | `--card`        | #1c1c1c           | #f7f7f5           |
| Elevated              | `--el`          | #2a2a2a           | #ffffff           |
| Popover               | `--pop`         | #262626           | #ffffff           |
| Hover                 | `--hov`         | #2f2f2f           | #efefed           |
| Border / hairline     | `--bd/bd2`      | #363636 / #2c2c2c | #e6e6e3 / #efefec |
| Text / 2              | `--tx/2`        | #ececec / #a3a3a3 | #1f1f1e / #5f5f5f |
| Text 3                | `--tx3`         | #969696           | #6c6c6c           |
| Accent (non-text)     | `--ac`          | #6c79e0           | #5e6ad2           |
| Filled button         | `--acb`         | #5a67cf           | #5e6ad2           |
| Accent text           | `--actx`        | #a9b1f4           | #4450b8           |
| AI input / border     | `--aiin/aiib`   | #2a2a2a / #3a3a3a | #f4f4f2 / #e3e3e0 |
| Code / PDF background | `--code/pdfbg`  | #1b1b1b           | #ffffff / #f0f0ee |
| Danger / warning      | `--danger/warn` | #e7746c / #d3a548 | #b8463d / #8e6519 |
| Presence              | `--presence`    | #c9a06a           | #b08550           |

The syntax colours (`--syn-k/b/e/c/n/m/t`), highlight, selection, dim and shadows follow the prototype, except `--syn-c` (below).

**Indigo is a signal, not a surface.** Use it for primary actions, AI affordances, Owner and selected states. The handoff notes still say "green" in places; read that as the accent.

### WCAG AA adjustments

Some prototype values failed AA for small text, so they were darkened or lightened by the smallest step that passes. The full table is in `features/system/tokens.ts`; it is rendered at `/app/design-system` and asserted by a unit test against the stylesheet.

| Token      | Theme | Prototype value   | Now               |
| ---------- | ----- | ----------------- | ----------------- |
| `--tx3`    | Dark  | #858585           | #969696           |
| `--danger` | Dark  | #e5685f           | #e7746c           |
| `--tx3`    | Light | #737373           | #6c6c6c           |
| `--danger` | Light | #c24a40           | #b8463d           |
| `--warn`   | Light | #a9781e           | #8e6519           |
| `--syn-c`  | Both  | #6b6b6b / #9a9a9a | #838383 / #767676 |

`--acb` is kept separate from `--ac`: white text on the dark-theme indigo `#6c79e0` is 3.9:1, so filled controls use `#5a67cf` (the prototype's hover indigo). In light, the prototype indigo already passes and both tokens share it.

## Typography

The fonts are self-hosted through Fontsource, so no network request is made at runtime:

| Font                    | Variable       | Use                                                   |
| ----------------------- | -------------- | ----------------------------------------------------- |
| Geist Variable          | `--font-sans`  | UI                                                    |
| Geist Variable          | `--font-serif` | Display and page titles: weight 600, −0.02em tracking |
| Geist Variable          | `--font-read`  | Reading and document body (14.5–16.5px)               |
| Lora Variable           | `--font-pdf`   | Rendered PDF pages only (`.pdf-page`)                 |
| JetBrains Mono Variable | `--font-mono`  | Code, LaTeX, IDs                                      |

`font-serif` and `font-read` are kept as semantic roles so titles and reading text can diverge from the UI face again without touching components.

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
