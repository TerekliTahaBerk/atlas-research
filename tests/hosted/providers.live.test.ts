import { describe, expect, it } from 'vitest';
import { searchRequest } from '../../packages/core/src/index';
import { createOpenAlexProvider } from '../../apps/web/src/features/discovery/server/openalex';
import { createSemanticScholarProvider } from '../../apps/web/src/features/discovery/server/semantic-scholar';

// Opt-in, actual public endpoints only. A 429 is a failed workflow check,
// never evidence that search/detail/normalization passed. No quota flooding.
if (process.env.ATLAS_LIVE_PROVIDER_SMOKE !== 'true')
  throw new Error('Set ATLAS_LIVE_PROVIDER_SMOKE=true to call live providers.');
const request = searchRequest.parse({ query: 'protein structure prediction' });
const providers = [
  createOpenAlexProvider({
    baseUrl: 'https://api.openalex.org',
    apiKey: process.env.ATLAS_OPENALEX_API_KEY,
    mailto: process.env.ATLAS_OPENALEX_MAILTO,
  }),
  createSemanticScholarProvider({
    baseUrl: 'https://api.semanticscholar.org',
    apiKey: process.env.ATLAS_SEMANTIC_SCHOLAR_API_KEY,
  }),
];
describe.each(providers)('$id live API', (provider) => {
  it('search, DOI normalization, paper detail and second page', async () => {
    const first = await provider.search({ request, offset: 0, limit: 5 });
    expect(first.kind, `${provider.id} search: ${first.kind}`).toBe('ok');
    if (first.kind !== 'ok') return;
    expect(first.data.items.length).toBeGreaterThan(0);
    const item = first.data.items.find((p) => p.doi);
    expect(item, 'expected a real DOI-bearing result').toBeDefined();
    if (!item) return;
    expect(item.doi).toMatch(/^10\.[0-9]{4,9}\/[^\s]+$/);
    expect(item.doi).toBe(item.doi?.toLowerCase());
    expect(item.provenance[0]?.provider).toBe(provider.id);
    const id =
      provider.id === 'openalex' ? item.openAlexId : item.semanticScholarId;
    expect(id).toBeTruthy();
    const detail = await provider.getPaper(id!);
    expect(detail).toMatchObject({
      kind: 'ok',
      data: { doi: item.doi, title: item.title },
    });
    expect(first.data.nextOffset).not.toBeNull();
    const second = await provider.search({
      request,
      offset: first.data.nextOffset!,
      limit: 5,
    });
    expect(second.kind).toBe('ok');
    if (second.kind !== 'ok') return;
    expect(second.data.items.length).toBeGreaterThan(0);
    expect(second.data.items.map((p) => p.candidateId)).not.toEqual(
      first.data.items.map((p) => p.candidateId),
    );
  });
  it('applies live year, open-access, field and citation filters', async () => {
    const filtered = await provider.search({
      request: searchRequest.parse({
        query: request.query,
        yearFrom: 2020,
        yearTo: 2024,
        openAccessOnly: true,
        minCitations: 10,
        field: 'Computer Science',
      }),
      offset: 0,
      limit: 5,
    });
    expect(filtered.kind, `${provider.id} filters: ${filtered.kind}`).toBe(
      'ok',
    );
    if (filtered.kind !== 'ok') return;
    expect(filtered.data.items.length).toBeGreaterThan(0);
    for (const item of filtered.data.items) {
      expect(item.year).toBeGreaterThanOrEqual(2020);
      expect(item.year).toBeLessThanOrEqual(2024);
      expect(item.openAccess.isOpenAccess).toBe(true);
      expect(item.citationCount).toBeGreaterThanOrEqual(10);
      // Taxonomies differ; the normalized field still comes from the provider.
      expect(item.fields.length).toBeGreaterThan(0);
    }
  });
});

it('OpenAlex live author filter and citation sort', async () => {
  const provider = providers[0]!;
  const result = await provider.search({
    request: searchRequest.parse({
      query: request.query,
      author: 'John Jumper',
      sort: 'citations',
    }),
    offset: 0,
    limit: 5,
  });
  expect(result.kind).toBe('ok');
  if (result.kind !== 'ok') return;
  expect(result.data.items.length).toBeGreaterThan(0);
  for (const item of result.data.items)
    expect(item.authors.some((a) => /jumper/i.test(a.name))).toBe(true);
  const counts = result.data.items.map((p) => p.citationCount ?? 0);
  expect(counts).toEqual([...counts].sort((a, b) => b - a));
});
it('Semantic Scholar live known paper detail independent of search availability', async () => {
  // Official Graph API documentation's example paper, not a fixture identity.
  const result = await providers[1]!.getPaper(
    '649def34f8be52c8b66281af98ae884c09aef38b',
  );
  expect(result.kind, `semantic-scholar detail: ${result.kind}`).toBe('ok');
  if (result.kind !== 'ok') return;
  expect(result.data.title.length).toBeGreaterThan(0);
  expect(result.data.provenance[0]?.provider).toBe('semantic-scholar');
});
