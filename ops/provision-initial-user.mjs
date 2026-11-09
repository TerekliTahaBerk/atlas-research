import pg from "pg";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";

// Operator-only, optional first identity. Never changes an existing credential.
// The owner explicitly asserts this initial identity; this is not SMTP evidence.
export async function provisionInitialUser(env = process.env) {
  const email = env.ATLAS_INITIAL_EMAIL?.trim().toLowerCase();
  const password = env.ATLAS_INITIAL_PASSWORD;
  const acknowledgement = env.ATLAS_INITIAL_USER_ACK;
  if (!email && !password && !acknowledgement) return "not-requested";
  if (
    acknowledgement !== "owner-requested-first-identity" ||
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !password ||
    password.length < 8 ||
    password.length > 128 ||
    !env.MIGRATION_DATABASE_URL
  )
    throw new Error("Initial identity configuration rejected");
  const client = new pg.Client({
    connectionString: env.MIGRATION_DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    const target = (
      await client.query(
        "SELECT current_database() AS db, current_user AS role",
      )
    ).rows[0];
    if (
      target.role !== "atlas_migrator" ||
      (target.db !== "atlas" &&
        !(env.NODE_ENV === "test" && target.db === "atlas_test"))
    )
      throw new Error("Dedicated Atlas migration identity required");
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("LOCK TABLE identity.users IN SHARE ROW EXCLUSIVE MODE");
    if (
      Number(
        (await client.query("SELECT count(*) AS count FROM identity.users"))
          .rows[0].count,
      ) !== 0
    ) {
      await client.query("ROLLBACK");
      return "skipped-existing-identity";
    }
    const id = randomUUID();
    const hash = await hashPassword(password);
    await client.query(
      'INSERT INTO identity.users(id,name,email,"emailVerified","updatedAt") VALUES($1,$2,$3,true,now())',
      [id, "Researcher", email],
    );
    await client.query(
      'INSERT INTO identity.accounts(id,"accountId","providerId","userId",password,"updatedAt") VALUES($1,$2,$3,$2,$4,now())',
      [randomUUID(), id, "credential", hash],
    );
    await client.query("COMMIT");
    return "created-owner-asserted-identity";
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    throw new Error("Initial identity provisioning failed");
  } finally {
    await client.end();
  }
}
