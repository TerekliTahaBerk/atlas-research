import 'server-only';
import { z } from 'zod';
import {
  candidateKey,
  normalizeDoi,
  normalizeSemanticScholarId,
  normalizedPaper,
  type NormalizedPaper,
} from '@atlas/core';
import { providerGet } from './provider-http';
import type { ScholarlyProvider } from './types';

/* https://api.semanticscholar.org/api-docs/graph — validated subset only. */
const nullableString = z
  .string()
  .nullish()
  .transform((v) => v ?? null);
const paper = z.object({
  paperId: z.string(),
  externalIds: z
    .record(z.string(), z.union([z.string(), z.number()]).nullable())
    .nullish(),
  title: nullableString,
  abstract: nullableString,
  year: z.number().int().nullish(),
  publicationDate: nullableString,
  venue: nullableString,
  journal: z.object({ name: nullableString }).nullish(),
  authors: z
    .array(z.object({ name: nullableString }))
    .nullish()
    .transform((v) => v ?? []),
  citationCount: z.number().int().nonnegative().nullish(),
  fieldsOfStudy: z.array(z.string()).nullish(),
  isOpenAccess: z.boolean().nullish(),
  openAccessPdf: z
    .object({
      url: nullableString,
      status: nullableString,
      license: nullableString,
    })
    .nullish(),
  url: nullableString,
  publicationTypes: z.array(z.string()).nullish(),
});
const page = z.object({
  total: z.number().int().nonnegative().nullish(),
  offset: z.number().int().nonnegative().nullish(),
  next: z.number().int().nonnegative().nullish(),
  data: z.array(z.unknown()).nullish(),
});
export const semanticScholarFields =
  'paperId,externalIds,title,abstract,year,publicationDate,venue,journal,authors,citationCount,fieldsOfStudy,isOpenAccess,openAccessPdf,url,publicationTypes';

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

export function normalizeSemanticScholarPaper(
  raw: unknown,
  retrievedAt: string,
): NormalizedPaper | null {
  const parsed = paper.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data;
  const semanticScholarId = normalizeSemanticScholarId(p.paperId);
  const title = p.title?.trim() ?? '';
  if (!semanticScholarId || !title) return null;
  const rawDoi = p.externalIds?.DOI;
  const doi = normalizeDoi(typeof rawDoi === 'string' ? rawDoi : null);
  const authors = p.authors
    .map((a) => (a.name ?? '').trim())
    .filter(Boolean)
    .map((name) => ({ name: name.slice(0, 300), orcid: null }));
  const pdfUrl = httpUrl(p.openAccessPdf?.url ?? null);
  const candidate = { doi, openAlexId: null, semanticScholarId };
  const venue = (p.journal?.name || p.venue || '').trim();
  const result = normalizedPaper.safeParse({
    candidateId: candidateKey(candidate),
    ...candidate,
    title: title.slice(0, 1000),
    authors: authors.slice(0, 100),
    authorCount: authors.length,
    year: p.year && p.year >= 1000 && p.year <= 2100 ? p.year : null,
    publicationDate: /^\d{4}-\d{2}-\d{2}$/.test(p.publicationDate ?? '')
      ? p.publicationDate
      : null,
    venue: venue ? venue.slice(0, 500) : null,
    abstract: p.abstract?.trim() ? p.abstract.trim().slice(0, 20000) : null,
    citationCount: p.citationCount ?? null,
    fields: (p.fieldsOfStudy ?? []).slice(0, 20).map((f) => f.slice(0, 120)),
    language: null,
    publicationType: p.publicationTypes?.[0]?.slice(0, 80) ?? null,
    openAccess: {
      isOpenAccess: p.isOpenAccess ?? null,
      status: p.openAccessPdf?.status?.slice(0, 40) ?? null,
      license: p.openAccessPdf?.license?.slice(0, 120) ?? null,
    },
    landingPageUrl:
      httpUrl(p.url) ?? (doi ? `https://doi.org/${encodeURI(doi)}` : null),
    pdfLocations: pdfUrl
      ? [
          {
            url: pdfUrl,
            license: p.openAccessPdf?.license?.slice(0, 120) ?? null,
            version: null,
            provider: 'semantic-scholar',
          },
        ]
      : [],
    provenance: [
      {
        provider: 'semantic-scholar',
        externalId: semanticScholarId,
        retrievedAt,
        sourceUrl: `https://www.semanticscholar.org/paper/${semanticScholarId}`,
      },
    ],
  });
  return result.success ? result.data : null;
}

export interface SemanticScholarConfig {
  baseUrl: string;
  apiKey?: string | undefined;
  now?: (() => Date) | undefined;
  sleep?: ((ms: number) => Promise<void>) | undefined;
}

export function createSemanticScholarProvider(
  config: SemanticScholarConfig,
): ScholarlyProvider {
  const now = config.now ?? (() => new Date());
  const headers: Record<string, string> = config.apiKey
    ? { 'x-api-key': config.apiKey }
    : {};
  return {
    id: 'semantic-scholar',
    configured: true,
    async search({ request, offset, limit, signal }) {
      const unsupported: string[] = [];
      if (request.author)
        unsupported.push('Author filter is not supported by this provider.');
      if (request.sort !== 'relevance')
        unsupported.push('Results are ordered by relevance only.');
      // The relevance search endpoint caps offset + limit below 1,000.
      const size = Math.min(limit, 100, 999 - offset);
      if (size <= 0)
        return {
          kind: 'ok',
          data: { items: [], total: null, nextOffset: null, unsupported },
        };
      const year =
        request.yearFrom || request.yearTo
          ? `${request.yearFrom ?? ''}-${request.yearTo ?? ''}`
          : undefined;
      const result = await providerGet({
        baseUrl: config.baseUrl,
        path: '/graph/v1/paper/search',
        query: {
          query: request.query,
          offset: String(offset),
          limit: String(size),
          fields: semanticScholarFields,
          year,
          openAccessPdf: request.openAccessOnly ? '' : undefined,
          fieldsOfStudy: request.field,
          minCitationCount:
            request.minCitations !== undefined
              ? String(request.minCitations)
              : undefined,
        },
        headers,
        signal,
        sleep: config.sleep,
      });
      if (result.kind !== 'ok')
        return result.kind === 'not_found'
          ? {
              kind: 'ok',
              data: { items: [], total: 0, nextOffset: null, unsupported },
            }
          : result;
      const body = page.safeParse(result.data);
      if (!body.success) return { kind: 'unavailable' };
      const retrievedAt = now().toISOString();
      const items = (body.data.data ?? [])
        .map((item) => normalizeSemanticScholarPaper(item, retrievedAt))
        .filter((item): item is NormalizedPaper => item !== null);
      const next = body.data.next ?? null;
      return {
        kind: 'ok',
        data: {
          items,
          total: body.data.total ?? null,
          nextOffset: next !== null && next < 999 ? next : null,
          unsupported,
        },
      };
    },
    async getPaper(externalId, signal) {
      const id = normalizeSemanticScholarId(externalId);
      if (!id) return { kind: 'not_found' };
      const result = await providerGet({
        baseUrl: config.baseUrl,
        path: `/graph/v1/paper/${id}`,
        query: { fields: semanticScholarFields },
        headers,
        signal,
        sleep: config.sleep,
      });
      if (result.kind !== 'ok') return result;
      const normalized = normalizeSemanticScholarPaper(
        result.data,
        now().toISOString(),
      );
      return normalized && normalized.semanticScholarId === id
        ? { kind: 'ok', data: normalized }
        : { kind: 'unavailable' };
    },
  };
}
