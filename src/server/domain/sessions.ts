import type { Auth } from "../auth/identity";
import { requireIdentity } from "../auth/identity";
import type { Database } from "../db/client";
import { AppError } from "../errors";

export async function revokeOwnSession(auth: Auth, identityDb: Database, headers: Headers, sessionId: string) {
  const identity = await requireIdentity(auth, headers);
  const session = await identityDb.session.findFirst({ where: { id: sessionId, userId: identity.id } });
  if (!session) throw new AppError("UNAVAILABLE", 404);
  await auth.api.revokeSession({ headers, body: { token: session.token } });
}
