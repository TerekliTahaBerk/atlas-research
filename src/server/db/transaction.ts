import type { Prisma } from "../../generated/prisma/client";
import type { Database } from "./client";
import type { Identity } from "../auth/identity";

export function asIdentity<T>(db: Database, identity: Identity, action: (tx: Prisma.TransactionClient) => Promise<T>) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${identity.id}, true), set_config('app.session_id', ${identity.sessionId}, true)`;
    return action(tx);
  }, { maxWait: 5000, timeout: 10000 });
}
