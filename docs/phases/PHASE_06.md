# Phase 06 — Beta release

Current repository capability classifications and hosted blockers: [A00 audit](A00_REPOSITORY_HARDENING_REPORT.md). This phase specification defines scope and acceptance requirements; historical checklists alone do not certify current activation.

Status: planned; not implemented

## 1. Objective

Deliver beta release as the phase outcome. Integrated workflows, security review, performance, onboarding refinement, monitoring, pilot validation and release readiness.

## 2. Dependencies

Phases 01–05 accepted; isolated staging; pilot consent; operational accounts, backup/PITR and incident owners assigned.

## 3. Exact scope

Integrated workflows, security review, performance, onboarding refinement, monitoring, pilot validation and release readiness.

## 4. Out of scope

New advanced research modules, enterprise certification claims, broad feature expansion before reliability gates.

## 5. Detailed implementation tasks

1. Automate register→workspace→project→paper→annotation→AI citation→note→task→discussion journey with failure recovery and multi-user roles.
2. Review session/CSRF/RLS/Storage/Realtime/injection/SSRF/tenant export boundaries and fix findings before pilot access.
3. Profile slow queries, source ingestion queue, reader/editor loading and AI first-token time; establish measured SLOs and load budgets.
4. Provision redacted logs/traces/alerts and documented on-call/incident response; correlate request/job/provider run IDs.
5. Perform DB plus Storage restore drill, data export/deletion and membership-revoke exercises in staging with recorded timings.
6. Run consented pilot, measure hypothesized activation/retention/workflow metrics, triage accessibility feedback and publish go/no-go evidence.

## 6. Proposed files and directories

tests/journeys; tests/security; tests/load; docs/operations/{runbooks,restore,incident,response}; docs/beta; feature-specific fixes only.

## 7. Data model changes

Only evidence-driven indexes/constraints and lifecycle corrections; migration audit and rollback plans for every change. No speculative new product entities.

## 8. Required APIs

Operational health/readiness with no secrets; approved analytics consent/events; existing domain APIs hardened, no bypass test endpoints in production.

## 9. UI states and workflows

Clear onboarding and retry recovery, empty first-run guidance, provider degradation and queue delay states, privacy controls/export/deletion confirmation.

## 10. Security requirements

Independent security review process, verified backups/restores, dependency/secret checks, least privilege and confidentiality consent. Close all critical/high exploitable findings.

## 11. Testing requirements

Full critical journey staging suite; load/rate-limit abuse; accessibility keyboard and screen-reader review; restore/export/deletion drills; provider outage simulations.

## 12. Acceptance criteria

- [ ] All critical scripted journeys pass in staging with real isolated services.
- [ ] No unresolved critical/high exploitable tenant/data exposure findings.
- [ ] Restore meets agreed pilot RPO/RTO with DB and objects consistent.
- [ ] Operational alerts and ownership are tested with a simulated incident.
- [ ] Pilot metrics are measured and distinguished from hypotheses.

## 13. Definition of Done

Each acceptance criterion has recorded evidence; applicable unit/integration/E2E and quality checks pass; migration SQL is reviewed against an identified environment; docs/API/security/ADRs reflect behavior; no unresolved critical defects; actual NOT RUN checks and external blockers are explicit. No later-phase behavior is implied by completion.

## 14. Dependencies on later phases

Phase 07 begins only after beta evidence identifies demand and operational capacity. Beta success does not waive new execution/billing reviews.

## 15. Risks and mitigation

Insufficient pilot evidence can look like success; record denominators, cohorts and failures. Limit pilot size until operational recovery is exercised.

## 16. Suggested issue breakdown for coding agents

- P06-01: Automate register→workspace→project→paper→annotation→AI citation→note→task→discussion journey with failure recovery and multi-user roles. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Establish contracts before dependent UI work.
- P06-02: Review session/CSRF/RLS/Storage/Realtime/injection/SSRF/tenant export boundaries and fix findings before pilot access. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P06-03: Profile slow queries, source ingestion queue, reader/editor loading and AI first-token time Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P06-04: Provision redacted logs/traces/alerts and documented on-call/incident response Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P06-05: Perform DB plus Storage restore drill, data export/deletion and membership-revoke exercises in staging with recorded timings. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P06-06: Run consented pilot, measure hypothesized activation/retention/workflow metrics, triage accessibility feedback and publish go/no-go evidence. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
