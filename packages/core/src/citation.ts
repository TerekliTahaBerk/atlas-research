/*
 * Deterministic bibliographic export. Only fields present in the saved
 * metadata are written; nothing is inferred or invented for missing values.
 */
export interface CitationEntry {
  title: string;
  authors: readonly string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
  publicationType: string | null;
  /** A03: exact interchange type; when set it decides the entry type. */
  recordType?: string | null;
  volume?: string | null;
  issue?: string | null;
  /** Published page range of the work, never a PDF evidence locator. */
  pages?: string | null;
  publisher?: string | null;
  /** Project paper ID written as an `atlas:<id>` round-trip marker. */
  atlasId?: string | null;
}

type EntryKind =
  | 'article'
  | 'conference'
  | 'book'
  | 'chapter'
  | 'thesis'
  | 'report'
  | 'generic';
const recordKinds: Record<string, EntryKind> = {
  'journal-article': 'article',
  'conference-paper': 'conference',
  book: 'book',
  'book-chapter': 'chapter',
  thesis: 'thesis',
  report: 'report',
};
function kind(entry: CitationEntry): EntryKind {
  if (entry.recordType) return recordKinds[entry.recordType] ?? 'generic';
  const type = entry.publicationType?.toLowerCase() ?? '';
  if (/proceedings|conference/.test(type)) return 'conference';
  if (entry.venue && /article|journal/.test(type)) return 'article';
  return 'generic';
}

const latexSpecials: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  '#': '\\#',
  $: '\\$',
  '%': '\\%',
  '&': '\\&',
  _: '\\_',
  '^': '\\textasciicircum{}',
  '~': '\\textasciitilde{}',
};
/** Escapes LaTeX-active characters; Unicode is preserved for biber/UTF-8. */
export function escapeLatex(value: string) {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\\{}#$%&_^~]/g, (c) => latexSpecials[c] ?? c)
    .trim();
}

function asciiWord(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}
const stopWords = new Set(['a', 'an', 'the', 'on', 'of', 'in', 'for', 'and']);
/** Stable key: first-author family token + year + first significant word. */
export function citationKey(entry: CitationEntry) {
  const author = asciiWord(entry.authors[0] ?? '').at(-1) ?? 'anon';
  const word =
    asciiWord(entry.title).find((w) => !stopWords.has(w.toLowerCase())) ??
    'untitled';
  return `${author}${entry.year ?? 'nd'}${word}`.toLowerCase().slice(0, 60);
}

function uniqueKeys(entries: readonly CitationEntry[]) {
  const seen = new Map<string, number>();
  return entries.map((entry) => {
    const base = citationKey(entry);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    if (count === 0) return base;
    // a, b, … z, then numeric suffixes keep keys unique in large exports.
    return count < 26
      ? `${base}${String.fromCharCode(97 + count)}`
      : `${base}${count}`;
  });
}

function bibName(name: string) {
  // A comma or literal "and" would be parsed as name structure; brace it.
  return /,|\sand\s/i.test(name) ? `{${escapeLatex(name)}}` : escapeLatex(name);
}

export function toBibtex(entries: readonly CitationEntry[]) {
  const keys = uniqueKeys(entries);
  return entries
    .map((entry, index) => {
      const type = kind(entry);
      const fields: [string, string][] = [['title', escapeLatex(entry.title)]];
      if (entry.authors.length)
        fields.push(['author', entry.authors.map(bibName).join(' and ')]);
      if (entry.year !== null) fields.push(['year', String(entry.year)]);
      if (entry.venue)
        fields.push([
          type === 'article'
            ? 'journal'
            : type === 'conference' || type === 'chapter'
              ? 'booktitle'
              : type === 'thesis'
                ? 'school'
                : type === 'report'
                  ? 'institution'
                  : 'howpublished',
          escapeLatex(entry.venue),
        ]);
      if (entry.volume) fields.push(['volume', escapeLatex(entry.volume)]);
      if (entry.issue) fields.push(['number', escapeLatex(entry.issue)]);
      if (entry.pages)
        fields.push(['pages', escapeLatex(entry.pages).replace(/–/g, '--')]);
      if (entry.publisher)
        fields.push(['publisher', escapeLatex(entry.publisher)]);
      if (entry.doi) fields.push(['doi', escapeLatex(entry.doi)]);
      if (entry.url) fields.push(['url', entry.url.replace(/[{}\s]/g, '')]);
      if (entry.atlasId) fields.push(['atlasid', `atlas:${entry.atlasId}`]);
      const bibType = (
        {
          article: 'article',
          conference: 'inproceedings',
          book: 'book',
          chapter: 'incollection',
          thesis: 'phdthesis',
          report: 'techreport',
          generic: 'misc',
        } as const
      )[type];
      return `@${bibType}{${keys[index]},\n${fields
        .map(([name, value]) => `  ${name} = {${value}}`)
        .join(',\n')}\n}`;
    })
    .join('\n\n')
    .concat(entries.length ? '\n' : '');
}

function risValue(value: string) {
  return value.replace(/[\r\n\t]+/g, ' ').trim();
}
export function toRis(entries: readonly CitationEntry[]) {
  return entries
    .map((entry) => {
      const type = kind(entry);
      const lines: [string, string][] = [
        [
          'TY',
          (
            {
              article: 'JOUR',
              conference: 'CPAPER',
              book: 'BOOK',
              chapter: 'CHAP',
              thesis: 'THES',
              report: 'RPRT',
              generic: 'GEN',
            } as const
          )[type],
        ],
        ['TI', risValue(entry.title)],
      ];
      for (const author of entry.authors) lines.push(['AU', risValue(author)]);
      if (entry.year !== null) lines.push(['PY', String(entry.year)]);
      if (entry.venue) lines.push(['T2', risValue(entry.venue)]);
      if (entry.volume) lines.push(['VL', risValue(entry.volume)]);
      if (entry.issue) lines.push(['IS', risValue(entry.issue)]);
      if (entry.pages) {
        const [start, end] = risValue(entry.pages).split(/\s*[-–]+\s*/);
        if (start) lines.push(['SP', start]);
        if (end) lines.push(['EP', end]);
      }
      if (entry.publisher) lines.push(['PB', risValue(entry.publisher)]);
      if (entry.doi) lines.push(['DO', risValue(entry.doi)]);
      if (entry.url) lines.push(['UR', risValue(entry.url)]);
      if (entry.atlasId) lines.push(['ID', `atlas:${entry.atlasId}`]);
      lines.push(['ER', '']);
      return lines
        .map(([tag, value]) => `${tag}  - ${value}`.trimEnd())
        .join('\r\n');
    })
    .join('\r\n\r\n')
    .concat(entries.length ? '\r\n' : '');
}

/** Plain-text reference for clipboard copy; omits absent fields. */
export function formatReference(entry: CitationEntry) {
  const parts = [
    entry.authors.length > 3
      ? `${entry.authors.slice(0, 3).join(', ')}, et al.`
      : entry.authors.join(', '),
    entry.year !== null ? `(${entry.year})` : '',
    `${entry.title.replace(/\.$/, '')}.`,
    entry.venue ? `${entry.venue}.` : '',
    entry.doi ? `https://doi.org/${entry.doi}` : (entry.url ?? ''),
  ];
  return parts.filter(Boolean).join(' ');
}
