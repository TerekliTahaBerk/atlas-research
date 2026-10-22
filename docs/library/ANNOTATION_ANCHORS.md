# Annotation anchors

Annotations (`paper_annotations`) belong to one project paper **and one immutable source version**. A foreign key on `(project_paper_id, source_version_id)` makes it impossible to attach an annotation to another paper's file, and annotations can only be created on `READY` versions.

## Anchor shape (`annotationAnchor` in core)

```ts
{
  pageNumber: number; // 1-based
  quote: string | null; // exact selected text (≤ 4,000 chars)
  prefix: string | null; // ≤ 64 chars of text before the quote
  suffix: string | null; // ≤ 64 chars after
  startOffset: number | null; // text-position selector into the page's
  endOffset: number | null; //   text-layer string (both or neither)
  rects: {
    (x, y, width, height);
  }
  []; // normalized to the page box, 0..1, ≤ 64
}
```

The page text is the concatenation of the PDF.js text-layer items for that page (`layerText`). Offsets come from walking text nodes to the selection's DOM range (`textPosition`). Rectangles are the selection's client rectangles divided by the page box, so highlights stay aligned at any zoom or width.

## Recovery

On load each annotation is checked against the current page text (`locateAnchor`):

- **PRECISE** — the stored offsets still select the stored quote.
- **RECOVERED** — the quote appears elsewhere on the page; the occurrence matching the stored prefix/suffix is preferred. Shown with a "Recovered anchor" label, never silently treated as exact.
- **LOST** — the quote is absent; the highlight is not drawn but the note remains in the panel with its page.

Because source versions are immutable and a new upload creates a new version, an annotation is never re-attached to different text. Anchor, version, author and kind are immutable (trigger); only the note body changes, with optimistic versions. Deletion is a soft delete.

## Kinds and visibility

`HIGHLIGHT`, `NOTE` (anchored to a selection) and `PAGE_NOTE` (page only). `PROJECT` annotations are visible to everyone who can read the project; `PRIVATE` annotations are visible only to their author (RLS). Only the author may edit or delete, and only while holding write access.
