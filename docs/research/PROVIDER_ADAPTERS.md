# Scholarly provider adapters

Phase 02 discovery uses two adapters behind one interface
(`apps/web/src/features/discovery/server/types.ts`):

```ts
interface ScholarlyProvider {
  id: 'openalex' | 'semantic-scholar';
  configured: boolean;
  search(page: {
    request;
    offset;
    limit;
    signal?;
  }): Promise<ProviderResult<ProviderPage>>;
  getPaper(
    externalId: string,
    signal?,
  ): Promise<ProviderResult<NormalizedPaper>>;
}
```

`ProviderResult` is `ok | not_found | rate_limited (retryAfterSeconds) | unavailable`. Adapters never throw provider details to callers, and React never receives raw provider payloads: every record is validated with a Zod subset and normalized to `NormalizedPaper` (`packages/core/src/research.ts`). Invalid records are dropped; missing fields stay `null`/empty and are never synthesized.

## HTTP boundary

`provider-http.ts` is the only network path. It builds URLs from a server-configured base (`ATLAS_OPENALEX_BASE_URL`, `ATLAS_SEMANTIC_SCHOLAR_BASE_URL`, defaulting to the official HTTPS hosts; environment validation accepts only HTTPS origins or loopback test fixtures), refuses redirects, caps response size (4 MB), times out each attempt (8 s), and composes the caller's `AbortSignal` so cancelling a search cancels the request. 429/5xx/network failures retry at most twice with exponential backoff and jitter; `Retry-After` is honoured when ≤ 4 s, otherwise the result is `rate_limited` immediately. No user-supplied URL is fetched anywhere in Phase 02.

## OpenAlex

`GET /works` with `search`, `filter`, `sort`, `per-page`, `page` and a fixed `select` list; `GET /works/{W…}` for saves. A server-side key (`ATLAS_OPENALEX_API_KEY`) is sent as `api_key`; `ATLAS_OPENALEX_MAILTO` is optional. Filters: `publication_year:from-to`, `is_oa:true`, `cited_by_count:>n-1`, `primary_topic.field.id:fields/{id}`, `raw_author_name.search`. Sort: relevance, `publication_date:desc`, `cited_by_count:desc`. Abstracts are rebuilt from the provider's inverted index (bounded at 5,000 positions). Basic paging stops at 10,000 records.

## Semantic Scholar

`GET /graph/v1/paper/search` with `query`, `offset`, `limit`, `fields`, `year`, `openAccessPdf`, `fieldsOfStudy`, `minCitationCount`; `GET /graph/v1/paper/{paperId}` for saves. `ATLAS_SEMANTIC_SCHOLAR_API_KEY` is sent as `x-api-key`. Relevance search caps `offset + limit` below 1,000. **Unsupported:** author filtering and non-relevance sorts; these are reported in `providers[].unsupported` and shown under the results, never applied as an unbounded local filter.

## Field taxonomy

Field filters use ten disciplines both providers can express (`researchFields` in core). Semantic Scholar receives the name; OpenAlex receives the matching field ID (e.g. Computer Science → `fields/17`, Physics → `fields/31` "Physics and Astronomy"). The taxonomies are not identical; the mapping is documented in code and results are not post-filtered.

## Orchestration, quotas and caching

`search.ts` queries the selected providers in parallel, interleaves rankings, and merges two records **only** when their normalized DOIs are identical (provenance from both is kept; the first provider's values win on conflict). Title similarity never merges. The overall state is `success | partial | no_results | rate_limited | unavailable`; a failed provider is never reported as an empty success. Cursors are base64 JSON holding per-provider offsets bound to a digest of the exact request.

Quotas (PostgreSQL buckets, shared by all instances): per actor 40 provider units/minute, per organization 200/minute (`all` costs two units), and an Atlas-wide hourly budget per provider (OpenAlex 100 anonymous / 900 keyed, Semantic Scholar 60 anonymous / 900 keyed) consumed by searches and saves. A per-instance cache holds only successful public-metadata pages for 5 minutes (200 entries); project saved-state is added per request and never cached.

## Saving

`paper.save` carries only `{projectId, provider, externalId, idempotencyKey}`. After checking `project.write`, the server re-fetches the record from the provider and stores the server-normalized metadata; client-supplied metadata is never accepted.

## Status in this delivery

Adapters, contracts and fixtures are implemented and tested. Live calls to `api.openalex.org` and `api.semanticscholar.org` were **BLOCKED** from the development session by its network policy; see the implementation report. The opt-in live smoke check is `ATLAS_LIVE_PROVIDER_SMOKE=true pnpm vitest run --config vitest.hosted.config.ts tests/hosted/providers.live.test.ts`.
