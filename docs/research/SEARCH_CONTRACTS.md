# Research search contracts

`GET /api/v1/projects/:projectId/research` — authenticated, `project.read` on a non-archived project, private/no-store.

| Parameter            | Type                                      | Notes                                                   |
| -------------------- | ----------------------------------------- | ------------------------------------------------------- |
| `query`              | 2–300 chars, no control characters        | required                                                |
| `provider`           | `all` \| `openalex` \| `semantic-scholar` | default `all`                                           |
| `yearFrom`, `yearTo` | 1000–2100, `from ≤ to`                    |                                                         |
| `openAccessOnly`     | boolean                                   |                                                         |
| `field`              | one of ten shared disciplines             | see PROVIDER_ADAPTERS                                   |
| `author`             | 2–120 chars                               | OpenAlex only; reported unsupported by Semantic Scholar |
| `minCitations`       | 0–1,000,000                               |                                                         |
| `sort`               | `relevance` \| `newest` \| `citations`    | non-relevance unsupported by Semantic Scholar           |
| `cursor`             | opaque, request-bound                     | from `nextCursor`                                       |

Unknown parameters are rejected (strict schema).

Response `data` (`searchResponse` in `packages/core/src/research.ts`):

```ts
{
  state: 'success' | 'partial' | 'no_results' | 'rate_limited' | 'unavailable';
  items: NormalizedPaper[];         // ≤ 50, deduplicated on DOI only
  providers: { provider; status: 'ok'|'no_results'|'rate_limited'|'unavailable'|'not_configured'|'skipped';
               total: number|null; retryAfterSeconds: number|null; unsupported: string[] }[];
  nextCursor: string | null;
  saved: Record<candidateId, projectPaperId>;  // active associations in this project only
}
```

Atlas-side failures use the standard envelope: `VALIDATION_ERROR` (400, including tampered/foreign cursors), `UNAUTHENTICATED`, `NOT_FOUND` (missing or inaccessible project), `RATE_LIMITED` (429, `Retry-After`). Provider failures are never converted to an empty success; they appear as provider statuses with `partial`/`rate_limited`/`unavailable` overall states.

UI states: idle, loading (cancellable), success, partial (banner + results), no results, rate limited, provider unavailable, invalid query.
