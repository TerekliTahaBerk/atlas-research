import { z } from 'zod';
const environment = z.object({
  ATLAS_MODE: z.literal('preview').default('preview'),
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
});
export function validateEnvironment(input: Record<string, string | undefined>) {
  const result = environment.safeParse(input);
  if (!result.success)
    throw new Error(
      `Invalid environment variables: ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  if (
    Boolean(result.data.NEXT_PUBLIC_SUPABASE_URL) !==
    Boolean(result.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  )
    throw new Error(
      'Supabase URL and publishable key must be configured together.',
    );
  return result.data;
}
