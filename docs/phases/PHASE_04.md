# Phase 04 — Documents and tasks

Status: implemented locally; hosted activation blocked (see [implementation report](PHASE_04_IMPLEMENTATION_REPORT.md))

## 1. Objective

Deliver documents and tasks as the phase outcome. Tiptap documents/research notes, immutable versions, tasks/assignments/board, typed artifact linking and authorized internal search.

## 2. Dependencies

Phase 01 policy; Phase 02 stable source IDs; Phase 03 index contracts when semantic search enabled.

## 3. Exact scope

Tiptap documents/research notes, immutable versions, tasks/assignments/board, typed artifact linking and authorized internal search.

## 4. Out of scope

Yjs advanced simultaneous editing, full manuscript/LaTeX, experiment execution, general project-management automation.

## 5. Detailed implementation tasks

1. Define Tiptap schema and sanitized rendering; implement document create/read/version save with optimistic concurrency and draft recovery.
2. Add source-aware citation inserts with permission checks and immutable source anchors; distinguish quoted evidence from editor text.
3. Implement tasks/states/eligible assignments and keyboard-accessible board/list controls; validate transition/version conflicts server-side.
4. Introduce project Artifact registry and typed relational links with composite scope FKs and allowed endpoint-kind matrix.
5. Implement internal search over authorized artifacts; lexical index first, semantic extension only with Phase 03 permission filters.
6. Handle tombstoned source references, link integrity, export permissions and accessible editor/task error/loading/empty states.

## 6. Proposed files and directories

features/{documents,tasks,artifacts,search}/server; components/editor; app/api/v1/{documents,tasks,links,search}; packages/database migrations.

## 7. Data model changes

Document, DocumentVersion, Task, TaskAssignment, Artifact, ResearchArtifactLink; current pointer/version uniqueness and full-text indexes. CitationReference connects versioned editor content.

## 8. Required APIs

Document/version CRUD; task state/assignment; links create/delete/query; authorized search cursor; export document.

## 9. UI states and workflows

Empty editor/library, unsaved/saving/saved/error, stale version conflict with retained draft, removed assignee, drag/keyboard move, archived linked target, no search hits.

## 10. Security requirements

Rich-text sanitization, link URL safety, source/target read rights, same-project link constraints, no unauthorized search snippets, secure draft retention policy.

## 11. Testing requirements

Editor schema/XSS fixtures; version conflict recovery; assignment revocation; tenant link FK matrix; keyboard board actions; search ACL tests; source citation preservation E2E.

## 12. Acceptance criteria

- [x] Concurrent saves detect conflict without overwriting another version (integration + browser Journey B).
- [x] Only eligible same-project participants can be assigned (integration + Journey D).
- [x] Every link validates endpoint kinds and same-project permissions (SQL CHECK/FK + integration + Journey E).
- [x] Search and snippets exclude revoked/private content (integration search ACL tests).
- [x] Keyboard users can complete document and task workflows (Journey A/D keyboard steps; see report for limits).

## 13. Definition of Done

Each acceptance criterion has recorded evidence; applicable unit/integration/E2E and quality checks pass; migration SQL is reviewed against an identified environment; docs/API/security/ADRs reflect behavior; no unresolved critical defects; actual NOT RUN checks and external blockers are explicit. No later-phase behavior is implied by completion.

## 14. Dependencies on later phases

Phase 05 messages share Artifact IDs; Phase 07 Yjs/manuscripts/experiments extend registry and version retention without breaking links.

## 15. Risks and mitigation

Editor JSON/schema upgrades need versioning/migration. Broad task scope can distract from research; constrain workflow to research assignments.

## 16. Suggested issue breakdown for coding agents

- P04-01: Define Tiptap schema and sanitized rendering Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Establish contracts before dependent UI work.
- P04-02: Add source-aware citation inserts with permission checks and immutable source anchors Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P04-03: Implement tasks/states/eligible assignments and keyboard-accessible board/list controls Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P04-04: Introduce project Artifact registry and typed relational links with composite scope FKs and allowed endpoint-kind matrix. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P04-05: Implement internal search over authorized artifacts Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P04-06: Handle tombstoned source references, link integrity, export permissions and accessible editor/task error/loading/empty states. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
