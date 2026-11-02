# A03 — Research interoperability report

Evidence date: **2 November 2026**. Base: `master` at `c26096b` (A02 and A02 post-merge hardening merged). Scope: code and local disposable verification. **A03 CODE COMPLETE ≠ HOSTED READY**: the new migration is local only, and hosted use depends on the A01 gates. No hosted migration, paid service, AI activation, worker deployment or live private Zotero content was used.

## 1. Supported formats

| Format                     | Import                                                                                                                                                                          | Export                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| BibTeX / BibLaTeX (`.bib`) | Multiple entries, `@string` macros + `#`, braced/quoted/multiline values, Unicode and LaTeX accent decoding, duplicate keys, malformed-entry recovery, unsupported-field report | Existing exporter extended with volume, number, pages, publisher, exact entry type and an `atlasid` marker; unchanged output for existing entries |
| RIS (`.ris`)               | Multiple records, continuation lines, missing `ER` recovery, SP/EP ranges, SN classified as ISSN/ISBN                                                                           | Existing exporter extended likewise (`ID  - atlas:<id>`)                                                                                          |
| CSL JSON (`.json`)         | Arrays or single items through the same pipeline                                                                                                                                | New, stable 2-space JSON, `application/vnd.citationstyles.csl+json`                                                                               |
| Zotero Web API v3          | Read-only: personal + permitted group libraries, collections, paginated top-level items, selected items                                                                         | Not in A03 (no write-back)                                                                                                                        |

Export targets: one paper, the project or a collection, selected papers (`ids`), and a note's cited papers (`documentId`). Field mappings: [reference interchange](../research/REFERENCE_INTERCHANGE.md).

## 2. Metadata interchange contract

`ReferenceRecord` (`packages/core/src/interchange.ts`) holds type (journal article, conference paper, book, book chapter, thesis, report, preprint, dataset, web page, other + `originalType`), title, authors/editors (`family`/`given` or `literal`), DOI (shared `normalizeDoi`, moved to `doi.ts`), issued date, container, volume, issue, pages, publisher, ISSN/ISBN, abstract, language, keywords, http(s) URL. Provenance (source, key, index, library/file SHA-256, version, `atlas:` marker) is separate from the record and is never authorization. Missing values stay missing; invalid DOIs, years and non-http URLs are dropped with a stated reason.

## 3. Zotero integration design

User-created read-only API key (OAuth 1.0a requires an Atlas application registration with Zotero, which does not exist). The key travels only in `Zotero-API-Key` with `Zotero-API-Version: 3`, GET only, one configured host, redirects refused, 10 s timeout, cancellation via the request signal, at most three attempts with bounded backoff, `Retry-After`/`Backoff` honoured up to 5 s and otherwise reported as `RATE_LIMITED`; 401/403 → reconnect message, 404 → unavailable. Paging uses `limit`/`start`/`Total-Results`; incremental reads use `since` with `Last-Modified-Version`. No background polling. Selected items (≤50 per preview via `itemKey`) are mapped to records and classified like files. Items missing from the response are reported as deleted/inaccessible upstream; Atlas papers are never removed.

**Live verification: BLOCKED.** This session's network policy blocks `www.zotero.org`/`api.zotero.org`, and no authorized Zotero account or key exists. The adapter follows the documented v3 contract and is exercised end to end by `tests/fixtures/zotero.mjs`; endpoint/field assumptions must be confirmed against a real read-only key before hosted activation.

## 4. Authentication and credential security

`external_connections` stores only `v1.<iv>.<ciphertext>.<tag>` (AES-256-GCM, server key `ATLAS_INTEGRATION_KEY`, owner profile ID + provider as AAD) and a validated access summary (permitted libraries). RLS shows a row to its owner only; browser roles have no table access; writes go through `zotero.connect`/`zotero.disconnect` SQL commands. Write-capable keys are refused. Status responses never include the key. Disconnect clears the ciphertext (a CHECK forbids a revoked row with a credential); users must also revoke the key in Zotero. A rotated server key or a tampered/foreign envelope fails closed ("reconnect").

## 5. Deduplication strategy

Within the target project only: (1) an existing import mapping, (2) an `atlas:<id>` marker for a paper of **this** project, (3) the normalized DOI (verified paper or private reference). Title + year + first-author similarity yields `POSSIBLE_DUPLICATE` for review and never merges; different DOIs are never similar. Matches are never overwritten. Archived papers are reported, never restored. The global verified catalog is neither consulted nor written: linking an imported DOI to it would reveal another tenant's saves (`can_read_paper` invariant), so every new record is a project-private reference.

## 6. External identity mapping

`reference_import_links(project, source, library, item_key) → project_paper` with item version and record hash, same-project composite FK. Files use their SHA-256 as library and citation key (or position for missing/duplicate keys); Zotero uses `users/<id>`/`groups/<id>` and the item key. The same Zotero item in two projects maps to two independent papers. A newer Zotero version is shown as `UPDATE_AVAILABLE` and applied only when the user selects it, only to an imported private reference, never rewinding to an older version. Direction is Zotero → Atlas, user-approved import only.

## 7. Bibliography and citation precision

Imported papers are ordinary project papers and can be cited (paper-level) in notes; citation quotes/pages still come only from verified annotations or chunks. Bibliographic `pages` is the work's page range and is never a PDF locator. Bibliography exports contain bibliographic metadata only — never annotation text, quotes or private notes. A bibliographic citation is not evidence that a PDF was read.

## 8. Attachments and licensing

Metadata only. Zotero attachments and notes are excluded (`itemType` filter and mapping), never downloaded, never marked READY, and no imported URL is fetched or trusted as a document. Any future attachment flow must use the existing upload → quarantine → scan → provenance path and remains blocked until A01 G4.

## 9. Tests (local, disposable)

| Check                                           | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| format / lint / typecheck / db:validate / build | see PR                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Unit                                            | parsers, bounds, hostile input, LaTeX inertness, round trips, unchanged legacy exports, credential envelope, import dialog confirm/retry (StrictMode)                                                                                                                                                                                                                                                                                                                                                                                                      |
| Integration (PG17 + pgvector)                   | `reference-interop.test.ts` (10: preview, idempotent import/replay, DOI + title review, cite → export → reimport in all formats, viewer/outsider/cross-project denial, catalog non-disclosure, hostile metadata, bounds, archived, concurrent duplicate import, explicit update/version rules, browser-role denial) and `zotero.test.ts` (6: write/invalid keys, encrypted owner-only storage, header-only key, groups, paging, `since`, shared-pipeline import, update/deletion review, no member sharing, 429/timeout/404/abort, revocation, disconnect) |
| Auth E2E                                        | `reference-interop.spec.ts`: UI BibTeX import → reimport → cite → note CSL bibliography download → reimport; Zotero fixture connect/refuse/preview/import/disconnect; axe on the dialog                                                                                                                                                                                                                                                                                                                                                                    |

Final local and CI results are recorded in the PR.

## 10. Known limitations

- No Crossref/OpenAlex DOI enrichment of imported records; imported metadata is labelled "not provider-verified".
- A paper later saved from search with the same DOI as an imported private reference becomes a second (verified) project paper; the import preview detects the reverse case.
- No collection-membership import, no Zotero write-back, no OAuth, no attachment import, no citation-style rendering engine.
- Live Zotero behaviour is fixture-verified only (§3).

## 11. Hosted activation dependencies

The additive migration needs the A01 G3 process (fresh approval of the changed batch). `ATLAS_INTEGRATION_KEY` must be provisioned in a secret store (G4); a hosted Zotero host allowlist and a real read-only key test are required. No other gate is affected.

## 12. A04 entry criteria

1. A03 PR merged with green quality, isolated-auth and offline-engines.
2. Live Zotero verification with an authorized read-only key on a development target.
3. Decision on DOI enrichment provider and on linking imported references to verified catalog records without cross-tenant disclosure.
4. Key-rotation procedure for `ATLAS_INTEGRATION_KEY` documented and rehearsed.
