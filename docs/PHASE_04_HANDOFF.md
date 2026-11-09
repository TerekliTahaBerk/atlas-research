# Phase 04 handoff — grounded AI implementation with calls disabled

Status: implementation and focused local verification complete; release/PR observations will be recorded after they occur. Phase 05 is outside scope. Email and S3 remain off.

## Owner decisions

- Reuse the owner's existing OpenAI key. The owner will enter `OPENAI_API_KEY` directly into Atlas Coolify; no key value has been requested in chat or read by the agent.
- Daily live budget undecided. No workspace policy is enabled on the owner's behalf.
- **No paid model calls**, including smoke tests and evaluation. Production `ATLAS_AI_CALLS_ENABLED=false`; real model activation is not part of this delivery under the current constraint.

## Implemented behavior

- Immutable PDF physical pages/chunks, hash/extractor provenance and project-filtered lexical evidence previews. Editor-triggered preparation reuses the existing file worker and private volume.
- Author-private project conversations with fixed source-version scope; same-project screen navigation retains conversation IDs, project changes close the panel. No private content is persisted in browser storage by this feature.
- A 392 px contextual rail on wide screens and accessible modal sheet on narrow screens, following the current Atlas HTML. Scope, excerpt preview, provider disclosure and explicit consent precede a request.
- Responses adapter with strict structured output, buffered delivery, validated evidence IDs/exact quote substrings, explicit insufficient/error/cancel states and separate human scientific-support review.
- Workspace-owner sharing policy and conservative daily budget, atomic reservation/idempotence, user/workspace concurrency, UTC daily quota, bounded timeout and conservative uncertain-cost settlement.
- Private before/after proposals, explicit revision-checked document apply, stable source/page citations in writing/export and revision-safe undo.
- Additive schema revision `007`. No infrastructure, domain, resource/volume or service topology replacement. Compose explicitly isolates the AI key from non-web roles under Coolify's global environment injection.

The implementation details, official provider/data references and accounting limitations are in [ADR 0006](decisions/0006-grounded-ai.md).

## Evidence ledger

Only observed results belong here. The local adapter and HTTP fixture are clearly synthetic; neither represents a real model answer.

| Check | Evidence/status |
| --- | --- |
| Disposable PostgreSQL migrations and critical Phase 04 behavior | PASS, final candidate: closed gate/no usage, private history/RLS, unrelated-project denial, budget/concurrency/idempotence, queued/after-dispatch cancellation, exact excerpt validation, fabricated-ID rejection, insufficient output, viewer apply denial, proposal conflict/apply/export/undo and revoked pre-dispatch access. Policy revocation during dispatch, expired-lease settlement and daily request 21 denial also passed. Full suite: 11/11. |
| Production-build Chromium journey | PASS: loopback synthetic HTTP provider, one fixture response; evidence preview/consent, exact PDF version/page, support review, fixed scope across screens, proposal diff/apply/undo, 1440px rail, 390px sheet, Escape/focus/project reset and light/dark snapshots. Browser plugin unavailable; Playwright Chromium fallback. No OpenAI request. |
| Type/lint/build/Compose | PASS: typecheck, lint, production build, 6/6 unit tests and Compose credential isolation under simulated Coolify global env-file injection. |
| Existing Coolify app migration/deployment | Not yet observed. |
| Live prepared evidence / closed provider gate | Not yet observed. |
| Real-model J1.10/J1.11 and G04 | **NOT RUN / OPEN**, paid calls prohibited. |

## Open acceptance work

G04 is not PASS. Preserve its thresholds: at least 10 legally accessible real papers, 40 questions and 50 locators; 100% valid permitted locators; at least 90% supported claims; at least 9/10 appropriate insufficient/contradictory abstentions; zero access/injection leakage or actions. Record locator resolution and independent claim-support judgment separately. Use positive, metadata-only, missing/contradictory evidence, source-version changes, multilingual PDF text, prompt-injection and permission-revocation cases. Do not commit private PDFs, real questions tied to personal research, raw provider responses or keys; public bibliographic IDs and aggregate findings may be documented.

Activation requires a selected daily workspace cap, current provider/model/pricing/data review, owner-enabled workspace policy, per-query consent, and explicit permission for paid validation. A key's presence alone does not authorize calls or close these gates. Broad A01–A13 live revocation/streaming/retention/load and the existing [pre-beta backlog](BETA_REVIEW_BACKLOG.md) remain open. Email delivery and independent encrypted DB+files backup/restore remain deferred by the owner.

Rollback to pre-007 images is not verified: readiness expects the matching schema. Keep compatible 007 images and preserve DB/files. A local synthetic lifecycle test is not a live rollback drill. Do not claim full pixel parity, broad browser/accessibility coverage or scientific reliability from the short fixture journey.
