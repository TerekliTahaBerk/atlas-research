# Link types

| Source   | Relationship | Target   | Created by                             |
| -------- | ------------ | -------- | -------------------------------------- |
| DOCUMENT | CITES        | PAPER    | content (citation atom) or manual      |
| DOCUMENT | REFERENCES   | DOCUMENT | content (documentRef) or manual        |
| DOCUMENT | TRACKS       | TASK     | content (taskRef) or manual            |
| TASK     | REFERENCES   | PAPER    | manual / task creation                 |
| TASK     | RELATES_TO   | DOCUMENT | manual / task creation                 |
| TASK     | DEPENDS_ON   | TASK     | manual; cycles and self-loops rejected |
| PAPER    | RELATED_TO   | PAPER    | manual                                 |

Checks on `artifact.link.create` (SQL): actor has `project.write`; both endpoints exist in the command's project (otherwise 404 — indistinguishable from missing); the triple is in the matrix (DB CHECK as well); endpoints differ; both are active; DEPENDS_ON is serialized per project and a recursive check rejects cycles; an existing active manual link is returned (`existing: true`) instead of duplicated. `artifact.link.remove` archives manual links; content links change only by editing the document. Queries (`GET artifacts/:id/links`) return both directions with endpoints resolved in one batch; archived endpoints are labelled, inaccessible ones are unavailable without titles.
