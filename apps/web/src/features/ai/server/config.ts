import 'server-only';
import { z } from 'zod';
import { modelPolicy } from '@atlas/ai';
import {
  GoogleEmbeddings,
  OpenAIEmbeddings,
  SDKResearchProvider,
} from '@atlas/ai/providers';
import { PlatformError } from '@/features/platform/server/errors';
const loopback = (url: URL) =>
  ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
export function isolatedAI() {
  try {
    const db = new URL(process.env.DATABASE_URL ?? 'http://invalid');
    const origin = new URL(process.env.ATLAS_ORIGIN ?? 'http://invalid');
    return (
      loopback(db) &&
      loopback(origin) &&
      /^\/atlas_(?:p01_test\w*|auth_test)$/.test(db.pathname)
    );
  } catch {
    return false;
  }
}
/** Separate from provider availability so saved research remains recoverable during outages. */
export function requireAIActivation() {
  if (
    process.env.ATLAS_MODE !== 'live' ||
    !(
      process.env.ATLAS_AI_ACTIVATION === 'reviewed-hosted' ||
      (process.env.ATLAS_AI_ACTIVATION === 'isolated-local' && isolatedAI())
    )
  )
    throw new PlatformError(
      'CONFLICT',
      'Atlas AI activation is pending security and recovery verification.',
    );
}
export function fixtureTransport(): typeof fetch | undefined {
  if (!process.env.ATLAS_AI_FIXTURE_ORIGIN) return undefined;
  let origin: URL;
  try {
    origin = new URL(process.env.ATLAS_AI_FIXTURE_ORIGIN);
  } catch {
    throw new PlatformError(
      'CONFLICT',
      'Invalid isolated AI fixture configuration.',
    );
  }
  if (
    !isolatedAI() ||
    process.env.ATLAS_AI_ACTIVATION !== 'isolated-local' ||
    origin.protocol !== 'http:' ||
    !loopback(origin) ||
    origin.pathname !== '/' ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash
  )
    throw new PlatformError(
      'CONFLICT',
      'AI fixtures require an isolated loopback test database and origin.',
    );
  return async (input, init) => {
    const original = new URL(
      input instanceof Request ? input.url : String(input),
    );
    if (
      ![
        'api.openai.com',
        'api.anthropic.com',
        'generativelanguage.googleapis.com',
      ].includes(original.hostname)
    )
      throw new Error('FIXTURE_HOST_DENIED');
    return fetch(new URL(original.pathname + original.search, origin), {
      ...init,
      redirect: 'error',
    });
  };
}
export function aiBudget() {
  requireAIActivation();
  const cap = z.coerce
    .number()
    .int()
    .min(1)
    .max(10_000_000)
    .safeParse(process.env.ATLAS_AI_MONTHLY_LIMIT_MICROS);
  if (!cap.success)
    throw new PlatformError(
      'CONFLICT',
      'Atlas AI spending limits are not configured.',
    );
  return cap.data;
}
export function aiConfig() {
  requireAIActivation();
  let raw: unknown;
  try {
    raw = JSON.parse(process.env.ATLAS_AI_MODEL_POLICY ?? 'null') as unknown;
  } catch {
    raw = null;
  }
  const parsed = modelPolicy.safeParse(raw);
  const cap = z.coerce
    .number()
    .int()
    .min(1)
    .max(10_000_000)
    .safeParse(process.env.ATLAS_AI_MONTHLY_LIMIT_MICROS);
  if (!parsed.success || !cap.success)
    throw new PlatformError(
      'CONFLICT',
      'Atlas AI model policy and limits are not configured.',
    );
  const transport = fixtureTransport();
  const policy = parsed.data;
  const key = transport
    ? 'atlas-isolated-fixture'
    : process.env[
        policy.provider === 'google'
          ? 'GEMINI_API_KEY'
          : policy.provider === 'openai'
            ? 'OPENAI_API_KEY'
            : 'ANTHROPIC_API_KEY'
      ];
  if (!transport && process.env.ATLAS_AI_PAID_REQUESTS !== 'approved')
    throw new PlatformError('CONFLICT', 'Paid AI requests are disabled.');
  if (!key)
    throw new PlatformError(
      'CONFLICT',
      'The approved model provider is unavailable.',
    );
  return { policy, key, cap: cap.data, transport };
}
export const generationProvider = (config: ReturnType<typeof aiConfig>) =>
  new SDKResearchProvider(config.policy, config.key, config.transport);
export function embeddingConfig() {
  requireAIActivation();
  const parsed = z
    .object({
      provider: z.enum(['openai', 'google']),
      model: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
      revision: z.string().regex(/^[a-zA-Z0-9._-]{1,30}$/),
      price: z.coerce.number().int().positive().max(100_000_000),
    })
    .safeParse({
      provider: process.env.ATLAS_AI_EMBEDDING_PROVIDER,
      model: process.env.ATLAS_AI_EMBEDDING_MODEL,
      revision: process.env.ATLAS_AI_EMBEDDING_REVISION,
      price: process.env.ATLAS_AI_EMBEDDING_MICROS_PER_MILLION,
    });
  if (!parsed.success)
    throw new PlatformError(
      'CONFLICT',
      'Atlas AI embedding policy is not configured.',
    );
  const transport = fixtureTransport();
  if (!transport && process.env.ATLAS_AI_PAID_REQUESTS !== 'approved')
    throw new PlatformError('CONFLICT', 'Paid AI requests are disabled.');
  const { provider, model, revision, price } = parsed.data;
  const key = transport
    ? 'atlas-isolated-fixture'
    : process.env[provider === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY'];
  if (!key)
    throw new PlatformError(
      'CONFLICT',
      'The embedding provider is unavailable.',
    );
  return {
    provider,
    model,
    revision,
    price,
    indexKey: `${provider}:${model}:${revision}:768`,
    adapter:
      provider === 'openai'
        ? new OpenAIEmbeddings(model, key, transport)
        : new GoogleEmbeddings(model, key, transport),
  };
}
