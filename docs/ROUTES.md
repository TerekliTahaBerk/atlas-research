# Route inventory

| Route                            | Phase 00 behavior                              | Future purpose                         |
| -------------------------------- | ---------------------------------------------- | -------------------------------------- |
| /                                | Public entry with honest preview CTA           | Product entry                          |
| /login, /register                | Not found; no simulated auth                   | Phase 01 authentication                |
| /onboarding                      | Not found                                      | Phase 01 personal/team bootstrap       |
| /app                             | Redirect to sample project overview            | Authorized last workspace              |
| /app/workspaces                  | Redirect to sample workspace                   | Authorized workspaces                  |
| /app/workspaces/sample           | Sample workspace shell                         | UUID workspace overview                |
| /app/workspaces/sample/projects  | Sample project link, labelled                  | Authorized projects list               |
| /app/projects/sample             | Redirect to overview                           | UUID project entry                     |
| /app/projects/sample/overview    | Representative project screen                  | Live project overview                  |
| /app/projects/sample/research    | Explicit Phase 02 empty state                  | Discovery                              |
| /app/projects/sample/library     | Explicit Phase 02 empty state                  | Sources, collections, annotations      |
| /app/projects/sample/documents   | Explicit Phase 04 empty state                  | Notes/editor                           |
| /app/projects/sample/tasks       | Explicit Phase 04 empty state                  | Research task board                    |
| /app/projects/sample/channels    | Explicit Phase 05 empty state                  | Channels/messages                      |
| /app/projects/sample/ai          | Explicit Phase 03 empty state                  | Grounded conversations                 |
| /app/settings                    | Appearance works; account settings unavailable | Authorized preferences                 |
| /app/settings/profile            | Same labelled settings preview                 | Actor profile                          |
| /app/settings/workspace          | Same labelled settings preview                 | Active workspace administration        |
| Any unknown resource/module/path | notFound page                                  | Permission-safe missing-resource state |

Production projects use stable UUIDs as canonical URLs; workspace ownership is resolved server-side, avoiding duplicate nested project routes. Breadcrumbs reveal only authorized parents. Optional human-readable slugs can decorate links later, never define access. Preview `sample` is deliberately distinct from UUID contracts and must never bypass a real auth guard. Route tables above list concrete preview URLs; `[projectId]`, `[workspaceId]`, and `[module]` implementation segments reject all other IDs in Phase 00.

Preview project/workspace/module/settings paths are statically enumerated with `generateStaticParams` and `dynamicParams=false` so unknown resources return HTTP 404 before loading-boundary streaming begins. Replace static sample enumeration with authenticated resource resolution in Phase 01; retain permission-safe not-found semantics.
