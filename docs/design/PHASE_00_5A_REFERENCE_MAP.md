# Phase 00.5A — design reference map

This maps each of the 15 screens in the Claude Design handoff (`Atlas.dc.html`, the _Atlas Handoff_ notes and the `chats/` transcript) to the React implementation. The prototype runtime (`<x-dc>`, `support.js`, `_ds_bundle.js`) was used only as a visual and behavioural reference. Nothing from it is imported, copied or executed. The Classical design-system gold accent was not adopted. Atlas keeps its green accent, as the brief requires.

Common to every screen:

- **Shell**: `features/shell/app-shell.tsx`.
  - 216px sidebar. Below 900px it becomes a 280px Radix drawer.
  - 48px topbar.
  - Canvas inset 6px, radius 10.
- **Tokens**: `apps/web/src/styles/globals.css`. The handoff tokens map onto the shadcn semantic names. `[data-theme]` and the `.dark`/`.light` classes are both set by next-themes.
- **Atlas AI**: one `AtlasProvider` state is shared by every placement. Every reply is a prewritten `Sample response`.

Status key:

- **Working**: real local UI behaviour.
- **Preview**: labeled sample or UI-only behaviour that performs no external work.
- **Deferred**: not built in this phase; the screen says so.

| #   | Prototype screen | Route                                                                | Main component(s)                                                                                                                                                                    | Key tokens / dimensions                                                                         |
| --- | ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 1   | `home`           | `/app/home`                                                          | `features/home/home-screen.tsx`                                                                                                                                                      | `--bg`, `--card`, `--bd2`; serif 36px greeting; grid/list `Segmented`                           |
| 2   | `overview`       | `/app/projects/sample/overview`                                      | `features/projects/overview-screen.tsx`                                                                                                                                              | Serif 42px title, timeline card, stat tiles, `SharePopover` 380px                               |
| 3   | `doc`            | `/app/projects/sample/documents?doc=d1…d4`                           | `features/documents/document-screen.tsx`, `editor/doc-editor.tsx`, `editor/nodes.tsx`, `document-rail.tsx`                                                                           | `.atlas-prose` (Lora 16.5/1.75), `--acs` suggestions, `--warns` comments; wide composer reserve |
| 4   | `manuscript`     | `/app/projects/sample/manuscripts`                                   | `features/manuscripts/manuscript-screen.tsx`, `latex-editor.tsx`, `pdf-preview.tsx`                                                                                                  | `--code`, `--syn-*` highlight, `--pdfbg`, `--paper`; 7px splitter; JetBrains Mono 13.5px        |
| 5   | `research`       | `/app/projects/sample/research`                                      | `features/research/research-screen.tsx`                                                                                                                                              | Composer-first layout, mode chips, source pills, comparison table                               |
| 6   | `library`        | `/app/projects/sample/library?paper=`                                | `features/library/library-screen.tsx`                                                                                                                                                | 196px collections rail, 400px detail panel (sheet under 768px)                                  |
| 7   | `reader`         | `/app/projects/sample/reader?paper=`                                 | `features/reader/reader-screen.tsx`                                                                                                                                                  | `.pdf-page` container queries; highlight palette; notes rail                                    |
| 8   | `tasks`          | `/app/projects/sample/tasks?task=`                                   | `features/tasks/tasks-screen.tsx`, `task-icons.tsx`                                                                                                                                  | 268px columns, 420px detail, status icons and priority bars                                     |
| 9   | `channels`       | `/app/projects/sample/channels` (`?demo=empty` for the empty state)  | `features/channels/channels-screen.tsx`                                                                                                                                              | 220px channel rail, 340px thread panel                                                          |
| 10  | `experiments`    | `/app/projects/sample/experiments`                                   | `features/experiments/experiments-screen.tsx`                                                                                                                                        | Notebook cells on `--code`, sweep table, wide composer reserve                                  |
| 11  | `graph`          | `/app/projects/sample/graph`                                         | `features/graph/graph-screen.tsx`                                                                                                                                                    | Kind colours from the handoff, SVG edges, inspector rail                                        |
| 12  | `inbox`          | `/app/inbox` and the sidebar popover                                 | `features/inbox/inbox-screen.tsx`, `inbox-popover.tsx`, `inbox-items.tsx`                                                                                                            | Popover 420px; unread dot `--ac`                                                                |
| 13  | `settings`       | `/app/settings/{profile,appearance,workspace,plan}`                  | `features/settings/settings-screen.tsx`, `overlays/pricing-dialog.tsx`                                                                                                               | Theme cards 186px; pricing 960px                                                                |
| 14  | `system`         | `/app/design-system`                                                 | `features/system/design-system-screen.tsx`, `system/tokens.ts`                                                                                                                       | Token table, contrast audit, component specimens                                                |
| 15  | `mobile`         | `/app/design-system/mobile` (QA view); every route responds at 390px | `features/system/mobile-screens.tsx`                                                                                                                                                 | 390×844 frames scaled 0.78; drawer 280px; bottom-sheet panel                                    |
| —   | Overlays         | Global                                                               | `shell/command-palette.tsx` (580px), `overlays/share-popover.tsx` (380), `overlays/version-history-dialog.tsx` (920×600), `overlays/pricing-dialog.tsx` (960), `inbox-popover` (420) | Radix Dialog/Popover/Menu; `--pop`, `shadow-pop`                                                |
| —   | Auth/onboarding  | `/login`, `/register`, `/reset-password`, `/onboarding?step=`        | `features/onboarding/auth-screen.tsx`, `onboarding-screen.tsx`                                                                                                                       | Editorial left column; seven-step progress                                                      |

## Behaviour, status, limitations and tests per screen

### 1. Home

- **Behaviour**:
  - A greeting.
  - All, Shared with you and Owned by you filters.
  - Sort menu.
  - Grid/list switch: grid shows sections, list shows a single `All resources` table.
  - Continue-working cards.
  - Project, document, manuscript, saved-paper and assigned-task sections.
  - Resource menus.
- **Status**: Working (filters, sort, layout, navigation). Preview (resource menu actions show a toast).
- **Limitations**: Resource counts and dates are fixtures. "New project" goes to onboarding step 5, which creates nothing.
- **Tests**: `phase-00-5a.spec.ts` "home switches between grid and list views"; overflow and axe matrix.
- **Deviations**: none of substance.

### 2. Project overview

- **Behaviour**: timeline, milestones, stat tiles, activity, team, a "What's at risk?" inline Atlas trigger, and the Share popover.
- **Status**: Working (navigation, share UI). Preview (invite, publish, inline AI).
- **Limitations**: Invite drafts never send. Publish is a description only.
- **Tests**: share popover (380px, honest toast, focus restore), the five AI-mode flow, and axe.
- **Deviations**: On phones the title takes a full row, so the avatars never overlap it.

### 3. Documents

- **Behaviour**:
  - A Tiptap v3 editor with custom nodes for citations, task references, person mentions, comment marks, tracked insertions and deletions, presence carets and an Atlas suggestion block (accept/discard).
  - BubbleMenu formatting; `/` block menu, `@` reference menu and a citation picker.
  - Word count.
  - Editing/Suggesting segmented control.
  - Comments and links rail, version history, more menu, share.
  - A mobile format toolbar.
- **Status**: Working (rich editing in memory, menus, suggestions, rail). Preview (Suggesting mode labels and collaborator presence are sample-only).
- **Limitations**: Content resets on reload. There is no autosave, CRDT or real collaborators. `?note=` was replaced by `?doc=`.
- **Tests**: "document edits stay in the tab and reset on reload"; version history (920×600, two-step restore, no replacement); axe in both themes.
- **Deviations**: Presence avatars are hidden below 1500px so the topbar never collides with the composer. Tiptap replaces the prototype's static markup.

### 4. Manuscript (LaTeX)

- **Behaviour**:
  - A file tree with CodeMirror 6, stex highlighting, a diagnostics gutter, a presence caret and a sync range.
  - Editor-only, split and PDF-only layouts via react-resizable-panels.
  - A problems panel.
  - A SyncTeX-style click from preview to source.
  - Zoom and paging; an in-editor neutral composer; the `?demo=errors` failed-log banner.
- **Status**:
  - Working: editing in memory, layouts, splitter, problem navigation, preview-to-source jump.
  - Preview: Compile, Download and Recompile show "not available" toasts. The PDF pane is an illustrated sample page.
- **Limitations**: No TeX engine runs. The PDF is not compiled. Pages after page 1 say so.
- **Tests**: "manuscript layouts switch and compile never pretends to run"; slash-command context (`/latex`); axe. CodeMirror content now has `tabindex=0` for the scrollable-region rule.
- **Deviations**: CodeMirror 6 is used instead of Monaco: it is smaller and its decoration API fits the diagnostics and presence rendering. The brief allows "Monaco or an equivalent".

### 5. Research

- **Behaviour**: question composer, research modes (wrapping), source toggles, a staged sample synthesis with source pills, a comparison table and an evidence list.
- **Status**: Preview. The question runs a labeled sample sequence; no search is executed.
- **Limitations**: The sources are five fixture papers.
- **Tests**: overflow and axe matrix; the no-network assertion in the AI preview test.

### 6. Library

- **Behaviour**: collections rail, filter, reading-status segmented control, paper rows, and a detail panel with Overview, Notes and Citation tabs (BibTeX with a sample note). Atlas actions are labeled "Sample answers".
- **Status**: Working (filtering, selection, tabs, notes in memory). Preview (import PDF/.bib, share paper).
- **Limitations**: No ingestion; the notes are lost on reload.
- **Tests**: "library filter, empty state and paper detail work on sample data"; axe.
- **Deviations**: Below 768px the detail panel is a sheet that sits above the floating composer, since the sheet has its own Ask Atlas.

### 7. Reader

- **Behaviour**: an outline, scaled sample pages, highlight colours, notes and questions, `?cite=1` jump from a citation, and an Explain/Summarize inline Atlas trigger.
- **Status**: Working (navigation, highlights in memory). Preview (AI).
- **Limitations**: This is not a PDF renderer; the pages are authored sample text.
- **Tests**: inline entry point attaches context; axe.

### 8. Tasks

- **Behaviour**: board and list views, HTML5 drag between columns, a detail panel (status menu, priority, assignee, labels, linked items, activity, comments), and an Atlas planning card with a sample plan.
- **Status**: Working (moves and status changes in memory). Preview (filters, sample plan).
- **Limitations**: Changes reset on reload.
- **Tests**: "task moves and channel messages are explicit local demonstrations"; `/create-task` without `/latex` in tasks.
- **Deviations**: A "Sample tasks · changes stay in this tab" label was added. On phones the detail sheet sits above the composer.

### 9. Channels

- **Behaviour**: channel rail, message list with entity cards and reactions, a thread panel, `@Atlas` with a sample reply, and channel drafts kept per channel in memory.
- **Status**: Working (local messages, threads). Preview (`@Atlas` reply, attachments).
- **Limitations**: "Stays in this tab · not delivered". Nothing is sent.
- **Tests**: unit test for a local send; the e2e channel step.

### 10. Experiments

- **Behaviour**: notebook cells with code, prewritten outputs, a sweep table and environment details.
- **Status**: Preview. Run buttons explain that execution is unavailable. No code is ever executed.
- **Tests**: overflow and axe matrix; the "every screen reachable" check.

### 11. Knowledge graph

- **Behaviour**:
  - A typed node graph with kind filters and focus/hover tracing.
  - An inspector with linked items and Open/Explain links.
  - "Atlas noticed" sample suggestions.
- **Status**: Working (filtering, selection, keyboard focus). Preview (suggestions).
- **Tests**: overflow and axe matrix.
- **Deviations**: none. The Graph was not omitted.

### 12. Inbox

- **Behaviour**: the sidebar popover (420px; becomes a link under 900px) and the full page, with unread and all filters, mark-all-read, and item links to their target screens.
- **Status**: Working in memory.
- **Tests**: "workspace and project menus, inbox and plan are transparent previews"; axe.

### 13. Settings

- **Behaviour**:
  - Profile, Appearance (theme cards Dark/Light/System), Workspace and Plan sections.
  - Usage meters.
  - Compare plans opens the pricing dialog.
- **Status**: Working (theme). Preview (profile, workspace, billing: "Checkout isn't connected — no payment was requested").
- **Tests**: "pricing and checkout are illustrative and request no payment"; theme persistence.

### 14. Design system (QA view)

- **Behaviour**: the token table, the contrast audit table (computed in `tokens.ts` and asserted by unit test), and specimens of buttons, chips, AI components and states.
- **Status**: Working (documentation view).
- **Tests**: unit tests "documents %s exactly as the stylesheet defines it" and "meets WCAG AA"; axe.

### 15. Mobile (QA view)

- **Behaviour**: three live iframes of real routes at 390×844, to review the stacked composer, the drawer and the panel sheet.
- **Status**: Working.
- **Limitations**: The view needs `frame-ancestors 'self'`, so `X-Frame-Options` changed from `DENY` to `SAMEORIGIN` (see the report).
- **Tests**: "every screen is reachable"; the 390px overflow matrix.

## Atlas AI mapping

| Handoff mode     | Implementation                                                                                                                                                                                                                     | Test                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Compact          | `AtlasSurface placement="canvas"` at the top centre, ≤620px; stacks under the topbar when the canvas is under 800px (under 1160px with `reserve="wide"`)                                                                           | Mode flow test (`data-mode="compact"`)                        |
| Open             | The same surface expanded (context row, conversation, controls)                                                                                                                                                                    | Mode flow test                                                |
| Focus (⌘/Ctrl+J) | Radix Dialog with `bg-dim` and a 7px backdrop blur; Esc returns to Open                                                                                                                                                            | Mode flow test (blur overlay, focus, shared draft)            |
| Panel (380px)    | Fixed right column; `#main-content` gets `mr-[392px]` so the canvas reflows; bottom sheet under 900px                                                                                                                              | Mode flow test (width 380, reflow) and narrow sheet test      |
| Inline           | `ContextualAITrigger` (overview "What's at risk?"), plus the same `atlas.ask()` entry from reader questions, library actions, task planning, the document bubble menu, channels `@Atlas`, graph "Explain links" and notebook cells | "inline entry points attach context and open Atlas"           |
| Mentions         | `filterMentions` across paper, document, manuscript, task, person, channel, project and experiment, with stable IDs                                                                                                                | Unit tests (keyboard, wrap, IDs) and e2e mobile picker bounds |
| Slash            | `commandsFor(screen)`: /ask /search /summarize /compare /cite /rewrite /latex /create-task, context-sensitive                                                                                                                      | Unit and e2e context tests                                    |
