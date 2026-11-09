import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_ORIGIN: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  AUTH_DATABASE_URL: z
    .url()
    .refine(
      (v) => v.startsWith("postgresql://") || v.startsWith("postgres://"),
    ),
  DATABASE_URL: z
    .url()
    .refine(
      (v) => v.startsWith("postgresql://") || v.startsWith("postgres://"),
    ),
  QUEUE_DATABASE_URL: z
    .url()
    .refine(
      (v) => v.startsWith("postgresql://") || v.startsWith("postgres://"),
    ),
  SMTP_HOST: z.string().min(1).default("127.0.0.1"),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.email().default("atlas@example.invalid"),
});

export function parseEnv(input: Record<string, string | undefined>) {
  const result = schema.safeParse(input);
  if (!result.success) {
    // Never serialize the supplied values or Zod errors into logs/responses.
    throw new Error(
      `Invalid server configuration: ${[...new Set(result.error.issues.map((i) => i.path[0]))].join(", ")}`,
    );
  }
  const env = result.data;
  if (env.NODE_ENV === "production" && !env.APP_ORIGIN.startsWith("https://")) {
    throw new Error("Production APP_ORIGIN must use HTTPS");
  }
  if (
    env.NODE_ENV === "production" &&
    (!input.SMTP_HOST || !input.MAIL_FROM || env.MAIL_FROM.endsWith(".invalid"))
  ) {
    throw new Error("Production SMTP_HOST and real MAIL_FROM are required");
  }
  return env;
}

export type ServerEnv = ReturnType<typeof parseEnv>;
export const getEnv = () => parseEnv(process.env);
const workerSchema = schema.omit({ APP_ORIGIN: true, AUTH_DATABASE_URL: true });
export function getWorkerEnv() {
  const result = workerSchema.safeParse(process.env);
  if (!result.success) throw new Error("Invalid mail worker configuration");
  if (
    result.data.NODE_ENV === "production" &&
    (!process.env.SMTP_HOST ||
      !process.env.MAIL_FROM ||
      result.data.MAIL_FROM.endsWith(".invalid"))
  )
    throw new Error("Production mail configuration required");
  return result.data;
}
export type MailEnv = ReturnType<typeof getWorkerEnv>;
