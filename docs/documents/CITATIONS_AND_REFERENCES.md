# Citations and references

Typed atoms store identity only; titles are resolved from the server at render/export time.

| Node            | Attributes                                                                                                                                      | Target                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `citation`      | `projectPaperId`, `sourceVersionId?`, `annotationId?`, `chunkId?`, `page?`, `quote?`, `startOffset?`, `endOffset?`, `sourceChecksum?`, `label?` | Project paper (creates a `DOCUMENT CITES PAPER` content link)           |
| `documentRef`   | `documentId`, `label?`                                                                                                                          | Another document in the project (`REFERENCES`); self-reference rejected |
| `taskRef`       | `taskId`, `label?`                                                                                                                              | Task in the project (`TRACKS`)                                          |
| `personMention` | `profileId`, `label?`                                                                                                                           | Current project participant; no notification in Phase 04                |

Rules enforced in SQL for every new or altered atom (unchanged atoms carried from the previous revision were validated when introduced):

- The target must exist **in the same project**; another project's IDs fail exactly like nonexistent IDs.
- New references must target active (non-archived) artifacts; archived ones remain valid in existing text and history.
- Quotes and pages must come from a verified location: an annotation on the cited READY source version (visible to the author; quote, page and offsets must equal its anchor) or an extracted Phase 03 chunk of that version (quote must occur in the chunk text, page must equal the chunk page). `sourceChecksum`, when present, must equal the source version SHA-256. A quote/page without such a location is rejected; page numbers are never invented.
- Label text is presentation only and is never rendered in place of the resolved title.

Editor workflow: `@` (or `/reference`) searches authorized papers, documents, tasks and people (`GET projects/:id/artifacts`); `/citation` opens the library picker; choosing a paper with a READY source offers its highlighted passages or a paper-level citation. Clicking a located citation opens the Reader at `?paper=&source=&page=`.

Unavailable/tombstoned states: archived targets render "· archived" with their title (the viewer can still read them); missing, foreign or RLS-hidden targets render "Unavailable source/document/task" with no title. Exports show `[unavailable reference]`. A citation never redirects to a different paper. Duplication copies references within the same project; restore keeps the historical references and re-authorizes them on render. Location verification proves where text is, not that a scientific claim is supported.
