# Phase 03 implementation report

Recorded 23 October 2026. Local implementation is delivered; hosted release and real-provider evaluation remain **BLOCKED**. No paid model request, hosted mutation, production deployment, merge or subscription upgrade occurred.

## 1. Executive summary — PASS locally, BLOCKED for release

Atlas now has an integrated source-grounded research engine: accepted-source extraction, embeddings, permission-scoped hybrid retrieval, streamed structured answers, exact source-location citations, persisted conversations and conservative cost accounting. It reuses the approved Atlas interface and existing identity/library/Reader boundaries. The end-to-end local workflow uses official SDKs against explicit synthetic wire fixtures, real PostgreSQL/pgvector, real disposable Auth/Storage and authenticated worker protocols. Fixture success is not hosted or scientific model-quality evidence.

## 2. Git baseline and final state — PASS locally; publication BLOCKED

Started on existing `feat/phase-03-ai-research` with substantial uncommitted AI work and unrelated Reels changes. Freshly fetched `origin/master` exactly matched `1fca7cfc5cb590d9afaf6c6231c538c36f9cdfe8`. The AI draft was audited, extended and committed; unrelated Reels files and their navigation/context hunks remain uncommitted and outside the feature commits.

Implementation commits: `12efe57` (engine/tests/UI), `543d948` (strict scoped-mention narrowing), `f401ab0` (offline worker). The final documentation commit follows these; its exact hash is reported in the handoff. A clean managed review worktree verified the committed scope independently of unrelated work. Branch publication/upstream tracking and a draft PR are pending publication approval. `master` is unchanged.

## 3. AI services — PASS

Provider-neutral schemas/utilities live in `packages/ai`; server-only configuration, repositories, retrieval, read tools, orchestration, SSE and ingestion live in `features/ai/server`. Identity, live capabilities and origin/rate/body protections reuse the established platform services. No database/UI imports enter the AI/core contracts. See [architecture](../ai/AI_ARCHITECTURE.md).

## 4. Providers — PASS contract integration; BLOCKED live calls

Official OpenAI Responses and Anthropic Messages SDK adapters support generation/streaming, cancellation/timeouts, usage, strict output, configured model allowlists, normalized errors and finish reasons. Tests cover both adapters with intercepted HTTP, including malformed output, 429/outage, unsolicited tools, output limits and truncation. No automatic retry/fallback changes provider or price. An optional Google adapter from the initial draft remains fixture-tested. No approved provider credential was activated: the user explicitly chose **Keep paid calls disabled**. Real account/model availability, pricing and scientific performance are not verified.

## 5. Ingestion architecture — PASS locally; BLOCKED hosted worker

`READY` sources only, explicit processing consent, idempotent outbox, three-attempt leases, stale-attempt fencing, duplicate-completion ownership and revocation checks. Separate HMAC broker, separate database worker role and secret-free offline Poppler process. Valid and malformed PDF smoke checks pass in the real image with network disabled, 640 MiB memory, one CPU, dropped capabilities and read-only root filesystem. Browser tests supply extraction text through the actual authenticated protocol; they do not claim a deployed extractor or actual malware scan. See [ingestion](../ai/DOCUMENT_INGESTION.md).

## 6. Embeddings and indexing — PASS locally

Provider-neutral OpenAI/Google adapters validate exact count/order, finite nonzero 768-dimensional output and input/batch bounds. Immutable chunks retain original file hash, chunk hash, exact page/UTF-16 offsets, ordinal, extraction version, provider/model/revision/dimensions and creation timestamp. Unique operation keys prevent duplicate active index records. Revision changes create separate indexes. Duplicate/stale completions and retry exhaustion are tested on PostgreSQL. No paid embeddings were generated.

## 7. RAG — PASS locally

Real pgvector cosine distance plus keyword ranking executes over materialized authorized project candidates. Explicit attachment predicates preserve paper/version/page scope independently; context is bounded and revalidated. Tests cover project/organization denial, saved-paper/version combinations, exact selected passages, private annotations, empty retrieval and revocation during generation. Metadata/abstracts remain distinct from full text and have no fabricated pages. Exact search is used initially; large-corpus performance and ANN tuning are NOT RUN.

## 8. Citations — PASS source-location verification; BLOCKED scientific support evaluation

Strict model proposals reconcile with actual evidence IDs, exact quotes and offsets. The server supplies canonical paper/version/page/checksum. Fabricated references and orphaned markers are withheld; provisional text never has final verified chips. Relational citation FKs preserve provenance. Resolution rechecks permissions and canonical source data; links open the authorized Reader version/page or Library metadata and show the exact passage. Verification explicitly does not certify scientific entailment. See [citation rules](../ai/VERIFIED_CITATIONS.md).

## 9. Streaming and conversations — PASS locally

Persisted prompt/assistant pairs, creator-private conversation history, bounded model history, rename/archive/content erasure and actor-triggered retention are implemented. POST SSE sends actual fixture-provider deltas and persisted final states, with typed retrieval/citation/usage events. Cancellation, outage, uncertain completion, lease recovery, payload-mismatch replay and no-double-settlement are tested. Snapshot/history recovery replaces detached SSE token replay; no exactly-once external billing claim is made. See [streaming](../ai/STREAMING_AND_CONVERSATIONS.md).

## 10. Five-mode UI — PASS locally

Compact, Open, Focus, Panel and research inline context share one live hook/provider. The authenticated browser journey exercises Reader context, floating submission, docking, focus/keyboard behavior, follow-up, reload/reopen, cancellation and project reset. Existing preview geometry, accessibility and six reviewed screenshot baselines pass unchanged. Live AI desktop 1440×1000 and mobile 390×844 screenshots were inspected outside the repository. Browser plugin was unavailable; configured Playwright was used. No new design system was introduced.

## 11. Mentions, commands and tools — PASS contracts/local flow; BLOCKED real scientific quality

The authorized picker resolves project/paper/accepted-version/annotation identities. The server rejects mismatched or unavailable references. Live read-only commands include ask, search-library, summarize, compare, explain, identify-gaps and cite, plus limitations/outline. One audited schema-bounded composite retrieval tool implements the supported research reads; models cannot dispatch SQL or writes. Future action proposals are typed, pending and execution-unavailable. Unsaved search results must first be saved to Library. No future document/task/channel/LaTeX backend is implied.

## 12. Security — PASS isolated verification; BLOCKED hosted review

Non-owner RLS, composite provenance keys, creator-private histories, browser ACL denial, separate worker grants, current membership/source rechecks, source-archive denial, private-note denial and revocation during generation pass. Prompt injection text cannot obtain a new tool or cross-tenant retrieval scope through the current server boundary. This is a structural security result; actual model susceptibility needs the blocked real-provider evaluation. New code logs normalized categories/request IDs, not document text or credentials. Tracked-diff credential-pattern inspection found no real credential patterns; only explicit disposable test credentials are present.

## 13. Usage and cost accounting — PASS locally

Atomic advisory-locked reservations precede generation and embeddings. Server configuration controls model/output/input bounds, tariffs and deployment/tenant-attributed caps. Per-actor/conversation concurrency and a separate `ai:run` HTTP bucket apply. Known generation usage settles once; undispatched work releases its reservation; uncertain dispatch retains its conservative charge. Embedding charges are conservative estimates rather than exact invoice exports. Browser quota-exhaustion copy is exercised with a temporary disposable ledger fixture and restored afterward. See [cost accounting](../ai/USAGE_AND_COSTS.md).

## 14. Migrations — PASS disposable; BLOCKED hosted

Two additive migrations: `20261023150000_ai_research` and `20261023160000_ai_retention`. All six earlier migrations are unchanged. From-scratch deploy of all eight migrations passes on PostgreSQL 17/pgvector, including reproduced hostile browser defaults. Foundation SQL constraints and subsequent migration status pass. Prisma diff has no table/column drift; it shows only intentionally SQL-owned foreign keys/indexes omitted from Prisma models. Do not apply that diff or use `db push` to remove these safeguards. No hosted migration was applied.

## 15. Quality and CI evidence

| Check                                    | Result                              | Evidence                                                             |
| ---------------------------------------- | ----------------------------------- | -------------------------------------------------------------------- |
| `pnpm lint`                              | PASS                                | Primary and clean review worktree, zero warnings                     |
| `pnpm typecheck`                         | PASS                                | Strict workspace and test/tool TypeScript                            |
| `pnpm test`                              | PASS                                | 172 tests, including 43 official-adapter checks                      |
| `pnpm test:integration`                  | PASS                                | 70 tests on fresh `atlas_p01_test_release`, including 20 AI tests    |
| `pnpm build`                             | PASS                                | Default Turbopack production build in clean review checkout          |
| `pnpm test:e2e`                          | PASS                                | 101 unchanged browser tests; six visual snapshots unchanged          |
| `pnpm test:auth:e2e`                     | PASS                                | 5 real disposable Auth/Storage browser journeys, including AI        |
| `pnpm db:validate`                       | PASS                                | Prisma schema validation                                             |
| Foundation SQL / migration deploy/status | PASS                                | Explicit disposable loopback targets, all eight migrations           |
| `pnpm format:check`                      | PASS scoped PR; FAIL mixed worktree | Clean checkout passes; unrelated unformatted Reels file is preserved |
| Scanner Python                           | PASS                                | 10 existing tests                                                    |
| Extractor Python                         | PASS                                | 6 boundary tests                                                     |
| Extractor image / actual offline engine  | PASS                                | Image builds; valid PDF two-page extraction and malformed rejection  |
| Hosted integration / recovery            | BLOCKED                             | Explicit authorization, security/recovery/worker prerequisites       |
| Real provider smoke / scientific eval    | BLOCKED                             | Paid calls explicitly disabled; no approved credential activation    |
| GitHub CI                                | NOT RUN                             | Branch push/PR rejected by automatic publication review              |

The first primary-worktree build stalled under the restricted sandbox and was cancelled (exit 130). The same default build passed in the clean review worktree with required local execution permission; no build command or assertion was weakened. Early fixture locator, void-result cast, timeout-realm, SQL alias and strict-narrowing failures were repaired before final checks. Preview snapshots were never updated to incorporate unrelated Reels changes.

## 16. Supabase Free plan — supported local design; hosted capacity NOT RUN

No paid upgrade was attempted. PostgreSQL, Auth, private Storage and pgvector are compatible with the architecture. The actual blocker is reviewed hosted activation/recovery, not the Free-plan label. Storage/compute/corpus capacity and operational quotas need measurements before release. An encrypted manual logical-export/restore procedure, including separate object-byte recovery, is documented in the activation plan.

## 17. Hosted activation blockers — BLOCKED

The last verified hosted Phase 02 audit found unsafe browser access to Prisma migration history, unactivated Phase 02 schema/private buckets, no deployed scanner, and no verified protected manual recovery snapshot/isolated restore. Phase 03 additionally needs reviewed pgvector/AI migrations, separate worker credentials/host, provider data-handling/model/tariff approval and actual workflow verification. None was bypassed. [Activation plan](PHASE_03_ACTIVATION_PLAN.md) preserves remediation → recovery → Phase 02 schema/fencing → Phase 03 schema → worker/provider review order.

## 18. Known limits and remaining issues

- Real-provider scientific comparison, gap identification, entailment and semantic prompt-injection efficacy remain untested.
- Selected quotes must fit an indexed exact chunk; PDF.js and Poppler text can differ. Unmatched selections are rejected rather than fuzzily certified.
- Exact vector search is bounded by SQL timeout but has no large-corpus benchmark or ANN optimization.
- History/list pages are bounded to the most recent 40 pairs/50 conversations; no older-history pagination UI or detached event replay is provided.
- Retention is actor/read-triggered; guaranteed timed erasure requires an approved scheduler. Usage identity remains after content erasure.
- Embedding billing and interrupted-provider charges require operator/invoice reconciliation; no exact external billing claim is made.
- Unsaved scholarly results must be saved first; future domain writes remain unavailable.
- Existing development-only React script-tag warnings appear in older Auth/Library journeys; the AI journey has no page errors and automated accessibility checks pass.

## 19. Phase 04 readiness — PASS integration contracts; BLOCKED production readiness

Typed research references, audited read tools, exact provenance, private conversations and pending action proposals provide integration points. Phase 04 still requires its own real document/task services, authorization, versioning and explicit execution approval. This implementation does not authorize or implement those services, nor does it waive hosted Phase 03 release gates.

## 20. PR and deployment — BLOCKED publication; NOT RUN deployment

A concrete draft PR body is prepared locally. Automatic approval review rejected pushing the branch and opening a draft PR, stating that publication of private source/remote mutation lacked sufficient explicit trusted-user authorization. No alternative publication path was attempted. The final handoff requests approval to push this exact branch and open a draft PR targeting `master`. No remote branch/upstream, PR, merge or deployment success is claimed. The local work is complete and reviewable without publication.
