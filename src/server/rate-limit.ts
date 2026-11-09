import { createHash,randomUUID } from "node:crypto";
import type { Database } from "./db/client";
import { AppError } from "./errors";
export async function chargeMutation(db: Database,userId: string) {
  const key="domain:"+createHash("sha256").update(userId).digest("hex"), now=BigInt(Date.now());
  const [row]=await db.$queryRaw<Array<{count:number}>>`INSERT INTO identity.rate_limits(id,key,count,"lastRequest") VALUES(${randomUUID()},${key},1,${now})
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN identity.rate_limits."lastRequest"<${now}::bigint-60000 THEN 1 ELSE identity.rate_limits.count+1 END,
    "lastRequest"=CASE WHEN identity.rate_limits."lastRequest"<${now}::bigint-60000 THEN ${now}::bigint ELSE identity.rate_limits."lastRequest" END RETURNING count`;
  if(row.count>60) throw new AppError("RATE_LIMITED",429);
}
