# Atlas design system V2

Phase 00.5 refines the Phase 00 UI infrastructure. It keeps Radix/shadcn, semantic tokens, the single `cn` utility, and local light/dark/system theme handling. The active [desktop concept](design/phase-00-5-concept.png), [UX blueprint](UX_MASTER_BLUEPRINT.md) and [component inventory](COMPONENT_INVENTORY.md) describe the current design. The original Phase 00 concept remains historical evidence.

## Visual contract

A warm research desk rather than an administrative dashboard. Primary anatomy: 230px neutral sidebar, 60px minimal context bar, 42px desktop content gutters, editorial welcome, sage question composer, reading/continuation surfaces and connected-artifact links. Compact sidebar is 64px. Documents use a centered reading width; task boards use available width; reading/manuscript/notebook layouts have their own rails without duplicating the shell. The original Atlas compass and Lucide 1.5–1.7 stroke icon family remain code-native. No generated screenshot is used as a background or substituted for UI.

## Semantic tokens

Implemented in `apps/web/src/styles/globals.css`. All feature color use resolves to this table; no feature literal colors or remote fonts.

| Token                   | Light             | Dark              |
| ----------------------- | ----------------- | ----------------- |
| background / foreground | #faf9f6 / #242622 | #1b1d1b / #f3f4ef |
| canvas / card           | #fffdf9           | #222522 / #232623 |
| sidebar                 | #f2f1eb           | #20231f           |
| primary / on-primary    | #2b7745 / #ffffff | #98caa2 / #183120 |
| secondary / foreground  | #e5ede0 / #335d3c | #2e3d30 / #c5e0c6 |
| muted / foreground      | #f0efe9 / #60665c | #292d28 / #aeb6a9 |
| accent / foreground     | #e0ebd9 / #284f32 | #2d3c2c / #d3e8cf |
| composer welcome        | #e4ecdf           | #2a3828           |
| border / input          | #e1dfd6 / #c7c9bd | #3a4037 / #68715f |
| focus ring              | #397b4f           | #a5cf9b           |
| destructive             | #a33333           | #ffb2ab           |
| surface hover           | #ecece3           | #343b31           |

AA body contrast is tested with axe, including the composer’s muted labels and inactive tabs. Status uses labels/icons as well as color. Focus is a 2px semantic ring with an offset; Radix controls keep their upstream focus behavior. A generated source without provenance cannot receive a verified status.

## Typography, spacing and motion

`--font-ui` is the local OS sans family (-apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif). `--font-editorial` is Georgia/Times. System fonts avoid install/build network dependencies and font layout shifts. Editorial headings are 30–44px in the app, up to 48px onboarding and 88px public entry; 21–25px serif section/paper headings, 13–16px body/reading text, 11–14px controls and 10–12px metadata. Small state labels are secondary, never the sole action name. Documents use 1.95 line height, body 1.65 and headings around 1.2–1.35.

Spacing is based on 4px with 8/12/16/20/24/28/32/42/48/60/64 for composition. Thin single borders; 5–10px control/panel radius; circles for avatars and compact statuses. One subtle overlay shadow; no gradients, neon or decorative data graphics. Feedback transitions use roughly 160–200ms. Mobile drawer omits the centered dialog’s scale animation so its edge stays anchored. Reduced motion collapses animation and transitions globally.

Breakpoints: 1700 wide, 1280 condensed composition, 1100 narrow desktop, 850 mobile navigation/stacked assistant, 650 compact rails and single columns. Verification targets 1440/1280/1024/768/390. Long strings wrap inside content and truncate only in reference chips with a full accessible title. Code and tables scroll locally. Z ordering: normal canvas, picker 10, compact tooltip 15, upstream modal/popover 50, skip-link 100; no independent competing floating widgets.

## Component and interaction rules

Reuse the existing UI package. Use Button variants, labeled Input/Select, TabsList composition, AvatarFallback, grouped menu/select items, Dialog title and description, Empty/Alert/Skeleton and shared layout classes. Feature primitives add preview disclosure, draft review, native radio view switches, paper cards, reference chips, task states and context-aware pickers. See [inventory](COMPONENT_INVENTORY.md).

Global search is navigation-only. Research/library search explicitly filters fixtures. Every later-phase capability either has a working local UI effect with disclosure or an explanation of unavailability; none reports fabricated success. Workspace/project selectors intentionally contain one sample context, without implying live membership or a tenant creation path.

Only `theme` and `atlas-sidebar-collapsed` persist in localStorage. In-memory notes, messages, prompts, tasks, reading lists and onboarding choices never persist. Browser unload warns on dirty notes; in-app navigation is explicitly described as discarding local drafts. See [interaction specification](INTERACTION_PATTERNS.md) and [visual QA](design/VISUAL_QA.md).
