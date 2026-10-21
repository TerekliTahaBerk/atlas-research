# Atlas master plan

Status: Phase 00 foundation. The product is an AI-native Research Operating System joining discovery, source management, notes, tasks, discussion, and evidence-grounded AI in one research context.

## Delivery policy

A modular monolith with one web application and four meaningful packages. Phase 00 ships interfaces and architecture, not business workflows. The preview is public and stores no research data. Do not add backend services to make a preview control appear functional. Future module plans are specifications, not claims of shipped capability.

| Phase | Outcome                                     | Release gate                                                         |
| ----- | ------------------------------------------- | -------------------------------------------------------------------- |
| 00    | Architecture, UI, developer infrastructure  | Local quality checks, validated schema, complete handover            |
| 01    | Identity, tenants, invitations, permissions | Two-tenant authorization and invitation abuse tests                  |
| 02    | Discovery, library, PDF reading             | Lawful ingestion, idempotent imports, private storage tests          |
| 03    | AI research                                 | Permission-scoped retrieval, verified provenance, quota tests        |
| 04    | Documents/tasks/artifact links              | Version/conflict recovery, typed links, secure search                |
| 05    | Communication                               | Server-authorized writes, private realtime delivery, reconnect tests |
| 06    | Beta                                        | Restore drill, security review, pilot workflow evidence              |
| 07    | Advanced OS                                 | Separately reviewed sandbox, billing, and enterprise boundaries      |

## Engineering sequence

Agree on the domain contract, then implement transactional services with tenant guards, route validation, UI states, and regression tests. Each milestone closes its measurable acceptance criteria and records risks before the next begins. Changes to hierarchy, permissions, data ownership, provider responsibilities, or deployment require an ADR. See [ROADMAP](ROADMAP.md) and [phase specifications](phases).

## Dependencies and ownership

Identity/membership services gate every later module. Library provenance gates grounded AI. Stable artifact IDs gate document/task/message connections. Beta validation gates external pilot use. University administration, notebooks, payment processing, manuscripts, experiments, and voice are Phase 07 discovery until requirements are narrowed. Product analytics targets are hypotheses, never fabricated results.
