import { z } from 'zod';

/*
 * Phase 02 research contracts. Provider adapters, services, routes and UI all
 * exchange these validated shapes; raw provider payloads never cross them.
 */
const id = z.uuid();
const version = z.number().int().positive();

export const scholarlyProviders = ['openalex', 'semantic-scholar'] as const;
export const scholarlyProvider = z.enum(scholarlyProviders);
export type ScholarlyProviderId = z.infer<typeof scholarlyProvider>;
export const providerLabels: Record<ScholarlyProviderId, string> = {
  openalex: 'OpenAlex',
  'semantic-scholar': 'Semantic Scholar',
};

// ---------------------------------------------------------------- identity

const doiPattern = /^10\.\d{4,9}\/[^\s]+$/;
/**
 * Canonicalizes DOI spellings (URL/doi: prefixes, whitespace, Unicode,
 * percent-encoding, case). It validates syntax only: a well-formed result
 * never proves that the DOI is registered or belongs to a given work.
 */
export function normalizeDoi(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;
  let value = input.normalize('NFKC').trim();
  if (!value || value.length > 500) return null;
  value = value.replace(/^doi:\s*/i, '');
  value = value.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
  if (/%[0-9a-f]{2}/i.test(value)) {
    try {
      value = decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  value = value.normalize('NFKC').trim().toLowerCase();
  if (value.length > 300 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  return doiPattern.test(value) ? value : null;
}

const openAlexWorkPattern = /^W\d{1,12}$/;
const semanticScholarPattern = /^[0-9a-f]{40}$/;
/** Accepts OpenAlex `W…` IDs or their canonical https://openalex.org/ URL. */
export function normalizeOpenAlexId(input: string | null | undefined) {
  if (typeof input !== 'string') return null;
  const value = input
    .trim()
    .replace(/^https?:\/\/(?:api\.)?openalex\.org\/(?:works\/)?/i, '')
    .toUpperCase();
  return openAlexWorkPattern.test(value) ? value : null;
}
export function normalizeSemanticScholarId(input: string | null | undefined) {
  if (typeof input !== 'string') return null;
  const value = input.trim().toLowerCase();
  return semanticScholarPattern.test(value) ? value : null;
}
export function normalizeExternalId(
  provider: ScholarlyProviderId,
  input: string,
) {
  return provider === 'openalex'
    ? normalizeOpenAlexId(input)
    : normalizeSemanticScholarId(input);
}

// ------------------------------------------------------------- normalized

const text = (max: number) => z.string().trim().min(1).max(max);
const safeUrl = z
  .url({ protocol: /^https?$/ })
  .max(2000)
  .refine((value) => !/\s/.test(value), 'URL must not contain whitespace.');
export const paperAuthor = z.object({
  name: text(300),
  orcid: z
    .string()
    .regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/)
    .nullable()
    .default(null),
});
export const pdfLocation = z.object({
  url: safeUrl,
  license: z.string().max(120).nullable(),
  version: z.string().max(80).nullable(),
  provider: scholarlyProvider,
});
export const providerProvenance = z.object({
  provider: scholarlyProvider,
  externalId: text(200),
  retrievedAt: z.iso.datetime({ offset: true }),
  sourceUrl: safeUrl.nullable(),
});
export const normalizedPaper = z.object({
  /** Deterministic within one response; never a database identifier. */
  candidateId: text(260),
  doi: z.string().max(300).nullable(),
  openAlexId: z.string().regex(openAlexWorkPattern).nullable(),
  semanticScholarId: z.string().regex(semanticScholarPattern).nullable(),
  title: text(1000),
  authors: z.array(paperAuthor).max(100),
  authorCount: z.number().int().nonnegative(),
  year: z.number().int().min(1000).max(2100).nullable(),
  publicationDate: z.iso.date().nullable(),
  venue: z.string().max(500).nullable(),
  abstract: z.string().max(20000).nullable(),
  citationCount: z.number().int().nonnegative().nullable(),
  fields: z.array(z.string().max(120)).max(20),
  language: z.string().max(20).nullable(),
  publicationType: z.string().max(80).nullable(),
  openAccess: z.object({
    isOpenAccess: z.boolean().nullable(),
    status: z.string().max(40).nullable(),
    license: z.string().max(120).nullable(),
  }),
  landingPageUrl: safeUrl.nullable(),
  /** External open-access locations only. Never a stored or verified copy. */
  pdfLocations: z.array(pdfLocation).max(10),
  provenance: z.array(providerProvenance).min(1).max(4),
});
export type NormalizedPaper = z.infer<typeof normalizedPaper>;

export function candidateKey(paper: {
  doi: string | null;
  openAlexId: string | null;
  semanticScholarId: string | null;
}) {
  if (paper.doi) return `doi:${paper.doi}`;
  if (paper.openAlexId) return `openalex:${paper.openAlexId}`;
  if (paper.semanticScholarId)
    return `semantic-scholar:${paper.semanticScholarId}`;
  return null;
}

/**
 * Merges two provider records only on an identical normalized DOI. Missing
 * fields may be filled from the other provider; conflicting values keep the
 * first record and both provenance entries stay attached.
 */
export function mergeOnDoi(
  first: NormalizedPaper,
  second: NormalizedPaper,
): NormalizedPaper {
  if (!first.doi || first.doi !== second.doi)
    throw new Error('Records without the same DOI must not be merged.');
  const pick = <T>(a: T | null, b: T | null) => (a === null ? b : a);
  return {
    ...first,
    openAlexId: pick(first.openAlexId, second.openAlexId),
    semanticScholarId: pick(first.semanticScholarId, second.semanticScholarId),
    authors: first.authors.length ? first.authors : second.authors,
    authorCount: Math.max(first.authorCount, second.authorCount),
    year: pick(first.year, second.year),
    publicationDate: pick(first.publicationDate, second.publicationDate),
    venue: pick(first.venue, second.venue),
    abstract: pick(first.abstract, second.abstract),
    citationCount: pick(first.citationCount, second.citationCount),
    fields: first.fields.length ? first.fields : second.fields,
    language: pick(first.language, second.language),
    publicationType: pick(first.publicationType, second.publicationType),
    openAccess: {
      isOpenAccess: pick(
        first.openAccess.isOpenAccess,
        second.openAccess.isOpenAccess,
      ),
      status: pick(first.openAccess.status, second.openAccess.status),
      license: pick(first.openAccess.license, second.openAccess.license),
    },
    landingPageUrl: pick(first.landingPageUrl, second.landingPageUrl),
    // The same open-access URL reported by both providers is one location.
    pdfLocations: [...first.pdfLocations, ...second.pdfLocations]
      .filter(
        (location, index, all) =>
          all.findIndex((other) => other.url === location.url) === index,
      )
      .slice(0, 10),
    provenance: [...first.provenance, ...second.provenance].slice(0, 4),
  };
}

// ----------------------------------------------------------------- search

/**
 * Field filters are limited to disciplines both providers can express.
 * OpenAlex uses its field taxonomy; the IDs below are the matching fields.
 */
export const researchFields = {
  'Computer Science': { openalex: 17 },
  Medicine: { openalex: 27 },
  Mathematics: { openalex: 26 },
  Physics: { openalex: 31 },
  Chemistry: { openalex: 16 },
  Economics: { openalex: 20 },
  Psychology: { openalex: 32 },
  Engineering: { openalex: 22 },
  'Environmental Science': { openalex: 23 },
  'Materials Science': { openalex: 25 },
} as const;
export const researchField = z.enum(
  Object.keys(researchFields) as [
    keyof typeof researchFields,
    ...(keyof typeof researchFields)[],
  ],
);
export const searchSort = z.enum(['relevance', 'newest', 'citations']);
const year = z.coerce.number().int().min(1000).max(2100);
export const searchRequest = z
  .object({
    query: z
      .string()
      .trim()
      .min(2, 'Enter at least two characters.')
      .max(300)
      .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), 'Invalid characters.'),
    provider: z.enum(['all', ...scholarlyProviders]).default('all'),
    yearFrom: year.optional(),
    yearTo: year.optional(),
    openAccessOnly: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    field: researchField.optional(),
    author: z.string().trim().min(2).max(120).optional(),
    minCitations: z.coerce.number().int().min(0).max(1000000).optional(),
    sort: searchSort.default('relevance'),
    cursor: z.string().max(512).optional(),
  })
  .strict()
  .refine((v) => !v.yearFrom || !v.yearTo || v.yearFrom <= v.yearTo, {
    message: 'The start year must not be after the end year.',
    path: ['yearFrom'],
  });
export type ScholarlySearchRequest = z.infer<typeof searchRequest>;

export const providerSearchStatus = z.enum([
  'ok',
  'no_results',
  'rate_limited',
  'unavailable',
  'not_configured',
  'skipped',
]);
export const providerReport = z.object({
  provider: scholarlyProvider,
  status: providerSearchStatus,
  total: z.number().int().nonnegative().nullable(),
  retryAfterSeconds: z.number().int().positive().nullable(),
  /** Filters this provider could not apply; results are not post-filtered. */
  unsupported: z.array(z.string().max(120)).max(10),
});
export type ProviderReport = z.infer<typeof providerReport>;
export const searchState = z.enum([
  'success',
  'partial',
  'no_results',
  'rate_limited',
  'unavailable',
]);
export const searchResponse = z.object({
  state: searchState,
  items: z.array(normalizedPaper).max(50),
  providers: z.array(providerReport),
  nextCursor: z.string().nullable(),
  /** Candidates already associated with this project (by candidateId). */
  saved: z.record(z.string(), id),
});
export type ScholarlySearchResponse = z.infer<typeof searchResponse>;

/** Derives the overall state without hiding provider failures. */
export function overallSearchState(
  reports: ProviderReport[],
  itemCount: number,
): z.infer<typeof searchState> {
  const queried = reports.filter((r) => r.status !== 'skipped');
  const failed = queried.filter((r) =>
    ['rate_limited', 'unavailable', 'not_configured'].includes(r.status),
  );
  if (itemCount > 0) return failed.length ? 'partial' : 'success';
  if (!failed.length) return 'no_results';
  if (failed.length < queried.length) return 'partial';
  return failed.some((r) => r.status === 'rate_limited')
    ? 'rate_limited'
    : 'unavailable';
}

// ---------------------------------------------------------------- library

export const readingStatuses = [
  'TO_READ',
  'READING',
  'READ',
  'ARCHIVED',
] as const;
export const readingStatus = z.enum(readingStatuses);
export type ReadingStatus = z.infer<typeof readingStatus>;
export const sourceStates = [
  'PENDING_UPLOAD',
  'QUARANTINED',
  'SCANNING',
  'PROCESSING',
  'READY',
  'FAILED',
  'REJECTED',
] as const;
export const sourceState = z.enum(sourceStates);
export type SourceState = z.infer<typeof sourceState>;

export const tagName = z
  .string()
  .normalize('NFKC')
  .trim()
  .min(1)
  .max(40)
  .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), 'Invalid characters.');
/** Project tags are unique case-insensitively after whitespace folding. */
export function normalizeTag(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export const sourceVersionDto = z.object({
  id,
  ordinal: z.number().int().positive(),
  sourceType: z.enum(['UPLOAD']),
  state: sourceState,
  byteSize: z.number().int().nonnegative().nullable(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  rightsBasis: z.enum(['USER_UPLOAD']),
  fileName: z.string().max(200),
  createdAt: z.string(),
  failure: z.string().max(200).nullable(),
});
export type SourceVersionDto = z.infer<typeof sourceVersionDto>;
export const tagDto = z.object({ id, name: z.string(), version });
export const collectionDto = z.object({
  id,
  name: z.string(),
  description: z.string().nullable(),
  version,
  paperCount: z.number().int().nonnegative(),
});
export type CollectionDto = z.infer<typeof collectionDto>;
export type TagDto = z.infer<typeof tagDto>;
export const projectPaperDto = z.object({
  id,
  projectId: id,
  artifactId: id,
  version,
  readingStatus,
  addedAt: z.string(),
  updatedAt: z.string(),
  addedById: id,
  /** PROVIDER: saved public metadata; PRIVATE: project-only user source. */
  origin: z.enum(['PROVIDER', 'PRIVATE']),
  title: z.string(),
  /** Public bibliographic metadata as saved, with its retrieval provenance. */
  paper: normalizedPaper.nullable(),
  collectionIds: z.array(id),
  tagIds: z.array(id),
  sources: z.array(sourceVersionDto),
});
export type ProjectPaperDto = z.infer<typeof projectPaperDto>;
export const libraryPageDto = z.object({
  items: z.array(projectPaperDto),
  nextCursor: z.string().nullable(),
  collections: z.array(collectionDto),
  tags: z.array(tagDto),
});
export type LibraryPage = z.infer<typeof libraryPageDto>;
export const librarySort = z.enum(['recent', 'title', 'year', 'citations']);
export const libraryQuery = z
  .object({
    q: z.string().trim().max(200).optional(),
    collectionId: id.optional(),
    tagId: id.optional(),
    status: readingStatus.optional(),
    sort: librarySort.default('recent'),
    cursor: z.string().max(1024).optional(),
  })
  .strict();
export type LibraryQuery = z.infer<typeof libraryQuery>;

// ------------------------------------------------------------ annotations

const unit = z.number().min(0).max(1);
export const annotationRect = z.object({
  x: unit,
  y: unit,
  width: unit,
  height: unit,
});
/**
 * Anchors combine a text-position selector (offsets into the page's text
 * layer), a text-quote selector (exact text with context) and normalized
 * page rectangles, so highlights survive zoom and can be re-located.
 */
export const annotationAnchor = z
  .object({
    pageNumber: z.number().int().min(1).max(10000),
    quote: z.string().max(4000).nullable(),
    prefix: z.string().max(64).nullable(),
    suffix: z.string().max(64).nullable(),
    startOffset: z.number().int().min(0).max(10000000).nullable(),
    endOffset: z.number().int().min(0).max(10000000).nullable(),
    rects: z.array(annotationRect).max(64),
  })
  .strict()
  .refine(
    (a) =>
      (a.startOffset === null) === (a.endOffset === null) &&
      (a.startOffset === null || a.startOffset <= (a.endOffset ?? 0)),
    { message: 'Invalid text offsets.', path: ['startOffset'] },
  );
export type AnnotationAnchor = z.infer<typeof annotationAnchor>;
export const annotationKind = z.enum(['HIGHLIGHT', 'NOTE', 'PAGE_NOTE']);
export const annotationVisibility = z.enum(['PROJECT', 'PRIVATE']);
export const annotationDto = z.object({
  id,
  sourceVersionId: id,
  projectPaperId: id,
  authorId: id,
  kind: annotationKind,
  visibility: annotationVisibility,
  body: z.string().nullable(),
  anchor: annotationAnchor,
  /** Precise anchors were created on this exact source version. */
  anchorStatus: z.enum(['PRECISE', 'RECOVERED']),
  version,
  createdAt: z.string(),
  updatedAt: z.string(),
  editable: z.boolean(),
});
export type AnnotationDto = z.infer<typeof annotationDto>;

// --------------------------------------------------------------- commands

const body = z.string().trim().max(10000);
export const researchCommand = z.discriminatedUnion('command', [
  z
    .object({
      command: z.literal('paper.save'),
      projectId: id,
      provider: scholarlyProvider,
      externalId: z.string().trim().min(1).max(200),
      idempotencyKey: id,
    })
    .strict(),
  z
    .object({
      // A user's own document that has no verified public record. Its title
      // stays in the project association and never enters global metadata.
      command: z.literal('paper.create'),
      projectId: id,
      title: text(1000),
      idempotencyKey: id,
    })
    .strict(),
  z
    .object({
      command: z.literal('paper.update'),
      id,
      expectedVersion: version,
      readingStatus,
    })
    .strict(),
  z
    .object({
      command: z.literal('paper.archive'),
      id,
      expectedVersion: version,
    })
    .strict(),
  z
    .object({
      command: z.literal('collection.create'),
      projectId: id,
      name: text(120),
      description: z.string().trim().max(500).optional(),
      idempotencyKey: id,
    })
    .strict(),
  z
    .object({
      command: z.literal('collection.update'),
      id,
      expectedVersion: version,
      name: text(120),
      description: z.string().trim().max(500).optional(),
    })
    .strict(),
  z
    .object({
      command: z.literal('collection.archive'),
      id,
      expectedVersion: version,
    })
    .strict(),
  z
    .object({
      command: z.literal('collection.paper.add'),
      collectionId: id,
      projectPaperId: id,
    })
    .strict(),
  z
    .object({
      command: z.literal('collection.paper.remove'),
      collectionId: id,
      projectPaperId: id,
    })
    .strict(),
  z
    .object({
      command: z.literal('tag.create'),
      projectId: id,
      name: tagName,
      idempotencyKey: id,
    })
    .strict(),
  z
    .object({
      command: z.literal('paper.tag.add'),
      projectPaperId: id,
      tagId: id,
    })
    .strict(),
  z
    .object({
      command: z.literal('paper.tag.remove'),
      projectPaperId: id,
      tagId: id,
    })
    .strict(),
  z
    .object({
      command: z.literal('annotation.create'),
      sourceVersionId: id,
      kind: annotationKind,
      visibility: annotationVisibility.default('PROJECT'),
      body: body.optional(),
      anchor: annotationAnchor,
      idempotencyKey: id,
    })
    .strict(),
  z
    .object({
      command: z.literal('annotation.update'),
      id,
      expectedVersion: version,
      body,
    })
    .strict(),
  z
    .object({
      command: z.literal('annotation.delete'),
      id,
      expectedVersion: version,
    })
    .strict(),
]);
export type ResearchCommand = z.infer<typeof researchCommand>;
export type ResearchCommandInput = z.input<typeof researchCommand>;
export const researchCommandNames = researchCommand.options.map(
  (option) => option.shape.command.value,
);

// ---------------------------------------------------------------- uploads

export const uploadLimits = {
  maxBytes: 25 * 1024 * 1024,
  mediaTypes: ['application/pdf'] as const,
};
export const uploadIntentInput = z
  .object({
    fileName: z
      .string()
      .normalize('NFKC')
      .trim()
      .min(1)
      .max(200)
      .refine((v) => /\.pdf$/i.test(v), 'Only PDF files are accepted.')
      .refine((v) => !/[\u0000-\u001f\u007f/\\]/.test(v), 'Invalid name.'),
    mediaType: z.enum(uploadLimits.mediaTypes),
    byteSize: z.number().int().min(8).max(uploadLimits.maxBytes),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    projectPaperId: id,
    idempotencyKey: id,
  })
  .strict();
export type UploadIntentInput = z.infer<typeof uploadIntentInput>;
export const uploadIntentDto = z.object({
  id,
  sourceVersionId: id,
  state: sourceState,
  expiresAt: z.string(),
  /** Short-lived, single-object signed upload grant. Never persisted. */
  upload: z
    .object({ url: z.url(), token: z.string().min(1).max(4096) })
    .nullable(),
});
export type UploadIntentDto = z.infer<typeof uploadIntentDto>;
export const sourceAccessDto = z.object({
  sourceVersionId: id,
  url: z.url(),
  expiresAt: z.string(),
  byteSize: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type SourceAccessDto = z.infer<typeof sourceAccessDto>;
