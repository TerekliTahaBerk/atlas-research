import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import type { Database } from "../db/client";
import type { ServerEnv } from "../env";

export function createAuth(db: Database, env: ServerEnv) {
  return betterAuth({
    appName: "Atlas Research",
    database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
    baseURL: env.APP_ORIGIN,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_ORIGIN],
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 },
    session: { expiresIn: 60 * 60 * 24 * 7, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
    advanced: { useSecureCookies: env.NODE_ENV === "production" },
    // No library error object, request body or token enters application logs.
    logger: { disabled: true },
  });
}
