import 'server-only';
import {
  searchResponse,
  type NormalizedPaper,
  type ScholarlyProviderId,
  type ScholarlySearchRequest,
} from '@atlas/core';
import type { VerifiedActor } from '@/features/platform/server/database';
import { PlatformError } from '@/features/platform/server/errors';
import { rateLimit, takeRate } from '@/features/platform/server/limiter';
import { getProject } from '@/features/platform/server/services';
import {
  savedCandidates,
  type PaperResolver,
} from '@/features/library/server/library';
import { configuredProviders, searchProviders } from './search';

/*
 * Atlas-side budgets protect provider allowances shared by every tenant. They
 * are conservative defaults: anonymous provider access gets far less than a
 * configured key, and every provider call (search or save) consumes one unit.
 */
export function providerHourlyBudget(
  provider: ScholarlyProviderId,
  env: Record<string, string | undefined> = process.env,
) {
  const keyed =
    provider === 'openalex'
      ? !!env.ATLAS_OPENALEX_API_KEY
      : !!env.ATLAS_SEMANTIC_SCHOLAR_API_KEY;
  return keyed ? 900 : provider === 'openalex' ? 100 : 60;
}
const takeProviderBudget = (provider: ScholarlyProviderId) =>
  takeRate(
    `provider:${provider}`,
    'global',
    providerHourlyBudget(provider),
    3600,
  );

export async function researchSearch(
  actor: VerifiedActor,
  projectId: string,
  request: ScholarlySearchRequest,
  signal?: AbortSignal,
) {
  const project = await getProject(actor, projectId);
  if (project.archived)
    throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
  // Per-actor and per-organization limits; "all" costs one unit per provider.
  const units = request.provider === 'all' ? 2 : 1;
  for (let i = 0; i < units; i++) {
    await rateLimit('research-search', actor.id, 40, 60);
    await rateLimit('research-search-org', project.organizationId, 200, 60);
  }
  const result = await searchProviders(request, {
    providers: configuredProviders(),
    takeProviderBudget,
    signal,
  });
  const saved = await savedCandidates(actor, projectId, result.items);
  return searchResponse.parse({ ...result, saved });
}

export const providerResolver: PaperResolver = {
  async resolve(provider, externalId): Promise<NormalizedPaper> {
    if (!(await takeProviderBudget(provider)))
      throw new PlatformError(
        'RATE_LIMITED',
        'The research provider budget is exhausted. Try again later.',
      );
    const result = await configuredProviders()[provider].getPaper(externalId);
    if (result.kind === 'ok') return result.data;
    if (result.kind === 'not_found')
      throw new PlatformError('NOT_FOUND', 'The provider has no such record.');
    if (result.kind === 'rate_limited')
      throw new PlatformError(
        'RATE_LIMITED',
        'The research provider is rate limiting requests. Try again later.',
      );
    throw new PlatformError(
      'EXTERNAL_PROVIDER_ERROR',
      'The research provider is unavailable. The paper was not saved.',
    );
  },
};
