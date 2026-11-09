# ADR 0006 — Grounded AI, bounded sharing and conservative reservations

Date: 9 November 2026. Status: implemented behind a closed production gate; real-model evaluation and activation pending. Supersedes no earlier security or beta gate.

The owner authorized Phase 04 on the existing Atlas Coolify app, chose an existing OpenAI key to enter directly in that app, has not selected a daily budget, and explicitly prohibited paid model calls. `ATLAS_AI_CALLS_ENABLED=false` therefore remains the release setting. Email/S3 stay disabled. No credentials or actual provider responses belong in this repository.

## Provider and data decision

Use the OpenAI Responses API, `gpt-6-luna`, with a strict JSON schema, buffered output, `store:false`, low reasoning, default service tier, no tools, no redirects and no automatic retries. Endpoint is fixed to `https://api.openai.com/v1/responses`. Output is plain text plus allowlisted evidence IDs and exact quotes; it is never executable HTML, editor JSON, SQL or a tool command. No embeddings, vector extension, Redis or new service is required.

Official documentation checked on 9 November 2026: [model capabilities](https://developers.openai.com/api/docs/models/gpt-6-luna), [pricing](https://developers.openai.com/api/docs/pricing), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Responses request](https://developers.openai.com/api/reference/resources/responses/methods/create) and [data controls](https://developers.openai.com/api/docs/guides/your-data). Published standard short-context rates were $0.10/M input and $0.50/M output; cache writes can cost more than ordinary input. Pricing/model availability must be rechecked before activation.

The global API is not a promise of EU residency, zero retention, or a particular processing country. `store:false` avoids stored Responses application state; default abuse monitoring may retain content for up to 30 days. API data is not used for training by default unless the customer opts in. Zero Data Retention requires provider approval and is not configured here. Workspace owner acceptance records a version of these terms, not a legal conclusion about any particular PDF.

Both workspace sharing and its budget start disabled/zero. Only a workspace owner can change them; every dispatch also requires the user's approval of the exact question and excerpt preview. Key presence is reported as a boolean. The app never accepts or returns the key. Only the web process receives `OPENAI_API_KEY`; explicit Compose overrides mask it from migration, database, mail and file roles, including Coolify global env-file injection. `ATLAS_AI_TEST_ORIGIN` is blank in all deployed processes and forbidden in production. A test-only loopback override additionally requires a synthetic literal key, a loopback app origin and runtime `NODE_ENV=test`.

## Evidence and privacy

The existing authorized PDF worker checks the file SHA-256, extracts physical pages using `pdftotext -enc UTF-8 -eol unix`, and records the actual Poppler version plus the Atlas parser revision. [Poppler's page separator and version behavior](https://manpages.debian.org/bookworm/poppler-utils/pdftotext.1.en.html) informs this parser. Pages and chunks are immutable per source version/extractor; a different extraction revision creates separate records. Existing files need an explicit editor-triggered Prepare evidence operation. No blanket backfill reads existing private PDFs on migration.

Offsets are zero-based Unicode code points with an exclusive end, compatible with PostgreSQL character substring semantics. Each evidence snapshot records physical page, source/version/page IDs, exact text interval, quote hash, file hash and extractor. SQL guards validate the page/file relationship, chunks and snapshot quotes. Previously prepared citations remain tied to their old page/extractor even when another extraction becomes current.

Selected versions belong to one project and are fixed for a conversation. Project/source access is checked before lexical search/rank, reservation, dispatch, result persistence, delivery and proposal use. Metadata and abstracts never become full-text evidence. Retrieval selects at most 20 excerpts from up to 10 versions and at most 30 KB of quote bytes; this is a bounded lexical subset, not complete-paper comprehension or semantic literature search. Sparse or unmatched queries produce an explicit empty preview, not a fabricated answer.

Conversation, question, snapshot, run, review and proposal rows are private to their author, including against workspace owners. Source page/chunk content is project research content. Composite scope foreign keys, runtime RLS and server checks reinforce the boundary. Usage helpers disclose only aggregate counts/costs to workspace members, never another person's prompts, responses, conversation IDs or project names. No prompt, quote, response body, credential or raw provider error is logged. There is currently no user-facing retention/purge control for AI history; retention/purge review remains pre-beta work.

Every factual answer segment must cite a supplied evidence ID and an exact substring of that evidence; otherwise the whole answer is withheld as `validation_failed`. An insufficient answer has no factual segments. Valid location does not prove scientific support. The UI separates locator validation from the user's private supported/partial/unsupported/contradicted review. No measured scientific accuracy is claimed before real-model evaluation.

## Jobs and budget

A request reserves once using its context ID and idempotency UUID. UTC request-start day determines accounting. Limits: one active request per user across workspaces, two per workspace, 20 requests per user/day across workspaces, plus an explicitly positive workspace cap. Cancelled/failed requests still count toward the daily request limit. Workspace and user advisory locks serialize aggregate checks and reservations.

Budget units deliberately overestimate the documented standard rates: $0.50/M input and $1/M output. Reserve `(serialized request UTF-8 bytes + 8192) × 0.5 + 2000` micro-USD, rounded up. Serialized requests are at most 50 KB, outputs at most 2,000 tokens, and accepted input usage at most 60,000 tokens; no long-context, tool or regional premium features are enabled. The byte bound plus overhead is conservative for this fixed payload, not an invoice guarantee for arbitrary future adapters. Unknown, malformed or excessive provider usage keeps the full reservation. Successful responses settle to conservative token units, not the actual bill. The cap needs review whenever model, payload, pricing or provider settings change.

Persist queued state, then execute once through Next.js [`after`](https://nextjs.org/docs/app/api-reference/functions/after) in the existing [self-hosted Node process](https://nextjs.org/docs/app/guides/self-hosting). No DB transaction remains open on the provider network call. Deadline: 45 seconds; persisted lease: 120 seconds. Cancelling before dispatch releases the reservation; cancellation, crash, revocation or uncertain failure after dispatch conservatively charges the full reservation. In-memory abort assists cancellation; persisted state and a final authorized compare-and-set prevent late delivery. Expired runs settle on the next authorized workspace AI operation and are never automatically redispatched. This is bounded best-effort processing, not a durable external worker or automatic paid retry system.

## Reviewed writing

A proposal is private and stores a before/after tree, target revision and planned stable citation IDs. Creation changes no document. Explicit apply requires current editor access, live sources and exactly the target revision; it atomically creates document history, source/page citations and artifact links. The shared document exposes only the approved writing and source quotes, not the private chat or question. Undo creates a new history revision only while the applied revision remains current. Concurrent edits cause a recoverable conflict; they are not overwritten.

## Acceptance boundary

Local PostgreSQL and browser fixture checks can verify program behavior with synthetic adapters. They cannot establish real model availability, scientific support, real-paper injection resistance, invoice accuracy or live team revocation. G04 remains OPEN until the defined real-paper evaluation and live security evidence pass with explicit paid-call authorization and a chosen budget. Phase 05 has not started.
