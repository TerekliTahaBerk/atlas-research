import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import pg from "pg";

const stagingOrigin = "https://pgovi9zdf5jeuzzqtl70nsce.91.99.118.96.sslip.io";
const database = "atlas";
const roles = new Map([
  ["postgres", "POSTGRES"],
  ["atlas_migrator", "MIGRATOR"],
  ["atlas_auth", "AUTH"],
  ["atlas_runtime", "RUNTIME"],
  ["atlas_queue", "QUEUE"],
  ["atlas_backup", "BACKUP"],
]);
const hex = /^[a-f0-9]{64}$/;

function verifier(password) {
  const iterations = 4096;
  const salt = randomBytes(16);
  const salted = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const client = createHmac("sha256", salted).update("Client Key").digest();
  const stored = createHash("sha256").update(client).digest("base64");
  const server = createHmac("sha256", salted)
    .update("Server Key")
    .digest("base64");
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${stored}:${server}`;
}

export async function rotateStagingDatabase(env, endpoint) {
  if (
    env.APP_ORIGIN !== stagingOrigin ||
    env.ALLOW_ATLAS_BOOTSTRAP !== database
  )
    throw new Error("Staging guard rejected");

  const credentials = [...roles].map(([role, key]) => ({
    role,
    previous: env[`ATLAS_ROTATION_OLD_${key}`],
    next: env[`ATLAS_ROTATION_NEW_${key}`],
  }));
  const passwords = credentials.flatMap(({ previous, next }) => [
    previous,
    next,
  ]);
  if (
    passwords.some((password) => !hex.test(password ?? "")) ||
    new Set(passwords).size !== passwords.length
  )
    throw new Error("Independent credentials required");

  const client = (user, password) =>
    new pg.Client({
      ...endpoint,
      database,
      user,
      password,
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000,
    });
  async function accepts(role, password) {
    const connection = client(role, password);
    try {
      await connection.connect();
      const {
        rows: [target],
      } = await connection.query(
        "SELECT current_database() AS db, current_user AS role, inet_client_addr() IS NOT NULL AS tcp",
      );
      if (target.db !== database || target.role !== role || !target.tcp)
        throw new Error("Unexpected database connection");
      return true;
    } catch (error) {
      if (error.code === "28P01") return false;
      throw error;
    } finally {
      await connection.end();
    }
  }
  async function matchesState(isRotated) {
    for (const { role, previous, next } of credentials) {
      if (
        (await accepts(role, previous)) !== !isRotated ||
        (await accepts(role, next)) !== isRotated
      )
        throw new Error("Unexpected role authentication state");
    }
  }

  const [admin] = credentials;
  const alreadyRotated = await accepts(admin.role, admin.next);
  await matchesState(alreadyRotated);
  if (alreadyRotated) return "verified";

  const control = client(admin.role, admin.previous);
  try {
    await control.connect();
    await control.query("BEGIN");
    await control.query("SET LOCAL lock_timeout = '5s'");
    const locked = await control.query(
      "SELECT pg_try_advisory_xact_lock(19900524) AS held",
    );
    if (!locked.rows[0].held) throw new Error("Rotation already running");
    for (const { role, next } of credentials)
      await control.query(
        `ALTER ROLE ${role} PASSWORD ${pg.escapeLiteral(verifier(next))}`,
      );
    await control.query("COMMIT");

    const sessions = await control.query(
      `SELECT pg_terminate_backend(pid, 4000) AS ended FROM pg_stat_activity
       WHERE datname=current_database() AND usename=ANY($1::text[])
       AND backend_type='client backend' AND pid<>pg_backend_pid()`,
      [[...roles.keys()]],
    );
    if (sessions.rows.some(({ ended }) => !ended))
      throw new Error("Prior database sessions still present");
  } finally {
    await control.end();
  }

  await matchesState(true);
  return "rotated";
}
