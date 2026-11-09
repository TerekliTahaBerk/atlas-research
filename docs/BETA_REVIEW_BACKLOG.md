# Beta review backlog

Owner decision, 9 November 2026: deliver the usable Phase 02 journey now. Comprehensive G01/G02/G03 reviews are deferred to **before the Phase 05 closed beta**, and do not block Phase 02/03. A PR merge is integration, not proof of full live acceptance. Previous PASS/FAIL/NOT RUN evidence remains historical evidence. Real access leaks, data loss and blocking failures must still be fixed immediately.

| Review | Current evidence / open work | Due |
| --- | --- | --- |
| Live cookies and security headers | Cookie attributes/header overwrite audit not run. Read-only HTTPS audit observed nosniff, DENY framing, no-referrer, restricted permissions, no powered-by, and HTTP→HTTPS redirect; HSTS and CSP were absent. Add/review hardening without changing unrelated proxy settings. | Before closed beta |
| Deployed image identities | Release SHA and ARM64 observed; record actual image IDs/digests for web/mail/files/migrator/DB and compare source labels. Container names alone are not image verification. | Before closed beta |
| PostgreSQL resources | Compose defines 1 GiB/1 CPU; actual DB cgroup/host-config limits not inspected. Web/mail limits were inspected. | Before closed beta |
| Live team isolation/revocation | Real PostgreSQL local matrix passed; controlled deployed two-team/member/session tests remain open. Local tests do not satisfy this live condition. | Before closed beta |
| Live compatible-image rollback | Local metadata-image procedure passed; controlled live image switch/rollback with preserved data remains open. Do not restore a template that leaks global env variables or an incompatible schema. | Before closed beta |
| Real email delivery | Disabled by owner; no external verification/reset/invitation delivery claim. Operator first identity is not mailbox verification. | Revisit before closed beta; explicit enablement required |
| Independent backup and recovery | S3 disabled and no independent target selected. Local synthetic restore is not independent remote recovery. DB plus private files must form a consistent encrypted set. | Revisit before closed beta; destination/retention approval required |
| Broad Phase 02 security/load/recovery | Job revocation races, quotas under concurrency, malicious PDF corpus, long range streams, storage reconciliation, retention/purge and DB+files restore/rollback. | Before closed beta |
| Broad UI/accessibility/browser review | Screen reader, native zoom, full screen×theme×viewport matrix, other browser engines and large PDFs. Short desktop/narrow journey remains a Phase 02 delivery check. | Before closed beta |

Phase 02 still requires typecheck/lint/build, one real source→private PDF→highlight/note→reload journey, duplicate handling, export inspection and a short anonymous/unrelated-project file denial check. Tests are repeated only after relevant changes/failures. The subsequent Phase 03 instruction authorizes documents/tasks/discussions/Inbox and deployment to the same Atlas app; SMTP, S3, paid services and unrelated infrastructure remain outside scope.

Phase 02 short delivery evidence is now in [PHASE_02_HANDOFF](PHASE_02_HANDOFF.md): local real-paper browser journey plus live source/PDF/highlight/note/re-login/export, anonymous/wrong-project denial and same-image redeployment persistence. These checks do not close the broad reviews above. Include interrupted/ambiguous DB-finalize reconciliation and retry in the storage failure review; no crash/restore matrix was run in this phase.

## Phase 03 additions — owner-authorized product delivery

- Broad A01–A13 expansion for every new entry/table, concurrent revocation/assignment/notification races and long edit sessions/load. Focused local PostgreSQL checks are separate evidence, not the full live matrix.
- Adversarial editor JSON/HTML/Markdown/LaTeX corpus, clipboard links, code-fence/math escaping, large documents and renderer budgets; full screen-reader/keyboard/zoom and all browser/theme/viewport combinations.
- Draft recovery across browser crashes/storage quota/shared computers, slow/ambiguous save responses, history/receipt retention and large-project pagination beyond current bounded list limits.
- Independent encrypted DB+private-files restore and compatible image rollback preserving citation/source-version/document-version/link integrity. Schema 006 requires compatible web/mail/files images; pre-006 images are not verified rollback candidates.
- Live controlled multi-user isolation/revocation and notification redaction remain broader pre-beta work; a short live writing→task→discussion smoke does not close them.

The Phase 03 delivery check is the short final journey and critical changed behavior described in [PHASE_03](phases/PHASE_03.md). Previous results are not rewritten.

Phase 03 short delivery evidence: [handoff](PHASE_03_HANDOFF.md), PR #35 / live `4a013d2`. Local real-PostgreSQL and production Chromium checks passed; live existing-account note→math writing→self-assigned task→topic/reply→Inbox and exact PDF locator/Markdown passed. Neither self-assignment nor local multi-user fixtures close the broader live team/revocation review.

## Phase 04 additions — calls disabled by owner

The owner authorized implementation/deployment, selected an existing key to enter directly in Coolify, has not chosen a daily budget, and prohibited paid model calls. See [Phase 04 handoff](PHASE_04_HANDOFF.md) and [ADR 0006](decisions/0006-grounded-ai.md). Do not treat the local synthetic adapter or a live evidence preview as real AI acceptance.

- G04 real-model evaluation remains OPEN: ≥10 real papers/40 questions/50 locators, all numeric support/abstention/access thresholds unchanged. No real model response or invoice was tested.
- Before activation: recheck model/pricing/data terms, select a daily workspace cap, obtain paid-test authorization, configure the owner's key privately, enable workspace sharing explicitly and inspect live reservations/settlement with controlled accounts.
- Extend live A01–A13 revocation at dispatch/result/delivery, policy changes during calls, process interruption/lease recovery, timezone boundaries, concurrency/load, retention/purge and malicious multilingual PDF corpus.
- Short Chromium rail/sheet testing does not replace all theme, viewport, screen-reader, zoom and engine combinations.
- Schema 007 rollback requires compatible images; pre-007 rollback has not been validated. Preserve consistent encrypted DB and files.

Phase 05 is not started. Email and independent backup acceptance remain deferred.
