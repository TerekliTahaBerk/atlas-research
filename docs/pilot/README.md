# Pilot preparation kit

The [current 20-person launch plan](LAUNCH.md) records the production and staging acceptance status for the commercial and Compute release. This kit retains the observation, consent, and incident procedures.

The product owner is assigned to coordinate test accounts, support and incident response. Participants contact the product owner by email using the address shared privately with their welcome instructions. The first participant list is pending. The [participant briefing](PARTICIPANT_BRIEF.md) is ready for the operator to share when the pilot opens.

## Start and stop conditions

Before admitting anyone, the product owner confirms the participant/team list, retention/deletion handling and access roles. The first wave is four researchers, with gradual expansion to at most 20. Current enrollment is **0 participants / 0 teams**. The [open roadmap gates](../BETA_REVIEW_BACKLOG.md) continue to track full beta acceptance separately from the pilot plan.

The application guide is `/help`. It explains source→annotation→cited document→task/discussion and the closed AI gate, saving conflicts, safe diagnostics and data-sharing limits. Operator-assisted account provisioning is not mailbox verification. With email disabled, self-registration, email recovery and invitation delivery are unavailable; do not advertise them as ready onboarding.

The operator owns the stop decision and records support availability in the private briefing. The current pilot scope excludes model calls. The owner deferred the independent backup destination for this pilot; the off-host recovery review remains open. Stop onboarding on a critical access, data-loss or main-workflow blocker. [Launch and stop conditions](LAUNCH.md)

## Participant briefing and consent record

Use a private roster outside the public repository. Record invitation/consent date, a pseudonymous participant key, agreed workspace/project role, permitted research material, observation consent and withdrawal instructions. Do not put emails, institution details, private project names, PDFs, prompts or model responses in this repo or aggregate measurements.

Explain that project material is accessible to authorized project members, private AI history is author-only, and approved text applied to shared documents becomes project content. AI is currently disabled. If later authorized, the global OpenAI API receives only the approved question and displayed excerpts; no EU residency or zero-retention guarantee is configured. See [the provider decision](../decisions/0006-grounded-ai.md). A stored API key alone is not consent to send research.

Agree retention/deletion and the support channel privately. Ask participants to start with replaceable, permitted sources while independent production recovery is deferred. Archiving preserves records for later access. Existing security audit records stay outside the consented pilot measurements.

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

For reports, record local time and timezone, release and schema, affected screen, expected and observed behavior, request ID, impact, steps with sensitive details removed, and any workaround. Participants can copy technical details from `/help` and share them privately with the operator.

Recovery requires a consistent DB+private-files set, keys kept separately, a disposable restore rehearsal, integrity/tenancy validation and an explicit production recovery decision. A compatible-image rollback changes code, not data; see [Phase 05 evidence](../PHASE_05_HANDOFF.md). Local drills are not an independent off-host backup.

## Metrics and review

Use [measurement instructions](MEASUREMENT.md), the versioned [empty template](measurements.empty.json) and `npm run pilot:metrics -- /path/to/private-aggregate.json`. Zero denominators and incomplete time windows produce NOT RUN; synthetic results cannot become real pilot acceptance. Do not edit the empty template to invent observations. Review raw counts, limitations and P0/P1 defects with the owner before any beta decision.
