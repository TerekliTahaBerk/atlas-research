# Artifact registry

`artifacts(id, organization_id, workspace_id, project_id, kind, created_at, deleted_at)` from Phase 02, extended with kinds `DOCUMENT` and `TASK` and a unique `(project_id, id, kind)` key. Each owner table (`project_papers`, `documents`, `tasks`) has a unique `artifact_id`, a constant `artifact_kind` and a composite FK to that key, so the owner's kind cannot disagree with the registry. Documents and tasks create their artifact in the same command transaction; paper artifacts and IDs from Phase 02 are unchanged. RLS: readable with `project.read`; no runtime DML.

Lifecycle: entity archive state lives on the owner row (`archived_at`); the artifact row is retained so history and links keep a stable identity. Hard deletes are restricted. Phase 05 messages and Phase 07 manuscripts/experiments are expected to extend `kind`.
