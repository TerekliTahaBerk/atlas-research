# Library model

Migration `20261023100000_research_library` (additive). All private tables carry `organization_id, workspace_id, project_id` with composite FKs to `projects(organization_id, workspace_id, id)` and child FKs through `(project_id, id)`, so rows cannot reference another project. Deletes are `RESTRICT`; nothing cascades.

| Table                                         | Purpose                                                                                                                                                                     |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `research_papers`                             | Public bibliographic identity: normalized DOI (unique), title, latest normalized metadata. No user, project, file or note data.                                             |
| `paper_external_identifiers`                  | `(provider, external_id)` unique → paper.                                                                                                                                   |
| `artifacts`                                   | Minimal project-scoped registry (ADR 0009); kind `PAPER`. Every project paper has one stable artifact ID for future typed links.                                            |
| `project_papers`                              | Private association: paper reference **or** private title, saved metadata snapshot, `reading_status`, `archived_at`, `added_by`, `version`. `UNIQUE(project_id, paper_id)`. |
| `paper_collections`, `collection_memberships` | Project collections (active names unique case-insensitively), many-to-many membership in the same project. Archive keeps memberships.                                       |
| `paper_tags`, `project_paper_tags`            | Project tags unique by normalized name (NFKC, collapsed whitespace, lowercase). Re-creating a tag returns the existing one.                                                 |
| `source_versions`                             | Immutable file provenance (see SOURCE_PROVENANCE).                                                                                                                          |
| `upload_intents`                              | 15-minute, actor-bound upload grants.                                                                                                                                       |
| `ingestion_jobs`                              | Transactional scan outbox with leases and retry budget.                                                                                                                     |
| `paper_annotations`                           | Anchored highlights/notes on one source version.                                                                                                                            |
| `research_command_keys`                       | Actor-scoped idempotency records (no runtime access).                                                                                                                       |

## Reading status

One field, `reading_status ∈ {TO_READ, READING, READ, ARCHIVED}`. A check constraint keeps `archived_at` set exactly when the status is `ARCHIVED`. "Remove from library" archives; the default list excludes archived papers; saving the same paper again or choosing another status restores it.

## Permissions (enforced in SQL and services)

| Action                                                                                 | Owner                           | Editor      | Viewer      | Workspace admin without project grant |
| -------------------------------------------------------------------------------------- | ------------------------------- | ----------- | ----------- | ------------------------------------- |
| Search within project, read library/papers/annotations, download READY sources, export | ✓                               | ✓           | ✓           | ✗ (private projects)                  |
| Save/create papers, status, archive, collections, tags, uploads                        | ✓                               | ✓           | ✗           | ✗                                     |
| Create annotations                                                                     | ✓                               | ✓           | ✗           | ✗                                     |
| Edit/delete an annotation                                                              | author only (with write access) | author only | ✗           | ✗                                     |
| Read a PRIVATE annotation                                                              | author only                     | author only | author only | ✗                                     |

Workspace-visible projects grant read (viewer column) to active workspace members, exactly as in Phase 01. Every read re-evaluates `atlas_private.can` in RLS; every write re-checks inside `mutate_research`; removing a membership removes library, file and annotation access on the next request.

## Commands

All writes go through `POST /api/v1/commands` → `atlas_private.mutate` → `mutate_research`: `paper.save`, `paper.create`, `paper.update`, `paper.archive`, `collection.create/update/archive`, `collection.paper.add/remove`, `tag.create`, `paper.tag.add/remove`, `annotation.create/update/delete`. Upload intent/finalize use dedicated endpoints but the same SQL boundary (`upload.create`, `upload.finalize`, not accepted from `/commands`). Optimistic `expectedVersion` applies to papers, collections and annotations; creates take UUID idempotency keys.

## Reads

`GET /api/v1/projects/:id/papers?q&collectionId&tagId&status&sort&cursor` returns `{items, nextCursor, collections, tags}` with 50 items per page. Cursors are HMAC-signed offsets bound to the actor, project and exact filter digest. Search within saved papers matches title, DOI, venue and author names (`ILIKE`, escaped). Sorts: recent, title, year, citations (at save time).
