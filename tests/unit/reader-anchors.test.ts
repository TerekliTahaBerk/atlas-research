import { describe, expect, it } from 'vitest';
import {
  layerText,
  locateAnchor,
  normalizeRects,
  quoteContext,
  textPosition,
} from '../../apps/web/src/features/reader/anchors';
import type { AnnotationAnchor } from '../../packages/core/src/index';

function layer(...spans: string[]) {
  const root = document.createElement('div');
  for (const text of spans) {
    const span = document.createElement('span');
    span.textContent = text;
    root.append(span, document.createElement('br'));
  }
  document.body.append(root);
  return root;
}
const anchor = (over: Partial<AnnotationAnchor>): AnnotationAnchor => ({
  pageNumber: 1,
  quote: 'memory',
  prefix: 'reduces ',
  suffix: ' use',
  startOffset: 25,
  endOffset: 31,
  rects: [],
  ...over,
});

describe('reader anchors', () => {
  it('maps a DOM selection to offsets in the concatenated page text', () => {
    const root = layer('Sparse attention ', 'reduces memory use.');
    const text = layerText(root);
    expect(text).toBe('Sparse attention reduces memory use.');
    const node = root.querySelectorAll('span')[1]!.firstChild!;
    const range = document.createRange();
    range.setStart(node, 8);
    range.setEnd(node, 14);
    expect(textPosition(root, range)).toEqual({ start: 25, end: 31 });
    expect(text.slice(25, 31)).toBe('memory');
    expect(quoteContext(text, 25, 31)).toEqual({
      prefix: 'Sparse attention reduces ',
      suffix: ' use.',
    });
  });
  it('rejects selections outside the text layer', () => {
    const root = layer('inside');
    const outside = layer('outside');
    const range = document.createRange();
    range.selectNodeContents(outside.querySelector('span')!.firstChild!);
    expect(textPosition(root, range)).toBeNull();
  });
  it('normalizes rectangles to the page box so zoom does not move highlights', () => {
    const page = { left: 100, top: 50, width: 400, height: 800 };
    expect(
      normalizeRects(
        [
          { left: 140, top: 90, width: 200, height: 16 },
          { left: 0, top: 0, width: 0.2, height: 0.2 },
          { left: 450, top: 820, width: 200, height: 100 },
        ],
        page,
      ),
    ).toEqual([
      { x: 0.1, y: 0.05, width: 0.5, height: 0.02 },
      { x: 0.875, y: 0.9625, width: 0.5, height: 0.125 },
    ]);
  });
  it('distinguishes precise, recovered and lost anchors', () => {
    const text = 'Sparse attention reduces memory use. Memory matters.';
    expect(locateAnchor(anchor({}), text)).toEqual({
      status: 'PRECISE',
      start: 25,
    });
    // Offsets drifted (e.g. a different text layer), but the quote with its
    // context is still on the page: recovered, and labelled as such.
    expect(
      locateAnchor(anchor({ startOffset: 2, endOffset: 8 }), text),
    ).toEqual({
      status: 'RECOVERED',
      start: 25,
    });
    expect(locateAnchor(anchor({ quote: 'absent text' }), text)).toEqual({
      status: 'LOST',
    });
    expect(locateAnchor(anchor({ quote: null }), text).status).toBe('PRECISE');
  });
});
