# Phase 07 — Advanced research OS

Current repository capability classifications and hosted blockers: [A00 audit](A00_REPOSITORY_HARDENING_REPORT.md). This phase specification defines scope and acceptance requirements; historical checklists alone do not certify current activation.

Status: planned; not implemented

## 1. Objective

Deliver advanced research os as the phase outcome. Future manuscript editor, sandboxed LaTeX/Python notebooks, experiment/results, advanced collaborative editing, voice rooms, billing and enterprise administration as separately approved subprojects.

## 2. Dependencies

Beta release gates; explicit prioritization/subphase specification; execution, collaboration, payment and institution providers separately approved.

## 3. Exact scope

Future manuscript editor, sandboxed LaTeX/Python notebooks, experiment/results, advanced collaborative editing, voice rooms, billing and enterprise administration as separately approved subprojects.

## 4. Out of scope

Implementing all advanced areas in a single change; unisolated execution; institutional data access by default; compliance certification without evidence.

## 5. Detailed implementation tasks

1. Split into 07A manuscripts/LaTeX, 07B notebooks/experiments/results, 07C Yjs collaboration/voice, 07D billing/enterprise; each needs an ADR and measurable gates.
2. Design manuscript citation/version/export model; compile untrusted LaTeX only in isolated resource-limited infrastructure without host/network secrets.
3. Define notebook/session/protocol/run/result artifacts and capability-gated Python execution; quotas, filesystem/egress limits, cancellation and reproducibility.
4. Prototype Yjs persistence/checkpoints and offline conflict recovery against document versions; select voice provider with participant authorization/recording policy.
5. Design signed billing webhook/idempotency ledger/entitlements and institution delegated policy/audit/SSO requirements without automatic private-content grants.
6. Deliver only prioritized subphase after end-to-end security/load/recovery tests, export compatibility and operational cost review.

## 6. Proposed files and directories

features/{manuscripts,experiments,notebooks,collaboration,billing,administration}; packages/execution only if a real shared executor contract is needed; docs/phases/07A-07D before coding.

## 7. Data model changes

Manuscript/Revision, CompilationJob, Notebook/Cell/Run, Experiment/Protocol/Result, CollaborationCheckpoint, VoiceSession, Subscription/Entitlement/WebhookLedger and InstitutionPolicy only in approved subphases; extend Artifact kinds and links.

## 8. Required APIs

Compile/status/download; execute/cancel/results; collaboration sessions/checkpoints; voice grants; webhook billing/entitlements; delegated admin/policy/export. No endpoint exists yet.

## 9. UI states and workflows

Compile/execute queued/running/failed/cancelled/expired, resource-limit diagnostics, collaborative reconnect/conflict, voice consent, billing pending/failed, delegated access denied.

## 10. Security requirements

Execution VM/container isolation with CPU/memory/time/egress/FS limits, no host secrets; signed voice grants, billing signatures/replay defense, least privilege and data residency review.

## 11. Testing requirements

Sandbox escape/egress/resource abuse suites; scientific reproducibility; collaboration convergence and recovery; payment replay/failure reconciliation; enterprise policy/privacy matrix.

## 12. Acceptance criteria

- [ ] Every approved subphase has its own scope/ADR/security review before code.
- [ ] Untrusted execution cannot reach host secrets, filesystem or unauthorized network.
- [ ] Artifact/citation IDs remain stable through export and collaboration.
- [ ] Billing reconciliation is idempotent and entitlements fail safely.
- [ ] Institution admins gain no implicit private research access.

## 13. Definition of Done

Each acceptance criterion has recorded evidence; applicable unit/integration/E2E and quality checks pass; migration SQL is reviewed against an identified environment; docs/API/security/ADRs reflect behavior; no unresolved critical defects; actual NOT RUN checks and external blockers are explicit. No later-phase behavior is implied by completion.

## 14. Dependencies on later phases

No committed later phase. Scale-out/services are considered only if measured execution/voice requirements justify isolation beyond the modular monolith.

## 15. Risks and mitigation

Execution and enterprise work expand risk/cost drastically; separate trust boundaries, bounded pilots and individual release gates avoid premature commitments.

## 16. Suggested issue breakdown for coding agents

- P07-01: Split into 07A manuscripts/LaTeX, 07B notebooks/experiments/results, 07C Yjs collaboration/voice, 07D billing/enterprise Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Establish contracts before dependent UI work.
- P07-02: Design manuscript citation/version/export model Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P07-03: Define notebook/session/protocol/run/result artifacts and capability-gated Python execution Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P07-04: Prototype Yjs persistence/checkpoints and offline conflict recovery against document versions Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P07-05: Design signed billing webhook/idempotency ledger/entitlements and institution delegated policy/audit/SSO requirements without automatic private-content grants. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P07-06: Deliver only prioritized subphase after end-to-end security/load/recovery tests, export compatibility and operational cost review. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
