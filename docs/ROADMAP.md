# Roadmap

## A00 audit and A01 activation

See the [canonical capability/status matrix and A00 evidence](phases/A00_REPOSITORY_HARDENING_REPORT.md). Phase 01–04 implementations are integrated into `master`; hosted Phase 02–04 activation remains blocked by migration-history/browser privileges, recovery verification and worker/provider gates. PR #11 is reviewed separately and must not be auto-merged. A01 requires the explicit target, approvals and verification sequence in the A00 report before any hosted changes.

## Phase 04 implementation update

Phase 04 code and local verification are complete (documents, versions, tasks, links, search, AI proposals). Hosted activation remains gated; Phase 05 (communication) can build on stable artifact IDs and `mentioned_profile_ids`.

## Phase 03 implementation update

Phase 03 local code and deterministic testing proceed under explicit user authorization while hosted Phase 02 activation is pending. The AI engine uses the existing design and permissions. Hosted activation, real-provider scientific evaluation and worker operation remain separate gates; Phase 04 domain writes are now implemented locally. See the [current report](phases/PHASE_03_IMPLEMENTATION_REPORT.md).

Phase 00 delivers the foundation; Phase 00.5 adds the product-wide UI/UX foundation and explicit local interaction demonstrations. Phases 01–04 have local implementations; Phases 05–07 remain planned, with no calendar promises. Each phase gates the next through acceptance evidence and security review of new boundaries. See individual plans for exact tasks and issue breakdowns.

0.5. UI/UX master foundation: semantic V2 themes, responsive navigation, contextual AI presentation and pickers, coherent module screens, auth/onboarding previews, visual/interaction QA. No backend services. See [delivery plan](phases/PHASE_00_5.md).

1. Core platform: identity, personal organizations, workspace/project CRUD, invitations, permissions.
2. Research discovery/library: provider adapters, normalization, lawful private files, reading and annotations. Integrated into `master`; live providers, hosted activation and a production scanner remain gates (see the Phase 02 report).
3. AI research: extraction/chunks/embeddings, permission-scoped RAG, citation verification and usage ledger.
4. Documents/tasks: versioned notes, assignments, typed artifact links and authorized search.
5. Communication: channels, durable messages, private realtime, mentions/reactions/notifications.
6. Beta: integrated workflows, security/performance/restore review, onboarding and pilot evidence.
7. Advanced OS: manuscripts, sandboxed LaTeX/Python, experiments, collaboration, voice, billing and enterprise policy. Break this phase into separately approved subprojects before implementation.

No later phase should bypass Phase 01 tenant guards. AI depends on stable Phase 02 source provenance; contextual AI in messages depends on Phase 03 and Phase 05 access boundaries. Artifact registry design is agreed now and introduced with the first linking use case; no separate graph store. Capacity and scaling decisions follow telemetry rather than speculative infrastructure.
