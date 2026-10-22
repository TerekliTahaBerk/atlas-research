# Phase 02 implementation report

## 1. Executive summary

Atlas now has a working research workflow in live mode: real scholarly search through provider-neutral OpenAlex and Semantic Scholar adapters, saving to a project library with DOI/provider deduplication, collections, tags, reading status and archive, private PDF upload into quarantined Supabase Storage, a PDF.js reader for scanner-accepted versions with persisted, version-anchored highlights and notes, and BibTeX/RIS export. Everything is enforced by the Phase 01 boundary (verified session, non-owner runtime, RLS, transaction-local actor, one fixed-command mutation function) and verified end-to-end on disposable real services.

**Phase 02 is not complete.** Three external gates remain: the live provider APIs were unreachable from the development session (network policy), the hosted Atlas development project could not be reached or migrated from this session, and no production malware scanner is deployed (uploads therefore stay quarantined in real environments by design).

## 2. Commits

Starting commit: `37c9a300de4635b404901b1c79ee4231e1479a16` (master, Phase 01 merge). Branch: `claude/dreamy-ritchie-yz7lcg` (the session's designated branch; the requested name `feat/phase-02-research-library` was not used because this environment only permits pushing the designated branch). Final commit: recorded in the pull request; see section 20.

| Commit      | Unit                                                              |
| ----------- | ----------------------------------------------------------------- |
| `1191414`   | fix(auth): commit sign-in feedback before navigation (entry gate) |
| `e6ad968`   | fix(auth): key session-bound action quotas by the verified user   |
| `821c815`   | feat(research): contracts and provider adapters                   |
| `84caf58`   | feat(library): migration, RLS, commands, services, routes         |
| `ec6ef95`   | fix(research): one external PDF location per URL on merge         |
| `9ffce6c`   | feat(ui): live Research, Library and Reader                       |
| `d1b8a54`   | test(e2e): real Auth/PostgreSQL/Storage journey and CI harness    |
| docs commit | documentation and this report                                     |

## Entry gate (Phase 01 CI)

Master run [39798601663](https://github.com/TerekliTahaBerk/atlas-research/actions/runs/39798601663) failed `isolated-auth`: "Signed in. Opening your research" was expected, the live region was empty. Reproduced locally twice against the disposable harness. Root cause, two parts:

1. **UI defect:** `setFeedback` and `location.assign` ran in the same tick, so React could commit the announcement after navigation had started. Fixed with `flushSync` before navigating.
2. **Test observation defect:** Playwright cannot query the outgoing document while its held replacement is pending (even `page.evaluate` blocks), so the assertion added in `a47c743` had never passed in CI (runs 22 and 23 failed; 20/21 were cancelled). The journey now records the live region and disabled submit button from the Navigation API `navigate` event, i.e. at the exact moment navigation starts. The assertion is unchanged in meaning and stricter in timing.

Both the new component test and the browser assertion **fail on the old code** (`""` announced) and pass on the fix; the full Auth suite then passed 3/3 on three consecutive local runs, and GitHub [run 39803238601](https://github.com/TerekliTahaBerk/atlas-research/actions/runs/39803238601) at `e6ad968` passed **both** `quality` and `isolated-auth`. [Run 39807201956](https://github.com/TerekliTahaBerk/atlas-research/actions/runs/39807201956) at `84caf58` (library migration and services, including the 17 new integration tests) also passed both jobs. While reproducing, a second real defect appeared: email-less Auth actions shared one deployment-wide quota (10 sign-outs/15 minutes for every user). Logout/password update are now keyed by the verified user, with a regression test.

Hosted environment: the Supabase connector available in this session has no access to project `hgngonpirctrwbckhbmy` (permission denied; it lists only an unrelated project, which was not touched) and no hosted credentials exist in this container. Hosted verification is **BLOCKED** from here; nothing hosted was changed.

## 3. Implemented modules

- `packages/core/src/research.ts`, `citation.ts` — identity normalization, `NormalizedPaper`, search/library/annotation/upload contracts, research commands, BibTeX/RIS.
- `apps/web/src/features/discovery/server` — bounded provider HTTP, OpenAlex and Semantic Scholar adapters, orchestration, quotas, cursors, cache.
- `apps/web/src/features/library/server` — library reads, command execution with server-side provider re-fetch, Storage signing, uploads/finalize, scanner protocol, export and route dispatch.
- Live UI: `features/research/live-research.tsx`, `features/library/live-library.tsx`, `features/reader/live-reader.tsx` (+ `anchors.ts`, `pdf-engine.ts`), client adapters `features/library/client.ts`.
- `packages/ai` — typed `ResearchReference` for Phase 03 context.
- ADR [0014](../decisions/0014-research-library-boundary.md).

## 4. Database migrations

`20261023100000_research_library` (additive): 13 tables, 5 enums, composite tenant FKs, RLS read policies + deny-DML policies, immutability triggers, `mutate_research` behind the existing `mutate` dispatcher, scanner functions, conditional private buckets. Applied to fresh disposable PostgreSQL 17 and to the disposable Supabase Auth + Storage harness. Phase 01 foundation constraint script still passes. `prisma migrate diff` shows no table/column drift (only hand-written constraints, as in Phase 01). **Not applied to the hosted development project** (no access from this session; requires the documented approval and backup check).

## 5. Provider adapter architecture

See [provider adapters](../research/PROVIDER_ADAPTERS.md) and [search contracts](../research/SEARCH_CONTRACTS.md): one interface, Zod-validated subsets, fixed HTTPS hosts, no redirects, 4 MB/8 s caps, bounded retry with `Retry-After`, cancellation, explicit unsupported filters, DOI-only merging, honest partial/rate-limited/unavailable states, per-actor/organization/provider PostgreSQL quotas and a public-only 5-minute cache. Saves re-fetch metadata server-side.

## 6. OpenAlex integration status — BLOCKED (live), PASS (contract/fixture)

Adapter, filters, sort, pagination and key support are implemented and pass unit and browser tests against synthetic documented-shape fixtures. Live calls to `api.openalex.org` were refused by the session's egress policy, so the live smoke test is NOT RUN. The `raw_author_name.search` filter and field IDs follow the documentation but are not live-verified.

## 7. Semantic Scholar integration status — BLOCKED (live), PASS (contract/fixture)

Same as OpenAlex; `api.semanticscholar.org` was refused. Author filter and non-relevance sorts are explicitly reported as unsupported.

## 8. Library persistence — PASS (disposable)

Saves, concurrent DOI/provider deduplication, idempotent replay/payload conflict, cross-project associations without disclosure, private sources outside global metadata, collections, tags (normalized reuse), reading status with versions, archive/restore, signed pagination, search and export: 17 real-PostgreSQL integration tests plus the browser journey (persistence across reload).

## 9. Private PDF storage — PASS (disposable Supabase Storage), BLOCKED (hosted)

Private buckets, no browser object policies, unpredictable keys, `upsert=false` single-object upload grants, server-measured size/SHA-256/PDF signature, 15-minute actor-bound intents, 60-second re-authorized download grants. Verified against the real Supabase Storage API (v1.79.32) in the harness, including a direct Storage listing with the user's own Supabase token returning nothing. Hosted bucket creation awaits the hosted migration. See [PDF storage security](../library/PDF_STORAGE_SECURITY.md).

## 10. File validation and scanning — PARTIAL

Byte-level validation in the web process: PASS. Quarantine, outbox, leases, retry budget, checksum-bound acceptance and the HMAC protocol: PASS (integration + browser). **Production malware/structure scanning: BLOCKED — no approved isolated scanner exists.** The browser test supplies the verdict through the protocol and is labelled as a fixture; no scan is claimed. Real uploads remain quarantined until a scanner is deployed.

## 11. Reader — PASS (disposable)

PDF.js 6.3.289 legacy build (polyfills new JS built-ins such as `Map.prototype.getOrInsertComputed`, which the standard build requires and older Chromium lacks — found in testing) in a same-origin worker (`worker-src 'self'`). Checksum-verified in-memory bytes; page navigation, page count, zoom, fit width, keyboard, text layer, search, outline, page list, re-sign on expired grant, and states for no PDF / external link only / pending / quarantined / processing / rejected / failed / unauthorized / invalid / password / integrity / network.

## 12. Annotation and version anchoring — PASS (disposable)

Highlights, notes and page notes bound to an immutable `READY` source version with text-position, text-quote and normalized-rectangle selectors; precise/recovered/lost handling; project or author-only visibility; author-only edit/delete with versions; soft delete; immutability trigger. Verified by unit tests, integration ACL tests and the browser journey (persisted across reload with version/offset/rectangle checks). See [annotation anchors](../library/ANNOTATION_ANCHORS.md).

## 13. Citation export — PASS

BibTeX (escaping, Unicode, stable unique keys, omitted missing fields) and RIS, per paper and per project/collection; copy DOI and formatted reference. See [citation export](../library/CITATION_EXPORT.md).

## 14. Security / RLS verification — PASS (disposable)

Cross-tenant service and raw-SQL reads denied; raw DML denied; idempotency table unreadable; viewer cannot write; workspace administrator without a private-project grant sees nothing; revoked editor loses library, annotation and file access; private annotations author-only; unauthorized signed-URL issuance denied; unscanned files denied (409); upload replay/mismatch/expiry handled; overwrite prevented by `upsert=false`; malformed/truncated/non-PDF uploads rejected; scanner HMAC freshness/tamper checks; second real account receives 404 from every research endpoint and cannot save into the project. Runtime role checks unchanged.

## 15. Visual regression verification

The approved shell, drawers, spacing and tokens are reused; preview mode code is unchanged except new scoped reader CSS. Local preview suite: 95/101 passed; the six failures are the signature screenshots at 2–3 % pixel difference, run with this container's preinstalled Chromium 141 instead of CI's pinned browser (the Playwright download was blocked). Unmodified `master` built in a separate worktree fails the same six tests in this container with **identical** pixel counts (13,071 / 13,666 / 16,457 / 17,009 / 27,021 / 27,190), so the local differences are browser-environmental, not caused by this branch. No baseline was updated and no tolerance changed; CI's pinned browser is the authoritative comparison.

## 16. Test results (actual)

| Check                                                 | Result           | Notes                                                                                    |
| ----------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------- |
| Frozen install                                        | PASS             | Node 24.21.0, pnpm 11.25.0                                                               |
| Format / lint / typecheck                             | PASS             |                                                                                          |
| Unit tests                                            | PASS             | 118                                                                                      |
| Schema validation                                     | PASS             | Prisma 7.10.1                                                                            |
| Integration (real PostgreSQL 17, non-owner runtime)   | PASS             | 47 (30 Phase 01 + 17 Phase 02)                                                           |
| Foundation SQL constraints                            | PASS             |                                                                                          |
| Production build                                      | PASS             | worker emitted as a same-origin static asset                                             |
| Isolated Auth E2E (GoTrue/Mailpit/Storage/PostgreSQL) | PASS             | 4/4 (3 Phase 01 + research journey)                                                      |
| Preview design E2E (local Chromium 141)               | 95 PASS / 6 FAIL | signature screenshots only; identical failures on unmodified master locally (section 15) |
| CI quality / isolated-auth                            | see PR           |                                                                                          |
| Live provider smoke                                   | NOT RUN          | provider hosts blocked by session network policy                                         |
| Hosted development smoke / migration                  | BLOCKED          | no hosted access from this session                                                       |

## 17. Known issues

- PDF search navigates to the next page containing the term; it does not highlight individual matches.
- The page list shows page numbers, not rendered thumbnails.
- Anchor recovery is best effort and labelled; selection tests use programmatic DOM ranges, not pointer drags.
- Library search uses unindexed `ILIKE` over metadata (fine for project-sized libraries; revisit with growth).
- Research writes hold the hierarchy advisory lock in shared mode; contention with hierarchy writes is unmeasured.
- Quotas and budgets are conservative initial values that need capacity review.
- A development-only console message ("Router action dispatched before initialization") appeared once during the browser journey without failing it; the cause was not established.
- No CSL citation styles; no automatic merge review UI for uncertain matches.

## 18. External-service blockers

1. `api.openalex.org` / `api.semanticscholar.org` refused by this environment's network policy (add them under the environment's allowed domains to run the live smoke test).
2. Hosted Atlas development project not accessible from this session; migration, buckets and `ATLAS_STORAGE_SERVICE_KEY` configuration pending explicit approval and the documented backup check.
3. No approved production scanner deployment; uploads remain quarantined.
4. Docker Hub anonymous pull limits were hit locally; the Storage image was obtained from Google's Docker Hub mirror (CI pulls the same tag from Docker Hub).

## 19. Phase 03 readiness

Ready: immutable `source_versions` with checksums, page-scoped text anchors, the `ingestion_jobs` outbox for extraction kinds, the artifact registry, typed `ResearchReference` chips, and server-side re-authorization patterns. Not done (by design): text extraction, chunks, embeddings, retrieval or any AI generation.

## 20. PR and deployment status

Draft PR [TerekliTahaBerk/atlas-research#7](https://github.com/TerekliTahaBerk/atlas-research/pull/7) targets `master`. No merge, no deployment, no hosted migration were performed.
