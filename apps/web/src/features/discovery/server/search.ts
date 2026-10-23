import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  mergeOnDoi,
  overallSearchState,
  scholarlyProviders,
  type NormalizedPaper,
  type ProviderReport,
  type ScholarlyProviderId,
  type ScholarlySearchRequest,
} from '@atlas/core';
import { PlatformError } from '@/features/platform/server/errors';
import { createOpenAlexProvider } from './openalex';
import { createSemanticScholarProvider } from './semantic-scholar';
import type { ProviderPage, ScholarlyProvider } from './types';
import type { ProviderResult } from './provider-http';

export const PAGE_SIZE = 20;

export function configuredProviders(
  env: Record<string, string | undefined> = process.env,
): Record<ScholarlyProviderId, ScholarlyProvider> {
  return {
    openalex: createOpenAlexProvider({
      baseUrl: env.ATLAS_OPENALEX_BASE_URL || 'https://api.openalex.org',
      apiKey: env.ATLAS_OPENALEX_API_KEY,
      mailto: env.ATLAS_OPENALEX_MAILTO,
    }),
    'semantic-scholar': createSemanticScholarProvider({
      baseUrl:
        env.ATLAS_SEMANTIC_SCHOLAR_BASE_URL ||
        'https://api.semanticscholar.org',
      apiKey: env.ATLAS_SEMANTIC_SCHOLAR_API_KEY,
    }),
  };
}

// ---------------------------------------------------------------- cursors

/**
 * Search cursors hold public provider offsets bound to a digest of the exact
 * request, so a cursor cannot be replayed against a different query.
 */
const cursorBody = z.object({
  v: z.literal(1),
  h: z.string().regex(/^[a-f0-9]{16}$/),
  o: z.partialRecord(
    z.enum(scholarlyProviders),
    z.number().int().min(0).max(10000),
  ),
});
export function requestDigest(request: ScholarlySearchRequest) {
  const canonical = Object.fromEntries(
    Object.entries(request)
      .filter(([k, v]) => k !== 'cursor' && v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return createHash('sha256')
    .update(JSON.stringify(canonical))
    .digest('hex')
    .slice(0, 16);
}
export function encodeSearchCursor(
  request: ScholarlySearchRequest,
  offsets: Partial<Record<ScholarlyProviderId, number>>,
) {
  return Buffer.from(
    JSON.stringify({ v: 1, h: requestDigest(request), o: offsets }),
  ).toString('base64url');
}
export function decodeSearchCursor(request: ScholarlySearchRequest) {
  if (!request.cursor) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(request.cursor, 'base64url').toString());
  } catch {
    throw new PlatformError('VALIDATION_ERROR', 'Invalid search cursor.');
  }
  const parsed = cursorBody.safeParse(raw);
  if (!parsed.success || parsed.data.h !== requestDigest(request))
    throw new PlatformError('VALIDATION_ERROR', 'Invalid search cursor.');
  return parsed.data.o;
}

// ------------------------------------------------------------------ cache

/*
 * Results contain only public bibliographic metadata, never project state, so
 * a short per-instance cache absorbs repeated identical requests without a
 * cross-tenant leak. Saved-state annotations are added per request.
 */
const cache = new Map<
  string,
  { at: number; value: ProviderResult<ProviderPage> }
>();
const CACHE_MS = 5 * 60 * 1000;
const CACHE_MAX = 200;
export function clearSearchCache() {
  cache.clear();
}
async function cached(
  key: string,
  load: () => Promise<ProviderResult<ProviderPage>>,
) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await load();
  // Only successful pages are cached; failures must be retried for real.
  if (value.kind === 'ok') {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), value });
  }
  return value;
}

// ----------------------------------------------------------------- search

export interface SearchDependencies {
  providers: Record<ScholarlyProviderId, ScholarlyProvider>;
  /** Consumes a provider budget unit; returns false when exhausted. */
  takeProviderBudget: (provider: ScholarlyProviderId) => Promise<boolean>;
  signal?: AbortSignal | undefined;
}

export async function searchProviders(
  request: ScholarlySearchRequest,
  deps: SearchDependencies,
) {
  const offsets = decodeSearchCursor(request);
  const wanted: ScholarlyProviderId[] =
    request.provider === 'all' ? [...scholarlyProviders] : [request.provider];
  const active = wanted.filter((p) =>
    offsets ? offsets[p] !== undefined : true,
  );
  const digest = requestDigest(request);
  const reports: ProviderReport[] = [];
  const pages = new Map<ScholarlyProviderId, ProviderPage>();
  await Promise.all(
    scholarlyProviders.map(async (id) => {
      if (!active.includes(id)) {
        reports.push({
          provider: id,
          status: 'skipped',
          total: null,
          retryAfterSeconds: null,
          unsupported: [],
        });
        return;
      }
      const provider = deps.providers[id];
      if (!provider.configured) {
        reports.push(report(id, 'not_configured'));
        return;
      }
      const offset = offsets?.[id] ?? 0;
      const key = `${id}:${digest}:${offset}`;
      const hit = cache.get(key);
      if (!(hit && Date.now() - hit.at < CACHE_MS)) {
        if (!(await deps.takeProviderBudget(id))) {
          reports.push(report(id, 'rate_limited'));
          return;
        }
      }
      const result = await cached(key, () =>
        provider.search({
          request,
          offset,
          limit: PAGE_SIZE,
          signal: deps.signal,
        }),
      );
      if (result.kind === 'ok') {
        pages.set(id, result.data);
        reports.push({
          provider: id,
          status: result.data.items.length ? 'ok' : 'no_results',
          total: result.data.total,
          retryAfterSeconds: null,
          unsupported: result.data.unsupported,
        });
      } else if (result.kind === 'rate_limited')
        reports.push({
          ...report(id, 'rate_limited'),
          retryAfterSeconds: result.retryAfterSeconds,
        });
      else reports.push(report(id, 'unavailable'));
    }),
  );
  reports.sort(
    (a, b) =>
      scholarlyProviders.indexOf(a.provider) -
      scholarlyProviders.indexOf(b.provider),
  );
  const items = interleave(
    scholarlyProviders.map((id) => pages.get(id)?.items ?? []),
  );
  const nextOffsets: Partial<Record<ScholarlyProviderId, number>> = {};
  for (const [id, page] of pages)
    if (page.nextOffset !== null) nextOffsets[id] = page.nextOffset;
  return {
    state: overallSearchState(reports, items.length),
    items,
    providers: reports,
    nextCursor: Object.keys(nextOffsets).length
      ? encodeSearchCursor(request, nextOffsets)
      : null,
  };
}

function report(
  provider: ScholarlyProviderId,
  status: ProviderReport['status'],
): ProviderReport {
  return {
    provider,
    status,
    total: null,
    retryAfterSeconds: null,
    unsupported: [],
  };
}

/**
 * Alternates provider rankings and merges records only on an identical
 * normalized DOI. Title similarity never merges records.
 */
export function interleave(lists: NormalizedPaper[][]) {
  const out: NormalizedPaper[] = [];
  const byDoi = new Map<string, number>();
  const seen = new Set<string>();
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++)
    for (const list of lists) {
      const item = list[i];
      if (!item) continue;
      if (item.doi && byDoi.has(item.doi)) {
        const index = byDoi.get(item.doi)!;
        out[index] = mergeOnDoi(out[index]!, item);
        continue;
      }
      if (seen.has(item.candidateId)) continue;
      seen.add(item.candidateId);
      if (item.doi) byDoi.set(item.doi, out.length);
      out.push(item);
    }
  return out.slice(0, 50);
}
