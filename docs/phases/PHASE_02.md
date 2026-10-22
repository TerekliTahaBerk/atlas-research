# Phase 02 — Research discovery and library

Status: implemented on the Phase 02 branch with disposable-environment evidence. **Not complete:** live provider access from the development session, hosted migration/Storage activation and a production malware scanner are external gates. See the [implementation report](PHASE_02_IMPLEMENTATION_REPORT.md).

## 1. Objective

Deliver research discovery and library as the phase outcome. Academic search adapters, normalized metadata, project paper associations, collections, lawful PDF storage/reader, annotations and citation source records.

## 2. Dependencies

Phase 01 identity/tenant/RLS gates; lawful OpenAlex/Semantic Scholar access; private Atlas Storage bucket.

## 3. Exact scope

Academic search adapters, normalized metadata, project paper associations, collections, lawful PDF storage/reader, annotations and citation source records.

## 4. Out of scope

Grounded AI generation, broad web scraping, editor/task workflows, publisher paywall bypass, collaborative PDF editing.

## 5. Detailed implementation tasks

1. Define typed discovery adapters with provider output Zod validation, timeouts, pagination, quotas, attribution and availability states.
2. Implement normalized DOI/provider dedup and transactional idempotent project save; preserve metadata/license provenance and uncertain-match review.
3. Add private quarantine upload/finalization, object checksums, scan state, file size/signature controls and authorized short-lived signing.
4. Integrate PDF.js reader with page loading, missing/unsupported/error recovery; never enable PDF redistribution from metadata rights alone.
5. Implement project collections and annotation anchors against immutable source versions; preserve quote/page/offset and deleted-source behavior.
6. Add sandboxed asynchronous parsing contract/outbox when processing begins, public metadata cache boundaries and authorized source citation export.

## 6. Implemented files and directories

`apps/web/src/features/discovery/server` (adapters, HTTP boundary, orchestration, quotas), `apps/web/src/features/library/server` (library, sources/uploads/scanner, Storage, routes), live screens `features/research/live-research.tsx`, `features/library/live-library.tsx`, `features/reader/{live-reader.tsx,anchors.ts,pdf-engine.ts}`, contracts `packages/core/src/{research,citation}.ts`, `ResearchReference` in `packages/ai`, migration `packages/database/prisma/migrations/20261023100000_research_library`, tests `tests/{unit,integration,auth/e2e,fixtures,hosted}`. Routes stay in the existing `/api/v1/[...path]` handler (no second mutation system).

## 7. Data model changes

ResearchPaper, ProjectPaper, PaperCollection, CollectionMembership, PaperAnnotation, SourceVersion and ingest job/outbox state. Private object references stay in project association, not global metadata.

## 8. Required APIs

Provider search; save/list/get project sources; collection membership; upload grant/finalize/status/download; annotation CRUD; citation metadata export.

## 9. UI states and workflows

Loading/search partial/provider failure/no matches; duplicate save; file uploading/quarantined/processing/ready/failed; stale URL renewal; reader offline; anchored annotation recovery.

## 10. Security requirements

PDF rights provenance, SSRF prevention, escaped metadata, private object policies, scan/parser isolation, tenant-aware signing and extraction reauthorization.

## 11. Testing requirements

Provider contract fixtures; DOI/retry race tests; duplicate upload finalization; cross-tenant Storage and annotation ACL tests; malformed/oversize PDF rejection; PDF reader E2E.

## 12. Acceptance criteria

- [x] Repeated DOI/provider save produces one paper association per project (concurrent saves, idempotent replay; real PostgreSQL).
- [x] No private file or annotation becomes globally accessible through bibliographic metadata (RLS, raw SQL, second-account browser checks).
- [x] Provider failures show retry state without fake results (unit + browser partial-failure journey; fixtures, not live providers).
- [x] Reading retains exact immutable source/version/page context (anchors bound to versions, immutability triggers, reload journey). Citation records for AI are Phase 03.
- [x] Failed scanning is retryable with a bounded budget and cannot corrupt a ready version (scan leases/retry tests; READY is terminal). Extraction itself is Phase 03.

Evidence covers disposable environments only; hosted activation is pending approval.

## 13. Definition of Done

Each acceptance criterion has recorded evidence; applicable unit/integration/E2E and quality checks pass; migration SQL is reviewed against an identified environment; docs/API/security/ADRs reflect behavior; no unresolved critical defects; actual NOT RUN checks and external blockers are explicit. No later-phase behavior is implied by completion.

## 14. Dependencies on later phases

Phase 03 requires immutable text/source provenance; Phase 04/05 link to ProjectPaper artifacts. Later manuscript citation formatting can extend metadata exports.

## 15. Risks and mitigation

Provider coverage/licenses vary; expose source metadata and lawful access limits. Parser vulnerabilities require sandbox and bounded resources.

## 16. Suggested issue breakdown for coding agents

- P02-01: Define typed discovery adapters with provider output Zod validation, timeouts, pagination, quotas, attribution and availability states. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Establish contracts before dependent UI work.
- P02-02: Implement normalized DOI/provider dedup and transactional idempotent project save Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P02-03: Add private quarantine upload/finalization, object checksums, scan state, file size/signature controls and authorized short-lived signing. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P02-04: Integrate PDF.js reader with page loading, missing/unsupported/error recovery Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P02-05: Implement project collections and annotation anchors against immutable source versions Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P02-06: Add sandboxed asynchronous parsing contract/outbox when processing begins, public metadata cache boundaries and authorized source citation export. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
