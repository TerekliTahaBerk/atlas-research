# A02 post-merge hardening report

Evidence date: **1 November 2026**. Base: `master` at `0837835` (PR #17 merged). Scope: local code and disposable verification only. No hosted Supabase, migration, Auth/Storage setting, worker, paid AI or A01 artifact was touched. **No migration was added.**

## 1. Reproduced defects

| #   | Defect                                                                                                                                                                                                    | Reproduction (fails on `0837835`)                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Master `isolated-auth` red: `documents-tasks.spec.ts:449` never shows `Assignee: Ada Editor` ([run 41343610282](https://github.com/TerekliTahaBerk/atlas-research/actions/runs/41343610282))              | `tests/unit/task-detail-concurrency.test.tsx` drives the real `LiveTasks` panel against an optimistic-concurrency fake: due date, then assignee before the first response. On the original file it fails with the same missing `Assignee: Ada Editor` |
| D2  | `document.cite-source` acknowledged a reused `clientRequestId` with **different** commentary/annotation/source/base revision, by **another actor**, or **without** private consent as a successful replay | `tests/integration/research-journey.test.ts` Journey D: 3 tests failed (`RESOLVED` instead of `CONFLICT`) on real PostgreSQL 17                                                                                                                       |
| D3  | Search memory was one slot: researching in another project replaced the previous project's results                                                                                                        | unit `per-tab search memory`                                                                                                                                                                                                                          |
| D4  | Cancelling Reader → note after a selection silently kept the just-saved highlight without saying so                                                                                                       | unit `says that cancelling keeps a highlight`                                                                                                                                                                                                         |
| D5  | Discarding (or failing to build) the proposal for a note created by the AI picker left an empty note with no recovery path                                                                                | unit `empty-note-notice`                                                                                                                                                                                                                              |

## 2. Root causes

**D1 — frontend concurrency, not the backend or the test.** `TaskDetail` read `version.current` when an edit was _sent_ and incremented it only after the _response_. The due-date `onChange` and the immediate assignee choice were therefore both sent with `expectedVersion: 1`; SQL correctly rejected the second with `CONFLICT`, and `assign()` then showed a misleading "Only eligible project editors can be assigned." Two more latent paths: the `[task]` effect overwrote `version.current` from list reloads, so an older reload could rewind the token, and a reload that already contained an in-flight edit followed by that edit's `+= 1` overshot it. Status changes from the panel went through the board's separate token. The server contract (Journey E) is correct: consecutive tokens commit, a reused one conflicts.

**D2 — incomplete replay identity.** The existing-note branch looked up `document_versions` by `(document_id, client_request_id)` and returned it, bypassing the SQL `document.save` content-hash replay check.

## 3. Corrections

- **Task lane** (`features/tasks/use-task-mutations.ts`, used by every panel edit: fields, assignment, status, archive/restore). Edits run strictly in order. Each takes its token when it **starts**, `max(locally confirmed, latest list version)` — with nothing of ours in flight neither can exceed the server version, so stale/early reloads cannot rewind or overshoot it. Tasks bump `version` by exactly one in SQL, so a confirmed edit's version is known. A `CONFLICT` is reported once, truthfully, and discards edits queued behind it unsent (they were based on the same outdated view) — never auto-retried over another user's work. Pending and confirmed values overlay the list row until a reload at least as new arrives. Unmounted panels stop reporting/reloading. Board drag/keyboard moves are unchanged.
- **Citation replay** (`cite-source.ts` `replayMatches`): a replay row is acknowledged only for the same actor, an `EDITOR` save on exactly `expectedRevision`, and content equal to the base revision plus this request's blocks (location fields from the stored server-derived citation, so a lost response remains retryable even if the annotation was later deleted); private consent is re-required while the annotation is still private. Otherwise `CONFLICT`, nothing written. New-note requests already replay through `research_replay` with the full request hash.
- **UX**: dialog says a created highlight is kept on cancel (no deletion); search memory is a per-actor, per-project map (5 entries, other actors dropped); picker-created notes left empty offer **Archive empty note** (reversible), only after re-reading that the note is still revision 1 with no text — otherwise kept.

## 4. Contracts

| Situation                                                                                 | Result                                                                                                                      |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Same request ID, identical intent, same actor (lost response, even after newer revisions) | `replayed: true`, original revision, no second insert                                                                       |
| Same ID, different commentary/annotation/source/destination revision                      | `CONFLICT`, nothing written                                                                                                 |
| Same ID, other actor                                                                      | `CONFLICT` (project writer) / `NOT_FOUND` (viewer, outsider); nothing disclosed                                             |
| Same ID reused on a _different_ note                                                      | treated as a different request (replay identity is note + ID, as `UNIQUE(document_id, client_request_id)`); see limitations |
| Note changed since `expectedRevision` (new request)                                       | `CONFLICT`; dialog re-reads and requires reconfirmation                                                                     |
| Task edits issued faster than responses                                                   | consecutive tokens; all apply                                                                                               |
| External task edit                                                                        | that edit wins; ours `CONFLICT`, queued edits discarded, message shown                                                      |

## 5. Regression evidence (local, disposable)

| Check                                                     | Result                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| format / lint / typecheck / db:validate                   | PASS                                                                                                   |
| `pnpm test`                                               | PASS 272/272 (new: 6 lane, 1 panel reproduction, 3 recovery/navigation, 1 search memory, 2 empty note) |
| `pnpm test:integration` on `pgvector/pgvector:0.8.7-pg17` | PASS 116/116 (new Journey D ×4 citation replay, Journey E task tokens)                                 |
| `pnpm build`, `pnpm test:e2e`, `pnpm test:auth:e2e`       | see PR description for the final local and CI results                                                  |

Failing-before evidence: D1 panel test and D2 Journey D were run against the `0837835` implementation and failed as described in §1.

## 6. Remaining limitations

- A request ID reused across **different** notes is not detected: there is no index on `client_request_id` alone, and adding one is a write-locking index build not justified by this risk (clients generate a new ID per destination). It is never acknowledged as the other note's success.
- Edits queued behind a conflict are discarded; the user re-applies them on the refreshed task.
- Board moves of the same task while its panel has queued edits can still conflict truthfully.
- Picker-created empty notes are archived only on explicit request; nothing is deleted.

## 7. Hosted activation dependencies

Unchanged from A02: A01 G1–G7 remain required; this work adds no migration and no hosted step.
