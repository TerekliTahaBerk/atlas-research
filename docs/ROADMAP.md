# Atlas roadmap

Status: Phase 04 implementation is squash merged ([PR #37](https://github.com/TerekliTahaBerk/atlas-research/pull/37)) and deployed as `91a78f9` to the existing Atlas Coolify app. Paid model calls are prohibited, the live daily budget is undecided, and the provider gate remains disabled. Real-model G04 is OPEN; [current release evidence](PHASE_04_HANDOFF.md). Phase 00–03 evidence remains in the earlier handoffs. Comprehensive G01/G02/G03, real email and independent backup/restore remain [before the Phase 05 beta](BETA_REVIEW_BACKLOG.md); they are not marked complete. Phase 05 has not started.

## Product

A connected research workspace for individual researchers and small teams of 2–10. Personal accounts do not require university affiliation.

Beta workflow: create a project → discover/add sources → read/annotate → create source-linked notes/documents → assign tasks → discuss → ask evidence-grounded AI.

Stable links must preserve the relationships between sources, annotations, documents, tasks, discussions and AI citations.

## Phases

| Phase | Outcome | Acceptance gate |
| --- | --- | --- |
| 00 | Product definition, prototype audit, flows, screen map, data model and architecture decisions | One complete example research journey is mapped through the supplied design; beta scope and future work are explicit |
| 01 | Real identity, personal/shared workspaces, projects, invitations, authorization and first Coolify deployment | Two researchers can collaborate and two unrelated teams cannot read each other's data |
| 02 | Discovery, source library, private PDFs, reader, anchored notes/highlights and reference export | Real source/read/annotate journey persists across sessions |
| 03 | Math-capable documents, source citations, recoverable saving/versioning, tasks, discussions, basic notifications and links | A source note becomes a document, assigned task and discussion without losing context |
| 04 | Source-grounded AI, clickable provenance, reviewed draft proposals and usage limits | Real-paper evaluation covers citation location, support, access denial and insufficient evidence |
| 05 | Closed beta, pilot support, recovery drill, reliability and feedback | Pilot users complete real work without critical access, data-loss or blocking defects |

Phase 05 is the closed-beta release boundary. Pilot hypothesis: 5–10 researchers and at least two small teams; validate this with actual recruitment.

## Beta boundary

Include basic academic discovery, DOI/link/manual metadata/PDF addition, source collections/tags/reading status, PDF reading and annotations, math-capable documents, references/export, basic tasks and project discussion, simple notifications, scoped AI and artifact links.

Defer native LaTeX compilation, executable notebooks/Python, university SSO/administration, voice/video, autonomous agents, advanced semantic maps/graph visualization, comprehensive chat and advanced Zotero synchronization.

Mathematical notation is in beta; LaTeX compilation is not. Simple links are in beta; an advanced graph interface is not.

## After beta

1. Fix measured usability/reliability issues before adding modules.
2. Research/writing 1.0: co-editing, advanced bibliography, Zotero interoperability, manuscript workflows.
3. LaTeX 1.1: files/editor, safe compilation, previews/templates.
4. Experiments 1.2: isolated notebooks, datasets/output linkage and experiment records.
5. Platform 2.0: validated advanced maps, controlled agents and institution/lab capabilities.

Dates and effort are not commitments. Every phase needs concrete acceptance evidence; local code completion alone does not establish release readiness.
