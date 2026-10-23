# Source provenance

Atlas keeps three things distinct:

| Record                     | Where                                                           | Meaning                                                                                                                     |
| -------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Search result              | `NormalizedPaper` in a response                                 | What a provider returned at `retrievedAt`. Not stored.                                                                      |
| Saved bibliographic record | `project_papers.metadata` snapshot (+ shared `research_papers`) | The server-fetched provider metadata at save time, with `provenance[]` (provider, external ID, retrieval time, source URL). |
| Imported file              | `source_versions`                                               | One immutable captured file with rights and integrity data.                                                                 |

A provider abstract is provider metadata, not verified full text. An external open-access PDF URL is a link, never a stored file; Atlas does not fetch it. Open-access metadata does not authorize storing or redistributing a PDF.

## Source version fields

`ordinal` (per paper), `source_type` (`UPLOAD`), `rights_basis` (`USER_UPLOAD` — supplied by a project member), `file_name`, `media_type`, declared size/SHA-256, measured `byte_size`/`sha256`, `quarantine_key`, accepted `object_key`, lifecycle `state`, `failure`, `scanned_by`, `scan_completed_at`, `ready_at`, `created_by_id`, `created_at`.

A trigger rejects changes to identity, declared or measured content, keys and terminal states, and rejects deletes. A new file is always a new version. Annotations and (in Phase 03) citations reference the version ID, so their evidence cannot drift.

## Phase 03 compatibility

`ingestion_jobs` is the transactional outbox (`kind` currently `SCAN`). Extraction can add kinds such as `EXTRACT` and a `source_chunks` table keyed by `(source_version_id, page, offsets)`, re-authorizing at execution time. The reader's anchors already use page-scoped text offsets, the same coordinate system extracted chunks need for grounded citations. No extraction, embeddings or RAG exist in Phase 02.
