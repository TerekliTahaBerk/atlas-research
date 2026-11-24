import pg from "pg";
import { SCHEMA_REVISION } from "../dist/worker/release.js";

const client = new pg.Client({ connectionString: process.env.QUEUE_DATABASE_URL, connectionTimeoutMillis: 2500 });
try {
  await client.connect();
  const { rows: [result] } = await client.query(
    "SELECT EXISTS(SELECT 1 FROM ops.service_heartbeat WHERE service='compute' AND revision=$1 AND \"checkedAt\">now()-interval '20 seconds') AS ready", [SCHEMA_REVISION]);
  if (!result.ready) process.exitCode = 1;
} catch { process.exitCode = 1; }
finally { await client.end().catch(() => {}); }
