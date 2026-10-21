# Shared interaction patterns

Phase 00.5 provides local UI behavior only. A real service integration must add server validation, actor/tenant/resource authorization, optimistic versions and normalized failures without changing these user-facing conventions.

| Pattern           | Implemented convention                                                     | Integration requirement                                                      |
| ----------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Navigation        | Central model, explicit active item, Cmd/Ctrl+K navigation search          | Filter authorized destinations and artifacts server-side                     |
| Sidebar           | Expanded/compact preference; mobile Radix dialog                           | Preference never selects tenant or establishes identity                      |
| Theme             | Light/dark/system through existing next-themes                             | Theme remains non-sensitive and local                                        |
| Creation          | Named Radix dialog, required bounded name, review draft, no fake success   | Create only after server capability check; retain input on failure           |
| Editing           | In-memory plain-text drafts; dirty warning and browser unload warning      | Versioned save, conflict recovery and deliberate navigation recovery         |
| Destruction       | No destructive write enabled in preview                                    | Specific target, consequence and recoverability in confirmation              |
| Search            | Explicit local fixture filter or navigation filter, clear no-results state | Provider/permission-aware query, bounded pagination, no private global cache |
| Filters/sort      | Native labeled selects and local query; clear-reset action                 | Validated allowlist and cursor reset                                         |
| View switches     | Keyboard-accessible native radio choices                                   | Keep content selection independent of layout                                 |
| Modals            | Named Radix Dialog, description, close button, Escape, focus return        | Avoid nesting independent destructive confirmations                          |
| Panels            | Nonmodal AI column, inline thread, stacked mobile rails                    | Preserve editing access and visible context                                  |
| Mentions/commands | Shared labeled combobox/listbox, active descendant, arrows/Enter/Escape    | Adapter supports rich-editor cursor and authorized entity search             |
| Source chips      | Icon, full title, truncation, named removal                                | IDs and title do not confer access                                           |
| Status            | Text and icon, not color alone                                             | Show authoritative service state, no guessed completion                      |
| Loading           | Shared status and skeleton primitives                                      | Label pending operation and bounded retry/cancel                             |
| Empty             | Shared EmptyState, explanatory text and real recovery action               | Differentiate no data, no filter match and denied access                     |
| Error             | Shared Alert/ErrorState, retry callback; example AI error is labeled       | Public-safe code/request ID; no raw provider/database detail                 |
| Feedback          | Inline status at the action location                                       | Toasts are optional; never substitute for essential durable error text       |
| Pagination        | Three-page reader navigation; filtered finite fixture lists                | Cursor pagination and membership check on every page                         |
| Context menus     | Existing Radix account and theme menus                                     | Respect actor capabilities and preserve keyboard behavior                    |

Keyboard: Cmd/Ctrl+K toggles navigation search. Enter submits composer unless a picker consumes it; Shift+Enter adds a newline. @ and / activate only in supported text inputs. Escape closes the innermost picker before a dialog or assistant. Native inputs keep standard editing shortcuts. Document selection exposes a context action that names the selected text; formatting inserts plain-text Markdown markers and does not claim a rich-text engine.

Local drafts reset when their screen unmounts. Document switching preserves local notes during one mounted visit. Browser refresh/close prompts on a dirty document; in-app navigation is not intercepted and the visible warning explains draft loss. Future persisted editing must provide explicit unsaved navigation recovery before enabling production data. The preview stores no drafts, messages, reading lists, prompts, or onboarding choices in browser storage.

Responsive rules: desktop content reserves sidebar and AI column space; below 850px navigation is a 300px maximum drawer. At 650px rails and columns stack. Mobile AI is a bounded block above content, not an overlay over writing. Dialogs are viewport-bounded, reader internals reflow, and long code/table content scrolls within its region. Reduced motion disables nonessential animation. Focus indicators and disabled/pressed states come from semantic tokens and shared primitives.
