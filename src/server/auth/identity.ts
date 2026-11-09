import type { createAuth } from "./create-auth";
import { AppError } from "../errors";

export type Auth = ReturnType<typeof createAuth>;
export async function requireIdentity(auth: Auth, headers: Headers) {
  const result = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
  if (!result || !result.user.emailVerified) throw new AppError("UNAUTHENTICATED", 401);
  return {
    id: result.user.id, email: result.user.email, name: result.user.name,
    sessionId: result.session.id, sessionCreatedAt: result.session.createdAt,
  };
}
export type Identity = Awaited<ReturnType<typeof requireIdentity>>;
