import "server-only";
import { z } from "zod";
import { getAuth,getIdentityDatabase } from "./auth";
import { requireIdentity,type Identity } from "./auth/identity";
import { getRuntimeDatabase } from "./db/runtime";
import { errorResponse, AppError } from "./errors";
import { privateJson } from "./http";
import { chargeMutation } from "./rate-limit";

export function entry(request: Request, action: (actor: Identity, db: ReturnType<typeof getRuntimeDatabase>) => Promise<unknown>) {
  return (async()=>{
    try {
      const actor = await requireIdentity(getAuth(),request.headers);
      if (!["GET","HEAD"].includes(request.method)) await chargeMutation(getIdentityDatabase(),actor.id);
      const result=await action(actor,getRuntimeDatabase());
      return result instanceof Response ? result : privateJson(result);
    } catch(error) { return errorResponse(error); }
  })();
}
export function uuid(value: string|null) {
  const parsed=z.uuid().safeParse(value);
  if(!parsed.success) throw new AppError("UNAVAILABLE",404);
  return parsed.data;
}
