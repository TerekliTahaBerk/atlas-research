import type { JSONContent } from '@tiptap/react';
/** Authored sample note (prototype "Related work — sparse attention"). */
const text = (t: string, marks?: JSONContent['marks']): JSONContent =>
  marks ? { type: 'text', text: t, marks } : { type: 'text', text: t };
const cite = (paper: string): JSONContent => ({
  type: 'citation',
  attrs: { paper },
});
const p = (...content: JSONContent[]): JSONContent => ({
  type: 'paragraph',
  content,
});
export const relatedWorkContent: JSONContent = {
  type: 'doc',
  content: [
    p(
      text(
        'Pair representations are the dominant memory cost in modern structure prediction. Every Evoformer block updates an L × L grid, so memory grows quadratically with sequence length, and targets beyond roughly a thousand residues no longer fit at ',
      ),
      text('batch size one', [{ type: 'comment', attrs: { thread: 't1' } }]),
      { type: 'commentCount', attrs: { count: 2 } },
      text(' '),
      cite('p2'),
      text('.'),
    ),
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [text('1. Why full pair attention does not scale')],
    },
    p(
      text(
        'Two families of fixes exist. Low-rank methods compress the grid itself; sparse methods keep the grid but restrict which entries attend. The distinction matters for long-range contacts, which low-rank factorization tends to blur while sparse patterns either keep exactly or drop entirely.',
      ),
    ),
    { type: 'aiSuggestion' },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [text('2. Learned and structured sparsity')],
    },
    p(
      text('Fixed axial patterns '),
      cite('p1'),
      text(' '),
      {
        type: 'trackedChange',
        attrs: {
          from: 'save 2.8× memory',
          to: 'reduce peak memory 2.8×',
          author: 'Ayşe',
        },
      },
      text(' above 1,024 residues.'),
      { type: 'presence', attrs: { name: 'Ayşe' } },
      text(' Our method, tracked in '),
      { type: 'taskRef', attrs: { task: 'ATL-27' } },
      text(', learns the mask instead. Open questions for the lab:'),
    ),
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            p(
              text(
                'Does a 64-residue block keep contact precision within 2% of dense?',
              ),
            ),
          ],
        },
        {
          type: 'listItem',
          content: [
            p(text('How much of the saving survives at batch size 4?')),
          ],
        },
        {
          type: 'listItem',
          content: [
            p(
              text('Is linear attention a fair baseline, given '),
              cite('p5'),
              text('?'),
            ),
          ],
        },
      ],
    },
    { type: 'paragraph' },
  ],
};
export const emptyContent: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};
