# Atlas UX master blueprint

Phase 00.5 makes the existing modular monolith a coherent research environment. It adds presentation and in-memory interactions; identity, production data, scholarly search, AI, collaboration, compilation, and execution remain behind their original phase gates. See [Phase 00.5](phases/PHASE_00_5.md) for delivery evidence and limitations.

## Vision and visual identity

A calm research desk, organized around the question rather than administration. Warm ivory canvas, quiet neutral navigation, restrained forest actions, and a sage assistant compose the light theme. Charcoal, mineral neutrals, and pale green compose dark mode. System UI typography keeps controls familiar; Georgia introduces editorial hierarchy at welcome, paper titles, and reading moments. These local fonts require no network or font service. No external visual asset is loaded in the browser.

The generated [concept](design/phase-00-5-concept.png) defines the primary screen: a 230px rail, 60px contextual header, 42px content gutters at desktop, editorial welcome, sage composer, three research shortcuts, two continuation notes, project/task pair, and a connected-artifact footer. The implementation adds required filtering and preview disclosures. Original compass/Lucide iconography replaces the reference product’s identity. See [reference analysis](design/REFERENCE_ANALYSIS.md).

## Information hierarchy and navigation

Organization → Workspace → Project remains the ownership model. A public `sample` context is an interface fixture and never an authorization capability. The centralized navigation model in `features/shell/navigation.ts` drives project routes, sidebar destinations, breadcrumbs, and navigation search. Home and Inbox are workspace entry points. Projects exposes the existing sample project; Research and Library are visibly separated from active-project writing and collaboration tools. They still resolve through a project route so research context is explicit.

Existing `/app` and sample overview routes remain compatible. `/app/home` adds a workspace home; `/app/inbox` adds activity. Future modules extend the existing `[module]` allowlist. Authentication previews occupy their intended route names with conspicuous design-only disclosure. Phase 01 must replace their presentation adapter, never enable a special `sample` bypass.

The desktop sidebar can collapse to a compact icon rail with accessible names and tooltips. Only this preference and appearance are persisted locally. Small screens use the existing focus-trapped Radix dialog. Workspace/project selectors intentionally expose one clearly labeled sample each. An actual no-membership or no-project tenant state must be supplied by Phase 01; this preview cannot infer an actor or create a tenant.

## Module layout conventions

| Surface         | Composition                                                             | Priority                                  |
| --------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| Home / overview | Editorial continuation desk                                             | Return to a note, question, or task       |
| Research        | Question composer, local query/filter row, paper list and detail dialog | Provenance and relevant reading           |
| Library         | Collection rail, reading state/tag filters, grid/list, reader           | Organize and inspect sources              |
| Documents       | Note tree, formatting toolbar, spacious editable plain-text canvas      | Researcher-authored thinking              |
| Tasks           | Board/list, status columns, task detail dialog                          | A concrete next step                      |
| Channels        | Channel rail, discussion, artifact chips, local thread                  | Conversation with research context        |
| Atlas AI        | Centered full assistant experience                                      | Inspect context, answer and source states |
| Manuscripts     | Files, local LaTeX text, static layout illustration                     | Future source/preview relationship        |
| Experiments     | Markdown/code/output cells and environment rail                         | Future reproducibility context            |
| Inbox           | Recipient-style activity list, local unread state                       | Attention with artifact links             |

Writing focus mode removes the note tree and global sidebar while retaining an explicit exit control. Reader zoom reflows authored sample text; it does not load a PDF. On mobile, rails and multi-panel layouts stack rather than create horizontal page scrolling. Tables can scroll within their own container when necessary.

## AI across modules

Atlas AI is one presentation layer, with typed context references rather than hidden ambient access. A compact sage composer can open a nonmodal assistant column. On narrow screens the assistant occupies a bounded, scrollable block above the workspace; it does not cover editing controls. The global trigger derives its context from the current route; explicit paper/document/task/selection actions attach named artifact chips. The full AI route reuses the same experience.

Entering a question displays a labeled prewritten sample answer. Searching/reading/generating are manually selected visual states, not timed simulations. Proposed writes disclose their target and cannot execute. Source states distinguish suggested, generated, unavailable, and verified provenance; a verified status without source ID, location, and evidence is downgraded. No fixture claims verified academic evidence.

Papers can be referenced by notes, notes can support tasks, and discussions can link all three. UI chips navigate to their module, never grant access or promise deep-link retrieval. Future authorized adapters must resolve stable artifact/version identifiers and reject removed or cross-tenant sources. See [AI interaction contract](AI_INTERACTION_SPEC.md).

## Accessibility and responsive behavior

Names, visible focus, input labels, keyboard selection, modal focus restoration, real headings, and non-color status cues are part of the contract. Cmd/Ctrl+K navigates, @ attaches, / selects commands, arrows move picker selection, Enter selects or submits, Shift+Enter creates a composer newline, and Escape dismisses the innermost picker/overlay. No global slash shortcut steals text entry. Motion honors reduced-motion preferences.

Layouts are checked at 1440, 1280, 1024, 768, and 390px in both themes. Automated axe checks complement visual review; they do not claim screen-reader or all-browser certification. Long titles wrap or truncate inside an accessible named reference, never expand the viewport. Details and native controls retain browser keyboard behavior.

## Phase 01 integration contracts

Replace fixture selectors with server-authorized workspace/project DTOs. Render loading, zero-workspace, zero-project, denied, revoked, and retry states using the shared state primitives. Bootstrap personal organization/workspace atomically, then redirect only to an authorized resource. Preserve private-by-default creation, explicit project membership, and permission-safe 404s. Disable or explain actions based on server capabilities, and recheck every request on the server regardless of the button state.

Session verification, authorization, schema migrations, private caching, invitation tokens, and provider calls do not belong in these client components. No UI state or localStorage value can establish identity, membership, role, or tool approval. Later service integration must validate external DTOs with Zod, normalize errors and request IDs, and retain version/conflict recovery. No security/tenant boundary changed in this phase.
