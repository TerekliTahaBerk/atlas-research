import catalogue from "./provider-pricing/2026-11-23.json";

export const CREDIT_MICROS = 10_000;
export const DEFAULT_MODEL = catalogue.defaultModel;
export const PRICING_VERSION = catalogue.version;
export const MAX_REQUEST_BYTES = 50_000;

const registry = { [catalogue.version]: catalogue };

type Rates = (typeof catalogue.models)[keyof typeof catalogue.models];
export type ProviderPricing = Rates & {
  version: string;
  provider: string;
  model: string;
};

export type ProviderMeters = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheWrite30mTokens?: number;
  cacheWrite12hTokens?: number;
};

export function providerPricing(
  model: string,
  version = PRICING_VERSION,
): ProviderPricing | null {
  if (!Object.hasOwn(registry, version)) return null;
  const entry = registry[version];
  if (!Object.hasOwn(entry.models, model)) return null;
  return {
    version,
    provider: entry.provider,
    model,
    ...(entry.models as Record<string, Rates>)[model],
  };
}

function meteredQuantity(value: number, cap: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > cap)
    throw new Error("Invalid provider meter");
  return value;
}

export function meteredMicros(rates: ProviderPricing, usage: ProviderMeters) {
  const input = meteredQuantity(usage.inputTokens, rates.maxInputTokens);
  const output = meteredQuantity(usage.outputTokens, rates.maxOutputTokens);
  const cached = meteredQuantity(usage.cachedInputTokens ?? 0, input);
  const cacheWrite30m = meteredQuantity(
    usage.cacheWrite30mTokens ?? 0,
    input - cached,
  );
  const cacheWrite12h = meteredQuantity(
    usage.cacheWrite12hTokens ?? 0,
    input - cached - cacheWrite30m,
  );
  const uncached = input - cached - cacheWrite30m - cacheWrite12h;
  const nanos =
    uncached * rates.inputNanoUsdPerToken +
    cached * rates.cachedNanoUsdPerToken +
    cacheWrite30m * rates.write30mNanoUsdPerToken +
    cacheWrite12h * rates.write12hNanoUsdPerToken +
    output * rates.outputNanoUsdPerToken;
  return Math.ceil(nanos / 1000);
}

export function creditsForSuccessfulRun(micros: number) {
  return Math.max(1, Math.ceil(micros / CREDIT_MICROS));
}

export function reservationForProvider(rates: ProviderPricing) {
  // Requests use the 30-minute cache tier. The wire envelope is capped separately.
  // Reserve the full metered token ceiling, including schema overhead and all cache writes.
  const micros = meteredMicros(rates, {
    inputTokens: rates.maxInputTokens,
    cacheWrite30mTokens: rates.maxInputTokens,
    outputTokens: rates.maxOutputTokens,
  });
  return {
    micros,
    credits: creditsForSuccessfulRun(micros),
    pricingVersion: rates.version,
  };
}

export function parseOpenAIMeters(
  raw: unknown,
  rates: ProviderPricing,
): ProviderMeters {
  if (!raw || typeof raw !== "object")
    throw new Error("Missing provider meters");
  const usage = raw as {
    input_tokens: number;
    output_tokens: number;
    input_tokens_details?: {
      cached_tokens?: number;
      cache_write_tokens?: number;
      cache_write_tokens_details?: {
        ttl_30m_tokens: number;
        ttl_12h_tokens: number;
      };
    };
  };
  const details = usage.input_tokens_details;
  if (!details || !Number.isSafeInteger(details.cached_tokens))
    throw new Error("Missing provider cache meters");
  const writes = details.cache_write_tokens ?? 0;
  const breakdown = details.cache_write_tokens_details;
  if (
    breakdown &&
    breakdown.ttl_30m_tokens + breakdown.ttl_12h_tokens !== writes
  )
    throw new Error("Provider cache meters do not reconcile");
  const meters = {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cachedInputTokens: details.cached_tokens,
    cacheWrite30mTokens: breakdown?.ttl_30m_tokens ?? writes,
    cacheWrite12hTokens: breakdown?.ttl_12h_tokens ?? 0,
  };
  meteredMicros(rates, meters);
  return meters;
}
