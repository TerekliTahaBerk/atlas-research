# Paper identity, normalization and deduplication

## DOI normalization (`normalizeDoi`)

Input is NFKC-normalized and trimmed; `doi:` and `http(s)://(dx.)doi.org/` prefixes are removed; valid percent-encoding is decoded (invalid sequences reject the value); the result is lowercased and must match `10.<4–9 digits>/<non-space>` within 300 characters. This validates syntax only. It never confirms that a DOI is registered or that it belongs to a given work.

Provider IDs are validated per provider: OpenAlex `W<digits>` (canonical URL accepted) and Semantic Scholar 40-hex `paperId`.

## Deduplication hierarchy

1. Identical normalized DOI → one `research_papers` row.
2. Stable provider ID (`paper_external_identifiers`, unique `(provider, external_id)`) → the existing row.
3. Anything else (similar titles/authors) stays separate. Merging uncertain candidates is a human-review task, never automatic.

When a provider ID already points to a paper with a _different_ DOI, the save fails with `CONFLICT` for review rather than merging. An identifier already bound to another paper is not moved.

## Concurrency and idempotency

`mutate_research('paper.save')` takes transaction advisory locks on every identity key (DOI and provider IDs, sorted), so concurrent saves of one work from any project resolve to one global row; `UNIQUE(project_id, paper_id)` keeps one association per project. Saves of an archived association restore it to `TO_READ`. Idempotency keys are scoped to the actor (`research_command_keys`); the stored request hash covers every field except the key, so a replay returns the original result and a changed payload returns `CONFLICT`.

## Cross-project privacy

A public paper may be associated with many projects. `research_papers` rows are readable only through an association the actor can currently read, so deduplication never reveals that another tenant saved a paper, and a project's metadata snapshot, tags, notes and files never leave its own rows. Private uploads without verified public metadata (`paper.create`) keep their title only in `project_papers.private_title`.
