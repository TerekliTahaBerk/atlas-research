# Route inventory · Phase 00.5A

## Phase 02 live research routes

In live mode `/app/projects/:projectId/research`, `/library` and `/reader` render real data for readable, non-archived projects (other modules keep their unavailable state). Research holds search state in the page; Library and Reader use `?paper=<projectPaperId>` (a UUID that grants nothing by itself; the APIs reauthorize). Inaccessible papers show an unavailable state without titles. Preview mode is unchanged and still uses only `sample` fixtures.

## Phase 01 live routing

`ATLAS_MODE=live` activates the verified application. `/`, `/login`, `/register`, `/reset-password`, `/auth/callback`, `/update-password` and the metadata-free `/invite` landing are public Auth-related surfaces. `/onboarding` requires a verified actor and recovers their saved draft. All `/app` pages require verified identity; Home/workspace/project/settings loaders independently resolve authorized DTOs and completed setup. Invalid/sample/inaccessible resources return safe 404s. Unauthenticated access returns to login; allowlisted return destinations preserve deep-link intent.

Live routes include `/app/home`, `/app/workspaces`, `/app/workspaces/:workspaceId[/projects]`, `/app/projects/:projectId[/overview]`, all known project module slugs, and `/app/settings/{profile,appearance,workspace,plan}`. Workspace selection is server-authorized. Future modules require the project context and show their phase/unavailable state. Live Inbox/design-system/help preview routes are unavailable; the full approved synthetic UI remains in the separate preview environment. Settings accepts `workspaceId`/`organizationId` for intentional context selection. `/sample` never bypasses live authorization. The inventory below describes preview mode only.

Every route serves synthetic sample content. Server allowlists (`generateStaticParams` with `dynamicParams=false`) still accept only the `sample` workspace and project and the explicit module and settings slugs. Anything else returns a 404 with recovery.

| Route                                                                          | Screen (handoff)                                    | Query parameters                   |
| ------------------------------------------------------------------------------ | --------------------------------------------------- | ---------------------------------- |
| `/`                                                                            | Public entry                                        | —                                  |
| `/login`, `/register`, `/reset-password`                                       | Auth previews (nothing is sent)                     | —                                  |
| `/onboarding`                                                                  | Seven-step onboarding preview                       | `step=1…7`                         |
| `/app`                                                                         | Redirects to `/app/home` (Phase 00.5: the overview) | —                                  |
| `/app/home`                                                                    | `home`                                              | —                                  |
| `/app/inbox`                                                                   | `inbox` (full page; the popover is in the sidebar)  | —                                  |
| `/app/help`                                                                    | Shortcuts and storage guide                         | —                                  |
| `/app/workspaces`, `/app/workspaces/sample`, `/app/workspaces/sample/projects` | Workspace project list                              | —                                  |
| `/app/projects/sample`                                                         | Redirects to `overview`                             | —                                  |
| `/app/projects/sample/overview`                                                | `overview`                                          | —                                  |
| `/app/projects/sample/research`                                                | `research`                                          | `demo=loading`, `errors`, `empty`  |
| `/app/projects/sample/library`                                                 | `library`                                           | `paper=p1…p5`, `demo=empty`        |
| `/app/projects/sample/reader` **(new)**                                        | `reader`                                            | `paper=p1…p5`, `cite=1`            |
| `/app/projects/sample/documents`                                               | `doc`                                               | `doc=d1…d4` (**replaces `note=`**) |
| `/app/projects/sample/tasks`                                                   | `tasks`                                             | `task=ATL-…`, `demo=empty`         |
| `/app/projects/sample/channels`                                                | `channels`                                          | `demo=empty`                       |
| `/app/projects/sample/ai`                                                      | Atlas research page                                 | —                                  |
| `/app/projects/sample/manuscripts`                                             | `manuscript`                                        | `demo=errors` (sample failed log)  |
| `/app/projects/sample/experiments`                                             | `experiments`                                       | —                                  |
| `/app/projects/sample/graph` **(new)**                                         | `graph`                                             | —                                  |
| `/app/settings/{profile,appearance,workspace,plan}`                            | `settings` (`/app/settings` is appearance)          | —                                  |
| `/app/design-system` **(new)**                                                 | `system` QA view                                    | —                                  |
| `/app/design-system/mobile` **(new)**                                          | `mobile` QA view (iframes of live routes)           | —                                  |

## Parameters that work on every app route

These parameters only select authored fixtures or presentation states. They never load an arbitrary resource:

- `atlas=open`, `focus` or `panel` opens Atlas AI in that mode, for deep links and QA.
- `demo=errors` makes Atlas previews end in a labeled sample error with Retry. On the manuscript screen it shows the sample failed log.

## Compatibility notes

- `/app` now redirects to `/app/home`, which matches the handoff's landing screen. The project overview is still at `/app/projects/sample/overview`.
- `?note=document-questions` is no longer recognised. Documents use `?doc=`.
- The module allowlist in `features/shell/navigation.ts` gained `reader` and `graph`.

No API route, database query, provider call or migration was added. In Phase 01, sample enumeration must be replaced with verified session and resource resolution, and the non-leaking 404 behaviour must be kept.
