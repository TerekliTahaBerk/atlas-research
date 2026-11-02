import { z } from 'zod';
import { normalizeDoi } from './doi';

/*
 * A03 scholarly metadata interchange. One normalized record shape for every
 * import/export format. Parsers treat input as untrusted *data*: BibTeX is
 * never executed as LaTeX, nothing is fetched from imported URLs, and every
 * input is bounded in size, entry count, nesting depth and work. Missing
 * metadata stays missing; unknown publication types stay `other` with the
 * original label preserved instead of being guessed.
 */

export const interchangeLimits = {
  bytes: 2_000_000,
  entries: 2000,
  depth: 32,
  fieldChars: 20_000,
  persons: 200,
  keywords: 50,
} as const;

export const referenceTypes = [
  'journal-article',
  'conference-paper',
  'book',
  'book-chapter',
  'thesis',
  'report',
  'preprint',
  'dataset',
  'webpage',
  'other',
] as const;
export const referenceType = z.enum(referenceTypes);
export type ReferenceType = z.infer<typeof referenceType>;
export const referenceTypeLabels: Record<ReferenceType, string> = {
  'journal-article': 'Journal article',
  'conference-paper': 'Conference paper',
  book: 'Book',
  'book-chapter': 'Book chapter',
  thesis: 'Thesis',
  report: 'Report',
  preprint: 'Preprint',
  dataset: 'Dataset',
  webpage: 'Web page',
  other: 'Other',
};
export const interchangeFormats = ['bibtex', 'ris', 'csl-json'] as const;
export const interchangeFormat = z.enum(interchangeFormats);
export type InterchangeFormat = z.infer<typeof interchangeFormat>;
export const referenceSources = [
  'BIBTEX',
  'RIS',
  'CSL_JSON',
  'ZOTERO',
] as const;
export const referenceSource = z.enum(referenceSources);
export type ReferenceSource = z.infer<typeof referenceSource>;

const control = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const clean = (value: string, max: number) =>
  value.replace(control, '').replace(/\s+/g, ' ').trim().slice(0, max);
const str = (max: number) =>
  z
    .string()
    .max(max * 2)
    .transform((v) => clean(v, max))
    .pipe(z.string().min(1).max(max));
const optionalStr = (max: number) => str(max).nullable().default(null);
const httpUrl = z
  .string()
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !/\s/.test(value);
    } catch {
      return false;
    }
  }, 'Only http(s) URLs are kept.');

export const personName = z.union([
  z
    .object({
      family: str(200),
      given: optionalStr(200),
    })
    .strict(),
  z.object({ literal: str(300) }).strict(),
]);
export type PersonName = z.infer<typeof personName>;
export const issuedDate = z
  .object({
    year: z.number().int().min(1000).max(2100),
    month: z.number().int().min(1).max(12).nullable().default(null),
    day: z.number().int().min(1).max(31).nullable().default(null),
  })
  .strict();

/** The normalized, format-independent bibliographic record. */
export const referenceRecord = z
  .object({
    type: referenceType,
    /** The source's own type label when it did not map exactly. */
    originalType: optionalStr(60),
    title: str(1000),
    authors: z.array(personName).max(interchangeLimits.persons).default([]),
    editors: z.array(personName).max(interchangeLimits.persons).default([]),
    doi: z.string().max(300).nullable().default(null),
    issued: issuedDate.nullable().default(null),
    containerTitle: optionalStr(500),
    volume: optionalStr(40),
    issue: optionalStr(40),
    /** Published page range of the work — never a PDF evidence locator. */
    pages: optionalStr(60),
    publisher: optionalStr(300),
    issn: z.array(str(20)).max(4).default([]),
    isbn: z.array(str(20)).max(4).default([]),
    abstract: optionalStr(interchangeLimits.fieldChars),
    language: optionalStr(20),
    keywords: z.array(str(120)).max(interchangeLimits.keywords).default([]),
    url: httpUrl.nullable().default(null),
  })
  .strict();
export type ReferenceRecord = z.infer<typeof referenceRecord>;
export type ReferenceRecordInput = z.input<typeof referenceRecord>;

/** Where one parsed record came from; provenance, never an authorization. */
export const recordProvenance = z
  .object({
    source: referenceSource,
    /** Citation key, RIS ID, CSL id or Zotero item key, when present. */
    key: z.string().max(200).nullable(),
    index: z.number().int().min(0),
    /** Zotero library (`users/123`, `groups/456`) or the file's SHA-256. */
    library: z.string().max(80).nullable(),
    version: z.number().int().min(0).nullable(),
    /** An `atlas:<uuid>` marker exported by Atlas, if present. */
    atlasId: z.uuid().nullable(),
  })
  .strict();
export type RecordProvenance = z.infer<typeof recordProvenance>;

export type ParseIssue = {
  index: number | null;
  severity: 'error' | 'warning';
  message: string;
};
export type ParsedRecord = {
  record: ReferenceRecord | null;
  provenance: RecordProvenance;
  /** Unsupported fields (names only); their values are not imported. */
  unsupported: string[];
  issues: string[];
};
export type ParseResult = { records: ParsedRecord[]; issues: ParseIssue[] };

class LimitError extends Error {}

// ------------------------------------------------------------- utilities

function personFromString(raw: string): PersonName | null {
  const value = raw.trim();
  if (!value) return null;
  // `{World Health Organization}` and similar corporate names stay literal.
  if (/^\{[^{}]*\}$/.test(value))
    return { literal: clean(value.slice(1, -1), 300) };
  if (value.includes(',')) {
    const [family, ...rest] = value.split(',');
    const given = rest.join(',').trim();
    return family?.trim()
      ? {
          family: clean(stripBraces(family), 200),
          given: given ? clean(stripBraces(given), 200) : null,
        }
      : null;
  }
  const parts = stripBraces(value).split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { family: clean(parts[0]!, 200), given: null };
  // "von" particles stay with the family name.
  let start = parts.length - 1;
  while (start > 1 && /^[a-z]/.test(parts[start - 1]!)) start--;
  return {
    family: clean(parts.slice(start).join(' '), 200),
    given: clean(parts.slice(0, start).join(' '), 200) || null,
  };
}
const stripBraces = (value: string) => value.replace(/[{}]/g, '');
const yearOf = (value: string | null | undefined) => {
  const match = value?.match(/\b(1[0-9]{3}|20[0-9]{2}|2100)\b/);
  return match ? Number(match[1]) : null;
};
function dateOf(value: string | null | undefined) {
  if (!value) return null;
  const iso = value.match(/^(\d{4})(?:[-/](\d{1,2}))?(?:[-/](\d{1,2}))?/);
  if (iso) {
    const year = Number(iso[1]);
    if (year < 1000 || year > 2100) return null;
    const month = iso[2] ? Number(iso[2]) : null;
    const day = iso[3] ? Number(iso[3]) : null;
    return {
      year,
      month: month && month >= 1 && month <= 12 ? month : null,
      day: month && day && day >= 1 && day <= 31 ? day : null,
    };
  }
  const year = yearOf(value);
  return year ? { year, month: null, day: null } : null;
}
const months: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};
const atlasMarker = (value: string | null | undefined) =>
  value
    ?.match(
      /^atlas:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
    )?.[1]
    ?.toLowerCase() ?? null;
const splitIdentifiers = (value: string | null | undefined) =>
  (value ?? '')
    .split(/[,;\s]+/)
    .map((v) => v.trim())
    .filter(Boolean);
const isIsbn = (value: string) =>
  /^(97[89])?\d{9}[\dXx]$/.test(value.replace(/-/g, ''));
const isIssn = (value: string) => /^\d{4}-?\d{3}[\dXx]$/.test(value);

/** Validates a draft into a record; never throws for content problems. */
function finish(
  draft: ReferenceRecordInput & { title?: string | null },
  provenance: RecordProvenance,
  unsupported: string[],
  issues: string[],
): ParsedRecord {
  if (draft.doi !== undefined && draft.doi !== null) {
    const doi = normalizeDoi(draft.doi);
    if (!doi) issues.push('The DOI is not a well-formed DOI and was dropped.');
    draft.doi = doi;
  }
  if (draft.url) {
    const url = httpUrl.safeParse(draft.url);
    if (!url.success) {
      issues.push('A non-http(s) URL was dropped.');
      draft.url = null;
    }
  }
  if (!draft.title || !clean(draft.title, 1000)) {
    issues.push('Missing title.');
    return { record: null, provenance, unsupported, issues };
  }
  const parsed = referenceRecord.safeParse(draft);
  if (!parsed.success) {
    issues.push(
      `Invalid fields: ${[...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? 'record')))].join(', ')}.`,
    );
    return { record: null, provenance, unsupported, issues };
  }
  return { record: parsed.data, provenance, unsupported, issues };
}
function checkSize(text: string) {
  if (new TextEncoder().encode(text).length > interchangeLimits.bytes)
    throw new LimitError('The file is larger than 2 MB.');
}

// --------------------------------------------------------------- BibTeX

const latexAccents: Record<string, Record<string, string>> = {
  "'": {
    a: 'á',
    e: 'é',
    i: 'í',
    o: 'ó',
    u: 'ú',
    y: 'ý',
    c: 'ć',
    n: 'ń',
    s: 'ś',
    z: 'ź',
    A: 'Á',
    E: 'É',
    I: 'Í',
    O: 'Ó',
    U: 'Ú',
    C: 'Ć',
    S: 'Ś',
    Z: 'Ź',
  },
  '`': {
    a: 'à',
    e: 'è',
    i: 'ì',
    o: 'ò',
    u: 'ù',
    A: 'À',
    E: 'È',
    O: 'Ò',
    U: 'Ù',
  },
  '"': {
    a: 'ä',
    e: 'ë',
    i: 'ï',
    o: 'ö',
    u: 'ü',
    y: 'ÿ',
    A: 'Ä',
    E: 'Ë',
    O: 'Ö',
    U: 'Ü',
  },
  '^': {
    a: 'â',
    e: 'ê',
    i: 'î',
    o: 'ô',
    u: 'û',
    A: 'Â',
    E: 'Ê',
    O: 'Ô',
    U: 'Û',
  },
  '~': { a: 'ã', n: 'ñ', o: 'õ', A: 'Ã', N: 'Ñ', O: 'Õ' },
  c: { c: 'ç', C: 'Ç', s: 'ş', S: 'Ş' },
  v: { c: 'č', s: 'š', z: 'ž', r: 'ř', e: 'ě', C: 'Č', S: 'Š', Z: 'Ž', R: 'Ř' },
  u: { g: 'ğ', a: 'ă', G: 'Ğ', A: 'Ă' },
  H: { o: 'ő', u: 'ű', O: 'Ő', U: 'Ű' },
  '.': { z: 'ż', I: 'İ', Z: 'Ż' },
};
const latexSymbols: Record<string, string> = {
  ss: 'ß',
  o: 'ø',
  O: 'Ø',
  ae: 'æ',
  AE: 'Æ',
  aa: 'å',
  AA: 'Å',
  l: 'ł',
  L: 'Ł',
  i: 'ı',
  '&': '&',
  '%': '%',
  _: '_',
  $: '$',
  '#': '#',
};
/**
 * Decodes the common, inert LaTeX accent/escape forms to Unicode and drops
 * grouping braces. Any other command is treated as text: its name is
 * removed and its argument kept. Nothing is ever expanded or executed.
 */
export function decodeLatex(value: string): {
  text: string;
  commands: boolean;
} {
  let commands = false;
  let out = value
    .replace(
      /\\([`'"^~.=])\s*\{?\\?([A-Za-z])\}?/g,
      (m, accent: string, letter: string) =>
        latexAccents[accent]?.[letter] ?? letter,
    )
    .replace(
      /\\([cvuH])\s*\{\\?([A-Za-z])\}/g,
      (m, accent: string, letter: string) =>
        latexAccents[accent]?.[letter] ?? letter,
    )
    .replace(
      /\\([cvuH])\s+([A-Za-z])/g,
      (m, accent: string, letter: string) =>
        latexAccents[accent]?.[letter] ?? letter,
    )
    .replace(
      /\\(ss|ae|AE|aa|AA|o|O|l|L|i)(?![A-Za-z])\s*/g,
      (m, name: string) => latexSymbols[name] ?? '',
    )
    .replace(/\\([&%_$#])/g, (m, c: string) => c)
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/\\[A-Za-z]+\*?/g, () => {
      commands = true;
      return '';
    });
  out = out.replace(/[{}]/g, '').replace(/~/g, ' ');
  return { text: out.replace(/\s+/g, ' ').trim(), commands };
}

const bibtexTypes: Record<string, ReferenceType> = {
  article: 'journal-article',
  inproceedings: 'conference-paper',
  conference: 'conference-paper',
  proceedings: 'other',
  book: 'book',
  incollection: 'book-chapter',
  inbook: 'book-chapter',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  thesis: 'thesis',
  techreport: 'report',
  report: 'report',
  online: 'webpage',
  electronic: 'webpage',
  www: 'webpage',
  dataset: 'dataset',
  unpublished: 'other',
  misc: 'other',
};
const bibtexKnown = new Set([
  'title',
  'author',
  'editor',
  'year',
  'month',
  'date',
  'journal',
  'journaltitle',
  'booktitle',
  'volume',
  'number',
  'issue',
  'pages',
  'publisher',
  'institution',
  'school',
  'organization',
  'issn',
  'isbn',
  'abstract',
  'language',
  'langid',
  'keywords',
  'url',
  'doi',
  'eprint',
  'archiveprefix',
  'eprinttype',
  'atlasid',
  'urldate',
]);

/** Splits a BibTeX name list on top-level `and`. */
function splitNames(value: string) {
  const names: string[] = [];
  let depth = 0;
  let current = '';
  const words = value.split(/(\s+and\s+|[{}])/i);
  for (const part of words) {
    if (part === '{') depth++;
    if (part === '}') depth--;
    if (depth === 0 && /^\s+and\s+$/i.test(part)) {
      names.push(current);
      current = '';
    } else current += part;
  }
  names.push(current);
  return names.map((n) => n.trim()).filter(Boolean);
}

/** Safe, bounded BibTeX/BibLaTeX parser. */
export function parseBibtex(
  text: string,
  library: string | null = null,
): ParseResult {
  const issues: ParseIssue[] = [];
  const records: ParsedRecord[] = [];
  try {
    checkSize(text);
  } catch (e) {
    return {
      records,
      issues: [
        { index: null, severity: 'error', message: (e as Error).message },
      ],
    };
  }
  const strings = new Map<string, string>(
    Object.entries(months).map(([k, v]) => [k, String(v)]),
  );
  let i = 0;
  const n = text.length;
  const skipSpace = () => {
    while (i < n && /\s/.test(text[i]!)) i++;
  };
  /** Reads a balanced `{…}` or `"…"` value; bounded depth/length. */
  const readDelimited = (): string => {
    const open = text[i];
    if (open === '{') {
      let depth = 0;
      const start = i;
      for (; i < n; i++) {
        const c = text[i];
        if (c === '\\') {
          i++;
          continue;
        }
        if (c === '{') {
          depth++;
          if (depth > interchangeLimits.depth)
            throw new LimitError('Braces are nested too deeply.');
        } else if (c === '}') {
          depth--;
          if (depth === 0) {
            i++;
            const inner = text.slice(start + 1, i - 1);
            if (inner.length > interchangeLimits.fieldChars)
              throw new LimitError('A field value is too long.');
            return inner;
          }
        }
      }
      throw new LimitError('Unterminated braced value.');
    }
    // Quoted: braces may nest inside; an unbraced quote ends the value.
    let depth = 0;
    const start = ++i;
    for (; i < n; i++) {
      const c = text[i];
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '"' && depth === 0) {
        const inner = text.slice(start, i);
        i++;
        if (inner.length > interchangeLimits.fieldChars)
          throw new LimitError('A field value is too long.');
        return inner;
      }
    }
    throw new LimitError('Unterminated quoted value.');
  };
  /** value := part (# part)* where part is delimited, number or macro. */
  const readValue = (): string => {
    let out = '';
    for (;;) {
      skipSpace();
      const c = text[i];
      if (c === '{' || c === '"') out += readDelimited();
      else {
        const match = /^[A-Za-z0-9_:.+\-/]+/.exec(text.slice(i, i + 200));
        if (!match) throw new LimitError('Expected a field value.');
        i += match[0].length;
        const word = match[0];
        out += /^\d+$/.test(word)
          ? word
          : (strings.get(word.toLowerCase()) ?? word);
      }
      skipSpace();
      if (text[i] === '#') {
        i++;
        continue;
      }
      return out;
    }
  };
  let index = 0;
  while (i < n) {
    const at = text.indexOf('@', i);
    if (at < 0) break;
    i = at + 1;
    const typeMatch = /^[A-Za-z]+/.exec(text.slice(i, i + 40));
    if (!typeMatch) continue;
    const entryType = typeMatch[0].toLowerCase();
    i += typeMatch[0].length;
    skipSpace();
    const close = text[i] === '(' ? ')' : '}';
    if (text[i] !== '{' && text[i] !== '(') continue;
    i++;
    if (entryType === 'comment' || entryType === 'preamble') {
      // Skipped as inert text; @preamble LaTeX is never executed.
      let depth = 1;
      for (; i < n && depth > 0; i++) {
        if (text[i] === '{' || text[i] === '(') depth++;
        else if (text[i] === '}' || text[i] === ')') depth--;
      }
      if (entryType === 'preamble')
        issues.push({
          index: null,
          severity: 'warning',
          message: '@preamble was ignored; LaTeX is never executed.',
        });
      continue;
    }
    if (entryType === 'string') {
      try {
        skipSpace();
        const name = /^[A-Za-z][A-Za-z0-9_:-]*/.exec(
          text.slice(i, i + 80),
        )?.[0];
        if (!name) throw new LimitError('Invalid @string.');
        i += name.length;
        skipSpace();
        if (text[i] !== '=') throw new LimitError('Invalid @string.');
        i++;
        if (strings.size > 500)
          throw new LimitError('Too many @string macros.');
        strings.set(name.toLowerCase(), readValue());
        skipSpace();
        if (text[i] === close) i++;
      } catch (e) {
        issues.push({
          index: null,
          severity: 'warning',
          message: `@string skipped: ${(e as Error).message}`,
        });
      }
      continue;
    }
    if (records.length >= interchangeLimits.entries) {
      issues.push({
        index: null,
        severity: 'error',
        message: `Only the first ${interchangeLimits.entries} entries are read.`,
      });
      break;
    }
    const entryIndex = index++;
    const entryStart = i;
    const fields = new Map<string, string>();
    let key: string | null = null;
    try {
      skipSpace();
      const keyMatch = /^[^,\s{}()"#=]+/.exec(text.slice(i, i + 220));
      if (keyMatch) {
        key = keyMatch[0].slice(0, 200);
        i += keyMatch[0].length;
      }
      skipSpace();
      if (text[i] === ',') i++;
      for (;;) {
        skipSpace();
        if (text[i] === close) {
          i++;
          break;
        }
        if (i >= n) throw new LimitError('Unterminated entry.');
        const name = /^[A-Za-z][A-Za-z0-9_:.+-]*/.exec(
          text.slice(i, i + 80),
        )?.[0];
        if (!name) throw new LimitError('Expected a field name.');
        i += name.length;
        skipSpace();
        if (text[i] !== '=')
          throw new LimitError(`Expected “=” after ${name}.`);
        i++;
        const value = readValue();
        if (fields.size < 200) fields.set(name.toLowerCase(), value);
        skipSpace();
        if (text[i] === ',') i++;
      }
    } catch (e) {
      // Recover at the next entry; the malformed one is reported, not guessed.
      issues.push({
        index: entryIndex,
        severity: 'error',
        message: `Entry ${key ?? entryIndex + 1}: ${(e as Error).message}`,
      });
      records.push({
        record: null,
        provenance: {
          source: 'BIBTEX',
          key,
          index: entryIndex,
          library,
          version: null,
          atlasId: null,
        },
        unsupported: [],
        issues: [(e as Error).message],
      });
      const next = text.indexOf('@', entryStart);
      i = next < 0 ? n : next;
      continue;
    }
    const entryIssues: string[] = [];
    let latex = false;
    const get = (...names: string[]) => {
      for (const name of names) {
        const raw = fields.get(name);
        if (raw !== undefined) {
          const decoded = decodeLatex(raw);
          latex ||= decoded.commands;
          return decoded.text || null;
        }
      }
      return null;
    };
    const mapped = bibtexTypes[entryType];
    let type: ReferenceType = mapped ?? 'other';
    const eprint =
      fields.has('eprint') ||
      /arxiv/i.test(
        fields.get('archiveprefix') ?? fields.get('eprinttype') ?? '',
      );
    if (
      (entryType === 'misc' ||
        entryType === 'unpublished' ||
        entryType === 'online') &&
      eprint
    )
      type = 'preprint';
    const persons = (raw: string | undefined) =>
      raw === undefined
        ? []
        : splitNames(raw)
            .map((name) => {
              const decoded = decodeLatex(name.replace(/^\{(.*)\}$/s, '{$1}'));
              latex ||= decoded.commands;
              return /^\{.*\}$/s.test(name.trim())
                ? personFromString(
                    `{${decodeLatex(name.trim().slice(1, -1)).text}}`,
                  )
                : personFromString(decodeLatex(name).text);
            })
            .filter((p): p is PersonName => !!p);
    const yearValue = yearOf(get('year'));
    const date =
      dateOf(get('date')) ??
      (yearValue ? { year: yearValue, month: null, day: null } : null);
    if (date && date.year && fields.has('month') && !date.month) {
      const month =
        Number(get('month')) ||
        months[(get('month') ?? '').slice(0, 3).toLowerCase()] ||
        null;
      if (month && month >= 1 && month <= 12) date.month = month;
    }
    const ids = splitIdentifiers(get('isbn')).concat(
      splitIdentifiers(get('issn')),
    );
    const draft: ReferenceRecordInput = {
      type,
      originalType: mapped && type !== 'preprint' ? null : entryType,
      title: get('title') ?? '',
      authors: persons(fields.get('author')),
      editors: persons(fields.get('editor')),
      doi: get('doi'),
      issued: date,
      containerTitle: get('journal', 'journaltitle', 'booktitle'),
      volume: get('volume'),
      issue: get('number', 'issue'),
      pages: get('pages'),
      publisher: get('publisher', 'institution', 'school', 'organization'),
      issn: ids.filter(isIssn).slice(0, 4),
      isbn: ids.filter(isIsbn).slice(0, 4),
      abstract: get('abstract'),
      language: get('language', 'langid'),
      keywords: (get('keywords') ?? '')
        .split(/[,;]/)
        .map((k) => k.trim())
        .filter(Boolean)
        .slice(0, interchangeLimits.keywords),
      url: get('url'),
    };
    if (latex) entryIssues.push('LaTeX commands were removed; text was kept.');
    if (date === null && (fields.has('year') || fields.has('date')))
      entryIssues.push('The year is not a valid year and was dropped.');
    const unsupported = [...fields.keys()].filter((f) => !bibtexKnown.has(f));
    const atlasId = atlasMarker(fields.get('atlasid')?.trim());
    records.push(
      finish(
        draft,
        {
          source: 'BIBTEX',
          key,
          index: entryIndex,
          library,
          version: null,
          atlasId,
        },
        unsupported,
        entryIssues,
      ),
    );
  }
  return { records, issues };
}

// ------------------------------------------------------------------ RIS

const risTypes: Record<string, ReferenceType> = {
  JOUR: 'journal-article',
  JFULL: 'journal-article',
  MGZN: 'journal-article',
  CONF: 'conference-paper',
  CPAPER: 'conference-paper',
  BOOK: 'book',
  EBOOK: 'book',
  CHAP: 'book-chapter',
  ECHAP: 'book-chapter',
  THES: 'thesis',
  RPRT: 'report',
  UNPB: 'preprint',
  ELEC: 'webpage',
  WEB: 'webpage',
  DATA: 'dataset',
  GEN: 'other',
};
const risKnown = new Set([
  'TY',
  'TI',
  'T1',
  'AU',
  'A1',
  'A2',
  'ED',
  'PY',
  'Y1',
  'DA',
  'T2',
  'JO',
  'JF',
  'JA',
  'BT',
  'VL',
  'IS',
  'SP',
  'EP',
  'PB',
  'SN',
  'AB',
  'N2',
  'LA',
  'KW',
  'UR',
  'DO',
  'ID',
  'ER',
]);
/** Line-oriented RIS parser with continuation lines and missing ER recovery. */
export function parseRis(
  text: string,
  library: string | null = null,
): ParseResult {
  const issues: ParseIssue[] = [];
  const records: ParsedRecord[] = [];
  try {
    checkSize(text);
  } catch (e) {
    return {
      records,
      issues: [
        { index: null, severity: 'error', message: (e as Error).message },
      ],
    };
  }
  let current: Map<string, string[]> | null = null;
  let last: string | null = null;
  const flush = () => {
    if (!current) return;
    const tags = current;
    current = null;
    if (records.length >= interchangeLimits.entries) return;
    const index = records.length;
    const one = (...names: string[]) => {
      for (const name of names) {
        const value = tags.get(name)?.[0];
        if (value) return value;
      }
      return null;
    };
    const all = (...names: string[]) =>
      names.flatMap((name) => tags.get(name) ?? []);
    const ty = (one('TY') ?? '').toUpperCase();
    const mapped = risTypes[ty];
    const date = dateOf(one('DA')) ?? dateOf(one('PY', 'Y1'));
    const sp = one('SP');
    const ep = one('EP');
    const sn = all('SN').flatMap(splitIdentifiers);
    const draft: ReferenceRecordInput = {
      type: mapped ?? 'other',
      originalType: mapped ? null : ty || null,
      title: one('TI', 'T1') ?? '',
      authors: all('AU', 'A1')
        .map(personFromString)
        .filter((p): p is PersonName => !!p),
      editors: all('A2', 'ED')
        .map(personFromString)
        .filter((p): p is PersonName => !!p),
      doi: one('DO'),
      issued: date,
      containerTitle: one('T2', 'JO', 'JF', 'BT', 'JA'),
      volume: one('VL'),
      issue: one('IS'),
      pages: sp && ep ? `${sp}–${ep}` : sp,
      publisher: one('PB'),
      issn: sn.filter(isIssn).slice(0, 4),
      isbn: sn.filter(isIsbn).slice(0, 4),
      abstract: one('AB', 'N2'),
      language: one('LA'),
      keywords: all('KW').slice(0, interchangeLimits.keywords),
      url: one('UR'),
    };
    const id = one('ID');
    const unsupported = [...tags.keys()].filter((t) => !risKnown.has(t));
    records.push(
      finish(
        draft,
        {
          source: 'RIS',
          key: id?.slice(0, 200) ?? null,
          index,
          library,
          version: null,
          atlasId: atlasMarker(id),
        },
        unsupported,
        [],
      ),
    );
  };
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  for (const line of lines) {
    const match = /^([A-Z][A-Z0-9])  -(?: (.*))?$/.exec(line);
    if (match) {
      const [, tag, value = ''] = match as unknown as [string, string, string?];
      if (tag === 'TY') {
        if (current) {
          issues.push({
            index: records.length,
            severity: 'warning',
            message: 'An entry without ER was closed at the next TY.',
          });
          flush();
        }
        current = new Map();
      }
      if (!current) {
        issues.push({
          index: null,
          severity: 'warning',
          message: `Tag ${tag} outside an entry was ignored.`,
        });
        continue;
      }
      if (tag === 'ER') {
        flush();
        last = null;
        continue;
      }
      const list = current.get(tag) ?? [];
      if (list.length < 200)
        list.push(value.trim().slice(0, interchangeLimits.fieldChars));
      current.set(tag, list);
      last = tag;
    } else if (current && last && line.trim()) {
      // Continuation of a multi-line value (e.g. abstracts).
      const list = current.get(last)!;
      const joined = `${list[list.length - 1]} ${line.trim()}`;
      list[list.length - 1] = joined.slice(0, interchangeLimits.fieldChars);
    }
  }
  if (current) {
    issues.push({
      index: records.length,
      severity: 'warning',
      message: 'The last entry had no ER and was closed at end of file.',
    });
    flush();
  }
  return { records, issues };
}

// ------------------------------------------------------------- CSL JSON

const cslTypes: Record<string, ReferenceType> = {
  'article-journal': 'journal-article',
  'article-magazine': 'journal-article',
  'paper-conference': 'conference-paper',
  book: 'book',
  chapter: 'book-chapter',
  thesis: 'thesis',
  report: 'report',
  article: 'preprint',
  dataset: 'dataset',
  webpage: 'webpage',
  'post-weblog': 'webpage',
  document: 'other',
};
const toCslType: Record<ReferenceType, string> = {
  'journal-article': 'article-journal',
  'conference-paper': 'paper-conference',
  book: 'book',
  'book-chapter': 'chapter',
  thesis: 'thesis',
  report: 'report',
  preprint: 'article',
  dataset: 'dataset',
  webpage: 'webpage',
  other: 'document',
};
const cslKnown = new Set([
  'id',
  'type',
  'title',
  'author',
  'editor',
  'DOI',
  'issued',
  'container-title',
  'volume',
  'issue',
  'page',
  'publisher',
  'ISSN',
  'ISBN',
  'abstract',
  'language',
  'keyword',
  'URL',
  'citation-key',
]);
const cslName = z
  .object({
    family: z.string().optional(),
    given: z.string().optional(),
    literal: z.string().optional(),
  })
  .loose();
const cslString = z.union([z.string(), z.number()]).transform(String);
/** CSL JSON array (or single item). Unknown keys are reported, not imported. */
export function parseCslJson(
  text: string,
  library: string | null = null,
): ParseResult {
  const issues: ParseIssue[] = [];
  const records: ParsedRecord[] = [];
  let data: unknown;
  try {
    checkSize(text);
    data = JSON.parse(text);
  } catch (e) {
    return {
      records,
      issues: [
        {
          index: null,
          severity: 'error',
          message:
            e instanceof LimitError ? e.message : 'The file is not valid JSON.',
        },
      ],
    };
  }
  const items = Array.isArray(data) ? data : [data];
  if (items.length > interchangeLimits.entries)
    issues.push({
      index: null,
      severity: 'error',
      message: `Only the first ${interchangeLimits.entries} entries are read.`,
    });
  items.slice(0, interchangeLimits.entries).forEach((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      records.push({
        record: null,
        provenance: {
          source: 'CSL_JSON',
          key: null,
          index,
          library,
          version: null,
          atlasId: null,
        },
        unsupported: [],
        issues: ['Not a CSL item.'],
      });
      return;
    }
    const item = raw as Record<string, unknown>;
    const s = (key: string) => {
      const v = cslString.safeParse(item[key]);
      return v.success && v.data.trim() ? v.data : null;
    };
    const names = (key: string) =>
      (Array.isArray(item[key]) ? (item[key] as unknown[]) : [])
        .slice(0, interchangeLimits.persons)
        .map((n): PersonName | null => {
          const p = cslName.safeParse(n);
          if (!p.success) return null;
          if (p.data.literal?.trim()) return { literal: p.data.literal };
          return p.data.family?.trim()
            ? { family: p.data.family, given: p.data.given?.trim() || null }
            : null;
        })
        .filter((p): p is PersonName => !!p);
    const parts = (item.issued as { 'date-parts'?: unknown } | undefined)?.[
      'date-parts'
    ];
    const first =
      Array.isArray(parts) && Array.isArray(parts[0])
        ? (parts[0] as unknown[])
        : null;
    const issued =
      first && Number.isInteger(Number(first[0]))
        ? {
            year: Number(first[0]),
            month: first[1] ? Number(first[1]) : null,
            day: first[1] && first[2] ? Number(first[2]) : null,
          }
        : dateOf((item.issued as { raw?: string } | undefined)?.raw ?? null);
    const list = (key: string) => {
      const v = item[key];
      return (
        Array.isArray(v)
          ? v.map(String)
          : typeof v === 'string'
            ? splitIdentifiers(v)
            : []
      ).slice(0, 4);
    };
    const typeLabel = s('type') ?? '';
    const mapped = cslTypes[typeLabel];
    const id = s('id');
    const draft: ReferenceRecordInput = {
      type: mapped ?? 'other',
      originalType: mapped ? null : typeLabel || null,
      title: s('title') ?? '',
      authors: names('author'),
      editors: names('editor'),
      doi: s('DOI'),
      issued:
        issued && issued.year >= 1000 && issued.year <= 2100 ? issued : null,
      containerTitle: s('container-title'),
      volume: s('volume'),
      issue: s('issue'),
      pages: s('page'),
      publisher: s('publisher'),
      issn: list('ISSN'),
      isbn: list('ISBN'),
      abstract: s('abstract'),
      language: s('language'),
      keywords: (s('keyword') ?? '')
        .split(/[,;]/)
        .map((k) => k.trim())
        .filter(Boolean)
        .slice(0, interchangeLimits.keywords),
      url: s('URL'),
    };
    records.push(
      finish(
        draft,
        {
          source: 'CSL_JSON',
          key: (s('citation-key') ?? id)?.slice(0, 200) ?? null,
          index,
          library,
          version: null,
          atlasId: atlasMarker(id),
        },
        Object.keys(item)
          .filter((k) => !cslKnown.has(k))
          .slice(0, 50),
        [],
      ),
    );
  });
  return { records, issues };
}

export function parseInterchange(
  format: InterchangeFormat,
  text: string,
  library: string | null = null,
): ParseResult {
  return format === 'bibtex'
    ? parseBibtex(text, library)
    : format === 'ris'
      ? parseRis(text, library)
      : parseCslJson(text, library);
}

// --------------------------------------------------------------- Zotero

const zoteroTypes: Record<string, ReferenceType> = {
  journalArticle: 'journal-article',
  magazineArticle: 'journal-article',
  conferencePaper: 'conference-paper',
  book: 'book',
  bookSection: 'book-chapter',
  thesis: 'thesis',
  report: 'report',
  preprint: 'preprint',
  dataset: 'dataset',
  webpage: 'webpage',
};
const zoteroCreator = z
  .object({
    creatorType: z.string(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    name: z.string().optional(),
  })
  .loose();
export const zoteroItem = z
  .object({
    key: z.string().regex(/^[A-Z0-9]{8}$/),
    version: z.number().int().min(0),
    data: z
      .object({
        itemType: z.string().max(60),
        title: z.string().max(4000).optional(),
        creators: z.array(zoteroCreator).max(500).optional(),
      })
      .loose(),
  })
  .loose();
export type ZoteroItem = z.infer<typeof zoteroItem>;
/** Maps one Zotero Web API v3 item (top-level, non-attachment) to a record. */
export function fromZoteroItem(
  raw: unknown,
  library: string,
  index = 0,
): ParsedRecord {
  const parsed = zoteroItem.safeParse(raw);
  const provenance = (
    key: string | null,
    version: number | null,
  ): RecordProvenance => ({
    source: 'ZOTERO',
    key,
    index,
    library,
    version,
    atlasId: null,
  });
  if (!parsed.success)
    return {
      record: null,
      provenance: provenance(null, null),
      unsupported: [],
      issues: ['Not a Zotero item.'],
    };
  const { key, version, data } = parsed.data;
  const d = data as Record<string, unknown>;
  const s = (name: string) =>
    typeof d[name] === 'string' && (d[name] as string).trim()
      ? (d[name] as string)
      : null;
  if (['attachment', 'note', 'annotation'].includes(data.itemType))
    return {
      record: null,
      provenance: provenance(key, version),
      unsupported: [],
      issues: ['Attachments and notes are not imported.'],
    };
  const people = (types: string[]) =>
    (data.creators ?? [])
      .filter((c) => types.includes(c.creatorType))
      .map((c): PersonName | null =>
        c.name?.trim()
          ? { literal: c.name }
          : c.lastName?.trim()
            ? { family: c.lastName, given: c.firstName?.trim() || null }
            : null,
      )
      .filter((p): p is PersonName => !!p);
  // DOI may live in the DOI field (articles) or in “Extra” as `DOI: …`.
  const doi = s('DOI') ?? s('extra')?.match(/^DOI:\s*(\S+)/im)?.[1] ?? null;
  const ids = splitIdentifiers(s('ISSN')).concat(splitIdentifiers(s('ISBN')));
  const mapped = zoteroTypes[data.itemType];
  const draft: ReferenceRecordInput = {
    type: mapped ?? 'other',
    originalType: mapped ? null : data.itemType,
    title: s('title') ?? '',
    authors: people(['author', 'presenter', 'programmer']),
    editors: people(['editor', 'seriesEditor']),
    doi,
    issued: dateOf(s('date')),
    containerTitle:
      s('publicationTitle') ??
      s('proceedingsTitle') ??
      s('bookTitle') ??
      s('websiteTitle') ??
      s('repository'),
    volume: s('volume'),
    issue: s('issue'),
    pages: s('pages'),
    publisher: s('publisher') ?? s('institution') ?? s('university'),
    issn: ids.filter(isIssn).slice(0, 4),
    isbn: ids.filter(isIsbn).slice(0, 4),
    abstract: s('abstractNote'),
    language: s('language'),
    keywords: Array.isArray(d.tags)
      ? (d.tags as { tag?: unknown }[])
          .map((t) => (typeof t.tag === 'string' ? t.tag : ''))
          .filter(Boolean)
          .slice(0, interchangeLimits.keywords)
      : [],
    url: s('url'),
  };
  return finish(draft, provenance(key, version), [], []);
}

// --------------------------------------------------------------- export

export type ExportableReference = { atlasId: string; record: ReferenceRecord };
const personCsl = (p: PersonName) =>
  'literal' in p
    ? { literal: p.literal }
    : p.given
      ? { family: p.family, given: p.given }
      : { family: p.family };
/** CSL JSON with stable key order; only present fields are written. */
export function toCslJson(items: readonly ExportableReference[]) {
  const out = items.map(({ atlasId, record: r }) => {
    const item: Record<string, unknown> = {
      id: `atlas:${atlasId}`,
      type: toCslType[r.type],
      title: r.title,
    };
    if (r.authors.length) item.author = r.authors.map(personCsl);
    if (r.editors.length) item.editor = r.editors.map(personCsl);
    if (r.issued)
      item.issued = {
        'date-parts': [
          [
            r.issued.year,
            ...(r.issued.month
              ? [r.issued.month, ...(r.issued.day ? [r.issued.day] : [])]
              : []),
          ],
        ],
      };
    if (r.containerTitle) item['container-title'] = r.containerTitle;
    if (r.volume) item.volume = r.volume;
    if (r.issue) item.issue = r.issue;
    if (r.pages) item.page = r.pages;
    if (r.publisher) item.publisher = r.publisher;
    if (r.doi) item.DOI = r.doi;
    if (r.issn.length) item.ISSN = r.issn.join(', ');
    if (r.isbn.length) item.ISBN = r.isbn.join(', ');
    if (r.url) item.URL = r.url;
    if (r.language) item.language = r.language;
    if (r.keywords.length) item.keyword = r.keywords.join(', ');
    if (r.abstract) item.abstract = r.abstract;
    return item;
  });
  return `${JSON.stringify(out, null, 2)}\n`;
}
export const personDisplay = (p: PersonName) =>
  'literal' in p ? p.literal : p.given ? `${p.given} ${p.family}` : p.family;

// ------------------------------------------------------------- matching

/** Review signal only (never identity): folded title + year + first family. */
export function similarityKey(
  record: Pick<ReferenceRecord, 'title' | 'issued' | 'authors'>,
) {
  const title = record.title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  const first = record.authors[0];
  const family = first
    ? ('literal' in first ? first.literal : first.family).toLowerCase()
    : '';
  return { title, year: record.issued?.year ?? null, family };
}

// ------------------------------------------------------- import contracts

export const importLink = z
  .object({
    source: referenceSource,
    library: z.string().min(1).max(80),
    key: z.string().min(1).max(200),
    version: z.number().int().min(0).nullable(),
  })
  .strict();
export type ImportLink = z.infer<typeof importLink>;
export const importItem = z
  .object({
    record: referenceRecord,
    link: importLink.nullable(),
    atlasId: z.uuid().nullable().default(null),
    /** Explicitly approved refresh of an already imported private reference. */
    update: z.boolean().default(false),
  })
  .strict();
export type ImportItemInput = z.input<typeof importItem>;
/** Max items per confirmed batch; larger selections are sent in batches. */
export const IMPORT_BATCH = 50;
export const referenceImportCommand = z
  .object({
    command: z.literal('reference.import'),
    projectId: z.uuid(),
    items: z.array(importItem).min(1).max(100),
    idempotencyKey: z.uuid(),
  })
  .strict();
export type ReferenceImportCommand = z.input<typeof referenceImportCommand>;
export const importOutcome = z.enum([
  'CREATED',
  'EXISTING',
  'UPDATED',
  'ARCHIVED',
]);
export type ImportOutcome = z.infer<typeof importOutcome>;
export const referenceImportResult = z.object({
  id: z.uuid(),
  results: z.array(
    z.object({ index: z.number().int(), id: z.uuid(), outcome: importOutcome }),
  ),
  replayed: z.boolean().optional(),
});
export type ReferenceImportResult = z.infer<typeof referenceImportResult>;

export const previewStatus = z.enum([
  'NEW',
  'EXISTING',
  'ARCHIVED',
  'POSSIBLE_DUPLICATE',
  'UPDATE_AVAILABLE',
  'INVALID',
]);
export type PreviewStatus = z.infer<typeof previewStatus>;
export const previewItem = z.object({
  index: z.number().int(),
  status: previewStatus,
  record: referenceRecord.nullable(),
  provenance: recordProvenance,
  link: importLink.nullable(),
  issues: z.array(z.string()),
  unsupported: z.array(z.string()),
  /** The project paper this record already corresponds to (or resembles). */
  match: z
    .object({
      projectPaperId: z.uuid(),
      title: z.string(),
      by: z.enum(['import', 'atlas-id', 'doi', 'title']),
    })
    .nullable(),
});
export type PreviewItem = z.infer<typeof previewItem>;
export const importPreview = z.object({
  source: referenceSource,
  library: z.string().nullable(),
  items: z.array(previewItem),
  issues: z.array(
    z.object({
      index: z.number().int().nullable(),
      severity: z.enum(['error', 'warning']),
      message: z.string(),
    }),
  ),
  counts: z.record(previewStatus, z.number().int()),
});
export type ImportPreview = z.infer<typeof importPreview>;
export const importPreviewRequest = z
  .object({
    format: interchangeFormat,
    content: z.string().max(interchangeLimits.bytes),
  })
  .strict();

/** Conservative provider publication-type mapping; unknown stays `other`. */
export function referenceTypeOf(providerType: string | null): ReferenceType {
  const t = providerType?.toLowerCase() ?? '';
  if (/journal|^article$/.test(t)) return 'journal-article';
  if (/proceedings|conference/.test(t)) return 'conference-paper';
  if (/book-chapter|chapter/.test(t)) return 'book-chapter';
  if (/^book$|monograph/.test(t)) return 'book';
  if (/dissertation|thesis/.test(t)) return 'thesis';
  if (/report/.test(t)) return 'report';
  if (/preprint|posted-content/.test(t)) return 'preprint';
  if (/dataset/.test(t)) return 'dataset';
  return 'other';
}
