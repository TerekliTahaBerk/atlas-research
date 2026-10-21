# Route inventory · Phase 00.5

| Route                                                  | Current UI behavior                                               | Later purpose                         |
| ------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------- |
| /                                                      | Editorial public entry with honest preview CTA                    | Product entry                         |
| /login, /register, /reset-password                     | Labeled local auth form previews; no submission                   | Phase 01 verified identity/recovery   |
| /onboarding                                            | Seven-step optional local sketch                                  | Phase 01 authorized bootstrap/invites |
| /app                                                   | Existing redirect to sample project overview                      | Authorized last workspace             |
| /app/home                                              | Workspace continuation desk                                       | Authorized recents and activity       |
| /app/inbox                                             | Synthetic activity with local read state                          | Phase 05 recipient notifications      |
| /app/help                                              | Shortcut/storage guide and auth preview links                     | Help                                  |
| /app/workspaces                                        | Existing redirect to sample workspace                             | Authorized workspaces                 |
| /app/workspaces/sample                                 | Sample workspace and project listing                              | UUID workspace overview               |
| /app/workspaces/sample/projects                        | Local project filter/grid/list and creation-flow preview          | Authorized project index              |
| /app/projects/sample                                   | Existing redirect to overview                                     | UUID project entry                    |
| /app/projects/sample/overview                          | Home-like project continuation desk                               | Authorized project overview           |
| /app/projects/sample/research                          | Local paper filtering, compare, reader and synthesis presentation | Phase 02 scholarly discovery          |
| /app/projects/sample/library                           | Local collection/tag/filter/grid/list and reader                  | Phase 02 private source library       |
| /app/projects/sample/documents                         | Local plain-text notebook, picker, selection and focus            | Phase 04 versioned writing            |
| /app/projects/sample/documents?note=document-questions | Opens the matching sample note                                    | Future authorized artifact deep link  |
| /app/projects/sample/tasks                             | Local board/list/status/task detail                               | Phase 04 research tasks               |
| /app/projects/sample/channels                          | Local discussion/thread/reaction/mention demonstration            | Phase 05 authorized communication     |
| /app/projects/sample/ai                                | Reusable full assistant preview                                   | Phase 03 grounded conversations       |
| /app/projects/sample/manuscripts                       | Local LaTeX text and static uncompiled illustration               | Phase 07 sandbox manuscript workspace |
| /app/projects/sample/experiments                       | Inert notebook/code/output illustration                           | Phase 07 isolated execution           |
| /app/settings, /profile, /workspace                    | Appearance works; account/membership unavailable                  | Authorized preferences                |
| Unknown ID/module/settings/path                        | Existing HTTP 404 with recovery                                   | Permission-safe missing resource      |

## Compatibility and scope

No existing route was removed, and `/app` retains its redirect. New Home/Inbox/Help and auth previews are additive. Project/workspace ownership architecture remains unchanged: production UUID project URLs resolve workspace/organization server-side. `features/shell/navigation.ts` is the centralized destination and module allowlist; avoid independently hardcoded module arrays.

`generateStaticParams` and `dynamicParams=false` still restrict preview resources to `sample` and the explicit module/settings allowlist. Real actors, tenant IDs and research entities are not accepted here. The document `note` query only selects an authored fixture; it cannot load an arbitrary resource. In Phase 01 replace sample enumeration with verified session/resource resolution and maintain non-leaking 404 behavior. Auth preview routes must be replaced by real verified flows, not wrapped with a demo bypass.

Research/Library live under a project route even though the sidebar visually groups them under Workspace. This preserves active research context and leaves an authorized cross-project aggregate as a later design. Context chips route to module views; they are not proof of access or arbitrary entity-detail retrieval. No route introduces a product API, database query, provider call, migration or tenant-policy change. See [screen map](SCREEN_MAP.md) for every screen’s states and service dependencies.
