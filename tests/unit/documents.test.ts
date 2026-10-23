import { describe, expect, it } from 'vitest';
import {
  artifactCapabilities,
  artifactCommand,
  canTransition,
  diffBlocks,
  blockTexts,
  linkAllowed,
  plainText,
  referenceNodes,
  renderDocument,
  searchTerms,
  validateDocumentContent,
  type DocNode,
} from '../../packages/core/src/index';

const uuid = '11111111-1111-4111-8111-111111111111';
const doc = (...content: DocNode[]): DocNode => ({ type: 'doc', content });
const p = (...content: DocNode[]): DocNode => ({ type: 'paragraph', content });
const t = (text: string, marks?: DocNode['marks']): DocNode =>
  marks ? { type: 'text', text, marks } : { type: 'text', text };
const ok = (value: unknown) => validateDocumentContent(value).ok;

describe('document schema v1', () => {
  it('accepts every supported block, mark and typed reference', () => {
    const content = doc(
      { type: 'heading', attrs: { level: 2 }, content: [t('Methods')] },
      p(
        t('Bold', [{ type: 'bold' }]),
        t(' link', [
          {
            type: 'link',
            attrs: {
              href: 'https://doi.org/10.1/x',
              target: '_blank',
              rel: 'noopener noreferrer nofollow',
              class: null,
              title: null,
            },
          },
        ]),
        { type: 'hardBreak' },
        {
          type: 'citation',
          attrs: {
            projectPaperId: uuid,
            sourceVersionId: null,
            annotationId: null,
            chunkId: null,
            page: null,
            quote: null,
            startOffset: null,
            endOffset: null,
            sourceChecksum: null,
            label: null,
          },
        },
        { type: 'documentRef', attrs: { documentId: uuid, label: 'Notes' } },
        { type: 'taskRef', attrs: { taskId: uuid, label: null } },
        { type: 'personMention', attrs: { profileId: uuid, label: 'Ayşe' } },
      ),
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [p(t('item'))] }],
      },
      {
        type: 'orderedList',
        attrs: { start: 3, type: null },
        content: [{ type: 'listItem', content: [p(t('n'))] }],
      },
      {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: true },
            content: [p(t('done'))],
          },
        ],
      },
      { type: 'blockquote', content: [p(t('quote'))] },
      {
        type: 'codeBlock',
        attrs: { language: 'python' },
        content: [t('print(1)\n')],
      },
      { type: 'horizontalRule' },
      { type: 'paragraph' },
    );
    const result = validateDocumentContent(content);
    expect(result).toMatchObject({ ok: true, references: 4 });
    expect(referenceNodes(content)).toHaveLength(4);
  });

  it.each([
    [
      'script nodes',
      { type: 'doc', content: [{ type: 'script', content: [t('x')] }] },
    ],
    [
      'raw HTML nodes',
      doc({ type: 'html', text: '<img onerror=alert(1)>' } as DocNode),
    ],
    [
      'event-handler attributes',
      doc({ type: 'paragraph', attrs: { onclick: 'x' }, content: [t('x')] }),
    ],
    [
      'javascript: links',
      doc(
        p(t('x', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])),
      ),
    ],
    [
      'obfuscated javascript links',
      doc(
        p(t('x', [{ type: 'link', attrs: { href: ' JaVaScRiPt:alert(1)' } }])),
      ),
    ],
    [
      'data: links',
      doc(
        p(
          t('x', [
            {
              type: 'link',
              attrs: { href: 'data:text/html;base64,PHNjcmlwdD4=' },
            },
          ]),
        ),
      ),
    ],
    [
      'link class/style injection',
      doc(
        p(
          t('x', [
            {
              type: 'link',
              attrs: { href: 'https://a.example', class: 'x" onmouseover="y' },
            },
          ]),
        ),
      ),
    ],
    [
      'unknown marks',
      doc(
        p(
          t('x', [
            {
              type: 'textStyle',
              attrs: { style: 'background:url(javascript:x)' },
            },
          ]),
        ),
      ),
    ],
    [
      'iframes',
      doc({
        type: 'iframe',
        attrs: { src: 'https://evil.example' },
      } as DocNode),
    ],
    [
      'images',
      doc(p({ type: 'image', attrs: { src: 'https://evil.example/x.png' } })),
    ],
    [
      'extra node fields',
      doc({
        type: 'paragraph',
        content: [t('x')],
        html: '<b>',
      } as unknown as DocNode),
    ],
    [
      'blocks inside paragraphs',
      doc(p({ type: 'heading', attrs: { level: 2 }, content: [t('x')] })),
    ],
    ['nested documents', doc({ type: 'doc', content: [p(t('x'))] })],
    [
      'heading levels outside 1-3',
      doc({ type: 'heading', attrs: { level: 6 }, content: [t('x')] }),
    ],
    [
      'forged reference IDs',
      doc(p({ type: 'citation', attrs: { projectPaperId: 'p1' } })),
    ],
    [
      'unverifiable quotes',
      doc(
        p({
          type: 'citation',
          attrs: { projectPaperId: uuid, quote: 'claim', page: 3 },
        }),
      ),
    ],
    [
      'citation attribute injection',
      doc(
        p({
          type: 'citation',
          attrs: { projectPaperId: uuid, href: 'javascript:x' },
        }),
      ),
    ],
    ['control characters', doc(p(t('a\u0000b')))],
    ['empty documents', { type: 'doc', content: [] }],
    ['non-doc roots', p(t('x'))],
    ['empty lists', doc({ type: 'bulletList', content: [] })],
    [
      'marks inside code blocks',
      doc({ type: 'codeBlock', content: [t('x', [{ type: 'bold' }])] }),
    ],
  ])('rejects %s', (_name, value) => {
    expect(ok(value)).toBe(false);
  });

  it('bounds depth, node count, text and bytes', () => {
    let deep: DocNode = p(t('x'));
    for (let i = 0; i < 30; i++) deep = { type: 'blockquote', content: [deep] };
    expect(validateDocumentContent(doc(deep))).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/deeply/),
    });
    expect(
      ok(
        doc(p(...Array.from({ length: 20001 }, () => ({ type: 'hardBreak' })))),
      ),
    ).toBe(false);
    expect(ok(doc(p(t('x'.repeat(20001)))))).toBe(false);
    expect(
      ok(doc(...Array.from({ length: 30 }, () => p(t('y'.repeat(15000)))))),
    ).toBe(false);
  });

  it('shares the validator with command parsing', () => {
    const base = {
      command: 'document.save',
      id: uuid,
      expectedRevision: 1,
      clientRequestId: uuid,
    };
    expect(
      artifactCommand.safeParse({ ...base, content: doc(p(t('ok'))) }).success,
    ).toBe(true);
    expect(
      artifactCommand.safeParse({
        ...base,
        content: { type: 'doc', content: [{ type: 'script' }] },
      }).success,
    ).toBe(false);
    // Extra fields (such as a forged author or project) are refused.
    expect(
      artifactCommand.safeParse({
        ...base,
        content: doc(p(t('ok'))),
        authorId: uuid,
      }).success,
    ).toBe(false);
  });
});

describe('projections, exports and diffs', () => {
  const content = doc(
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [t('<script>alert(1)</script>')],
    },
    p(
      t('See '),
      { type: 'citation', attrs: { projectPaperId: uuid } },
      t(' and **bold**', [{ type: 'italic' }]),
    ),
    p(
      t('evil', [
        { type: 'link', attrs: { href: 'https://x.example/"><script>' } },
      ]),
    ),
    {
      type: 'taskList',
      content: [
        { type: 'taskItem', attrs: { checked: true }, content: [p(t('done'))] },
      ],
    },
  );
  const label = () => '[Ronneberger, 2015]';
  it('projects plain text without stored labels', () => {
    expect(plainText(content)).toBe(
      '<script>alert(1)</script>\nSee  and **bold**\nevil\n[x] done',
    );
  });
  it('escapes Markdown and resolves references through the authorized resolver', () => {
    const md = renderDocument('Title *x*', content, 'markdown', label);
    expect(md).toContain('# Title \\*x\\*');
    expect(md).toContain('## \\<script\\>alert(1)\\</script\\>');
    expect(md).toContain('\\[Ronneberger, 2015\\]');
    expect(md).toContain('- [x] done');
  });
  it('emits sanitized HTML by construction', () => {
    const html = renderDocument('<b>T</b>', content, 'html', label);
    expect(html).not.toMatch(/<script/);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('href="https://x.example/&quot;&gt;&lt;script&gt;"');
    expect(html).toContain('<title>&lt;b&gt;T&lt;/b&gt;</title>');
  });
  it('diffs block texts', () => {
    expect(diffBlocks(['a', 'b', 'c'], ['a', 'c', 'd'])).toEqual([
      { op: 'same', text: 'a' },
      { op: 'removed', text: 'b' },
      { op: 'same', text: 'c' },
      { op: 'added', text: 'd' },
    ]);
    expect(blockTexts(content).length).toBe(4);
  });
});

describe('policies', () => {
  it('mirrors the documented transition policy', () => {
    expect(canTransition('TODO', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('TODO', 'DONE')).toBe(false);
    expect(canTransition('IN_REVIEW', 'DONE')).toBe(true);
    expect(canTransition('DONE', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('CANCELLED', 'DONE')).toBe(false);
  });
  it('allows only the explicit link matrix', () => {
    expect(linkAllowed('DOCUMENT', 'CITES', 'PAPER')).toBe(true);
    expect(linkAllowed('PAPER', 'CITES', 'DOCUMENT')).toBe(false);
    expect(linkAllowed('TASK', 'DEPENDS_ON', 'TASK')).toBe(true);
    expect(linkAllowed('DOCUMENT', 'DEPENDS_ON', 'TASK')).toBe(false);
  });
  it('derives artifact capabilities from project capabilities only', () => {
    expect(artifactCapabilities([])).toEqual([]);
    expect(artifactCapabilities(['project.read'])).toContain('document.export');
    expect(artifactCapabilities(['project.read'])).not.toContain(
      'document.edit',
    );
    expect(artifactCapabilities(['project.read', 'project.write'])).toContain(
      'task.assign',
    );
  });
  it('builds tsquery input from letters and digits only', () => {
    expect(searchTerms("U-Net & (drop) | !x:* 'quote'")).toBe(
      'u:* & net:* & drop:* & x:* & quote:*',
    );
    expect(searchTerms('&&&')).toBe('');
  });
});
