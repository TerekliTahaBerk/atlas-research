# ADR 0016: bounded research inference inside the modular monolith

Status: accepted for Phase 03 local implementation; hosted activation remains gated.

Use the existing server/domain/Prisma authorization boundary and one Atlas conversation engine across placements. Official OpenAI/Anthropic SDKs execute schema-constrained generation; models receive authorized evidence and no executable tools. Read-only retrieval is a fixed audited server tool. Provider/model/prices are server configuration, with no implicit fallback.

Consolidate the two persisted messages of a run into `ai_runs.prompt/answer` rather than adding a second message table with duplicate lifecycle state. Consolidate a reservation and its settlement in one unique `ai_usage` row; retain uncertain costs conservatively. Store one immutable embedding alongside its chunk; a provider/model/revision/dimension key separates reindexing. Relational citations additionally bind run, paper, immutable source and chunk. These are appropriately scoped versions of the planned message/run/reservation/embedding/citation entities, not a separate AI application.

Exact pgvector distance runs over materialized authorized project candidates, with GIN keywords and bounded context. This deliberately avoids unfiltered global ANN search. Revisit an ANN index only after project corpus benchmarks and a tenant-preserving plan. Revisit separate message/embedding tables when multi-assistant branches, multiple embeddings per extraction, or independent message editing become concrete requirements.

Use a leased SQL outbox and a separate narrowly granted extraction worker role. A secret-free offline parser follows the established scanner isolation pattern. Hosted security/recovery approval and worker deployment are separate from local code delivery. Real-provider scientific quality remains an explicit evaluation gate; location verification never certifies scientific support.
