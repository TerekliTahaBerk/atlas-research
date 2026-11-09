# Phase 04 handoff — grounded AI implementation with calls disabled

Status: implementation and focused local verification complete. [PR #37](https://github.com/TerekliTahaBerk/atlas-research/pull/37) squash merged as `91a78f9a5c77f80d8acfe2d3d655c9c109506034`; the existing yula.co / Atlas application is deployed to this functional commit. G04 remains OPEN. Phase 05 is outside scope. Email and S3 remain off.

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
| Existing Coolify app migration/deployment | PASS, observed 9 November: deployment `wtu1rutdchie7x5b1n5lgjsp` (started 16:33:16 UTC) reports Success. HTTPS `/health/ready` returns `ready`, release `91a78f9a5c77f80d8acfe2d3d655c9c109506034`, schema `202611090007_grounded_ai`. |
| Live prepared evidence / closed provider gate | PASS: existing public PLOS PDF v2 explicitly prepared by the authorized editor; 20 matching excerpts previewed, first exact-version link resolves physical page 5. Usage/request/reservation counters remain zero, workspace cap zero, global call gate disabled, send button disabled. No provider call. |
| Real-model J1.10/J1.11 and G04 | **NOT RUN / OPEN**, paid calls prohibited. |

## Open acceptance work

G04 is not PASS. Preserve its thresholds: at least 10 legally accessible real papers, 40 questions and 50 locators; 100% valid permitted locators; at least 90% supported claims; at least 9/10 appropriate insufficient/contradictory abstentions; zero access/injection leakage or actions. Record locator resolution and independent claim-support judgment separately. Use positive, metadata-only, missing/contradictory evidence, source-version changes, multilingual PDF text, prompt-injection and permission-revocation cases. Do not commit private PDFs, real questions tied to personal research, raw provider responses or keys; public bibliographic IDs and aggregate findings may be documented.

Activation requires a selected daily workspace cap, current provider/model/pricing/data review, owner-enabled workspace policy, per-query consent, and explicit permission for paid validation. A key's presence alone does not authorize calls or close these gates. Broad A01–A13 live revocation/streaming/retention/load and the existing [pre-beta backlog](BETA_REVIEW_BACKLOG.md) remain open. Email delivery and independent encrypted DB+files backup/restore remain deferred by the owner.

Rollback to pre-007 images is not verified: readiness expects the matching schema. Keep compatible 007 images and preserve DB/files. A local synthetic lifecycle test is not a live rollback drill. Do not claim full pixel parity, broad browser/accessibility coverage or scientific reliability from the short fixture journey.

## Reproduce local checks

`npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run test:integration`, `npm run build`, `npm run verify:compose`. Focused checks: `npm run test:ai` and `npm run test:ai:browser` after a production build. The browser harness starts only disposable loopback PostgreSQL/SMTP, synthetic PDFs and a loopback HTTP provider with an explicitly synthetic key. It never needs a real provider key or permission to incur model charges. Production rejects the test override. Screenshots are kept outside the public repository.

The complete integration run exposed a test-fixture ordering issue: a Phase 03 PDF job can precede the Phase 02 fixture in their shared disposable queue. The library test now drains a bounded number of jobs until its own version is ready. No production queue bypass was added. Existing PostgreSQL driver concurrency deprecation warnings in the prior collaboration test remain non-failing; they are not an AI/provider failure.

## Observed live release

Existing app: [Atlas preview](https://om2lefhyk80lxthwkqe2qi3f.91.99.118.96.sslip.io). Coolify project **yula.co**, existing production resource **Atlas Research**; no new app/server/database or domain was created. Source remains `main`, pinned to functional commit `91a78f9`; `ATLAS_RELEASE` matches it. Reloaded the repository Compose and observed its explicit non-web OpenAI-key mask before redeploying. The only added live setting is `ATLAS_AI_CALLS_ENABLED=false`. Existing credential values were not read or rotated; the owner's `OPENAI_API_KEY` variable name was present, but key validity/provider access was not tested. Email/S3 remain disabled. Volumes, resource declarations, custom serial build command and service topology are unchanged.

Controlled data only: the previously uploaded open-access PLOS paper, DOI `10.1371/journal.pbio.1002106`, was indexed by `poppler-22.12.0;atlas-text-v1`. Its first selected excerpt resolves to PDF version `fb759960-20ca-4e48-912b-d8992985b900`, physical page 5, code-point interval `[0,1380)`. SQL verifies exact text/hash provenance. PDF file SHA-256: `769d967609d464d2079e92a0c968ce8eb9d895bcfefd51256e097584eb050a4a`. The PDF rendered at page 5; no horizontal page overflow was observed. This is a locator check, not a scientific support evaluation.

The private conversation's selected scope survived Library → PDF → Document navigation. The prior controlled Phase 03 document remained revision 3, Saved, with its source citation, original sentences and math intact. No document edit was made during this check. The current app tab recorded zero console errors/warnings. Tasks/discussions were not separately re-tested live in Phase 04; their local integration regression tests passed.

The preview displayed an estimated maximum reservation of $0.0228 budget units for the selected question/excerpts, while actual spent/reserved/request counts stayed **zero**. No consent or sharing-policy acceptance was submitted, no AI run was created, no live proposal was generated/applied and no paid model call occurred. Completed-response/proposal behavior was checked only with the local synthetic adapter. Preview and consent are transient UI state and reset on navigation; users must preview/approve again before sending. Conversation IDs, scope and completed history persist privately.

Local, uncommitted screenshots: `atlas-phase04-ai-desktop.png`, `atlas-phase04-ai-narrow.png`, `atlas-phase04-ai-reader-narrow.png`, `atlas-phase04-ai-dark.png`, `atlas-phase04-live-evidence.png`, `atlas-phase04-live-document.png`. They contain synthetic fixtures or controlled public-source data, no keys or private PDF content. The live screenshots show a disabled provider gate; they are not model-output evidence.

The follow-up documentation commit need not be redeployed: the app intentionally remains pinned to the functional release above. Broad live cookie/header, actual image digest, PostgreSQL resource, two-team revocation and compatible rollback audits remain in the pre-beta backlog; the readiness SHA is not an image-digest verification.
