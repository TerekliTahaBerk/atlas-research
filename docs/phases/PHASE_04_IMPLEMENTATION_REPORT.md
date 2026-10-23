# Phase 04 implementation report

## 1. Executive summary

Phase 04 turns the Documents and Tasks previews into database-backed research features in the approved Atlas design: persisted Tiptap documents with immutable versions, debounced autosave with conflict and draft recovery, source-aware citations and typed references, Markdown/text/HTML export, project tasks with milestones, eligible assignment, a server-enforced transition policy and keyboard-accessible board moves, typed same-project artifact links, project-scoped full-text search, a live graph projection, and Atlas AI proposals that change nothing until explicitly approved and re-validated. All local mandatory checks and GitHub Actions `quality` pass. **Hosted activation is BLOCKED** behind the unresolved Phase 02/03 gates; no hosted migration, data change, paid model call or deployment was performed.

## 2. Commits

- Starting point: `master` `cc0190f` (Phase 03 merge; master CI run 40016438763 `success`). No open PRs, clean tree.
- Work branch: `claude/gifted-wright-hivumw` (the session's designated branch, used instead of `feat/phase-04-documents-tasks`).
- Commits: `bc913d0` persistence/contracts/services, `70dfb29` live UI, `7fdfc61` performance probe, `ec414b9` documentation; merged as [PR #10](https://github.com/TerekliTahaBerk/atlas-research/pull/10) → `master` `c086013`. This report is a follow-up commit on the same branch restarted from `c086013`.

## 3. Document implementation

Services (`features/documents/server/documents.ts`, `features/artifacts/server/commands.ts`): create, list (signed 50-row cursor; archived list for writers), open, rename, save, history (30-row cursor), version read, compare (block diff), restore (new revision), duplicate, archive/restore, export. Every mutation is authenticated, schema-validated, one SQL transaction, audited with action/resource/request IDs only, and idempotent (creates: actor-scoped idempotency keys; saves: per-document `clientRequestId`). UI: `features/documents/live-documents.tsx` (index with search, editor view, metadata, links rail, references section, save-state pill, history modal `live-version-history.tsx`).

## 4. Editor schema

Version 1, documented in [EDITOR_SCHEMA](../documents/EDITOR_SCHEMA.md): allowlisted nodes/marks/attributes, http/https/mailto links only, depth 24, 20 000 nodes, 400 KB, no control characters; unknown content is rejected. The existing `DocEditor` gained a live mode (StarterKit without trailing-node plugin, task lists, typed reference atoms, real slash commands, link insertion, read-only mode, Ctrl/⌘+S); the preview mode is unchanged.

## 5. Autosave and concurrency

1.5 s debounce / 10 s ceiling, truthful states (Saved only after commit), stable request IDs for retries, offline/backoff retries, `CONFLICT` stops autosave with compare / save-on-top / discard choices, `beforeunload` guard, and a bounded per-actor local draft store (7-day expiry, purged for other accounts and on sign-out, explicit recovery). See [AUTOSAVE_AND_RECOVERY](../documents/AUTOSAVE_AND_RECOVERY.md).

## 6. Immutable version history

`document_versions` with trigger-enforced immutability (verified even for the owner role), unique revision and request IDs, SQL content hash, source/provenance columns and a composite current-pointer FK. See [VERSIONING](../documents/VERSIONING.md).

## 7. Tasks and milestones

Per-project numbered tasks, priorities, due dates, milestones, version tokens, archive/restore, filters/sorts, board/list, optimistic moves with rollback and `aria-live` announcements, keyboard Move menus, detail panel with typed links. Comments are labelled as Phase 05. See [TASK_MODEL](../tasks/TASK_MODEL.md) and [TRANSITION_POLICY](../tasks/TRANSITION_POLICY.md).

## 8. Assignment permissions

Eligible assignees hold a live OWNER/EDITOR project grant. Revoked assignees remain recorded, are shown as "Former participant" without identity, lose read access and cannot be newly assigned. Capability matrix derived from existing project capabilities. See [ASSIGNMENT_AND_ROLES](../tasks/ASSIGNMENT_AND_ROLES.md).

## 9. Artifact registry extensions

`artifacts.kind` widened to PAPER/DOCUMENT/TASK with a `(project_id,id,kind)` key; owner rows carry kind-checked composite FKs; existing paper artifacts unchanged. See [ARTIFACT_REGISTRY](../artifacts/ARTIFACT_REGISTRY.md) and [ADR 0017](../decisions/0017-documents-tasks-artifact-links.md).

## 10. Typed links and search

Link matrix enforced by DB CHECK and SQL command; endpoints FK-bound to one project; dependency cycles rejected; content links mirror document references. Lexical PostgreSQL search over documents, tasks and saved papers with SQL ACLs, archived exclusion, bounded plain snippets and signed cursors; bounded graph projection and mention options. See [LINK_TYPES](../artifacts/LINK_TYPES.md) and [SEARCH_AND_ACL](../artifacts/SEARCH_AND_ACL.md). Semantic search over documents is deliberately not implemented.

## 11. Source-aware citations

Citations reference project papers and optionally a READY source version plus an annotation or Phase 03 chunk; quotes/pages/offsets/checksums must match the verified location; archived sources stay historical and render labelled; foreign or missing targets render unavailable without titles. Reader navigation via `?paper&source&page`. See [CITATIONS_AND_REFERENCES](../documents/CITATIONS_AND_REFERENCES.md).

## 12. Atlas AI action proposals

The five Atlas modes are unchanged (preview E2E). Document identity is supplied as context; linked papers are never implied; document text is not sent as evidence (documented limitation). Proposals are derived server-side from the actor's completed run; application requires `approved: true` and the proposal hash and re-runs capability, schema, reference, eligibility, idempotency, revision and run-ownership checks. The deterministic loopback fixture gained a `fixture-plan` branch for tests. Paid calls remain disabled. See [DOCUMENT_TASK_ACTIONS](../ai/DOCUMENT_TASK_ACTIONS.md).

## 13. Database migration

`20261024090000_documents_tasks` (additive; widens one CHECK; wraps the Phase 02 dispatcher by rename). Applied only to disposable local PostgreSQL 17 + pgvector 0.8.7 and the isolated Auth harness, and in CI. **Not applied to any hosted database.** One new web dependency: `@tiptap/extension-list@3.32.0` (already a transitive dependency of StarterKit).

## 14. Security and tenant-isolation tests

Integration (real PostgreSQL, non-owner runtime): unauthorized document read/history/export, workspace administrator without a grant, raw runtime DML denial, cross-tenant raw SQL, forged and foreign citations, unverifiable quotes, forged page/checksum on annotation citations, outsider person mentions, self references, 13 malicious payloads incl. `script`, `iframe`, `javascript:`/`data:` links and event-handler attributes at server **and** SQL level, revoked member and revoked assignee, concurrent document saves and task updates, idempotent replay/conflict, duplicate link, cross-project and invalid-kind links rejected by the DB itself, forged owner `artifact_kind`, search ACL/snippets/cursor binding, AI approval/stale/revocation. Browser: viewer revocation (404 for document, export, history), cross-project link denial via HTTP, assignment of a revoked collaborator refused.

## 15. Accessibility and visual QA

Axe (`wcag2a`, `wcag2aa`, `wcag21aa`, zero violations) on the live document and task screens in the browser journeys. Keyboard: document creation, title, typing, `@` picker navigation, saving, history; task creation, Move menu, status/priority/assignee menus, list view, search combobox with arrow/Enter. One pre-existing WCAG 2.5.3 issue on the Atlas strip button was fixed without visual change. Preview visual baselines: the six approved screenshots **pass in CI** with the pinned browser; locally they fail identically on untouched `master` with the container's older Chromium (rendering differences of ≤0.03% pixels; branch vs master renders were pixel-identical or anti-aliasing-only). No snapshot was updated. Responsive behaviour reuses the existing breakpoints; a dedicated mobile pass for the new live screens was **NOT RUN**.

## 16. Automated test counts (local)

| Suite                                             | Result                                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm test` (unit)                                | 213 passed (37 new: 33 document/policy, 4 draft store)                              |
| `pnpm test:integration`                           | 93 passed on a fresh database (18 new in `artifacts.test.ts`)                       |
| `pnpm test:auth:e2e`                              | 8 passed (3 new Phase 04 journeys + 5 Phase 01–03)                                  |
| `pnpm test:e2e` (preview)                         | 95 behavioural passed; 6 screenshots environment-only failures locally (pass in CI) |
| lint, typecheck, format:check, db:validate, build | PASS                                                                                |

Performance probe (500 tasks, 20 documents, local): board page 125 ms, search 97 ms, graph 85 ms, mention options 90 ms. Board/list loads are bounded to 300 rows, search to 20, graph to 300 nodes/1 000 edges; link counts and link endpoints are batched (no N+1).

## 17. GitHub Actions

PR #10 run [40027687291](https://github.com/TerekliTahaBerk/atlas-research/actions/runs/40027687291): `quality` **success** (format, lint, db:validate, typecheck, unit, scanner/extractor, migrate deploy, constraints, integration, build, preview E2E incl. visual baselines). `isolated-auth` was still in its `playwright install --with-deps` step (no test had started) when the PR was merged and when this report was written; its result, and the post-merge master run [40028609337](https://github.com/TerekliTahaBerk/atlas-research/actions/runs/40028609337), were not yet reported. The same 8-spec auth suite passed locally on the disposable harness (section 16). Treat CI `isolated-auth` as NOT RUN until those runs complete.

## 18. Hosted Supabase blockers

Unchanged and unverified in this phase: migration-history role exposure remediation, protected backup/restore evidence, hosted Phase 02 and Phase 03 schemas, private Storage, scanner/extractor deployment, provider approval for paid inference. Phase 04 adds its own migration and verification gate. See [activation plan](PHASE_04_ACTIVATION_PLAN.md).

## 19. Remaining limitations

- No realtime co-editing, presence, comments or notifications (Phases 05/07).
- Document text is not used as AI evidence; semantic search over notes is not implemented.
- Local drafts share one key across tabs of the same account (latest tab wins locally; the server still serializes saves).
- Links are added via `window.prompt`; milestone creation also uses a prompt; a richer inline UI is future polish.
- Mobile-specific QA of the new live screens not performed; hosted performance not measured.
- Dev-server logs show `ECONNRESET` when a browser test navigates away during an in-flight request; no user-visible effect observed.

## 20. Phase 05 readiness

Stable artifact IDs for documents/tasks, typed links and `mentioned_profile_ids` on versions provide the hooks for messages, mentions and notifications. No Phase 05 behaviour is implemented or implied.

## 21. PR status and classification

[PR #10](https://github.com/TerekliTahaBerk/atlas-research/pull/10) merged into `master` by the repository owner.

| Capability                                         | Code readiness                                          | Hosted activation       |
| -------------------------------------------------- | ------------------------------------------------------- | ----------------------- |
| Documents, versions, autosave, recovery, export    | PASS                                                    | BLOCKED                 |
| Editor schema and XSS defences                     | PASS                                                    | BLOCKED                 |
| Citations and references                           | PASS                                                    | BLOCKED                 |
| Tasks, milestones, assignment, transitions         | PASS                                                    | BLOCKED                 |
| Artifact registry and typed links                  | PASS                                                    | BLOCKED                 |
| Search and graph projection                        | PASS                                                    | BLOCKED                 |
| AI proposals (deterministic fixture)               | PASS                                                    | BLOCKED (provider gate) |
| Real-model AI proposal quality                     | NOT RUN                                                 | BLOCKED                 |
| Mobile QA of live screens                          | NOT RUN                                                 | —                       |
| CI `isolated-auth` (PR head and post-merge master) | NOT RUN when written (runner still installing browsers) | —                       |
