# Component inventory · Phase 00.5A

Atlas primitives live in `apps/web/src/components/atlas/`. Features live in `apps/web/src/features/<area>/`. Sample fixtures live in `apps/web/src/lib/preview/` and do not depend on Prisma or the core domain. `@atlas/ui` keeps its existing shadcn components. `cn()` there now registers Atlas's named text sizes with tailwind-merge.

## Primitives (`components/atlas`)

| Component                                                                                                            | Notes                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `Btn`, `btnVariants`                                                                                                 | Variants primary, secondary, outline, ghost, ai, aiGhost, subtle, danger, inverse; sizes xs–cta; `asChild` |
| `IconBtn`                                                                                                            | `label` is required; it becomes both the accessible name and the tooltip                                   |
| `Segmented`                                                                                                          | Radio group with roving arrow keys; track, plain and solid variants; icon-only options take `ariaLabel`    |
| `RefChip`, `InlineRef`, `CountBadge`, `UnreadBadge`, `Kbd`, `SampleTag`, `StatusTag`, `Dot`, `Avatar`, `AvatarStack` | Chips and labels. `SampleTag` marks preview content. `Avatar` is `role="img"`.                             |
| `Menu*`, `MenuItem`, `MenuRadioItem`, `Popover*`, `HoverCard*`, `Modal*`                                             | Radix wrappers with the Atlas pop surface; `ModalContent` takes `blur` and `position`                      |
| `ToastProvider` / `useToast`                                                                                         | A single polite `role="status"` region                                                                     |
| `EmptyState`, `ErrorBanner`, `SkeletonLines`                                                                         | Shared states                                                                                              |

## Shell (`features/shell`)

| Component / module                 | Responsibility                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `AppShell`                         | Providers, fixed layout, desktop `Sidebar` aside, Radix drawer under 900px, `#main-content` canvas, global keys (⌘K, ⌘\\, ?) |
| `Sidebar`                          | Workspace and New menus, Search, Home, Inbox popover, sections, project menu, Upgrade, theme menu                            |
| `Topbar`, `SidebarToggle`, `Crumb` | 48px contextual header                                                                                                       |
| `ShellProvider` / `useShell`       | Narrow, collapsed (persisted), drawer, search, pricing and shortcuts state                                                   |
| `PreviewStoreProvider`             | In-memory saved papers, task moves, read state, channel drafts and doc citations (never persisted)                           |
| `CommandPalette`                   | ⌘K "Search Atlas" combobox over pages and sample items; hands off to Atlas                                                   |
| `ShortcutsDialog`, `ThemeMenu`     | "?" help; Dark/Light/System, gated on hydration                                                                              |
| `navigation.ts`                    | The single allowlist for modules, destinations and screen keys                                                               |
| `useMediaQuery`, `useHydrated`     | SSR-safe client state                                                                                                        |

## Atlas AI (`features/atlas-ai`)

| Handoff component     | Implementation                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `AtlasComposer`       | `atlas-composer.tsx`: combobox "Ask Atlas", mention and slash listboxes, send/stop              |
| `AtlasAIPanel`        | `AtlasSurface` with `placement="panel"`; `AtlasLayer` positions the panel and focus dialog      |
| `AtlasAIMessage`      | `atlas-message.tsx`: user and assistant messages, preview steps, actions, "Sample response"     |
| `AtlasAIContext`      | `AtlasProvider` / `useAtlas`: the single state shared by all modes                              |
| `ContextChip`         | `RefChip` in the context row, with "Remove …" buttons                                           |
| `CitationChip`        | `citations.tsx`: `CitationChip`, `CitePill`, `PaperHoverCard`                                   |
| `SourcePill`          | `citations.tsx`: opens the reader at the cited paper                                            |
| `MentionMenu`         | The composer listbox over `filterMentions`; the editor uses the same item data                  |
| `SlashMenu`           | The composer listbox over `commandsFor(screen)`; the editor has its own block menu              |
| `ContextualAITrigger` | `atlas-surface.tsx`: button that calls `atlas.ask({ prompt, chips, mode })`                     |
| `AIStatusIndicator`   | `atlas-surface.tsx`: pulsing dot plus specific status text                                      |
| `AISuggestionBlock`   | `documents/editor/nodes.tsx`: the `AISuggestion` Tiptap node with Accept, Discard and Try again |

## Screens

`home`, `projects` (overview, workspace projects), `documents` (Tiptap editor, nodes, rail), `manuscripts` (CodeMirror editor, PDF preview), `research`, `library`, `reader`, `tasks`, `channels`, `experiments`, `graph`, `inbox`, `settings`, `system` (design system, tokens, mobile frames), `onboarding` (auth, onboarding) and `overlays` (share, version history, pricing, resource menus).

The per-screen detail is in the [reference map](design/PHASE_00_5A_REFERENCE_MAP.md).

## Boundaries

- No feature imports the database, server environment or provider packages.
- Presentation IDs (`p1`, `d1`, `ATL-27`, …) are not production identifiers. A Phase 01+ adapter must validate DTOs with Zod and authorize them on the server.
- Tiptap and CodeMirror content is in memory only.
