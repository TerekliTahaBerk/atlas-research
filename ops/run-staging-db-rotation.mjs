import { rotateStagingDatabase } from "./rotate-staging-db.mjs";

try {
  const operation = await rotateStagingDatabase(process.env, {
    host: "postgres",
    port: 5432,
  });
  console.log(
    JSON.stringify({
      event: "atlas_staging_db_rotation",
      operation,
      newLogins: 6,
      oldLoginsRejected: 6,
    }),
  );
} catch {
  console.error(JSON.stringify({ event: "atlas_staging_db_rotation_failed" }));
  process.exitCode = 1;
}
