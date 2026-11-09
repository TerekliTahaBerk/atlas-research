import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import type { Database } from "../db/client";
import type { ServerEnv } from "../env";
import type { MailQueue } from "../mail/outbox";

export function createAuth(db: Database, env: ServerEnv, mail: Pick<MailQueue, "enqueue">) {
  return betterAuth({
    appName: "Atlas Research",
    database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
    baseURL: env.APP_ORIGIN,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_ORIGIN],
    verification: { storeIdentifier: "hashed" },
    emailAndPassword: {
      enabled: true, minPasswordLength: 12, maxPasswordLength: 128, requireEmailVerification: true, autoSignIn: false,
      resetPasswordTokenExpiresIn: 900, revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => { await mail.enqueue({ to: user.email, subject: "Reset your Atlas password", text: `Reset your password within 15 minutes:\n${url}\nIf you did not request this, ignore this email.` }, 900); },
    },
    emailVerification: {
      sendOnSignUp: true, sendOnSignIn: false, expiresIn: 3600, autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => { await mail.enqueue({ to: user.email, subject: "Verify your Atlas email", text: `Verify your email within one hour:\n${url}` }); },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, freshAge: 300, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 60, customRules: {
      "/sign-in/email": { window: 60, max: 5 }, "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 }, "/send-verification-email": { window: 60, max: 3 },
    } },
    advanced: { useSecureCookies: env.NODE_ENV === "production", ipAddress: { ipAddressHeaders: ["x-real-ip"] } },
    // No library error object, request body or token enters application logs.
    logger: { disabled: true },
  });
}
