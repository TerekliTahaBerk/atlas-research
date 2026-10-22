# Phase 01 UI integration handoff

This is an integration boundary document, not implementation of Phase 01. The reviewed UI remains an unauthenticated, synthetic preview. Use [ARCHITECTURE](../ARCHITECTURE.md), [SECURITY](../SECURITY.md), [API_CONTRACTS](../API_CONTRACTS.md), [DATABASE](../DATABASE.md), and the [Phase 01 plan](../phases/PHASE_01.md) as authoritative server contracts. Preserve the approved visual system and the regressions in this phase.

## Identity and route ownership

Replace auth/onboarding presentation adapters with verified server sessions and membership-aware loaders. Never grant a `sample` bypass in protected routes. The current static allowlists and 404 behavior are preview routing constraints, not authorization. Tenant and project IDs from URLs, state, chips, hidden buttons or browser preferences confer no permission.

Server code must verify actor, organization/workspace membership, project grant, resource and capability for every read/write, file request, job and AI tool. Keep tenant composite keys and tenant-scoped queries; recheck at execution/retrieval time. Permission-revoked or unknown resources need safe denied/not-found responses that do not leak titles or snippets. Do not migrate any unknown or production database from this handoff.

## Workspace and project presentation contracts

The UI needs these **presentation projections**, resolved by authorized services and validated with Zod at the external boundary. These descriptions do not add API endpoints or change existing core contracts.

| UI consumer                          | Authorized data required                                                                                       | States / safety                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Workspace selector/sidebar           | Opaque workspace/organization IDs, display names, membership role, permitted projects, navigation capabilities | Loading, no workspace, no project, revoked membership, retry; never infer a tenant from stored preference |
| Project header/breadcrumb/navigation | Project ID/name/visibility and capability set, permitted module summaries                                      | Safe 404/denied, archived/read-only, loading/error; do not expose private counts to unauthorized actors   |
| Home/Inbox/search                    | Authorized artifact references with kind/ID/project, safe title and timestamps; recipient-scoped unread state  | Distinguish no data from no filter match; reauthorize every deep link and search result                   |
| Document/task/channel panels         | Versioned resource DTO, bounded content, authorized linked references, write capabilities                      | Local draft pending/saving/saved only when server-confirmed; conflicts, removed sources, revoked writers  |
| Library/reader/manuscript/notebook   | Rights/provenance-aware metadata and authorized file access                                                    | Later-phase adapters; PDF/compile/execute controls remain unavailable until their own gates               |

Keep organization → workspace → project ownership. Display names are not IDs. Do not re-use fixture models as persistence/domain models.

## Replace fixtures deliberately

`apps/web/src/lib/preview/*` and `PreviewStoreProvider` contain synthetic UI data. Keep them isolated as explicit development fixtures. Introduce authorized loaders/adapters at feature boundaries; domain services own business logic and transactions outside React/handlers. Core and AI contracts must remain independent of database/UI packages.

Do not remove sample labels until the corresponding service and failure paths exist. Migration should proceed feature-by-feature with contract tests, normalized public errors/request IDs, optimistic versions and permission tests. Never turn a timer or optimistic local update into proof that an operation completed. Invitations, checkout, AI research, compilation, execution and uploads are still deferred.

Only `theme` and `atlas-sidebar-collapsed` persist in browser storage. Do not store prompts, research text, notes, messages, onboarding content, credentials or signed URLs there. Add deliberate draft/conflict/navigation recovery before enabling real research editing. Current draft reset is explicitly disclosed.

## Permission-aware behavior and states

Capability-aware buttons explain unavailable actions and preserve keyboard names/focus. Disabled/hidden UI is only presentation; server authorization must independently deny requests. Confirm consequential actions with a specific resource and outcome. Preserve typed input on real failures. Use shared EmptyState, ErrorBanner, SkeletonLines and polite status feedback; never substitute a generic toast for a durable action error.

Required integration states include: unauthenticated, no memberships, empty workspace/project, pending data, no filter match, denied/revoked, archived/read-only, transient retry, validation failure, version conflict and unavailable source. UI labels must distinguish local draft, pending server write, confirmed save and failure. The preview never claims automatic saving.

## Shared ownership and regression contracts

- `components/atlas` owns application buttons, chips, segmented controls and Radix overlays; `packages/ui` owns foundational primitives and class merging.
- `styles/globals.css` and `features/system/tokens.ts` own the shared tokens and contrast evidence. Preserve dark/light parity, 216px sidebar, 48px topbar, 42px composer, 10px canvas and bounded overlays.
- Shell owns navigation/shortcuts/drawer; foreground dialogs own focus. Use the controlled modal focus-restoration behavior for invokers outside Radix Root.
- Document editor owns local selection/picker placement; maintain portaled collision bounds, active descendant and listener cleanup.
- Manuscript observes actual canvas width; preserve usable source minimums and secondary-tree collapse when AI is docked.
- Reader owns the responsive notes sheet; graph owns a scrollable accessible inspector/node representation.
- Keep dynamic editor loading with SSR enabled; avoid loading editor engines into every module again.

Run the full quality gate and the independent reference capture when changing these contracts. Snapshot updates require comparison against the original design; passing a self-baseline alone is insufficient.

## Atlas AI context and effects

`AtlasProvider` is the single presentation state across Compact, Open, Focus, Panel and inline entry points. Screen defaults are replaced on navigation; active document/paper/channel/manuscript references replace ambient context on resource changes. New inline references are passed directly into the sample-response function so the previous closure cannot choose the wrong context. Explicit references must never silently carry to another project.

For real AI, replace sample presentation through an authorized, provider-neutral adapter. Validate actor/workspace/project/resource/version and source locations before retrieval and before displaying results. Chips describe requested context; they do not authorize retrieval. Recheck removed/revoked sources, maintain verified provenance, implement real cancellation/request IDs/usage handling, and keep tool calls as proposals until server capability checks permit their effects. No fixture citation becomes “verified” merely by entering a conversation.

## Readiness

**PASS**: reviewed UI shell and synthetic interaction foundation can guide Phase 01 work without a redesign. **NOT RUN / not delivered**: identity, real tenancy, production CRUD, external research/AI, compile/execute/billing and deployed security. Manual assistive-technology and additional browser/platform checks remain recorded release gates in the [accessibility audit](ACCESSIBILITY_AUDIT.md). Phase 01 requires separate user authorization and its own acceptance tests.
