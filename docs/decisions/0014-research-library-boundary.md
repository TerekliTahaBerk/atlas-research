# ADR 0014: Research library data, file and scanning boundary

Status: accepted for Phase 02 implementation; hosted activation pending.

## Context

Phase 02 adds the first research data: public bibliographic metadata shared across tenants, private project libraries, user-supplied PDFs and anchored annotations. It must keep the Phase 01 guarantees (non-owner runtime, RLS, transaction-local actor, fixed-command mutations), avoid leaking one tenant's saves through shared metadata, and never expose an unvalidated file.

## Decision

1. **Split public identity from private association.** `research_papers`/`paper_external_identifiers` hold only provider metadata and identifiers; `project_papers` holds everything project-specific (snapshot, status, files, notes). Public rows are readable only through an association the actor can read.
2. **Extend the single command boundary.** `atlas_private.mutate` dispatches research command names to `mutate_research` (security definer, fixed search path, no dynamic SQL, actor from transaction context). It takes the hierarchy lock in _shared_ mode so research writes run concurrently but never interleave with revocations, uses advisory locks per identity key for deduplication, and records actor-scoped idempotency results with payload hashes.
3. **Server-owned provider data.** `paper.save` accepts only a provider identity; the server re-fetches and normalizes metadata.
4. **Private Storage with no browser policies.** Two private buckets; the server (holding the Storage service credential) signs single-object upload and 60-second download grants after Atlas authorization. Storage RLS policies would have to duplicate Atlas capability logic in a second policy system; with no policies, browser roles have no object access at all.
5. **Quarantine until an isolated verdict.** The web process verifies only bytes (size, SHA-256, PDF header/trailer). Malware/structure scanning is delegated to an external worker over an HMAC-authenticated claim/complete protocol backed by a transactional outbox with leases and bounded retries. `READY` requires a scan completion and an accepted object key bound to the exact project/version (constraint + trigger).
6. **Immutable source versions and anchors.** New files create new versions; annotations bind to one version with text-position, text-quote and normalized-rectangle selectors.
7. **Minimal artifact registry.** `artifacts` (kind `PAPER`) gives each project paper a stable ID for later typed links (ADR 0009); no other artifact kinds are created.

## Alternatives considered

Storage RLS policies keyed on object paths (duplicates authorization; path guessing becomes a security surface); parsing/scanning PDFs inside the web process (untrusted parser in the privileged runtime); trusting client-supplied paper metadata (lets editors plant fake public records); a separate REST mutation surface (two competing systems); Inngest for scanning now (no approved worker yet; the outbox keeps the contract without new infrastructure).

## Consequences

Uploaded PDFs remain unreadable in any environment without an approved scanner deployment. The server holds a Storage service credential that must be environment-scoped and rotated like the database runtime credential. Signed URLs are bearer capabilities for up to 60 seconds and cannot be revoked early. Annotation recovery is best effort and labelled.

## Revisit conditions

An approved isolated scanner is chosen (implement its worker against this protocol); Phase 03 extraction adds outbox kinds and chunk tables; measured contention on the shared hierarchy lock; a need for collaborative or realtime annotation.
