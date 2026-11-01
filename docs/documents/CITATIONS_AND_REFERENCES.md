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

## Reader to note (A02)

`document.cite-source` is the confirmed Reader action **Add to research note** (selection, annotation card, notes panel, Details tab). It is a thin server orchestration over the existing commands, not a new workflow engine:

- The client sends IDs only; the strict schema rejects `quote`, `page`, `label` or checksum fields. In the actor's transaction the server re-checks project write capability, then reads the project paper (archived → `CONFLICT`), the READY source version (its stored SHA-256 becomes `sourceChecksum`) and the annotation on exactly that version (deleted, foreign or another person's private annotation → `NOT_FOUND`, indistinguishable from missing).
- Citation attributes come only from those rows (`sourceCitationAttrs` in `packages/core/src/research-journey.ts`): an annotation supplies page, quote and offsets verbatim; a page note supplies its page without a quote; version-only and paper-only references record no page. A highlight longer than the 2,000-character citation limit is refused rather than truncated; the dialog offers an explicit version-level reference instead.
- A quotation is a `blockquote` ending in the citation; optional user commentary is a separate paragraph.
- **Existing note:** replay is checked first. A version carrying the same `clientRequestId` is acknowledged (`replayed: true`, its original revision) only if it is provably this request: same author, an `EDITOR` save made on exactly `expectedRevision`, and content equal to that base revision plus the blocks this request produces (paper, version, annotation and commentary), with private-annotation consent re-required while the annotation is still private. Any other reuse is `CONFLICT` and inserts nothing (A02 hardening). Then `expectedRevision` must equal the current revision (`CONFLICT` otherwise — nothing is merged), then the blocks are appended and committed as an ordinary `document.save` (new immutable revision, SQL reference validation, content links). Open editors are never written to; a dirty editor of that note sees the usual revision conflict and keeps its draft.
- **New note:** a `RESEARCH_NOTE` is created by `document.create` **with** the citation in one transaction, keyed by the request ID; nothing exists before the user confirms.
- The actor's own **private** annotation can be quoted only with `sharePrivateAnnotation: true`, set by an explicit checkbox warning that the text becomes visible to project members.

Citation chips now open the Reader at `?paper=&source=` plus `&page=` and `&annotation=` when recorded; a version-only citation opens that version without inventing a page. If the cited version is no longer READY the Reader states that it is showing another version instead of switching silently.
