# Phase 03 — Atlas AI research

## Current implementation and release state

Local implementation is delivered for provider adapters, source processing, pgvector hybrid retrieval, exact citation locations, streaming conversations, conservative usage and shared Atlas UI. The user authorized Phase 03 development independently of hosted Phase 02 activation, and explicitly disabled paid calls. This supersedes the original “planned; not implemented” status. Hosted completion remains **BLOCKED**, and scientific claim support is not certified. [Implementation report](PHASE_03_IMPLEMENTATION_REPORT.md) records actual checks; [activation](PHASE_03_ACTIVATION_PLAN.md) preserves the security/recovery/credential gates.

Status: locally implemented; release remains behind the documented hosted/provider gates

## 1. Objective

Deliver atlas ai research as the phase outcome. Provider adapters, conversations, background extraction/chunks/embeddings, permission-scoped RAG, citations, structured/streamed responses and usage accounting.

## 2. Dependencies

Phase 01 permissions; Phase 02 lawful sources, immutable provenance/private storage; reviewed model account and provider policy.

## 3. Exact scope

Provider adapters, conversations, background extraction/chunks/embeddings, permission-scoped RAG, citations, structured/streamed responses and usage accounting.

## 4. Out of scope

Autonomous write tools without user authorization, arbitrary code execution, cross-workspace private retrieval, contextual channel bot until Phase 05.

## 5. Detailed implementation tasks

1. Implement adapter contract tests, server model allowlists, capability configuration, normalized errors/cancellation and validated structured outputs.
2. Create versioned extraction/chunk/embedding jobs with unique operation keys, content hashes, bounded retries, outbox and reconciliation.
3. Enable pgvector through reviewed SQL; use project/source ACL predicates before ranking and live permission rechecks before context/render.
4. Implement conversation/message/run state and quota reservation/settlement ledger; SSE events include provisional/final status and reconnect semantics.
5. Verify every returned reference against authorized source version/chunk/exact quote/page anchors; withhold unsupported references and evaluate scientific claim support separately.
6. Build context-injection regression corpus, server-authorized tool registry (read-only initially), retention/consent policy and privacy-safe operational metrics.

## 6. Proposed files and directories

packages/ai/src/providers; features/ai/server; features/ingestion/server; app/api/v1/{conversations,runs}; packages/database vector migrations; tests/evals.

## 7. Data model changes

Conversation, AIMessage, GenerationRun, UsageEvent, SourceChunk, Embedding, CitationReference and outbox. Constraints dedup chunk/model/version and usage run settlement.

## 8. Required APIs

Create/list conversations; submit/cancel run; authorized SSE stream/backfill; processing status; quota usage; citation source resolver.

## 9. UI states and workflows

No sources, indexing pending/failed, generating provisional text, verified final answer, unsupported claim warning, quota exhausted, provider outage, cancellation, retry/restart disclosure.

## 10. Security requirements

No private cross-tenant context, no prompt/tool self-authorization, provider data handling consent, precise citation status, spend limits and live revoke handling.

## 11. Testing requirements

Synthetic adapter/stream tests; adversarial paper prompt injection fixtures; two-tenant retrieval tests including private notes; quote/offset verification; usage settlement/retry concurrency; opt-in provider evals.

## 12. Acceptance criteria — local deterministic verification

- [x] Every displayed verified citation resolves to an authorized exact source passage.
- [x] Unauthorized or revoked source text never enters retrieval context or citations.
- [x] Repeated or uncertain-completion requests cannot double-settle usage.
- [x] Streaming failures disclose interruption and preserve recoverable run state.
- [x] No paid requests occur in standard CI.

## 13. Definition of Done

Each acceptance criterion has recorded evidence; applicable unit/integration/E2E and quality checks pass; migration SQL is reviewed against an identified environment; docs/API/security/ADRs reflect behavior; no unresolved critical defects; actual NOT RUN checks and external blockers are explicit. No later-phase behavior is implied by completion.

## 14. Dependencies on later phases

Phase 04 search shares authorized index contracts; Phase 05 contextual AI requires channel permissions in addition to source permissions; future tools need explicit capability grants.

## 15. Risks and mitigation

Plausible citations are not verification; exact provenance plus support evals mitigate hallucination. Token/cost variance needs hard budget reservation and reconciliation.

## 16. Suggested issue breakdown for coding agents

- P03-01: Implement adapter contract tests, server model allowlists, capability configuration, normalized errors/cancellation and validated structured outputs. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Establish contracts before dependent UI work.
- P03-02: Create versioned extraction/chunk/embedding jobs with unique operation keys, content hashes, bounded retries, outbox and reconciliation. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P03-03: Enable pgvector through reviewed SQL Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P03-04: Implement conversation/message/run state and quota reservation/settlement ledger Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P03-05: Verify every returned reference against authorized source version/chunk/exact quote/page anchors Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P03-06: Build context-injection regression corpus, server-authorized tool registry (read-only initially), retention/consent policy and privacy-safe operational metrics. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
