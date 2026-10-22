# Atlas AI interaction specification · Phase 00.5A

Status: presentation only. No model, search, retrieval, tool or network request is made. The contracts in `apps/web/src/features/atlas-ai/contracts.ts` are UI DTOs, not database entities or access grants.

## One state, five modes

`AtlasProvider` (`atlas-provider.tsx`) owns a single state shared by every placement:

- mode
- input draft
- context chips
- messages
- busy message

Changing mode never resets the conversation or the draft.

| Mode    | Entry                                                | Placement                                                                                                                        | Exit                                                                         |
| ------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Compact | Default                                              | `AtlasAnchor` floats ≤620px at the canvas top centre; stacks under the topbar on narrow canvases                                 | —                                                                            |
| Open    | Focus the composer, or the "Chat · N messages" strip | The same surface expanded: context row, conversation, controls                                                                   | Collapse button, or Escape (animated unless reduced motion)                  |
| Focus   | ⌘/Ctrl+J, the Focus button, or `?atlas=focus`        | Radix Dialog with a `--dim` overlay and 7px backdrop blur, 720px wide                                                            | Escape returns to **Open** (or Compact where there is no anchor); ⌘J toggles |
| Panel   | "Dock to side", or `?atlas=panel`                    | Fixed 380px right column; `#main-content` gets `margin-right: 392px` so content reflows. Under 900px it is a bottom sheet (78vh) | "Close Atlas panel", or "Float" back to Open                                 |
| Inline  | `ContextualAITrigger` and `atlas.ask()` call sites   | Attaches chips, then opens a mode and optionally asks                                                                            | —                                                                            |

Escape is layered in this order:

1. An open mention or slash menu closes first (`menuOpen`).
2. A running preview stops.
3. The mode steps down.

Route changes move the context to the new screen's default chips. An expanded float collapses, and Focus steps back to Open.

The manuscript editor hosts its own neutral composer (`editorComposer`). Hiding it routes Open to Focus.

## Mentions and slash commands

**Mentions.** `@` opens a listbox grouped by kind, with structured IDs:

| Kind       | Examples           |
| ---------- | ------------------ |
| Paper      | `p1…p4`            |
| Document   | `d1`, `d2`         |
| Manuscript | `ms-main`          |
| Task       | `ATL-27`, `ATL-31` |
| Person     | `ayse`, `mehmet`   |
| Channel    | `ch-reading`       |
| Project    | `pr2`              |
| Experiment | `nb-14`            |

Picking an item removes the `@query` text and adds a removable chip `{ id, kind, title }`.

**Slash commands.** `/` lists `commandsFor(screen)`:

- Available everywhere: `/ask`, `/search`, `/summarize`, `/compare`, `/create-task`.
- Context-sensitive:
  - `/cite`: documents, manuscripts, library, reader, research, AI and home.
  - `/rewrite`: documents, manuscripts, reader and AI.
  - `/latex`: manuscripts, documents, experiments and AI.

Picking a command inserts `/<id> `. Commands do not execute anything.

**Keyboard.**

- ↑/↓ move and wrap. `aria-activedescendant` tracks the active option, which is scrolled into view.
- Enter picks the option.
- Escape dismisses the menu and keeps the draft.

When nothing matches, the menu says so explicitly. The document editor has its own block (`/`), reference (`@`) and citation menus over the same fixture data.

## Responses: labeled sample animation (approved deviation)

The handoff shows thinking steps and token streaming. The user chose **labeled sample animations** over a static answer. This deviates from the Phase 00.5 rule "no fake timed research runs". The rule is still met in spirit, because every animated element is visibly marked as a preview of prewritten content:

- **Thinking.** Steps advance on fixed timers (460ms for the first, then 360–640ms). They carry a `Preview` tag, and the collapsed summary reads "Preview sequence · N.Ns".
- **Streaming.** Prewritten text is revealed 6 characters every 30ms.
- **Labels.** Every assistant message shows **"Sample response"** next to its actions. The empty state reads "Answers are prewritten samples".
- **Reduced motion.** Under `prefers-reduced-motion: reduce` the final state renders immediately (duration 0), with no animation.
- **Stop and errors.** Stop cancels the sequence and marks it stopped. `?demo=errors` ends sequences in a labeled sample error with Retry, which shows the safe failure path.
- **No external work.** Nothing reaches the network. E2E tests assert that no `/api` request or non-GET request is made.

`sampleReply()` picks prewritten text from the command, screen and context. It must never be described as generated, searched, personalised or verified.

## Citations and sources

`CitationChip` and `CitePill` show a numbered pill with a `PaperHoverCard` (title, authors, venue). `SourcePill` opens the reader at `?paper=…&cite=1`. All papers are synthetic fixtures, and no citation claims verification.

Message actions:

- **Copy** uses the clipboard.
- **Insert below** and **Accept** in documents change only the in-memory editor.
- **Create task** and similar actions show toasts stating they are UI-only.

## Honesty rules (until real services land)

1. No AI execution. Every preview output is labeled `Sample response` or `Sample`.
2. No artificial success for loading, payment, sharing, invitations, compilation, restore or sign-in. Toasts state what did **not** happen.
3. Code, LaTeX and notebooks never execute.
4. Prompts, drafts, messages and onboarding answers are never written to browser storage. Only `theme` and `atlas-sidebar-collapsed` persist.

## Focus

- Focus mode moves focus to the composer and restores it on close (Radix).
- The panel does not trap focus.
- The command palette restores focus to its invoker, or to the sidebar toggle when the invoker was inside the closed drawer.
- A future streaming transport must add request IDs, real cancellation, bounded retries and usage reconciliation. It must never log prompts or private source text.
