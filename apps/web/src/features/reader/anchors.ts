import type { AnnotationAnchor } from '@atlas/core';

/*
 * Annotation anchors combine three selectors so a highlight can be found
 * again: character offsets into the page's text-layer string, the exact quote
 * with surrounding context, and rectangles normalized to the page box (so
 * they are independent of zoom and layout).
 */
const CONTEXT = 32;

/** Concatenated text of a text layer, in document order. */
export function layerText(root: Node) {
  let text = '';
  const walker = root.ownerDocument!.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
  );
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    text += node.nodeValue ?? '';
  return text;
}

/** Character offsets of a DOM range within the layer's concatenated text. */
export function textPosition(root: Node, range: Range) {
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  )
    return null;
  let offset = 0;
  let start: number | null = null;
  let end: number | null = null;
  const walker = root.ownerDocument!.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
  );
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.nodeValue?.length ?? 0;
    if (node === range.startContainer) start = offset + range.startOffset;
    if (node === range.endContainer) end = offset + range.endOffset;
    offset += length;
  }
  // Ranges anchored on elements (e.g. a whole span) fall back to text search.
  if (start === null || end === null || end < start) return null;
  return { start, end };
}

export function quoteContext(text: string, start: number, end: number) {
  return {
    prefix: text.slice(Math.max(0, start - CONTEXT), start) || null,
    suffix: text.slice(end, end + CONTEXT) || null,
  };
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
const clamp = (value: number) => Math.min(1, Math.max(0, value));
/** Converts client rectangles to page-relative units in [0, 1]. */
export function normalizeRects(rects: readonly Box[], page: Box) {
  return rects
    .filter((r) => r.width > 0.5 && r.height > 0.5)
    .map((r) => {
      const x = clamp((r.left - page.left) / page.width);
      const y = clamp((r.top - page.top) / page.height);
      return {
        x,
        y,
        width: clamp(r.width / page.width),
        height: clamp(r.height / page.height),
      };
    })
    .filter((r) => r.width > 0 && r.height > 0)
    .slice(0, 64);
}

/**
 * Checks an anchor against the current page text. PRECISE when the stored
 * offsets still select the stored quote; RECOVERED when the quote is found
 * elsewhere on the page; LOST when the quote is absent. A recovered match is
 * a best effort and is labelled as such, never silently treated as exact.
 */
export function locateAnchor(anchor: AnnotationAnchor, text: string) {
  if (!anchor.quote) return { status: 'PRECISE' as const };
  if (
    anchor.startOffset !== null &&
    anchor.endOffset !== null &&
    text.slice(anchor.startOffset, anchor.endOffset) === anchor.quote
  )
    return { status: 'PRECISE' as const, start: anchor.startOffset };
  const candidates: number[] = [];
  for (
    let at = text.indexOf(anchor.quote);
    at >= 0 && candidates.length < 20;
    at = text.indexOf(anchor.quote, at + 1)
  )
    candidates.push(at);
  if (!candidates.length) return { status: 'LOST' as const };
  // Prefer the occurrence whose surrounding text matches the stored context.
  const score = (at: number) =>
    (anchor.prefix &&
    text.slice(Math.max(0, at - anchor.prefix.length), at) === anchor.prefix
      ? 1
      : 0) +
    (anchor.suffix &&
    text.slice(
      at + anchor.quote!.length,
      at + anchor.quote!.length + anchor.suffix.length,
    ) === anchor.suffix
      ? 1
      : 0);
  const best = candidates.reduce((a, b) => (score(b) > score(a) ? b : a));
  return { status: 'RECOVERED' as const, start: best };
}
