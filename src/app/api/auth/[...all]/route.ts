import { getAuth } from "@/server/auth";
import { errorResponse } from "@/server/errors";

export const runtime = "nodejs";
async function handle(request: Request) {
  try { return await getAuth().handler(request); }
  catch (error) { return errorResponse(error); }
}
export { handle as GET, handle as POST };
