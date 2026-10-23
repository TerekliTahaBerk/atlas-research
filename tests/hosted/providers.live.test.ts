import { describe, expect, it } from 'vitest';
import { searchRequest } from '../../packages/core/src/index';
import { createOpenAlexProvider } from '../../apps/web/src/features/discovery/server/openalex';
import { createSemanticScholarProvider } from '../../apps/web/src/features/discovery/server/semantic-scholar';

/*
 * Explicit opt-in contract smoke test against the real public APIs. It is
 * never part of CI: provider uptime must not gate merges. Run with
 *   ATLAS_LIVE_PROVIDER_SMOKE=true pnpm vitest run \
 *     --config vitest.hosted.config.ts tests/hosted/providers.live.test.ts
 * Optional keys are read from ATLAS_OPENALEX_API_KEY /
 * ATLAS_SEMANTIC_SCHOLAR_API_KEY and are never printed.
 */
if (process.env.ATLAS_LIVE_PROVIDER_SMOKE !== 'true')
  throw new Error('Set ATLAS_LIVE_PROVIDER_SMOKE=true to call live providers.');

const request = searchRequest.parse({ query: 'protein structure prediction' });
describe('live scholarly providers', () => {
  it('OpenAlex returns validated, attributed records', async () => {
    const provider = createOpenAlexProvider({
      baseUrl: 'https://api.openalex.org',
      apiKey: process.env.ATLAS_OPENALEX_API_KEY,
      mailto: process.env.ATLAS_OPENALEX_MAILTO,
    });
    const result = await provider.search({ request, offset: 0, limit: 5 });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.data.items.length).toBeGreaterThan(0);
    const first = result.data.items[0]!;
    expect(first.provenance[0]?.provider).toBe('openalex');
    const again = await provider.getPaper(first.openAlexId!);
    expect(again).toMatchObject({
      kind: 'ok',
      data: { openAlexId: first.openAlexId },
    });
  });
  it('Semantic Scholar returns validated, attributed records', async () => {
    const provider = createSemanticScholarProvider({
      baseUrl: 'https://api.semanticscholar.org',
      apiKey: process.env.ATLAS_SEMANTIC_SCHOLAR_API_KEY,
    });
    const result = await provider.search({ request, offset: 0, limit: 5 });
    // Anonymous Semantic Scholar access is shared and often rate limited;
    // that is a reportable state, not a contract failure.
    expect(['ok', 'rate_limited']).toContain(result.kind);
    if (result.kind !== 'ok') return;
    expect(result.data.items[0]?.provenance[0]?.provider).toBe(
      'semantic-scholar',
    );
  });
});
