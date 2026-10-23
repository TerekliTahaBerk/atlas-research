# Atlas master plan

## Phase 03 delivery state

Phase 03 local implementation is authorized independently of pending hosted Phase 02 activation. Official providers, isolated extraction/outbox, scoped hybrid retrieval, exact citations, persisted streaming conversations, quotas and the shared UI are implemented with deterministic verification. Real-provider scientific evaluation, hosted security/recovery/migrations and worker deployment remain release gates. See the [Phase 03 report](phases/PHASE_03_IMPLEMENTATION_REPORT.md) and [activation plan](phases/PHASE_03_ACTIVATION_PLAN.md). No Phase 04/05 write service is enabled.

## Phase 02 delivery state

Research discovery, project libraries, private PDF storage, the PDF reader, anchored annotations and citation export are implemented on the Phase 02 branch with disposable-environment evidence; see the [implementation report](phases/PHASE_02_IMPLEMENTATION_REPORT.md). Live provider access, hosted migration/Storage activation and a production malware scanner remain external gates, so Phase 02 is not declared complete.

## Phase 01 delivery state

Core platform implementation is present on `feat/phase-01-core-platform`: Supabase SSR, profile/onboarding drafts, idempotent personal environments, tenant/project management, hashed invitations, membership/owner guards, distributed SQL rate buckets and live UI adapters. See [the implementation report](phases/PHASE_01_IMPLEMENTATION_REPORT.md). Phase 01 remains behind its verification/release gates: hosted database/TLS/Prisma pooler checks pass; actual hosted signup/confirmation/onboarding and persisted-project logout/login pass; hosted recovery, Google/provider setup, deployed security and production invitation delivery remain unverified. Phase 02 is not implemented or approved by this change.

Status: Phase 01 core implementation, with release verification gates still open. The product is an AI-native Research Operating System joining discovery, source management, notes, tasks, discussion, and evidence-grounded AI in one research context.

## Delivery policy

A modular monolith with one web application and four meaningful packages. Phase 00 ships interfaces and architecture, not business workflows. The preview is public and stores no research data. Do not add backend services to make a preview control appear functional. Future module plans are specifications, not claims of shipped capability.

| Phase | Outcome                                       | Release gate                                                         |
| ----- | --------------------------------------------- | -------------------------------------------------------------------- |
| 00    | Architecture, UI, developer infrastructure    | Local quality checks, validated schema, complete handover            |
| 00.5  | Product-wide UI/UX and interaction foundation | Honest local demos, responsive/keyboard/axe QA, production build     |
| 01    | Identity, tenants, invitations, permissions   | Two-tenant authorization and invitation abuse tests                  |
| 02    | Discovery, library, PDF reading               | Lawful ingestion, idempotent imports, private storage tests          |
| 03    | AI research                                   | Permission-scoped retrieval, verified provenance, quota tests        |
| 04    | Documents/tasks/artifact links                | Version/conflict recovery, typed links, secure search                |
| 05    | Communication                                 | Server-authorized writes, private realtime delivery, reconnect tests |
| 06    | Beta                                          | Restore drill, security review, pilot workflow evidence              |
| 07    | Advanced OS                                   | Separately reviewed sandbox, billing, and enterprise boundaries      |

## Engineering sequence

Agree on the domain contract, then implement transactional services with tenant guards, route validation, UI states, and regression tests. Each milestone closes its measurable acceptance criteria and records risks before the next begins. Changes to hierarchy, permissions, data ownership, provider responsibilities, or deployment require an ADR. See [ROADMAP](ROADMAP.md) and [phase specifications](phases).

## Dependencies and ownership

Identity/membership services gate every later module. Library provenance gates grounded AI. Stable artifact IDs gate document/task/message connections. Beta validation gates external pilot use. University administration, notebooks, payment processing, manuscripts, experiments, and voice are Phase 07 discovery until requirements are narrowed. Product analytics targets are hypotheses, never fabricated results.

## Phase 00.5 UI foundation

[Phase 00.5](phases/PHASE_00_5.md) sits between foundation and real identity. It adds the shared shell, contextual AI presentation contracts, module layouts, local demonstrations and onboarding design. It does not change tenant hierarchy, schema, server policy or service ownership. [UX blueprint](UX_MASTER_BLUEPRINT.md), [screen map](SCREEN_MAP.md), [AI interaction spec](AI_INTERACTION_SPEC.md), and [interaction patterns](INTERACTION_PATTERNS.md) are the presentation contracts for later phases.
