# Atlas design system

## Visual contract

A quiet research desk: pale sage navigation, near-white canvas, forest-green actions, editorial Georgia headings and compact Arial UI. The generated concept at `docs/design/atlas-concept.png` is a design reference, not production data or a UI background. `design/concept-brief.md` preserves the generation brief. Primary screen anatomy: 244px sidebar, 70px contextual header, 36px content gutters, welcome band, research rows and project detail rail, connected-artifact footer. Mobile uses a focus-trapped Radix navigation dialog; content becomes one column. Public entry extends the same tokens and typography.

## Tokens (implemented in apps/web/src/styles/globals.css)

| Semantic token          | Light             | Dark              |
| ----------------------- | ----------------- | ----------------- |
| background / foreground | #fafbf9 / #202c29 | #131b18 / #edf2ec |
| sidebar                 | #f0f3ef           | #18231c           |
| primary / on-primary    | #245b45 / #ffffff | #9acaaa / #10271b |
| secondary / foreground  | #e6ede7 / #254738 | #283a2e / #d0e6d4 |
| muted / foreground      | #eef1ed / #5b6862 | #202d25 / #a5b5a9 |
| accent / foreground     | #e0e9e0 / #173f2f | #2b4031 / #e3f2e5 |
| border / input          | #d7dfd8 / #c3cfc5 | #35463a / #4c6051 |
| destructive             | #a32e2e           | #ffaaa5           |
| focus ring              | #397b5b           | #a2d2ae           |

Text pairs target WCAG AA (4.5:1 body, 3:1 large text); focus/controls must retain visible contrast. Browser axe checks and manual theme review complement token inspection; they do not replace assistive-technology testing. Error text uses destructive token; shape/icon and wording supplement color. Status is never color alone.

Typography: display clamp 32–53px (public 44–90), section 26, row heading 18, body 14–15, UI 12–14, caption 11–12. Georgia headings 400/500, sans body 400, controls 500/600; body line-height 1.6, heading 1.15–1.3. Local system fonts eliminate build-time font network dependencies. English copy, `lang=en`, logical reading order; future localization extracts strings and uses Intl date/number formatting. UUID routing avoids localized identifiers.

Spacing: 4px base with 4/8/12/16/20/24/32/36/48/64. Radius 4/6/8/12, pill only for status and avatars. Thin borders; one subtle shadow level for overlays. Z layers: canvas 0, popovers/dialogs 50 (upstream primitives), skip-link 100; no arbitrary overlay overrides. Motion 150–200ms feedback, no decorative animation. Reduced motion collapses animation and transitions. Breakpoints: 560 compact, 850 mobile navigation, 1180 condensed desktop, 1500 wide.

## Reusable components

Official shadcn/Radix source lives in `packages/ui/src/components`: Button, Input, Textarea, Select, Dialog, DropdownMenu, Tooltip, Badge, Avatar, Card, Tabs, Skeleton, Empty, Alert, Separator. Accessible composition and upstream keyboard behavior remain intact. `cn` is the single local clsx/tailwind-merge utility. Use semantic variants rather than per-use color overrides. `apps/web/src/components` supplies PageHeader, EmptyState, ErrorState (with retry), LoadingIndicator, Providers and ThemeControl. Feature shell supplies sidebar, breadcrumbs, selectors, search dialog, user menu and responsive composition.

Required states: default/hover/pressed/focus/disabled, loading with status announcement, empty with explanatory copy and navigation, recoverable error with retry, not-found with return path. Inputs need labels, invalid state and description when used in real forms. Dialog needs title/description, focus trap, Escape close and focus restoration. Dropdown options use groups; select items use SelectGroup. Avatars have fallback. Tabs use TabsList. Decorative icons are aria-hidden and Lucide stroke style remains consistent.

Theme preference uses next-themes (light/dark/system), persisted locally; system reacts to OS media changes. No user account is implied. Search filters navigation only (Cmd/Ctrl+K), not research contents. Workspace/project selectors contain a single labelled sample each, avoiding fake creation or persistence. Footer explicitly states no research data is stored.
