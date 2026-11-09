import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ORIGIN: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  AUTH_DATABASE_URL: z.url().refine(v => v.startsWith("postgresql://") || v.startsWith("postgres://")),
  DATABASE_URL: z.url().refine(v => v.startsWith("postgresql://") || v.startsWith("postgres://")),
});

export function parseEnv(input: Record<string, string | undefined>) {
  const result = schema.safeParse(input);
  if (!result.success) {
    // Never serialize the supplied values or Zod errors into logs/responses.
    throw new Error(`Invalid server configuration: ${[...new Set(result.error.issues.map(i => i.path[0]))].join(", ")}`);
  }
  const env = result.data;
  if (env.NODE_ENV === "production" && !env.APP_ORIGIN.startsWith("https://")) {
    throw new Error("Production APP_ORIGIN must use HTTPS");
  }
  return env;
}

export type ServerEnv = ReturnType<typeof parseEnv>;
export const getEnv = () => parseEnv(process.env);
