# Phase 00 — Foundation

Status: implemented foundation; validation evidence in HANDOVER.md

## 1. Objective

Deliver foundation as the phase outcome. Architecture, product requirements, domain/AI contracts, minimal tenant schema, reusable UI, preview routes, developer tooling, CI and handover.

## 2. Dependencies

Empty independent Atlas repository; Node 24 LTS and pnpm; no external accounts required.

## 3. Exact scope

Architecture, product requirements, domain/AI contracts, minimal tenant schema, reusable UI, preview routes, developer tooling, CI and handover.

## 4. Out of scope

Production authentication; any live research, AI, editing, task, message, ingestion, execution or billing business logic.

## 5. Detailed implementation tasks

1. Initialize pnpm workspaces and exact stable dependencies; verify install and all package exports.
2. Write PRD, architecture diagrams, relational model, API/security/AI contracts and concrete ADRs.
3. Generate design concept and implement semantic light/dark tokens and accessible Radix components.
4. Build public entry, responsive shell, sample overview, planned-module empty states, error/loading and 404 recovery.
5. Validate Prisma, generate migration, enable default-deny RLS and test in an isolated database where available.
6. Create meaningful unit/component/browser/constraint tests and required CI; record real results and external blockers.

## 6. Proposed files and directories

apps/web/src/{app,components,features,lib,styles}; packages/{ui,core,database,ai}; tests; .github/workflows; docs; AGENTS.md; CLAUDE.md.

## 7. Data model changes

Seven foundation models only: Profile, Organization, OrganizationMembership, Workspace, WorkspaceMembership, Project, ProjectMembership. Composite scope FKs; no future-domain tables.

## 8. Required APIs

No product endpoints. Core request/error/pagination schemas and AI interfaces only. Future /api/v1 contracts documented.

## 9. UI states and workflows

Public entry → sample workspace; navigation → explicit future empty states; theme menu light/dark/system; Cmd/Ctrl+K navigation; mobile dialog; error retry and 404 recovery.

## 10. Security requirements

No external calls or private data, secret-free preview, validated optional environment, tenant constraints and deny-by-default non-owner SQL baseline.

## 11. Testing requirements

Lint/typecheck/unit/build/Prisma/format checks; Playwright routes/themes/mobile/keyboard/axe; isolated SQL constraints and RLS tests.

## 12. Acceptance criteria

- [ ] A clean frozen install and documented dev startup work without secrets.
- [ ] All required local checks pass, with actual execution evidence.
- [ ] Every phase has all sixteen planning sections and ADRs record real decisions.
- [ ] Initial migration validates and status is explicit; no unrelated DB touched.
- [ ] All preview content is labelled and future controls do not fake persistence.

## 13. Definition of Done

Each acceptance criterion has recorded evidence; applicable unit/integration/E2E and quality checks pass; migration SQL is reviewed against an identified environment; docs/API/security/ADRs reflect behavior; no unresolved critical defects; actual NOT RUN checks and external blockers are explicit. See HANDOVER.md for completed Phase 00 status; this plan checklist is a specification, not execution evidence.

## 14. Dependencies on later phases

No later-phase work required to complete local foundation. Remote preview deployment depends on verified Vercel identity.

## 15. Risks and mitigation

Overbuilding can conceal missing authorization; keep preview and service plans explicit. Dependency release churn is managed by exact pins and lockfile.

## 16. Suggested issue breakdown for coding agents

- P00-01: Initialize pnpm workspaces and exact stable dependencies Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Establish contracts before dependent UI work.
- P00-02: Write PRD, architecture diagrams, relational model, API/security/AI contracts and concrete ADRs. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P00-03: Generate design concept and implement semantic light/dark tokens and accessible Radix components. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P00-04: Build public entry, responsive shell, sample overview, planned-module empty states, error/loading and 404 recovery. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P00-05: Validate Prisma, generate migration, enable default-deny RLS and test in an isolated database where available. Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
- P00-06: Create meaningful unit/component/browser/constraint tests and required CI Acceptance: implement the corresponding task above with its failure paths, tests, documentation and phase gate evidence. Depends on the preceding issue where a contract or schema is needed.
