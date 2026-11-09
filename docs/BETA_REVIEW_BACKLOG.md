# Beta review backlog

Owner decision, 9 November 2026: deliver the usable Phase 02 journey now. Comprehensive G01/G02 reviews are deferred to **before the Phase 05 closed beta**, and do not block Phase 02. A PR merge is integration, not proof of full live acceptance. Previous PASS/FAIL/NOT RUN evidence remains historical evidence. Real access leaks, data loss and blocking failures must still be fixed immediately.

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

Phase 02 still requires typecheck/lint/build, one real source→private PDF→highlight/note→reload journey, duplicate handling, export inspection and a short anonymous/unrelated-project file denial check. Tests are repeated only after relevant changes/failures. No Phase 03 features, SMTP, S3, paid service or unrelated infrastructure change is authorized.

Phase 02 short delivery evidence is now in [PHASE_02_HANDOFF](PHASE_02_HANDOFF.md): local real-paper browser journey plus live source/PDF/highlight/note/re-login/export, anonymous/wrong-project denial and same-image redeployment persistence. These checks do not close the broad reviews above. Include interrupted/ambiguous DB-finalize reconciliation and retry in the storage failure review; no crash/restore matrix was run in this phase.
