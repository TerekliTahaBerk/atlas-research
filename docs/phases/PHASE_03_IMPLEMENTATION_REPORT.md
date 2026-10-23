# Phase 03 implementation report

Recorded 23 October 2026. Local implementation is delivered; hosted release and real-provider evaluation remain **BLOCKED**. No paid model request, hosted mutation, production deployment, merge or subscription upgrade occurred. PR #9 is OPEN as a DRAFT against `master`; its automatic Vercel preview is separate from production activation.

## 1. Executive summary — PASS locally, BLOCKED for release

Atlas now has an integrated source-grounded research engine: accepted-source extraction, embeddings, permission-scoped hybrid retrieval, streamed structured answers, exact source-location citations, persisted conversations and conservative cost accounting. It reuses the approved Atlas interface and existing identity/library/Reader boundaries. The end-to-end local workflow uses official SDKs against explicit synthetic wire fixtures, real PostgreSQL/pgvector, real disposable Auth/Storage and authenticated worker protocols. Fixture success is not hosted or scientific model-quality evidence.

## 2. Git baseline and final state — PASS; existing draft PR

Started on existing `feat/phase-03-ai-research` with substantial uncommitted AI work and unrelated Reels changes. Freshly fetched `origin/master` exactly matched `1fca7cfc5cb590d9afaf6c6231c538c36f9cdfe8`. The AI draft was audited, extended and committed; unrelated Reels files and their navigation/context hunks remain uncommitted and outside the feature commits.

Implementation commits: `12efe57` (engine/tests/UI), `543d948` (strict scoped-mention narrowing), `f401ab0` (offline worker). The final documentation commit follows these; its exact hash is reported in the handoff. A clean managed review worktree verified the committed scope independently of unrelated work. The user subsequently authorized publication: [PR #9](https://github.com/TerekliTahaBerk/atlas-research/pull/9) is OPEN/DRAFT, base `master`, head `feat/phase-03-ai-research`, tracking its matching origin branch. Final hardening is committed in `4c370d4`; the evidence documentation commit follows. `origin/master` remains `1fca7cfc5cb590d9afaf6c6231c538c36f9cdfe8`. Unrelated Reels work remains outside the PR.

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

Three additive Phase 03 migrations: `20261023150000_ai_research`, `20261023160000_ai_retention` and final hardening `20261023170000_ai_stream_authorization`. All eight pre-hardening migrations are unchanged. From-scratch deploy of all nine migrations passes on PostgreSQL 17/pgvector, including reproduced hostile browser defaults. Foundation SQL constraints and subsequent migration status pass. Prisma diff has no table/column drift; it shows only intentionally SQL-owned foreign keys/indexes omitted from Prisma models. Do not apply that diff or use `db push` to remove these safeguards. No hosted migration was applied.

## 15. Quality and CI evidence

| Check                                    | Result                              | Evidence                                                                                                                                                                                         |
| ---------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm lint`                              | PASS                                | Primary and clean review worktree, zero warnings                                                                                                                                                 |
| `pnpm typecheck`                         | PASS                                | Strict workspace and test/tool TypeScript                                                                                                                                                        |
| `pnpm test`                              | PASS                                | 176 tests, including 43 official-adapter and 4 stream-buffer checks                                                                                                                              |
| `pnpm test:integration`                  | PASS                                | 75 tests on fresh `atlas_p01_test_final`, including 25 AI tests                                                                                                                                  |
| `pnpm build`                             | PASS                                | Default Turbopack production build in clean review checkout                                                                                                                                      |
| `pnpm test:e2e`                          | PASS                                | 101 unchanged browser tests; six visual snapshots unchanged                                                                                                                                      |
| `pnpm test:auth:e2e`                     | PASS                                | 5 real disposable Auth/Storage browser journeys, including AI                                                                                                                                    |
| `pnpm db:validate`                       | PASS                                | Prisma schema validation                                                                                                                                                                         |
| Foundation SQL / migration deploy/status | PASS                                | Explicit disposable loopback targets, all nine migrations                                                                                                                                        |
| `pnpm format:check`                      | PASS scoped PR; FAIL mixed worktree | Clean checkout passes; unrelated unformatted Reels file is preserved                                                                                                                             |
| Scanner Python                           | PASS                                | 10 existing tests                                                                                                                                                                                |
| Extractor Python                         | PASS                                | 6 boundary tests                                                                                                                                                                                 |
| Extractor image / actual offline engine  | PASS                                | Image builds; valid PDF two-page extraction and malformed rejection                                                                                                                              |
| Hosted integration / recovery            | BLOCKED                             | Explicit authorization, security/recovery/worker prerequisites                                                                                                                                   |
| Real provider smoke / scientific eval    | BLOCKED                             | Paid calls explicitly disabled; no approved credential activation                                                                                                                                |
| GitHub CI                                | PASS original published head        | Run [40006126343](https://github.com/TerekliTahaBerk/atlas-research/actions/runs/40006126343): quality and isolated-auth SUCCESS at `ac50290`; current hardening head checks are linked on PR #9 |

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

## 20. PR and deployment — draft OPEN; production BLOCKED

[PR #9](https://github.com/TerekliTahaBerk/atlas-research/pull/9) already exists, is OPEN/DRAFT and targets `master`. The earlier publication rejection was superseded by explicit user authorization and successful branch/PR publication. The final-review request explicitly authorizes committing, pushing the corrections to the same branch and updating that PR. No auto-merge or production deployment is requested or performed. The automatic Vercel preview/check for the original published head succeeded; this does not activate hosted AI or prove release readiness. The authoritative checks for the current pushed head and final Actions run are linked in the PR delivery description.

## 21. Final independent hardening review

The review reproduced excessive per-event SQL in the original published code, then measured the same real PostgreSQL scenarios after correction. One/twelve-source and twenty-four-chunk validations now take three application SQL round trips in one actor transaction. Fast streams coalesce at 256 characters/50 ms, persist and project minimal state in one transaction per batch, keep a one-second idle authorization heartbeat and share a single final snapshot across citation/usage/completion events. No stale permission cache replaces RLS.

| Measurement                 | SQL before → after | Transactions before → after | Local elapsed before → after |
| --------------------------- | ------------------ | --------------------------- | ---------------------------- |
| One source                  | 7 → 3              | 2 → 1                       | 8 → 4 ms                     |
| Twelve sources              | 29 → 3             | 2 → 1                       | 23 → 5 ms                    |
| Twenty-four evidence chunks | 77 → 3             | 2 → 1                       | 64 → 7 ms                    |
| 100 provider deltas         | 4,769 → 50         | 750 → 15                    | 4,495 → 94 ms                |
| 500 provider deltas         | 23,194 → 54        | 3,618 → 16                  | 21,188 → 104 ms              |

These are synthetic burst/provider-orchestration measurements, not hosted/model benchmarks. Counts include role/context setup, exclude BEGIN/COMMIT and fixture/admin setup, and do not count internal SQL-function statements as network round trips. Latency is a single local observation, not an SLA. CI enforces operation-count budgets; [performance methodology](../ai/STREAMING_PERFORMANCE.md) records the exact scope and bounds.

Two correctness gaps were also repaired. Citation resolution now rejects end offsets past the canonical text length instead of allowing JavaScript substring truncation. Follow-up answers now persist bounded transitive historical evidence/reference dependencies, so an archived or inaccessible prior source also hides/cuts off dependent follow-ups. The additive migration checks canonical evidence tuples, metadata kinds and private notes under caller RLS; deletion/retention erases the new historical snapshot. Existing migrations were not rewritten.

New regression evidence covers canonical evidence ID/paper/version/project/page/offset/text/hash tampering, fabricated metadata anchors/kinds/pages, historical-source archive during streaming, completed citation denial after archive, reader disconnect, TimeoutError, buffered cancellation and single settlement. Existing tests retain private-annotation denial, PDF instruction injection boundaries, membership revocation, leases, replay/concurrent budgets, provider failure and official-SDK structured output checks. All 75 PostgreSQL tests and 176 unit tests pass; fixture outputs remain explicitly synthetic. Scientific entailment and real-provider injection resistance remain NOT RUN.

The complete local quality suite runs from the clean scoped worktree at `4c370d4`; format/lint/schema/typecheck/unit/integration/build/Auth+Storage+AI E2E pass. Production preview Playwright preserves the six approved baselines without updates. Scanner (10) and extractor (6) Python tests pass. The read-only activation SQL executes successfully on the disposable Auth/Storage harness: nine migration records, vector `extensions` namespace, zero browser/elevated-role findings and exactly two private PDF buckets with no object policies. This is local evidence only. Hosted audit/recovery/migrations/buckets/deployed workers remain BLOCKED and were not changed.

The new OpenAI/Anthropic opt-in smoke procedure is prepared with a combined USD 0.50 ceiling, bounded context/output, at most six generation calls per provider, separate indexing allowance, no automatic retries and invoice reconciliation. It remains NOT RUN; paid dispatch remains disabled.

## 22. UI verification and merge/release verdict

Browser plugin not available; configured Playwright is the recorded fallback. Flow: disposable account login → saved paper/upload/index consent → Reader chips → streamed answer → exact citation/Reader navigation → follow-up/dock/focus → reload/reopen/cancel → project reset. Five authenticated journeys pass at `http://127.0.0.1:3102`. The AI journey asserts no page errors, no unsupported browser storage and no axe violations. Desktop 1440×1000 and mobile 390×844 renders were inspected against the approved dark tokens, typography, shell and composer; no overlap or design-system mismatch required a UI change. Existing development React script-tag warnings remain limited to older Auth/Library journeys; they are not hidden or reclassified as AI failures.

| UI check                                                 | Result      | Evidence                                                                                                         |
| -------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------- |
| Intended route, meaningful content, no framework overlay | PASS        | Authenticated Reader/research navigation and visible response assertions                                         |
| Controls and state transitions                           | PASS        | Consent, mentions/chips, streamed/final citations, conversation history, cancellation and five shared placements |
| Console/accessibility                                    | PASS for AI | Zero page errors and zero axe violations; older development warning noted above                                  |
| Responsive visual inspection                             | PASS        | `/tmp/atlas-phase03-ai-desktop.png` and `/tmp/atlas-phase03-ai-mobile.png`; no snapshot updates                  |
| Approved preview regressions                             | PASS        | 101 production-browser checks and six existing image comparisons                                                 |

Code merge readiness: **eligible for merge after current-head required GitHub checks pass and normal reviewer approval**. No remaining critical defect was identified in the reviewed scope; keep the PR draft until the human review decision. Release readiness: **BLOCKED for real users** by the hosted security/recovery/schema/bucket/worker gates, approved credentials/data handling/tariffs and real-provider/scientific evaluation. Merging code does not authorize paid traffic, hosted migration, deployment or Phase 04.
