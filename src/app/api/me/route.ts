import { z } from "zod";
import { getAuth } from "@/server/auth";
import { requireIdentity } from "@/server/auth/identity";
import { ensurePersonalWorkspace } from "@/server/domain/personal-workspace";
import { getRuntimeDatabase } from "@/server/db/runtime";
import { errorResponse } from "@/server/errors";
import { privateJson, readMutation } from "@/server/http";

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity(getAuth(), request.headers);
    const workspace = await ensurePersonalWorkspace(getRuntimeDatabase(), identity);
    return privateJson({ user: { id: identity.id, name: identity.name, email: identity.email }, personalWorkspace: workspace });
  } catch (error) { return errorResponse(error); }
}
export async function PATCH(request: Request) {
  try {
    const identity = await requireIdentity(getAuth(), request.headers);
    const body = await readMutation(request, z.object({ name: z.string().trim().min(1).max(80) }).strict());
    await getAuth().api.updateUser({ headers: request.headers, body });
    return privateJson({ user: { id: identity.id, name: body.name, email: identity.email } });
  } catch (error) { return errorResponse(error); }
}
