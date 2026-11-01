# A02 — Connected research journey report

Evidence date: **1 November 2026**. Scope: code and local disposable verification only. **A02 CODE COMPLETE ≠ A02 HOSTED READY**: hosted activation remains gated by A01 G1–G7. No hosted migration, Auth/Storage setting, worker/scanner deployment, paid AI provider or real user data was touched.

Base: `master` at `48e708f` (PR #16 merged). No concurrent A01 branch or open PR was present at preflight; no A01 manifest, operational script or historical report was modified.

## 1. Initial journey audit

| Transition                   | Working before A02                                                                                | Gap found                                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Research → Library           | Provider search, DOI/provenance merge, `paper.save` with server dedupe (`existing`), “Saved” link | Search state lost on any navigation (re-query of rate-limited providers); each retry used a new idempotency key; “Open library” forced a full page reload                                     |
| Library → Reader             | Open PDF/Reader links; authorized, checksum-verified download                                     | Library deep link (`?paper=`) silently showed nothing when the paper was not on the loaded page/filter                                                                                        |
| Reader → Atlas AI            | Selection chip with `selection` reference; ambient paper/version context                          | No Ask Atlas from a saved annotation; annotation-only context retrieved **no** indexed text (`AND false`); Details tab still said “AI arrives in Phase 03”; no indexed-vs-metadata disclosure |
| Reader → Documents           | Editor `/citation` picker could cite highlights while _inside_ a note                             | No way to send a highlight/annotation/page from the Reader into a note; no new-note path                                                                                                      |
| Atlas AI → Documents         | Approved `document.insert` proposals with hash, revision and run checks                           | Only available when a document chip was in context; inserted AI text was indistinguishable from user text                                                                                     |
| Documents → Tasks            | Manual “Track a task” link in the Links rail; `task.create` already accepts `references`          | No create-task action; `DocUi.openTask` was a **no-op placeholder** (`() => {}`)                                                                                                              |
| Tasks → Papers/Documents     | Task detail lists typed links with hrefs                                                          | Task deep link (`?task=`) failed for tasks outside the loaded page or filter                                                                                                                  |
| Documents/Tasks → Graph      | Bounded authorized projection of all link types                                                   | Nothing missing; verified with the new relationships                                                                                                                                          |
| Citation → original PDF page | Located citations opened `reader?paper&source&page`                                               | Version-only citations opened the library; the annotation was not focused; if the cited version was no longer READY the Reader silently showed another version                                |

Existing tests covered each module independently (91/98 integration, 248 unit, 11 auth journeys); no test exercised the cross-module journey.

## 2–3. Confirmed gaps and implemented interactions

1. **Reader → research note** (`document.cite-source`, `SourceNoteDialog`): from a text selection (saved first as a highlight — only stored anchors are citable), an annotation card, the notes panel (“Add source to research note”) or the Details tab. Choose an existing note (search, shows its revision) or a new research note; optional commentary; explicit confirmation; success state with **Open note**.
2. **Ask Atlas about this source**: annotation cards send an exact `annotation` reference; Details sends paper + accepted version. Retrieval now scopes an annotation to its own version/page. The Reader states whether the open version is indexed or Atlas would answer from metadata only.
3. **AI finding → note**: **Add to note…** outside documents (pick or explicitly create the destination), then the unchanged preview/Accept flow. Every AI insert starts with an attribution line marking generated interpretation.
4. **Note → task**: **Create research task** (document toolbar, selection bubble menu, `/` menu) with editable prefilled title, description, milestone, eligible assignee, explicit paper selection and an optional task reference in the note.
5. **Traceability**: paper panel “Linked research” (citing notes, referencing tasks); library/task deep links resolve items outside the loaded page with truthful unavailable/retry states; citation chips open the exact version, page and annotation; cited-version-missing notice; `openTask` placeholder wired.
6. **Research continuity**: last search held in tab memory (actor+project bound; never URL or storage); stable per-paper save key across retries; client-side library navigation.

## 4–5. Reused contracts and the one new command

Reused unchanged: `document.save`/`document.create` (immutable revisions, replay, SQL `document_references` provenance checks), `task.create` with `references` (atomic `TASK RELATES_TO DOCUMENT` / `TASK REFERENCES PAPER`), content links (`DOCUMENT CITES PAPER`, `DOCUMENT TRACKS TASK`), `artifact.links`, `projectGraph`, `resolveArtifacts`, AI `ResearchReference` + `ai_references_visible`, proposals, `GET projects/:id/milestones|participants`.

**New:** `document.cite-source` (TypeScript orchestration only — no migration, no SQL function, no schema change). Contract and evidence rules: [citations § Reader to note](../documents/CITATIONS_AND_REFERENCES.md#reader-to-note-a02), [API contracts](../API_CONTRACTS.md). Pure builders: `packages/core/src/research-journey.ts`. No new table: every invariant was supportable by existing rows and SQL checks.

## 6. Citation and evidence integrity

- Client sends IDs only; schema rejects quote/page/label/checksum. Server derives page/quote/offsets from the annotation anchor and `sourceChecksum` from the READY version row; SQL re-verifies them on commit.
- Precision is stated, never upgraded: quote → page note → version (no page) → paper. A page with no highlight/page note is not recorded; the dialog explains how to pin one. Over-long highlights are refused, not truncated.
- Version identity survives newer uploads (citation keeps `sourceVersionId`; Reader reopens it or says it is gone).
- Quotation, AI interpretation (attribution line) and user commentary are separate blocks. A citation is not treated as proof of a claim.

## 7. Multi-user security guarantees

Server-side actor; `project.write` re-checked first; paper/version/annotation read under RLS within the project; other people's private annotations and foreign IDs are `NOT_FOUND`; one's own private annotation needs explicit `sharePrivateAnnotation`; target note must be in the same project and editable; revoked members cannot replay; viewers/outsiders get `NOT_FOUND`; cross-project task references fail in SQL. AI annotation scope re-reads the anchor under RLS. UI gating is convenience only.

## 8. Failure and recovery

| Case                                   | Behavior                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| Duplicate/lost save or insert response | Same request ID/idempotency key → committed result (`replayed`), no duplicate note/task/paper |
| Note changed (version conflict)        | `CONFLICT`, nothing merged; dialog re-reads the revision and requires reconfirmation          |
| Dirty editor open on the target note   | Never written to; its autosave reports the existing conflict and keeps the draft              |
| Source archived / annotation deleted   | `CONFLICT` / `NOT_FOUND`; nothing written                                                     |
| AI index unavailable                   | Disclosed in Reader; deleted annotation context fails closed                                  |
| Task ref autosave fails after creation | Task already linked atomically; editor shows the unsaved edit (documented partial state)      |
| Rapid project switch / navigation      | Dialogs keyed per evidence; unmounted continuations ignored; search memory is project-bound   |

## 9. Accessibility and UX

Existing neutral/indigo components only (`Modal`, `Btn`, `IconBtn`); no navigation or design-system change. Named dialogs and buttons, labelled fields/radios, `role=alert` errors, `aria-busy`, polite status, keyboard-operable lists, focus return from `ModalContent`. Success notifications appear only after server confirmation. Axe check of the open dialog is part of the browser journey.

## 10. Automated test results (local, disposable)

| Check                                   | Result   | Evidence                                                                                                                       |
| --------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`        | PASS     | Node 24.21.0, pnpm 11.25.0                                                                                                     |
| `format:check`, `lint`, `typecheck`     | PASS     |                                                                                                                                |
| `db:validate`                           | PASS     | Schema unchanged                                                                                                               |
| `pnpm test`                             | PASS     | 260 tests / 21 files (7 new: builder, contract, dialog confirm/replay/consent/conflict)                                        |
| `pnpm test:integration` (PG17+pgvector) | PASS     | 111/111 on `pgvector/pgvector:0.8.7-pg17` (CI image): 13 new A02 journey tests + extended AI annotation scope + AI attribution |
| Repeat deploy + A01 history gate        | PASS     | Same disposable PG17                                                                                                           |
| `pnpm build`                            | PASS     |                                                                                                                                |
| `pnpm test:e2e` (preview)               | SEE §10a | 95/101; 6 signature screenshots differ locally                                                                                 |
| `pnpm test:auth:e2e`                    | SEE §10b | Local GoTrue/Storage/Mailpit harness from `tests/auth/compose.yml`                                                             |
| GitHub Actions                          | SEE PR   | Recorded in the PR                                                                                                             |

Journey A (server + browser): search → save → upload/scan → reader → highlight → new note with quotation → reload → task linked to note + paper → task chip → task → note → citation → reader page 2 + annotation → paper linked research → graph edges. Journey B: viewer, outsider, other member's/own private annotation, cross-project paper/note/task, revoked replay, outsider search. Journey C: duplicate/lost responses, conflicts, newer version, long quote, deleted annotation, unready version, archived paper/note, deleted AI annotation context.

## 11. Known limitations

- A page without a highlight or page note can only be cited at version level (by design: no unverifiable page).
- Search memory is per tab and lost on reload (by policy: no stored prompts).
- Creating a new note from the AI picker happens before the proposal preview (explicit title confirmation); a discarded preview leaves that empty note.
- The optional task reference in a note is a separate autosaved edit; task and links are atomic, the in-text reference is not.
- Indexing disclosure reads the latest 50 project jobs.
- Human screen-reader and non-Chromium certification NOT RUN.

## 12. A01 activation dependencies

Hosted use of A02 requires the A01 gates unchanged: G1 history ACL denial, G2 recovery, G3 migration preflight (A02 adds **no** migration), G4 scanner/extractor/worker deployment (Reader evidence needs READY versions; AI annotation scope needs indexed chunks), G5 synthetic hosted workflow, G6 paid-provider approval, G7 operations. Nothing in A02 depends on Phase 02–04 hosted activation having completed.

## 13. A03 research-interoperability entry criteria

1. A02 PR merged with green CI (quality + isolated-auth).
2. Stable typed IDs for paper/version/annotation/document/task remain the only link identity (no title keys) — export/import formats must carry them.
3. Citation precision levels (quote/page/version/paper) mapped to external formats (CSL/BibTeX/RIS) without inventing locators.
4. Private-annotation consent rule preserved by any export.
5. A01 G1–G3 closed before any hosted interoperability write.
