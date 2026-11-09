import type { Database } from "./db/client";
import { SCHEMA_REVISION } from "./release";
export async function ready(db: Database) {
  const rows = await db.$queryRaw<
    Array<{ ready: boolean }>
  >`SELECT EXISTS(SELECT 1 FROM ops.schema_revision WHERE id=1 AND revision=${SCHEMA_REVISION}) AND EXISTS(SELECT 1 FROM ops.service_heartbeat WHERE service='mail' AND revision=${SCHEMA_REVISION} AND "checkedAt">now()-interval '30 seconds') AS ready`;
  if(rows[0]?.ready!==true)return false;
  if(process.env.FILE_STORAGE_PATH){const worker=await db.$queryRaw<Array<{ready:boolean}>>`SELECT EXISTS(SELECT 1 FROM ops.service_heartbeat WHERE service='files' AND revision=${SCHEMA_REVISION} AND "checkedAt">now()-interval '30 seconds') AS ready`;return worker[0]?.ready===true;}
  return true;
}
