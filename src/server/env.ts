import { z } from "zod";

export function assertProductionEnvIsolation(
  input: Record<string, string | undefined>,
  role: "web" | "mail",
) {
  if (input.NODE_ENV !== "production") return;
  const forbidden = Object.entries(input).some(
    ([key, value]) =>
      value &&
      (/^(SERVICE_HEX_|ATLAS_INITIAL_|ATLAS_.*_PASSWORD$)/.test(key) ||
        [
          "POSTGRES_PASSWORD",
          "ADMIN_DATABASE_URL",
          "MIGRATION_DATABASE_URL",
          "ATLAS_ISOLATION_EMPTY",
        ].includes(key) ||
        (role === "web" && ["SMTP_USER", "SMTP_PASSWORD"].includes(key)) ||
        (role === "mail" && key === "AUTH_DATABASE_URL")),
  );
  if (forbidden)
    throw new Error("Privileged credential in application environment");
}

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
  MAIL_DELIVERY: z.enum(["smtp", "disabled"]).default("smtp"),
  SMTP_HOST: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(1).default("127.0.0.1"),
  ),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.email().default("atlas@example.invalid"),
  ),
});

export function parseEnv(input: Record<string, string | undefined>) {
  assertProductionEnvIsolation(input, "web");
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
    env.MAIL_DELIVERY === "smtp" &&
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
  assertProductionEnvIsolation(process.env, "mail");
  const result = workerSchema.safeParse(process.env);
  if (!result.success) throw new Error("Invalid mail worker configuration");
  if (
    result.data.NODE_ENV === "production" &&
    result.data.MAIL_DELIVERY === "smtp" &&
    (!process.env.SMTP_HOST ||
      !process.env.MAIL_FROM ||
      result.data.MAIL_FROM.endsWith(".invalid"))
  )
    throw new Error("Production mail configuration required");
  return result.data;
}
export type MailEnv = ReturnType<typeof getWorkerEnv>;
