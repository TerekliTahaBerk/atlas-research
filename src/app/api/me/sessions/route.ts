import { z } from "zod";
import { getAuth, getIdentityDatabase } from "@/server/auth";
import { requireIdentity } from "@/server/auth/identity";
import { errorResponse } from "@/server/errors";
import { privateJson, readMutation } from "@/server/http";
import { revokeOwnSession } from "@/server/domain/sessions";
import { fresh } from "@/server/domain/access";

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity(getAuth(), request.headers);
    fresh(identity);
    const sessions = await getAuth().api.listSessions({
      headers: request.headers,
    });
    return privateJson({
      sessions: sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        current: s.id === identity.sessionId,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const { sessionId } = await readMutation(
      request,
      z.object({ sessionId: z.string().min(1).max(128) }).strict(),
    );
    await revokeOwnSession(
      getAuth(),
      getIdentityDatabase(),
      request.headers,
      sessionId,
    );
    return privateJson({ revoked: true });
  } catch (error) {
    return errorResponse(error);
  }
}
