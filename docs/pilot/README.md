# Pilot preparation kit

Owner direction, 9 November 2026: complete preparation and hardening; participants and support/incident owner are **not assigned**. No recruitment, invitation, paid AI call, email enablement or independent backup destination is authorized by this kit. Closed beta has not launched.

## Start and stop conditions

Before inviting anyone, the product owner must assign an operator and private support channel, confirm the participant/team list, agree retention/deletion handling and access roles, and review the open G01–G04 and recovery gates in [the backlog](../BETA_REVIEW_BACKLOG.md). Target cohort remains 5–10 researchers and at least two teams; current real cohort is **0 participants / 0 teams**. Synthetic accounts are not recruited pilots.

The application guide is `/help`. It explains source→annotation→cited document→task/discussion and the closed AI gate, saving conflicts, safe diagnostics and data-sharing limits. Operator-assisted account provisioning is not mailbox verification. With email disabled, self-registration, email recovery and invitation delivery are unavailable; do not advertise them as ready onboarding.

No response-time SLA or on-call coverage exists until a named operator accepts it. Keep the pilot closed while critical access/data-loss blockers, unsupported recovery, real-model acceptance or unassigned support remain unresolved. The owner makes the final release decision from evidence; a merged PR or a passing synthetic test is not that decision.

## Participant briefing and consent record

Use a private roster outside the public repository. Record invitation/consent date, a pseudonymous participant key, agreed workspace/project role, permitted research material, observation consent and withdrawal instructions. Do not put emails, institution details, private project names, PDFs, prompts or model responses in this repo or aggregate measurements.

Explain that project material is accessible to authorized project members, private AI history is author-only, and approved text applied to shared documents becomes project content. AI is currently disabled. If later authorized, the global OpenAI API receives only the approved question and displayed excerpts; no EU residency or zero-retention guarantee is configured. See [the provider decision](../decisions/0006-grounded-ai.md). A stored API key alone is not consent to send research.

Agree retention/deletion, support channel and an independently tested encrypted DB+files backup before collecting important pilot research. Archiving is recoverable organization state, not permanent erasure. Existing security audit records are not silently repurposed as analytics. This preparation installs no analytics SDK, automatic pilot tracking or external feedback collector.

## Moderated journey sheet

For each consented session, keep private observation notes with start/end times and a pseudonymous participant key:

1. Select the intended workspace/project and add a permitted source/PDF. Distinguish metadata from actual text.
2. Open a fixed PDF version, save an annotation, reload and verify persistence.
3. Write a source-linked document, include math if relevant, wait for Saved, reload and inspect the citation/export.
4. Assign a linked task and open a linked discussion. Check member access with a separate controlled team.
5. Preview AI evidence, inspect a source locator and confirm the disabled-call message. This is an explicitly partial journey while paid calls/G04 remain blocked; do not count it as a real-model J1 completion.
6. Exercise a recoverable conflict and a revoked-access case using controlled fixtures. Stop on any disclosure or lost acknowledged edit.

Record whether each step was completed without help, where help was needed, the failure class and request ID. Keep scientific support judgments separate from quote/locator validation. Do not record screen video or collect content by default.

## Incident handling and safe feedback

P0: suspected tenant/credential disclosure or widespread data loss. P1: blocked main workflow or repeated lost acknowledged writes. P2: recoverable defect. P3: cosmetic issue. A keyboard/contrast defect blocking the main journey is P1.

For P0/P1, stop the affected workflow, notify the assigned owner privately, preserve only minimal timestamp/request/release evidence, assess scope, and agree containment. Do not copy private research into public GitHub issues or logs. Never respond with broad server resets, volume deletion, credential dumps or changes to unrelated Coolify applications.

Report template: local time/timezone; release/schema; affected screen; expected/actual behavior; request ID; impact; sanitized reproduction; workaround. The in-app safe diagnostic text contains only readiness/release/schema/time. It is manually shared, not automatically sent anywhere. No support owner is assigned yet.

Recovery requires a consistent DB+private-files set, keys kept separately, a disposable restore rehearsal, integrity/tenancy validation and an explicit production recovery decision. A compatible-image rollback changes code, not data; see [Phase 05 evidence](../PHASE_05_HANDOFF.md). Local drills are not an independent off-host backup.

## Metrics and review

Use [measurement instructions](MEASUREMENT.md), the versioned [empty template](measurements.empty.json) and `npm run pilot:metrics -- /path/to/private-aggregate.json`. Zero denominators and incomplete time windows produce NOT RUN; synthetic results cannot become real pilot acceptance. Do not edit the empty template to invent observations. Review raw counts, limitations and P0/P1 defects with the owner before any beta decision.
