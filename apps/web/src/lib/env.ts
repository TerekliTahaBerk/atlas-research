import { z } from 'zod';
// Fixed scholarly API hosts: HTTPS, or loopback for controlled test fixtures.
const providerBase = z.url().refine((value) => {
  const url = new URL(value);
  return (
    url.origin === value.replace(/\/$/, '') &&
    (url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        ['127.0.0.1', 'localhost'].includes(url.hostname)))
  );
}, 'Provider base URLs must be HTTPS origins or loopback test fixtures.');
const environment = z.object({
  ATLAS_MODE: z.enum(['preview', 'live']).default('preview'),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//)
    .optional(),
  DIRECT_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//)
    .optional(),
  ATLAS_ORIGIN: z.url().optional(),
  ATLAS_RATE_SECRET: z.string().min(32).optional(),
  ATLAS_CURSOR_SECRET: z.string().min(32).optional(),
  ATLAS_GOOGLE_OAUTH: z.enum(['true', 'false']).default('false'),
  ATLAS_DEV_INVITATION_LINKS: z.enum(['true', 'false']).default('false'),
  // Phase 02. All server-only; never prefix these with NEXT_PUBLIC_.
  ATLAS_OPENALEX_API_KEY: z.string().min(1).max(200).optional(),
  ATLAS_OPENALEX_MAILTO: z.email().optional(),
  ATLAS_SEMANTIC_SCHOLAR_API_KEY: z.string().min(1).max(200).optional(),
  ATLAS_OPENALEX_BASE_URL: providerBase.optional(),
  ATLAS_SEMANTIC_SCHOLAR_BASE_URL: providerBase.optional(),
  ATLAS_STORAGE_SERVICE_KEY: z.string().min(20).optional(),
  ATLAS_SCANNER_SECRET: z.string().min(32).optional(),
});
export function validateEnvironment(input: Record<string, string | undefined>) {
  const result = environment.safeParse(input);
  if (!result.success)
    throw new Error(
      `Invalid environment variables: ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  const env = result.data;
  if (
    Boolean(env.NEXT_PUBLIC_SUPABASE_URL) !==
    Boolean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  )
    throw new Error(
      'Supabase URL and publishable key must be configured together.',
    );
  if (env.ATLAS_MODE === 'live') {
    const required = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'DATABASE_URL',
      'ATLAS_ORIGIN',
      'ATLAS_RATE_SECRET',
      'ATLAS_CURSOR_SECRET',
    ] as const;
    const missing = required.filter((key) => !env[key]);
    if (missing.length)
      throw new Error(
        `Missing live environment variables: ${missing.join(', ')}`,
      );
    const origin = new URL(env.ATLAS_ORIGIN!);
    if (
      origin.origin !== env.ATLAS_ORIGIN ||
      (origin.protocol !== 'https:' &&
        !['localhost', '127.0.0.1'].includes(origin.hostname))
    )
      throw new Error(
        'ATLAS_ORIGIN must be an exact HTTPS origin or local loopback origin.',
      );
    if (env.DIRECT_URL && env.DIRECT_URL === env.DATABASE_URL)
      throw new Error(
        'Migration and runtime connections must use separate database credentials.',
      );
  }
  return env;
}
export function isLive() {
  return process.env.ATLAS_MODE === 'live';
}
