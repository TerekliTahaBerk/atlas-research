import pg from "pg";
const client = new pg.Client({
  connectionString: process.env.ADMIN_DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
try {
  if (process.env.ALLOW_ATLAS_BOOTSTRAP !== "atlas")
    throw new Error("Target acknowledgement required");
  await client.connect();
  const target = (await client.query("SELECT current_database() AS db")).rows[0]
    .db;
  if (target !== "atlas") throw new Error("Dedicated Atlas database required");
  for (const role of [
    "atlas_migrator",
    "atlas_auth",
    "atlas_runtime",
    "atlas_queue",
    "atlas_backup",
    "atlas_policy",
    "atlas_lifecycle",
  ]) {
    const helper = ["atlas_policy", "atlas_lifecycle"].includes(role),
      backup = role === "atlas_backup";
    const existing = (
      await client.query(
        "SELECT rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1",
        [role],
      )
    ).rows[0];
    if (existing) {
      if (
        existing.rolcanlogin === helper ||
        existing.rolsuper ||
        existing.rolbypassrls !== (helper || backup) ||
        existing.rolcreatedb ||
        existing.rolcreaterole
      )
        throw new Error("Unexpected existing role");
      continue;
    }
    const password = process.env[role.toUpperCase() + "_PASSWORD"];
    if (!helper && (!password || !/^[a-f0-9]{64}$/.test(password)))
      throw new Error("Independent 32-byte hex passwords required");
    await client.query(
      `CREATE ROLE ${role} ${helper ? "NOLOGIN" : "LOGIN"} NOSUPERUSER ${helper || backup ? "BYPASSRLS" : "NOBYPASSRLS"} NOCREATEDB NOCREATEROLE ${helper ? "" : `PASSWORD ${pg.escapeLiteral(password)}`}`,
    );
  }
  await client.query(
    "GRANT atlas_policy,atlas_lifecycle TO atlas_migrator; REVOKE CREATE ON SCHEMA public FROM PUBLIC; REVOKE CONNECT ON DATABASE atlas FROM PUBLIC; GRANT CONNECT ON DATABASE atlas TO atlas_migrator,atlas_auth,atlas_runtime,atlas_queue,atlas_backup; GRANT CREATE ON DATABASE atlas TO atlas_migrator; GRANT USAGE,CREATE ON SCHEMA public TO atlas_migrator; ALTER ROLE atlas_backup SET default_transaction_read_only=on",
  );
  console.log(
    "Atlas role bootstrap complete; existing passwords were not rotated.",
  );
} catch {
  console.error(
    "Atlas role bootstrap failed; no credential or SQL body logged.",
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
