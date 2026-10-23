# Editor schema (version 1)

Implemented in `packages/core/src/documents.ts` (`validateDocumentContent`) and enforced again in SQL (`atlas_private.document_references`). The live editor (`features/documents/editor/doc-editor.tsx` with `live`) uses StarterKit (headings 2–3, link with `openOnClick:false`, no trailing-node plugin), TaskList/TaskItem and the atoms in `live-nodes.tsx`. Preview-only nodes (comments, tracked changes, presence, AI suggestion blocks) are not part of the live schema.

| Kind   | Allowed                                                                                      | Attributes                                                                                                                                                |
| ------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blocks | paragraph, heading, blockquote, bulletList, orderedList, taskList, codeBlock, horizontalRule | heading `level` 1–3; orderedList `start`, `type` (1,a,A,i,I); taskItem `checked`; codeBlock `language` `[a-z0-9+#.-]{1,24}`                               |
| Inline | text, hardBreak, citation, documentRef, taskRef, personMention                               | see [citations](CITATIONS_AND_REFERENCES.md)                                                                                                              |
| Marks  | bold, italic, strike, code, underline, link                                                  | link `href` must parse as `http:`, `https:` or `mailto:`; `target` `_blank`/null; `rel` from noopener/noreferrer/nofollow/ugc; `class` null; `title` ≤200 |

Limits: 400 KB serialized (also a DB CHECK), depth 24, 20 000 nodes, 20 000 characters per text node, 200 000 characters total, 500 references, no C0 control characters except newline/tab. Unknown node types, marks, node fields or attributes are rejected (never stripped silently), so `script`, `iframe`, images, raw HTML, event-handler attributes, `javascript:`/`data:` links and class/style injection all fail with `VALIDATION_ERROR`.

Rendering never turns stored JSON into HTML: the editor renders through the Tiptap schema and React node views; version previews use plain block text; exports escape everything (see [EXPORT](EXPORT.md)). Reference atoms do not parse pasted HTML (`parseHTML` returns no rules), so pasted markup can never become a trusted reference.

Upgrades: every version row records `schema_version` (only `1` is accepted). A future schema adds a new version number plus a pure upgrade function applied on read; an unsupported version renders a safe "unsupported format" message rather than executable content.
