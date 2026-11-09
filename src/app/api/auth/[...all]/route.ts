import { getAuth } from "@/server/auth";
import { errorResponse } from "@/server/errors";
import { createAuthHandler } from "@/server/auth/handler";
import { getEnv } from "@/server/env";

export const runtime = "nodejs";
async function handle(request: Request) {
  try { return await createAuthHandler(getAuth(), getEnv())(request); }
  catch (error) { return errorResponse(error); }
}
export { handle as GET, handle as POST };
