import { describe, expect, it } from 'vitest';
import {
  citationKey,
  escapeLatex,
  formatReference,
  normalizeDoi,
  normalizeOpenAlexId,
  normalizeSemanticScholarId,
  normalizeTag,
  overallSearchState,
  researchCommand,
  searchRequest,
  toBibtex,
  toRis,
  annotationAnchor,
  uploadIntentInput,
  type CitationEntry,
  type ProviderReport,
} from '../../packages/core/src/index';

describe('DOI normalization', () => {
  it.each([
    ['10.5555/ABC.123', '10.5555/abc.123'],
    ['  https://doi.org/10.5555/abc.123 ', '10.5555/abc.123'],
    ['http://dx.doi.org/10.5555/ABC.123', '10.5555/abc.123'],
    ['doi:10.5555/abc.123', '10.5555/abc.123'],
    ['DOI: 10.5555/abc.123', '10.5555/abc.123'],
    ['https://doi.org/10.5555%2Fabc%28x%29', '10.5555/abc(x)'],
    // Fullwidth digits/solidus fold through NFKC.
    ['１０.５５５５／abc', '10.5555/abc'],
  ])('canonicalizes %s', (input, expected) => {
    expect(normalizeDoi(input)).toBe(expected);
  });
  it.each([
    '',
    'not a doi',
    '10.12/too-short-prefix',
    '11.5555/abc',
    '10.5555/',
    '10.5555/with space',
    'https://doi.org/10.5555%ZZabc',
    `10.5555/${'x'.repeat(400)}`,
    null,
    undefined,
  ])('rejects invalid input %s without inventing identity', (input) => {
    expect(normalizeDoi(input)).toBeNull();
  });
  it('validates provider identifiers without guessing', () => {
    expect(normalizeOpenAlexId('https://openalex.org/W123')).toBe('W123');
    expect(normalizeOpenAlexId('w123')).toBe('W123');
    expect(normalizeOpenAlexId('A123')).toBeNull();
    expect(normalizeSemanticScholarId('F'.repeat(40))).toBe('f'.repeat(40));
    expect(normalizeSemanticScholarId('abc')).toBeNull();
  });
  it('normalizes tag names for project reuse', () => {
    expect(normalizeTag('  Protein   Folding ')).toBe('protein folding');
    expect(normalizeTag('ＭＬ')).toBe('ml');
  });
});

describe('search request contract', () => {
  it('rejects too-short, control-character and inverted year queries', () => {
    expect(searchRequest.safeParse({ query: 'a' }).success).toBe(false);
    expect(searchRequest.safeParse({ query: 'ok\u0000x' }).success).toBe(false);
    expect(
      searchRequest.safeParse({ query: 'ok', yearFrom: 2024, yearTo: 2020 })
        .success,
    ).toBe(false);
    expect(
      searchRequest.safeParse({ query: 'ok', unknownFilter: true }).success,
    ).toBe(false);
  });
  it('derives honest overall states from provider reports', () => {
    const r = (status: ProviderReport['status']): ProviderReport => ({
      provider: 'openalex',
      status,
      total: null,
      retryAfterSeconds: null,
      unsupported: [],
    });
    expect(overallSearchState([r('ok'), r('ok')], 3)).toBe('success');
    expect(overallSearchState([r('ok'), r('unavailable')], 3)).toBe('partial');
    expect(overallSearchState([r('no_results'), r('no_results')], 0)).toBe(
      'no_results',
    );
    // A failure is never reported as an empty success.
    expect(overallSearchState([r('no_results'), r('unavailable')], 0)).toBe(
      'partial',
    );
    expect(overallSearchState([r('rate_limited'), r('skipped')], 0)).toBe(
      'rate_limited',
    );
    expect(overallSearchState([r('unavailable'), r('unavailable')], 0)).toBe(
      'unavailable',
    );
  });
});

describe('command contracts', () => {
  it('cannot smuggle scope or metadata into a paper save', () => {
    const base = {
      command: 'paper.save',
      projectId: crypto.randomUUID(),
      provider: 'openalex',
      externalId: 'W1',
      idempotencyKey: crypto.randomUUID(),
    };
    expect(researchCommand.safeParse(base).success).toBe(true);
    expect(
      researchCommand.safeParse({ ...base, organizationId: base.projectId })
        .success,
    ).toBe(false);
    expect(
      researchCommand.safeParse({ ...base, paper: { title: 'Invented' } })
        .success,
    ).toBe(false);
  });
  it('requires consistent annotation anchors', () => {
    const anchor = {
      pageNumber: 2,
      quote: 'evidence',
      prefix: null,
      suffix: null,
      startOffset: 10,
      endOffset: 18,
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.02 }],
    };
    expect(annotationAnchor.safeParse(anchor).success).toBe(true);
    expect(
      annotationAnchor.safeParse({ ...anchor, endOffset: null }).success,
    ).toBe(false);
    expect(
      annotationAnchor.safeParse({ ...anchor, startOffset: 20 }).success,
    ).toBe(false);
    expect(
      annotationAnchor.safeParse({
        ...anchor,
        rects: [{ x: 2, y: 0, width: 0, height: 0 }],
      }).success,
    ).toBe(false);
  });
  it('limits uploads to bounded PDF intents', () => {
    const input = {
      fileName: 'paper.pdf',
      mediaType: 'application/pdf',
      byteSize: 1024,
      sha256: 'a'.repeat(64),
      projectPaperId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
    };
    expect(uploadIntentInput.safeParse(input).success).toBe(true);
    for (const change of [
      { fileName: 'paper.html' },
      { fileName: '../paper.pdf' },
      { mediaType: 'text/html' },
      { byteSize: 25 * 1024 * 1024 + 1 },
      { sha256: 'xyz' },
    ])
      expect(uploadIntentInput.safeParse({ ...input, ...change }).success).toBe(
        false,
      );
  });
});

describe('citation export', () => {
  const entry: CitationEntry = {
    title: 'Fixture: 100% {robust} $x_1$ & more',
    authors: ['Ada Fixture', 'Bao Ngọc Example', 'Research Group, Atlas'],
    year: 2023,
    venue: 'Journal of Fixture Studies',
    doi: '10.5555/atlas.fixture.0001',
    url: 'https://doi.org/10.5555/atlas.fixture.0001',
    publicationType: 'article',
  };
  it('escapes LaTeX-sensitive characters and keeps Unicode', () => {
    expect(escapeLatex('a_b & 50% #1 {x} ~ ^ \\ $')).toBe(
      'a\\_b \\& 50\\% \\#1 \\{x\\} \\textasciitilde{} \\textasciicircum{} \\textbackslash{} \\$',
    );
    const bib = toBibtex([entry]);
    expect(bib).toContain('@article{fixture2023fixture,');
    expect(bib).toContain(
      'title = {Fixture: 100\\% \\{robust\\} \\$x\\_1\\$ \\& more}',
    );
    expect(bib).toContain(
      'author = {Ada Fixture and Bao Ngọc Example and {Research Group, Atlas}}',
    );
    expect(bib).toContain('journal = {Journal of Fixture Studies}');
    expect(bib).toContain('doi = {10.5555/atlas.fixture.0001}');
  });
  it('omits missing fields instead of fabricating them', () => {
    const sparse: CitationEntry = {
      title: 'Untitled preprint',
      authors: [],
      year: null,
      venue: null,
      doi: null,
      url: null,
      publicationType: null,
    };
    const bib = toBibtex([sparse]);
    expect(bib).toBe(
      '@misc{anonnduntitled,\n  title = {Untitled preprint}\n}\n',
    );
    expect(toRis([sparse])).toBe(
      'TY  - GEN\r\nTI  - Untitled preprint\r\nER  -\r\n',
    );
    expect(formatReference(sparse)).toBe('Untitled preprint.');
  });
  it('produces stable unique keys inside a collection export', () => {
    expect(citationKey(entry)).toBe('fixture2023fixture');
    const bib = toBibtex([entry, entry, entry]);
    expect(bib.match(/@article\{([^,]+),/g)).toEqual([
      '@article{fixture2023fixture,',
      '@article{fixture2023fixtureb,',
      '@article{fixture2023fixturec,',
    ]);
  });
  it('writes RIS with typed records and one AU line per author', () => {
    const ris = toRis([entry]);
    expect(ris.split('\r\n')).toEqual([
      'TY  - JOUR',
      'TI  - Fixture: 100% {robust} $x_1$ & more',
      'AU  - Ada Fixture',
      'AU  - Bao Ngọc Example',
      'AU  - Research Group, Atlas',
      'PY  - 2023',
      'T2  - Journal of Fixture Studies',
      'DO  - 10.5555/atlas.fixture.0001',
      'UR  - https://doi.org/10.5555/atlas.fixture.0001',
      'ER  -',
      '',
    ]);
  });
});
