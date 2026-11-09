# ADR 0005 — Source-linked writing and lightweight collaboration

Date: 2026-11-09. Status: implemented for Phase 03; verification and release evidence in [handoff](../PHASE_03_HANDOFF.md).

## Editor and content contract

Use MIT-licensed Tiptap 3.33.0 (React/Core/PM/StarterKit/Mathematics) and its compatible KaTeX 0.18.10. npm peer metadata accepts React 19 and KaTeX 0.16/0.17/0.18; latest KaTeX 0.19 was outside that peer range and was not selected. The exact lockfile is authoritative. No paid editor, AI, collaboration or conversion service is used. Next client rendering uses `immediatelyRender:false`; the editor chunk is loaded only on document screens. Official APIs checked: [Next integration](https://tiptap.dev/docs/editor/getting-started/install/nextjs), [StarterKit](https://tiptap.dev/docs/editor/extensions/functionality/starterkit), [Mathematics](https://tiptap.dev/docs/editor/extensions/nodes/mathematics), [KaTeX options](https://katex.org/docs/options.html).

Persist a bounded allowlist of Tiptap JSON nodes, never arbitrary HTML. The server reconstructs allowed attributes and structure, checks every citation belongs to this document/project, and rejects unsupported nodes, invalid links, deep/large trees and overlong math. Supported nodes: paragraph, headings 1–3, text/marks, bullet/ordered lists, blockquote, code block, rule, hard break, inline/block math and the Atlas citation atom. HTTP(S)/mailto links only; no scripts, raw HTML, embeds, image/network rendering or executable code. KaTeX trust is false, macro expansion is capped at 100 and size at 20. Invalid notation stays visible as an error/source expression. This short review is not a malicious-input corpus audit.

## Saving and recovery

A 1.2-second debounce sends an expected revision and stable request UUID. Acknowledgement alone produces Saved. The scoped project write lock plus atomic revision check prevents last-writer-wins; the lock helper now allows editor writers while governance services and RLS still enforce their own roles. The previous helper rejected editor content writes, which the new focused test exposed.

Current document state is durable on every accepted save. Immutable history checkpoints are taken at creation, after at least 60 seconds, on an author change, explicitly by Save checkpoint, and around restore/recovery. Explicit checkpoints preserve both the prior current state and the next revision. Restore creates a new revision; it never mutates an old version. A small hash/revision receipt deduplicates retries without retaining a second full body for every autosave. History is intentionally coarser than keystroke history.

Network errors retain input and the original pending request. Session-scoped recovery is keyed by user + project endpoint + document, expires after 24 hours and is cleared on explicit sign-out. It is a device/tab convenience, not full offline editing or a server backup. Reopening an unsaved draft presents local/server comparison. Both can be downloaded; keeping the reviewed local draft uses the current server revision and checkpoints the overwritten server copy. Drafts from another account are never opened. Access failure unmounts private editor content. Previously viewed/downloaded local copies cannot be recalled by revocation.

## Stable links and citations

Immutable citation UUIDs point to an existing same-project SourceVersion and optional Annotation/page. Quote/locator are copied from the stored annotation, not invented for metadata-only sources. Citation order is presentation only; exported numbering is computed from the current tree. A new PDF never retargets old references. Bibliographic labels resolve authorized current metadata; immutable source-version metadata remains in the source model. Archived/removed targets are labeled. Explicit missing PDF versions show unavailable rather than falling back to the latest file.

Registry endpoints and composite foreign keys keep artifact links in the same project. Links are navigable in both directions for documents, sources, PDF notes, tasks and discussions. Markdown export serializes the allowlisted tree, preserves inline/block LaTeX, renders bibliographic references, and embeds a JSON UUID/locator manifest. It does not include PDF bytes or carry access to another project.

## Tasks, discussion and Inbox

Tasks have four fixed statuses, four priorities, one optional eligible assignee and an optional date. List and board read the same rows; status select is the keyboard alternative and no drag/drop dependency is introduced. Revision conflicts retain the edit form. A fixed SECURITY DEFINER membership trigger clears assignments on project downgrade/revocation and workspace revocation in the same transaction. It neither creates memberships nor grants content access.

Discussions are project topics with plain text messages and explicit artifact cards, not channels/DM. Author/client UUID deduplicates send; changed payload under the same key is rejected. Own edits and owner/admin moderation increment revision and show an edit marker. Reply participants and explicitly selected mentions receive notifications; assignment notifications go to the assigned member (including self-assignment).

Notifications are written atomically with the originating change in the same PostgreSQL transaction. No asynchronous outbox/dispatcher is needed for an in-database side effect; email outbox stays untouched and delivery disabled. The row contains event/recipient/target IDs, no private title or message preview. Inbox checks the recipient and reacquires current project access before resolving a target; revoked targets are redacted, including old read notifications. Only readAt can be changed by a recipient. Normal requests, focus refetch and existing 20-second polling suffice; no Redis, WebSocket or realtime service.

## Limits and later review

Document JSON ≤200,000 text characters/5,000 nodes/depth 25, math ≤2,000 characters; titles ≤300, task/message text ≤20,000. Lists currently show the latest 200 documents/topics, 300 tasks, 100 notifications; a discussion displays its first 500 messages and signals this limit. These bounded beta screens are not unlimited archives. Large-project pagination, receipt/history retention, sustained editing, full XSS/math corpus, permission races and independent DB+PDF restore remain [pre-beta reviews](../BETA_REVIEW_BACKLOG.md). No co-editing, compile/notebook, AI or Phase 04 work is included.
