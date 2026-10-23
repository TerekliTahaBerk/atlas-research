import 'server-only';
import type {
  NormalizedPaper,
  ScholarlyProviderId,
  ScholarlySearchRequest,
} from '@atlas/core';
import type { ProviderResult } from './provider-http';

export interface ProviderPageRequest {
  request: ScholarlySearchRequest;
  offset: number;
  limit: number;
  signal?: AbortSignal | undefined;
}
export interface ProviderPage {
  items: NormalizedPaper[];
  total: number | null;
  /** Offset for the next page, or null when the provider has no more. */
  nextOffset: number | null;
  /** Requested filters the provider cannot express; never post-filtered. */
  unsupported: string[];
}
export interface ScholarlyProvider {
  readonly id: ScholarlyProviderId;
  readonly configured: boolean;
  search(page: ProviderPageRequest): Promise<ProviderResult<ProviderPage>>;
  getPaper(
    externalId: string,
    signal?: AbortSignal,
  ): Promise<ProviderResult<NormalizedPaper>>;
}
