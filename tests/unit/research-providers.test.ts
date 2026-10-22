import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  searchRequest,
  type ScholarlySearchRequest,
} from '../../packages/core/src/index';
import { providerGet } from '../../apps/web/src/features/discovery/server/provider-http';
import {
  createOpenAlexProvider,
  invertedAbstract,
  normalizeOpenAlexWork,
} from '../../apps/web/src/features/discovery/server/openalex';
import {
  createSemanticScholarProvider,
  normalizeSemanticScholarPaper,
} from '../../apps/web/src/features/discovery/server/semantic-scholar';
import {
  clearSearchCache,
  encodeSearchCursor,
  interleave,
  searchProviders,
} from '../../apps/web/src/features/discovery/server/search';
import type { ScholarlyProvider } from '../../apps/web/src/features/discovery/server/types';

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(
      resolve(process.cwd(), `tests/fixtures/providers/${name}.json`),
      'utf8',
    ),
  ) as unknown;
const at = '2026-10-22T12:00:00.000Z';
const now = () => new Date(at);
const noSleep = vi.fn(async () => {});
const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
const request = (input: Partial<ScholarlySearchRequest> = {}) =>
  searchRequest.parse({ query: 'protein folding', ...input });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  noSleep.mockClear();
  clearSearchCache();
});
afterEach(() => vi.unstubAllGlobals());

describe('OpenAlex normalization', () => {
  it('validates records, keeps provider fields and drops invalid ones', () => {
    const page = fixture('openalex-search') as { results: unknown[] };
    const items = page.results
      .map((r) => normalizeOpenAlexWork(r, at))
      .filter(Boolean);
    expect(items).toHaveLength(2);
    const [first, sparse] = items;
    expect(first).toMatchObject({
      candidateId: 'doi:10.5555/atlas.fixture.0001',
      doi: '10.5555/atlas.fixture.0001',
      openAlexId: 'W9900000001',
      year: 2023,
      venue: 'Journal of Fixture Studies',
      abstract: 'Sparse attention reduces memory use.',
      citationCount: 412,
      fields: ['Computer Science', 'Artificial Intelligence'],
      openAccess: { isOpenAccess: true, status: 'gold', license: 'cc-by' },
      pdfLocations: [
        {
          url: 'https://example.org/fixture/0001.pdf',
          provider: 'openalex',
        },
      ],
      provenance: [
        {
          provider: 'openalex',
          externalId: 'W9900000001',
          retrievedAt: at,
        },
      ],
    });
    expect(first?.authors[0]).toEqual({
      name: 'Ada Fixture',
      orcid: '0000-0002-1825-0097',
    });
    // Missing values remain missing; nothing is synthesized.
    expect(sparse).toMatchObject({
      candidateId: 'openalex:W9900000002',
      doi: null,
      year: null,
      venue: null,
      abstract: null,
      authors: [],
      landingPageUrl: null,
      pdfLocations: [],
    });
  });
  it('rejects oversized inverted indexes instead of truncating text', () => {
    expect(invertedAbstract({ a: [6000] })).toBeNull();
    expect(invertedAbstract(null)).toBeNull();
  });
});

describe('Semantic Scholar normalization', () => {
  it('maps DOI, open-access and missing fields without invention', () => {
    const page = fixture('semantic-scholar-search') as { data: unknown[] };
    const items = page.data
      .map((r) => normalizeSemanticScholarPaper(r, at))
      .filter(Boolean);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      candidateId: 'doi:10.5555/atlas.fixture.0001',
      semanticScholarId: 'f1'.repeat(20),
      venue: 'Journal of Fixture Studies',
      language: null,
      publicationType: 'JournalArticle',
    });
    expect(items[1]).toMatchObject({
      doi: null,
      abstract: null,
      venue: null,
      citationCount: 17,
      fields: [],
      openAccess: { isOpenAccess: false, status: null, license: null },
    });
  });
});

describe('bounded provider HTTP', () => {
  const base = { baseUrl: 'https://api.example.test', path: '/x', query: {} };
  it('retries 5xx with a bound and then reports unavailability', async () => {
    fetchMock.mockImplementation(async () => new Response('', { status: 503 }));
    await expect(
      providerGet({ ...base, retries: 2, sleep: noSleep }),
    ).resolves.toEqual({ kind: 'unavailable' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it('honours a short Retry-After and succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response('', { status: 429, headers: { 'retry-after': '1' } }),
      )
      .mockResolvedValueOnce(json({ ok: true }));
    await expect(providerGet({ ...base, sleep: noSleep })).resolves.toEqual({
      kind: 'ok',
      data: { ok: true },
    });
    expect(noSleep).toHaveBeenCalledWith(1000);
  });
  it('reports a long Retry-After without waiting or hammering', async () => {
    fetchMock.mockResolvedValue(
      new Response('', { status: 429, headers: { 'retry-after': '120' } }),
    );
    await expect(providerGet({ ...base, sleep: noSleep })).resolves.toEqual({
      kind: 'rate_limited',
      retryAfterSeconds: 120,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(noSleep).not.toHaveBeenCalled();
  });
  it('times out hanging providers and refuses redirects', async () => {
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('timeout', 'TimeoutError')),
          );
        }),
    );
    await expect(
      providerGet({ ...base, timeoutMs: 20, retries: 1, sleep: noSleep }),
    ).resolves.toEqual({ kind: 'unavailable' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' });
  });
  it('treats malformed or oversized bodies as unavailable', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{not json'));
    await expect(providerGet({ ...base, retries: 0 })).resolves.toEqual({
      kind: 'unavailable',
    });
    fetchMock.mockResolvedValueOnce(new Response('x'.repeat(100)));
    await expect(
      providerGet({ ...base, retries: 0, maxBytes: 10 }),
    ).resolves.toEqual({ kind: 'unavailable' });
  });
  it('propagates caller cancellation instead of retrying', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('cancelled', 'AbortError'));
    await expect(
      providerGet({ ...base, signal: controller.signal }),
    ).rejects.toThrow('cancelled');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('provider adapters', () => {
  it('translates OpenAlex filters, sort, pagination and key', async () => {
    fetchMock.mockResolvedValue(json(fixture('openalex-search')));
    const provider = createOpenAlexProvider({
      baseUrl: 'https://api.openalex.test',
      apiKey: 'server-key',
      now,
    });
    const result = await provider.search({
      request: request({
        yearFrom: 2020,
        yearTo: 2024,
        openAccessOnly: true,
        minCitations: 10,
        field: 'Computer Science',
        author: 'Ada, Fixture',
        sort: 'citations',
      }),
      offset: 0,
      limit: 20,
    });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/works');
    expect(url.searchParams.get('filter')).toBe(
      'publication_year:2020-2024,is_oa:true,cited_by_count:>9,primary_topic.field.id:fields/17,raw_author_name.search:Ada  Fixture',
    );
    expect(url.searchParams.get('sort')).toBe('cited_by_count:desc');
    expect(url.searchParams.get('per-page')).toBe('20');
    expect(url.searchParams.get('api_key')).toBe('server-key');
    expect(result).toMatchObject({
      kind: 'ok',
      data: { total: 3, nextOffset: null, unsupported: [] },
    });
  });
  it('explains Semantic Scholar filters it cannot apply', async () => {
    fetchMock.mockResolvedValue(json(fixture('semantic-scholar-search')));
    const provider = createSemanticScholarProvider({
      baseUrl: 'https://api.s2.test',
      apiKey: 's2-key',
      now,
    });
    const result = await provider.search({
      request: request({ author: 'Ada', sort: 'newest', openAccessOnly: true }),
      offset: 980,
      limit: 20,
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const parsed = new URL(String(url));
    expect(parsed.searchParams.get('limit')).toBe('19');
    expect(parsed.searchParams.has('openAccessPdf')).toBe(true);
    expect(parsed.searchParams.has('author')).toBe(false);
    expect(init?.headers).toMatchObject({ 'x-api-key': 's2-key' });
    expect(result.kind === 'ok' && result.data.unsupported).toEqual([
      'Author filter is not supported by this provider.',
      'Results are ordered by relevance only.',
    ]);
  });
  it('only accepts a fetched paper matching the requested identity', async () => {
    const provider = createOpenAlexProvider({
      baseUrl: 'https://api.openalex.test',
      now,
    });
    fetchMock.mockResolvedValueOnce(json(fixture('openalex-work')));
    await expect(provider.getPaper('W9900000001')).resolves.toMatchObject({
      kind: 'ok',
      data: { openAlexId: 'W9900000001' },
    });
    fetchMock.mockResolvedValueOnce(json(fixture('openalex-work')));
    await expect(provider.getPaper('W9900000099')).resolves.toEqual({
      kind: 'unavailable',
    });
    await expect(provider.getPaper('../etc')).resolves.toEqual({
      kind: 'not_found',
    });
  });
});

function stubProvider(
  id: ScholarlyProvider['id'],
  result: Awaited<ReturnType<ScholarlyProvider['search']>>,
): ScholarlyProvider {
  return {
    id,
    configured: true,
    search: vi.fn(async () => result),
    getPaper: vi.fn(async () => ({ kind: 'not_found' as const })),
  };
}

describe('search orchestration', () => {
  const openalexPage = () => {
    const page = fixture('openalex-search') as { results: unknown[] };
    return page.results
      .map((r) => normalizeOpenAlexWork(r, at))
      .filter((p) => p !== null);
  };
  const s2Page = () => {
    const page = fixture('semantic-scholar-search') as { data: unknown[] };
    return page.data
      .map((r) => normalizeSemanticScholarPaper(r, at))
      .filter((p) => p !== null);
  };
  const budget = vi.fn(async () => true);

  it('merges strong DOI matches, keeps both provenances, and never merges on title', async () => {
    const result = await searchProviders(request(), {
      providers: {
        openalex: stubProvider('openalex', {
          kind: 'ok',
          data: {
            items: openalexPage(),
            total: 2,
            nextOffset: 20,
            unsupported: [],
          },
        }),
        'semantic-scholar': stubProvider('semantic-scholar', {
          kind: 'ok',
          data: {
            items: s2Page(),
            total: 2,
            nextOffset: null,
            unsupported: [],
          },
        }),
      },
      takeProviderBudget: budget,
    });
    expect(result.state).toBe('success');
    expect(result.items).toHaveLength(3);
    const merged = result.items[0]!;
    expect(merged.provenance.map((p) => p.provider)).toEqual([
      'openalex',
      'semantic-scholar',
    ]);
    expect(merged.semanticScholarId).toBe('f1'.repeat(20));
    // OpenAlex values win on conflict; its count is kept, not averaged.
    expect(merged.citationCount).toBe(412);
    expect(result.nextCursor).not.toBeNull();
  });
  it('returns partial results and reports the failed provider', async () => {
    const result = await searchProviders(request(), {
      providers: {
        openalex: stubProvider('openalex', { kind: 'unavailable' }),
        'semantic-scholar': stubProvider('semantic-scholar', {
          kind: 'ok',
          data: {
            items: s2Page(),
            total: 2,
            nextOffset: null,
            unsupported: [],
          },
        }),
      },
      takeProviderBudget: budget,
    });
    expect(result.state).toBe('partial');
    expect(result.providers.map((p) => [p.provider, p.status])).toEqual([
      ['openalex', 'unavailable'],
      ['semantic-scholar', 'ok'],
    ]);
  });
  it('never substitutes fake records when every provider fails', async () => {
    const result = await searchProviders(request(), {
      providers: {
        openalex: stubProvider('openalex', {
          kind: 'rate_limited',
          retryAfterSeconds: 30,
        }),
        'semantic-scholar': stubProvider('semantic-scholar', {
          kind: 'unavailable',
        }),
      },
      takeProviderBudget: budget,
    });
    expect(result).toMatchObject({
      state: 'rate_limited',
      items: [],
      nextCursor: null,
    });
    expect(result.providers[0]).toMatchObject({ retryAfterSeconds: 30 });
  });
  it('stops at an exhausted Atlas provider budget without calling it', async () => {
    const openalex = stubProvider('openalex', {
      kind: 'ok',
      data: { items: [], total: 0, nextOffset: null, unsupported: [] },
    });
    const result = await searchProviders(request({ provider: 'openalex' }), {
      providers: {
        openalex,
        'semantic-scholar': stubProvider('semantic-scholar', {
          kind: 'unavailable',
        }),
      },
      takeProviderBudget: async () => false,
    });
    expect(openalex.search).not.toHaveBeenCalled();
    expect(result.state).toBe('rate_limited');
    expect(result.providers[1]?.status).toBe('skipped');
  });
  it('continues only providers that have more pages and rejects foreign cursors', async () => {
    const providers = {
      openalex: stubProvider('openalex', {
        kind: 'ok',
        data: { items: [], total: 0, nextOffset: null, unsupported: [] },
      }),
      'semantic-scholar': stubProvider('semantic-scholar', {
        kind: 'ok',
        data: { items: [], total: 0, nextOffset: null, unsupported: [] },
      }),
    };
    const base = request();
    const cursor = encodeSearchCursor(base, { openalex: 20 });
    await searchProviders(
      { ...base, cursor },
      { providers, takeProviderBudget: budget },
    );
    expect(providers.openalex.search).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 20 }),
    );
    expect(providers['semantic-scholar'].search).not.toHaveBeenCalled();
    await expect(
      searchProviders(
        { ...request({ query: 'different query' }), cursor },
        { providers, takeProviderBudget: budget },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it('does not merge records that only look similar', () => {
    const [a] = openalexPage();
    const b = {
      ...a!,
      doi: null,
      candidateId: 'openalex:W1',
      openAlexId: 'W1',
    };
    expect(interleave([[a!], [b]])).toHaveLength(2);
  });
});
