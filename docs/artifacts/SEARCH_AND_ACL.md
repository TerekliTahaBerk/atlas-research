# Search and access control

`GET /api/v1/projects/:id/search?q=&kind=&sort=relevance|recent&cursor=` (60/min).

- Query text is reduced to letters/digits (≤8 terms, prefix match) and passed as a bound `to_tsquery('simple', …)` parameter.
- Sources: documents (`search_document` = title A + plain-text projection B), tasks (title A + description B) and saved project papers (expression index over title + abstract). Archived rows are excluded.
- Authorization in SQL: `requireProject(project.read)`, explicit `project_id` filter and RLS on every table — results are never filtered in React.
- Response: artifact/entity IDs, title, kind, detail, permitted link and a plain-text `ts_headline` snippet (≤400 chars, private-use markers rendered as `<mark>`). No private cache; responses are `private, no-store`.
- Pagination: 20 per page with HMAC cursors bound to actor, project and query.
- Semantic search over documents/tasks is not implemented (no document text is sent to embedding providers).

The bounded graph projection (`GET projects/:id/graph`) returns up to 300 most recent active artifacts and up to 1 000 active edges among them. The mention picker (`GET projects/:id/artifacts`) returns ≤6 per kind (20 when filtered) plus current participants.
