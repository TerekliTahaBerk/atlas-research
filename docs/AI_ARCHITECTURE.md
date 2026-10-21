# AI architecture foundation

`packages/ai` exports provider-neutral AIProvider, AIModelConfig, AIMessage, AIRequest, AIResponse, AIUsage, ResearchContext, ResearchCitation, and ResearchTool interfaces plus normalized stream/error unions. No SDK, API keys, adapters, paid requests, embeddings, or fake answers exist in Phase 00.

Adapters in Phase 03 implement generate and stream, capability checks, bounded model configs, validated structured outputs, cancellation, and normalized provider errors. Provider/model allowlists are server controlled; user input cannot select arbitrary endpoints. Costs are integer micros with explicit currency and marked estimates until reconciliation. Persist reservation/run/usage ledgers before dispatch; settle once by run ID.

## Retrieval and evidence pipeline

Research document → immutable source version → sandboxed text extraction → page/passage-aware chunking → embedding → pgvector index → permission-scoped retrieval → context assembly → provider generation → citation verification → user response.

Store extraction version, source SHA-256, chunk id, exact text/offsets/page and embedding model/version. Use same-project and source-level ACL checks in SQL retrieval; recheck before context assembly and citation rendering. Filter deleted/stale sources. Private annotations, conversations, and unpublished data never enter another workspace's retrieval. Global bibliographic metadata is distinct from user-owned source text.

A citation is verified only when the returned source/version/chunk belongs to the authorized context and its quoted passage matches the retained source/offsets, with page anchors when extraction provides them. Model-generated references start unverified. Verification establishes provenance and quotation, not scientific truth or full entailment; evaluate claim support separately. Invalid/missing references are withheld or labelled unsupported. Streaming text is provisional until verification finishes; persist final verified answer separately.

## Context, tools, privacy

Treat uploaded papers, retrieved text, tool results, and provider text as untrusted data. Source instructions cannot change system rules, execute tools, access secrets, or widen scope. Context assembly tags trusted instructions versus quoted evidence, enforces token/source limits, and carries permission snapshot IDs for auditing. Live authorization remains authoritative after a snapshot is created.

Tools are descriptors only in Phase 00. Future executor receives a server-issued capability, validates schema and active scope, and obtains explicit user authorization for side effects. A model cannot self-authorize. Isolate execution, cap duration/output, and log safe tool action metadata. No Python/LaTeX execution in the web process.

Choose providers using documented retention/training policies and regional handling; confidential uploads require organization consent and least-data transfer. No private prompts in logs or analytics. Support cancellation, deletion of provider-hosted artifacts when applicable, and usage exports.

Failover: retry transient pre-generation failures with bounded backoff; do not silently switch models mid-stream or after unknown completion. Disclose a restarted response, honor organization provider policy, reconcile usage first, and retain citations against the exact source context. Provider adapters pass deterministic contract tests with synthetic text; paid/live tests are opt-in and never run in standard CI.
