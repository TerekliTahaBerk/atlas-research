# ADR 0017: documents, tasks and typed artifact links

Status: accepted for Phase 04 local implementation; hosted activation remains gated.

## Document version format

Documents store Tiptap/ProseMirror JSON (schema version 1) in immutable `document_versions` rows; `documents.current_version_id/current_revision` is the only mutable pointer and is protected by a composite FK to `(document_id, id, revision)`. The revision number is the optimistic-concurrency token. Restore appends a new revision with `restored_from_revision`; nothing is rewritten or deleted (a trigger rejects UPDATE/DELETE even for the owner role). The content hash is computed in SQL from the canonical `jsonb` text. Revisit with Yjs (Phase 07): CRDT updates would become an input that is periodically checkpointed into the same immutable versions.

## Artifact identity

The Phase 02 `artifacts` registry is extended (`PAPER`, `DOCUMENT`, `TASK`), not replaced. Owner rows carry a constant `artifact_kind` column and a composite FK to `artifacts(project_id, id, kind)`, so an artifact's kind cannot be forged and existing paper artifact IDs are unchanged. Documents/tasks and their artifacts are created in one SQL command transaction.

## Relationship types

`research_artifact_links` stores directed typed edges with both endpoints FK-bound to the same project and a CHECK enforcing the (source kind, relationship, target kind) matrix in [LINK_TYPES](../artifacts/LINK_TYPES.md). `MANUAL` links are user-created; `CONTENT` links mirror the current document revision's references and are re-synchronized on every commit. Links are archived, never deleted, and never confer access. Cross-project linking is impossible at the schema level until a separately reviewed sharing model exists. This supersedes the earlier illustrative relation names in DATABASE.md (`cited_by`, `informs`, …).

## AI action authorization

Model output never writes. A proposal is derived deterministically on the server from the actor's own completed run (which RLS re-checks), shown in full, and applied only through `ai.document-proposal.apply`/`ai.task-proposal.apply` with `approved: true` and the proposal hash. The server re-derives the proposal, compares the hash, and the SQL boundary applies the ordinary capability, schema, reference, assignee and revision checks plus `require_completed_run`.

## Search indexing

PostgreSQL full-text search (`simple` configuration) with generated `tsvector` columns on documents/tasks and an expression GIN index on project papers. Queries are project-filtered SQL under RLS with archived rows excluded; snippets are plain text bounded to 400 characters. Semantic search over documents is deferred: sending unpublished notes to an embedding provider needs separate consent/provider review. Revisit when the Phase 03 evidence model gains a document kind.
