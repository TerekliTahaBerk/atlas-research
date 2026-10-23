# Document versioning

- `documents` holds identity, title, kind, archive state, metadata `version` (rename/archive token) and the current pointer (`current_version_id`, `current_revision`).
- `document_versions` rows are immutable (trigger), unique per `(document_id, revision)` and per `(document_id, client_request_id)`, and record author, JSON, SQL-computed SHA-256 `content_hash`, `schema_version`, `source` (`CREATE`, `EDITOR`, `RESTORE`, `DUPLICATE`, `AI_PROPOSAL`), optional `change_summary`, `restored_from_revision`, `ai_run_id`, the resolved `reference_artifact_ids` and `mentioned_profile_ids`.
- `document.save` locks the document row, replays an existing `clientRequestId` (same hash → original revision; different hash → `CONFLICT`), rejects a stale `expectedRevision` with `CONFLICT`, no-ops identical content, otherwise commits revision N+1 and moves the pointer in the same transaction.
- `document.restore-version` copies an old revision into a new one; history is never rewritten. Restored references keep their identity and are re-authorized when rendered.
- History reads (`GET documents/:id/versions`, `…/versions/:revision`) re-check access now; archived documents expose no versions through RLS.
- Comparison is a block-level LCS diff (`diffBlocks`) between a revision and the current revision, shown in the version modal.

Retention: versions are kept indefinitely in Phase 04; purge/retention policy is a later reviewed workflow.
