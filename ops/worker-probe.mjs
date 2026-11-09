import pg from "pg";
const client = new pg.Client({
  connectionString: process.env.QUEUE_DATABASE_URL,
  connectionTimeoutMillis: 5000,
  query_timeout: 5000,
});
try {
  await client.connect();
  const result = await client.query(
    "SELECT 1 FROM ops.service_heartbeat WHERE service='mail' AND \"checkedAt\">now()-interval '30 seconds'",
  );
  if (result.rowCount !== 1) process.exitCode = 1;
} catch {
  process.exitCode = 1;
} finally {
  await client.end();
}
