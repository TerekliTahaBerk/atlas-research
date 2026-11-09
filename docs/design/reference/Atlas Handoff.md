# Atlas Research OS — Design handoff

The prototype is `Atlas.dc.html`. It is a single interactive design and every screen in it uses prototype data. No changes were made to `TerekliTahaBerk/atlas-research`. This spec is for implementing the design in Next.js, Tailwind, shadcn/ui and Radix.

## 1. Tokens (CSS variables → `globals.css`, Tailwind `theme.extend.colors`)

| Token | Dark | Light | Use |
|---|---|---|---|
| `--sb` | #181818 | #F2F1EB | Sidebar, app frame |
| `--bg` | #212121 | #FAF9F6 | Main canvas (inset panel, 10px radius, 6px margin) |
| `--card` | #1C1C1C | #F2F1EB | Resource cards (darker than canvas in dark) |
| `--el` | #2A2A2A | #FFFDF9 | Raised controls, segmented tracks, chips |
| `--pop` | #262626 | #FFFFFF | Popovers, menus, modals, AI surface |
| `--hov` | #2F2F2F | #E9E7E0 | Hover and active nav |
| `--bd` / `--bd2` | #363636 / #2C2C2C | #E2E0D8 / #EAE8E1 | Borders, strong and hairline |
| `--tx` / `--tx2` / `--tx3` | #ECECEC / #A3A3A3 / #767676 | #242622 / #696E66 / #8E938B | Text, three levels |
| `--ac` / `--ach` | #6C79E0 / #5A67CF | #5E6AD2 / #4E59BF | Primary actions only |
| `--acs` | green 14% | #E3EFDF | Soft green chips, citations |
| `--actx` | #A9B1F4 | #4450B8 | Green text on soft green |
| `--aiin` / `--aiib` | #24382A / #2F5B3C | #E4EEDF / #BFD8BA | AI composer fill and border |
| `--danger` / `--warn` | #E5685F / #D3A548 | #C24A40 / #A9781E | Destructive, warnings |
| `--dim` | rgba(9,10,9,.58) | rgba(40,40,32,.28) | Modal and AI-focus backdrop |
| `--syn-*` | see source | see source | LaTeX and Python syntax colors |

**Rule:** use green for primary actions, AI affordances, Owner and selected states. Never use it as a large surface.

## 2. Type
- **Serif (Geist, 500):** page titles 30–36, document title 42, sections 22–26, modal hero 38, paper titles 15–19. These sizes come from the Classical design system and give Atlas its editorial identity.
- **Reading (Geist):** 16.5/1.75 in documents, 14–15 in previews and synthesis.
- **UI (Geist):** 13 body, 12.5 controls, 11.5 meta, 11 badges. Weights are 400, 500 and 600 only.
- **Mono (JetBrains Mono):** 13/22 in the editor, 11–12 for IDs and file names.
- Use tabular numbers for counts, prices and table figures.

## 3. Dimensions
- Sidebar 216px. Nav rows 30px, radius 6px, gap 1px, section labels 11.5px in `--tx3`.
- Topbar 48px. Icon buttons 28px. Buttons are 28px tall with 10–12px horizontal padding.
- Inputs are 32px (36–40px on auth). The AI composer is 42px with radius 10.
- Radii: controls 6, inputs 7–8, cards 10–12, popovers 10–12, modals 14–16.
- Spacing scale is 4/8/12/16/24/32/48. Content padding is 32px on Home and 40px on document gutters.
- Widths: share popover 380, inbox popover 420, menus 220–250, version history 920×600, pricing 960, search 580.

## 4. Components (suggested shadcn/Radix mapping)

| Atlas component | Base | Notes |
|---|---|---|
| `AppShell`, `Sidebar`, `NavItem` | custom | Collapsible sections. Becomes a drawer under 900px. |
| `WorkspaceSwitcher`, `ProjectSwitcher` | DropdownMenu | Check mark on the active item |
| `SegmentedControl` | ToggleGroup | Track `--el`, active `--hov` |
| `ResourceCard` (project, doc, manuscript) | custom | Ellipsis opens `ContextMenu` |
| `ContextMenu` / `MoreMenu` | DropdownMenu | Icon + label + optional sub. Destructive item in `--danger`. Word count footer. |
| `SharePopover` | Popover + Tabs | Share/Publish tabs, invite row, members, general-access select, Copy link. The link note restates the current access. |
| `VersionHistoryDialog` | Dialog | Timeline list + diff preview. Restore asks for confirmation in two steps. Empty state included. |
| `PricingDialog` | Dialog + RadioGroup | Monthly/Yearly, plan radio cards, institution row, usage bars. All prices illustrative. |
| `CommandPalette` (⌘K) | `cmdk` | Groups: papers, documents, tasks, actions |
| `AtlasComposer` | custom | Single component, positioned by mode (see §5) |
| `MentionMenu` (`@`), `SlashMenu` (`/`) | Popover anchored to input | Grouped. Enter picks the first match. |
| `ContextChip`, `CitationChip`, `SourcePill` | custom | Chips are removable. Pills are numbered `[n]` and open the paper. |
| `InboxPopover`, `InboxPage` | Popover / page | Tabs, unread dots, empty state |
| `LatexWorkspace` | custom + Monaco | File tree, tabs, problems panel, resizable split (`react-resizable-panels`), PDF pane |
| `PaperRow`, `PaperDetailDrawer` | Sheet (inline) | Overview, Notes and Citation tabs, plus AI actions |
| `TaskBoard`, `TaskCard`, `TaskDetail` | custom | Status icon colors are the only color on the board |
| `ChannelView`, `Message`, `ThreadPanel` | custom | Paper, task and doc reference cards. Atlas messages are tagged "AI". |
| `NotebookCell` | custom | Code, output table, chart, markdown, AI analysis |
| `OnboardingStep`, `OptionCard` | custom | 7 steps with a pill progress bar |

## 5. Atlas AI modes
1. **Compact** – the composer floats top-centre in the active workspace (`top:14px`, width ≤620). A "Chat · n" strip expands it. In manuscripts it is an inline bar over the editor in a neutral tone.
2. **Open (anchored)** – the same surface grows downward. The input stays on top. Context chips and mode buttons sit under it, then the scrollable messages. This mode is non-modal.
3. **Focus** – ⌘J or the maximize button. Centred at 16vh, up to 720px wide. The background dims and blurs. Esc returns to Open.
4. **Panel** – docked on the right at 380px, full height. The main canvas reflows (`margin-right: 392px`) so work continues beside it.
5. **Inline** – entry points in the content itself: the selection toolbar's Ask Atlas, suggestion blocks with Accept/Discard, Fix with Atlas in the problems panel, notebook Explain, and channel `@Atlas`.

Context defaults to the current screen. It can be removed and added to with `@`. Responses show numbered source pills, Copy, an Insert action and Clear chat on the last message, and a "Sample response" label until real responses are wired in.

## 6. Screens

| Screen | Layout | Empty / loading / error |
|---|---|---|
| Home | Title, filter + sort + grid/list, Continue working, Projects, Documents, Manuscripts, Saved papers, Assigned tasks | Dashed create cards |
| Document | Centred 740px article with selection toolbar, suggestion block, slash menu, and a right rail for comments, papers and links | Empty doc shows "Start with" actions |
| Manuscript | Tree 200 / editor / 7px splitter / PDF. Layouts: editor, split, pdf. | Compiling spinner, problems list, PDF dims during compile |
| Research | Composer + modes + source filters, collapsible synthesis, results with compare selection, sticky action bar, comparison table | Skeleton loading state |
| Library | Collections column, filter row, paper list, detail drawer | — |
| PDF Reader | Toolbar, page canvas with selection popover, panel with Notes, Outline and Ask | — |
| Tasks | Board/List, detail panel with AI milestones | Milestone loading state |
| Channels | Channel list, messages, composer with @Atlas, thread panel | "New" divider |
| Experiments | Linked artifacts, cells, outputs, AI analysis | Per-cell running state |
| Inbox | Grouped list + preview. Popover version on the sidebar. | All-caught-up empty state |
| Auth | Sign in, sign up and reset; OAuth (Google, ORCID, SSO); email | Error on the first sign-in attempt; reset confirmation |
| Onboarding | Welcome, role, interests, workspace, project, invite, finish | — |
| Settings | Profile, Appearance, Workspace, Plan | — |

## 7. Responsive
- **Under 1100px:** the manuscript file tree, library collections and thread panel hide.
- **Under 900px:** the sidebar becomes a drawer over a scrim, the manuscript drops to editor-only with a layout switch, and right panels collapse.
- **390px mobile:** stack the panels and keep the composer full-width at the top. Detail panels should open as `Sheet` drawers.

## 8. Motion
- **Menus and popovers:** 140ms ease-out, combining fade, a 4px drop and a 0.985 scale.
- **AI mode changes:** 180ms on position and width.
- **Backdrop:** a fade, with a 7px blur in Focus mode only.
- **Loading:** a single pulsing dot with specific status text. No generic spinners in content.

## 9. Implementation notes
- Theme uses `data-theme` on `<html>` and CSS variables, so `next-themes` works with `attribute="data-theme"`.
- Icons are Lucide (`lucide-react`).
- Keep the AI composer as one component that takes `mode` and `anchorRect` props. Don't build separate chat UIs per mode.
- All AI, search, compile, invite, publish and checkout actions in the prototype are UI-only. Wire them to real endpoints and keep the "sample" labels until they are live.
