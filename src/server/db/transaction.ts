import type { Prisma } from "../../generated/prisma/client";
import type { Database } from "./client";
import type { Identity } from "../auth/identity";

export async function asIdentity<T>(db: Database, identity: Identity, action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt=0; ; attempt++) {
    try {
      return await db.$transaction(async tx => {
        await tx.$executeRaw`SELECT set_config('app.user_id', ${identity.id}, true), set_config('app.session_id', ${identity.sessionId}, true)`;
        return action(tx);
      }, { maxWait: 5000, timeout: 10000 });
    } catch(error) {
      const code=error&&typeof error==="object"&&"code" in error?String(error.code):"";
      const meta=error&&typeof error==="object"&&"meta" in error?error.meta as {code?:string}:null;
      if(attempt>=2 || !(code==="P2034" || (code==="P2010" && ["40001","40P01"].includes(meta?.code??"")))) throw error;
      await new Promise(resolve=>setTimeout(resolve,20*(attempt+1)));
    }
  }
}
