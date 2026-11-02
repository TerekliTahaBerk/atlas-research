import { describe, expect, it, vi } from 'vitest';
import {
  decodeLatex,
  fromZoteroItem,
  parseBibtex,
  parseCslJson,
  parseRis,
  referenceTypeOf,
  similarityKey,
  toBibtex,
  toCslJson,
  toRis,
} from '../../packages/core/src/index';
import {
  openCredential,
  sealCredential,
} from '@/features/integrations/server/credentials';

const id = '11111111-1111-4111-8111-111111111111';

describe('BibTeX import', () => {
  it('parses multiple entries, macros, Unicode names, escapes and multiline values', () => {
    const { records, issues } = parseBibtex(String.raw`
@string{jfx = "Journal of"}
@ARTICLE{a1,
  author = {de la Cruz, Mar{\'i}a and {\O}rsted, Hans and {European Space Agency}},
  title = "Multi-line
           {DNA} title with 50\% and \& signs",
  journal = jfx # { Fixtures}, year = 2021, month = feb,
  pages = {1--9}, doi = {doi:10.1000/ABC},
  keywords = {one; two}, unknownfield = {x}
}
@book{b1, title = {A {Book}}, editor = {Editor, Ed}, publisher = {Pub}, isbn = {978-0-306-40615-7}, year = {1999}}
@phdthesis{t1, title = {A thesis}, school = {Uni}, year = 2010}
@misc{p1, title = {An arXiv preprint}, eprint = {2101.00001}, archivePrefix = {arXiv}, year = 2021}
@weirdtype{w1, title = {Unknown type}}`);
    expect(issues).toEqual([]);
    expect(records.map((r) => r.record?.type)).toEqual([
      'journal-article',
      'book',
      'thesis',
      'preprint',
      'other',
    ]);
    const a = records[0]!;
    expect(a.record).toMatchObject({
      title: 'Multi-line DNA title with 50% and & signs',
      authors: [
        { family: 'de la Cruz', given: 'María' },
        { family: 'Ørsted', given: 'Hans' },
        { literal: 'European Space Agency' },
      ],
      containerTitle: 'Journal of Fixtures',
      issued: { year: 2021, month: 2 },
      pages: '1–9',
      doi: '10.1000/abc',
      keywords: ['one', 'two'],
    });
    expect(a.unsupported).toEqual(['unknownfield']);
    expect(records[1]!.record).toMatchObject({
      editors: [{ family: 'Editor', given: 'Ed' }],
      publisher: 'Pub',
      isbn: ['978-0-306-40615-7'],
    });
    expect(records[2]!.record?.publisher).toBe('Uni');
    expect(records[4]!.record?.originalType).toBe('weirdtype');
  });

  it('never executes LaTeX and recovers from malformed entries', () => {
    expect(
      decodeLatex(
        String.raw`\input{/etc/passwd} \write18{rm -rf /} {\bf bold} \"o`,
      ),
    ).toEqual({
      text: '/etc/passwd 18rm -rf / bold ö',
      commands: true,
    });
    const { records, issues } = parseBibtex(String.raw`
@preamble{"\usepackage{evil}"}
@article{bad, title = {open brace
@article{good, title = {Survives}}
@article{nest, title = ${'{'.repeat(40)}x${'}'.repeat(40)}}`);
    expect(records.map((r) => [r.provenance.key, !!r.record])).toEqual([
      ['bad', false],
      ['good', true],
      ['nest', false],
    ]);
    expect(issues.map((i) => i.message).join(' ')).toMatch(
      /preamble.*never executed|never executed/,
    );
    expect(issues.some((i) => /nested too deeply/.test(i.message))).toBe(true);
  });

  it('bounds size and entry count', () => {
    expect(parseBibtex('x'.repeat(2_000_001)).issues[0]!.message).toMatch(
      /2 MB/,
    );
    const many = Array.from(
      { length: 2001 },
      (_, i) => `@misc{k${i}, title={T${i}}}`,
    ).join('\n');
    const result = parseBibtex(many);
    expect(result.records).toHaveLength(2000);
    expect(result.issues.at(-1)!.message).toMatch(/first 2000/);
  });

  it('keeps missing metadata missing and drops unsafe values', () => {
    const [r] = parseBibtex(
      String.raw`@article{x, title={Only a title}, url={javascript:alert(1)}, doi={not-a-doi}, year={MMXX}}`,
    ).records;
    expect(r!.record).toMatchObject({
      authors: [],
      issued: null,
      doi: null,
      url: null,
      pages: null,
    });
    expect(r!.issues).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/DOI/),
        expect.stringMatching(/URL/),
        expect.stringMatching(/year/),
      ]),
    );
  });
});

describe('RIS and CSL JSON import', () => {
  it('parses RIS with continuations, page ranges, ISSN/ISBN and missing ER', () => {
    const { records, issues } = parseRis(
      'TY  - JOUR\nTI  - First\nAU  - Doe, Jane\nAU  - Roe, Rick\nPY  - 2020///\nSP  - 5\nEP  - 9\nSN  - 1234-5678\nAB  - Line one\n continues here\nKW  - k1\nKW  - k2\nZZ  - custom\nER  - \nTY  - BOOK\nTI  - Second without ER\nSN  - 9780306406157\n',
    );
    expect(records.map((r) => r.record?.title)).toEqual([
      'First',
      'Second without ER',
    ]);
    expect(records[0]!.record).toMatchObject({
      pages: '5–9',
      issn: ['1234-5678'],
      abstract: 'Line one continues here',
      keywords: ['k1', 'k2'],
      issued: { year: 2020 },
    });
    expect(records[0]!.unsupported).toEqual(['ZZ']);
    expect(records[1]!.record).toMatchObject({
      type: 'book',
      isbn: ['9780306406157'],
    });
    expect(issues[0]!.message).toMatch(/no ER/);
  });

  it('parses CSL JSON faithfully and rejects non-JSON safely', () => {
    const { records } = parseCslJson(
      JSON.stringify([
        {
          id: 'k',
          type: 'chapter',
          title: 'C',
          author: [{ literal: 'Org' }],
          editor: [{ family: 'E', given: 'F' }],
          issued: { 'date-parts': [[2018, 3, 4]] },
          'container-title': 'Book',
          page: '3-4',
          ISBN: ['9780306406157'],
          custom: 1,
        },
        { type: 'motion_picture', title: 'Film' },
        'not an item',
      ]),
    );
    expect(records[0]!.record).toMatchObject({
      type: 'book-chapter',
      authors: [{ literal: 'Org' }],
      editors: [{ family: 'E', given: 'F' }],
      issued: { year: 2018, month: 3, day: 4 },
    });
    expect(records[0]!.unsupported).toEqual(['custom']);
    expect(records[1]!.record).toMatchObject({
      type: 'other',
      originalType: 'motion_picture',
    });
    expect(records[2]!.record).toBeNull();
    expect(parseCslJson('{not json').issues[0]!.message).toMatch(
      /not valid JSON/,
    );
  });

  it('maps Zotero items without importing attachments or notes', () => {
    expect(
      fromZoteroItem(
        {
          key: 'AAAA1111',
          version: 1,
          data: { itemType: 'attachment', title: 'PDF' },
        },
        'users/1',
      ).record,
    ).toBeNull();
    const parsed = fromZoteroItem(
      {
        key: 'AAAA1111',
        version: 3,
        data: {
          itemType: 'conferencePaper',
          title: 'T',
          proceedingsTitle: 'Proc',
          date: '2021-05',
          creators: [{ creatorType: 'author', lastName: 'L', firstName: 'F' }],
        },
      },
      'groups/2',
    );
    expect(parsed.record).toMatchObject({
      type: 'conference-paper',
      containerTitle: 'Proc',
      issued: { year: 2021, month: 5 },
    });
    expect(parsed.provenance).toMatchObject({
      source: 'ZOTERO',
      key: 'AAAA1111',
      version: 3,
      library: 'groups/2',
    });
  });
});

describe('export and round trip', () => {
  const record = parseBibtex(
    String.raw`@article{k, author={Okafor, Ada}, title={Round trip}, journal={J}, year=2024, volume={1}, number={2}, pages={3--4}, publisher={P}, doi={10.5555/rt}}`,
  ).records[0]!.record!;
  it('round-trips through CSL JSON, BibTeX and RIS without losing fields or the Atlas marker', () => {
    const csl = parseCslJson(toCslJson([{ atlasId: id, record }])).records[0]!;
    expect(csl.record).toEqual(record);
    expect(csl.provenance.atlasId).toBe(id);
    const entry = {
      title: record.title,
      authors: ['Ada Okafor'],
      year: 2024,
      venue: 'J',
      doi: record.doi,
      url: null,
      publicationType: null,
      recordType: record.type,
      volume: '1',
      issue: '2',
      pages: '3–4',
      publisher: 'P',
      atlasId: id,
    };
    const bib = parseBibtex(toBibtex([entry])).records[0]!;
    expect(bib.record).toMatchObject({
      title: 'Round trip',
      doi: '10.5555/rt',
      volume: '1',
      issue: '2',
      pages: '3–4',
      publisher: 'P',
      containerTitle: 'J',
    });
    expect(bib.provenance.atlasId).toBe(id);
    const ris = parseRis(toRis([entry])).records[0]!;
    expect(ris.record).toMatchObject({
      title: 'Round trip',
      doi: '10.5555/rt',
      volume: '1',
      issue: '2',
      pages: '3–4',
    });
    expect(ris.provenance.atlasId).toBe(id);
  });

  it('keeps existing export output unchanged for entries without new fields', () => {
    const legacy = {
      title: 'T',
      authors: ['A B'],
      year: 2020,
      venue: 'V',
      doi: '10.1/x',
      url: null,
      publicationType: 'journal-article',
    };
    expect(toBibtex([legacy])).toBe(
      '@article{b2020t,\n  title = {T},\n  author = {A B},\n  year = {2020},\n  journal = {V},\n  doi = {10.1/x}\n}\n',
    );
    expect(toRis([legacy])).toBe(
      'TY  - JOUR\r\nTI  - T\r\nAU  - A B\r\nPY  - 2020\r\nT2  - V\r\nDO  - 10.1/x\r\nER  -\r\n',
    );
  });

  it('maps provider types conservatively and treats similarity as a signal', () => {
    expect(
      [
        'article',
        'proceedings-article',
        'book-chapter',
        'dissertation',
        'unknown',
      ].map(referenceTypeOf),
    ).toEqual([
      'journal-article',
      'conference-paper',
      'book-chapter',
      'thesis',
      'other',
    ]);
    expect(
      similarityKey({ title: 'Héllo, World!', issued: null, authors: [] }),
    ).toEqual({ title: 'hello world', year: null, family: '' });
  });
});

describe('credential envelope', () => {
  it('encrypts with owner/provider binding and fails closed', () => {
    vi.stubEnv(
      'ATLAS_INTEGRATION_KEY',
      Buffer.alloc(32, 9).toString('base64url'),
    );
    const envelope = sealCredential(
      'SECRETKEY000000000000000',
      'owner-a',
      'ZOTERO',
    );
    expect(envelope).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(envelope).not.toContain('SECRETKEY');
    expect(openCredential(envelope, 'owner-a', 'ZOTERO')).toBe(
      'SECRETKEY000000000000000',
    );
    expect(openCredential(envelope, 'owner-b', 'ZOTERO')).toBeNull();
    const parts = envelope.split('.');
    expect(
      openCredential(
        [
          parts[0],
          parts[1],
          parts[2]!.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')),
          parts[3],
        ].join('.'),
        'owner-a',
        'ZOTERO',
      ),
    ).toBeNull();
    vi.stubEnv(
      'ATLAS_INTEGRATION_KEY',
      Buffer.alloc(32, 1).toString('base64url'),
    );
    expect(openCredential(envelope, 'owner-a', 'ZOTERO')).toBeNull();
    vi.unstubAllEnvs();
  });
});
