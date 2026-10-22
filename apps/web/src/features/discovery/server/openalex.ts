import 'server-only';
import { z } from 'zod';
import {
  candidateKey,
  normalizeDoi,
  normalizeOpenAlexId,
  normalizedPaper,
  researchFields,
  type NormalizedPaper,
} from '@atlas/core';
import { providerGet } from './provider-http';
import type { ScholarlyProvider } from './types';

/* https://docs.openalex.org/api-entities/works — validated subset only. */
const nullableString = z
  .string()
  .nullish()
  .transform((v) => v ?? null);
const location = z
  .object({
    landing_page_url: nullableString,
    pdf_url: nullableString,
    license: nullableString,
    version: nullableString,
    source: z
      .object({ display_name: nullableString })
      .nullish()
      .transform((v) => v ?? null),
  })
  .nullish()
  .transform((v) => v ?? null);
const work = z.object({
  id: z.string(),
  doi: nullableString,
  title: nullableString,
  display_name: nullableString,
  publication_year: z.number().int().nullish(),
  publication_date: nullableString,
  type: nullableString,
  language: nullableString,
  cited_by_count: z.number().int().nonnegative().nullish(),
  authorships: z
    .array(
      z.object({
        author: z
          .object({ display_name: nullableString, orcid: nullableString })
          .nullish(),
        raw_author_name: nullableString,
      }),
    )
    .nullish()
    .transform((v) => v ?? []),
  primary_location: location,
  best_oa_location: location,
  open_access: z
    .object({ is_oa: z.boolean().nullish(), oa_status: nullableString })
    .nullish(),
  abstract_inverted_index: z
    .record(z.string(), z.array(z.number().int().nonnegative()))
    .nullish(),
  primary_topic: z
    .object({
      field: z.object({ display_name: nullableString }).nullish(),
      subfield: z.object({ display_name: nullableString }).nullish(),
    })
    .nullish(),
});
const page = z.object({
  meta: z.object({ count: z.number().int().nonnegative().nullish() }),
  results: z.array(z.unknown()),
});
export const openAlexSelect =
  'id,doi,title,display_name,publication_year,publication_date,type,language,cited_by_count,authorships,primary_location,best_oa_location,open_access,abstract_inverted_index,primary_topic';

/** Rebuilds the provider's own abstract text from its inverted index. */
export function invertedAbstract(
  index: Record<string, number[]> | null | undefined,
) {
  if (!index) return null;
  const words: string[] = [];
  let total = 0;
  for (const [word, positions] of Object.entries(index))
    for (const position of positions) {
      if (position > 5000 || ++total > 5000) return null;
      words[position] = word;
    }
  const text = words
    .filter((w) => w !== undefined)
    .join(' ')
    .trim();
  return text ? text.slice(0, 20000) : null;
}

function orcid(value: string | null) {
  const match = value?.match(/(\d{4}-\d{4}-\d{4}-\d{3}[\dX])$/);
  return match?.[1] ?? null;
}
function httpUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !/\s/.test(value)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function normalizeOpenAlexWork(
  raw: unknown,
  retrievedAt: string,
): NormalizedPaper | null {
  const parsed = work.safeParse(raw);
  if (!parsed.success) return null;
  const w = parsed.data;
  const openAlexId = normalizeOpenAlexId(w.id);
  const title = (w.title ?? w.display_name ?? '').trim();
  if (!openAlexId || !title) return null;
  const doi = normalizeDoi(w.doi);
  const authors = w.authorships
    .map((a) => ({
      name: (a.author?.display_name ?? a.raw_author_name ?? '').trim(),
      orcid: orcid(a.author?.orcid ?? null),
    }))
    .filter((a) => a.name);
  const pdfUrl = httpUrl(w.best_oa_location?.pdf_url ?? null);
  const field = w.primary_topic?.field?.display_name;
  const subfield = w.primary_topic?.subfield?.display_name;
  const candidate = {
    doi,
    openAlexId,
    semanticScholarId: null,
  };
  const year =
    w.publication_year &&
    w.publication_year >= 1000 &&
    w.publication_year <= 2100
      ? w.publication_year
      : null;
  const result = normalizedPaper.safeParse({
    candidateId: candidateKey(candidate),
    ...candidate,
    title: title.slice(0, 1000),
    authors: authors
      .slice(0, 100)
      .map((a) => ({ ...a, name: a.name.slice(0, 300) })),
    authorCount: authors.length,
    year,
    publicationDate: /^\d{4}-\d{2}-\d{2}$/.test(w.publication_date ?? '')
      ? w.publication_date
      : null,
    venue: w.primary_location?.source?.display_name?.slice(0, 500) ?? null,
    abstract: invertedAbstract(w.abstract_inverted_index),
    citationCount: w.cited_by_count ?? null,
    fields: [field, subfield]
      .filter((v): v is string => !!v)
      .map((v) => v.slice(0, 120)),
    language: w.language?.slice(0, 20) ?? null,
    publicationType: w.type?.slice(0, 80) ?? null,
    openAccess: {
      isOpenAccess: w.open_access?.is_oa ?? null,
      status: w.open_access?.oa_status?.slice(0, 40) ?? null,
      license: w.best_oa_location?.license?.slice(0, 120) ?? null,
    },
    landingPageUrl:
      httpUrl(w.primary_location?.landing_page_url ?? null) ??
      (doi ? `https://doi.org/${encodeURI(doi)}` : null),
    pdfLocations: pdfUrl
      ? [
          {
            url: pdfUrl,
            license: w.best_oa_location?.license?.slice(0, 120) ?? null,
            version: w.best_oa_location?.version?.slice(0, 80) ?? null,
            provider: 'openalex',
          },
        ]
      : [],
    provenance: [
      {
        provider: 'openalex',
        externalId: openAlexId,
        retrievedAt,
        sourceUrl: `https://openalex.org/${openAlexId}`,
      },
    ],
  });
  return result.success ? result.data : null;
}

export interface OpenAlexConfig {
  baseUrl: string;
  apiKey?: string | undefined;
  mailto?: string | undefined;
  now?: (() => Date) | undefined;
  sleep?: ((ms: number) => Promise<void>) | undefined;
}

export function createOpenAlexProvider(
  config: OpenAlexConfig,
): ScholarlyProvider {
  const now = config.now ?? (() => new Date());
  const auth = {
    api_key: config.apiKey || undefined,
    mailto: config.mailto || undefined,
  };
  return {
    id: 'openalex',
    configured: true,
    async search({ request, offset, limit, signal }) {
      const filters: string[] = [];
      if (request.yearFrom || request.yearTo)
        filters.push(
          `publication_year:${request.yearFrom ?? ''}-${request.yearTo ?? ''}`,
        );
      if (request.openAccessOnly) filters.push('is_oa:true');
      if (request.minCitations !== undefined && request.minCitations > 0)
        filters.push(`cited_by_count:>${request.minCitations - 1}`);
      if (request.field)
        filters.push(
          `primary_topic.field.id:fields/${researchFields[request.field].openalex}`,
        );
      if (request.author)
        // OpenAlex filter values use "," and "|" as separators.
        filters.push(
          `raw_author_name.search:${request.author.replace(/[,|:]/g, ' ')}`,
        );
      const perPage = Math.min(limit, 50);
      const pageNumber = Math.floor(offset / perPage) + 1;
      const result = await providerGet({
        baseUrl: config.baseUrl,
        path: '/works',
        query: {
          search: request.query,
          filter: filters.length ? filters.join(',') : undefined,
          sort:
            request.sort === 'newest'
              ? 'publication_date:desc'
              : request.sort === 'citations'
                ? 'cited_by_count:desc'
                : 'relevance_score:desc',
          'per-page': String(perPage),
          page: String(pageNumber),
          select: openAlexSelect,
          ...auth,
        },
        signal,
        sleep: config.sleep,
      });
      if (result.kind !== 'ok')
        return result.kind === 'not_found' ? { kind: 'unavailable' } : result;
      const body = page.safeParse(result.data);
      if (!body.success) return { kind: 'unavailable' };
      const retrievedAt = now().toISOString();
      const items = body.data.results
        .map((item) => normalizeOpenAlexWork(item, retrievedAt))
        .filter((item): item is NormalizedPaper => item !== null);
      const total = body.data.meta.count ?? null;
      // OpenAlex basic paging stops at 10,000 records.
      const nextOffset =
        body.data.results.length === perPage &&
        pageNumber * perPage < Math.min(total ?? 0, 10000)
          ? pageNumber * perPage
          : null;
      return {
        kind: 'ok',
        data: { items, total, nextOffset, unsupported: [] },
      };
    },
    async getPaper(externalId, signal) {
      const openAlexId = normalizeOpenAlexId(externalId);
      if (!openAlexId) return { kind: 'not_found' };
      const result = await providerGet({
        baseUrl: config.baseUrl,
        path: `/works/${openAlexId}`,
        query: { select: openAlexSelect, ...auth },
        signal,
        sleep: config.sleep,
      });
      if (result.kind !== 'ok') return result;
      const paper = normalizeOpenAlexWork(result.data, now().toISOString());
      // A record for a different work than requested is never accepted.
      return paper && paper.openAlexId === openAlexId
        ? { kind: 'ok', data: paper }
        : { kind: 'unavailable' };
    },
  };
}
