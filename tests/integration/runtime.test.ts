import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createDatabase } from "../../src/server/db/client";
import { createAuth } from "../../src/server/auth/create-auth";
import { getEnv } from "../../src/server/env";

test("PostgreSQL Prisma transaction and Better Auth session roundtrip", async () => {
  const env = getEnv();
  const db = createDatabase(env.AUTH_DATABASE_URL);
  try {
    const rows = await db.$transaction(tx => tx.$queryRaw<Array<{ value: number }>>`SELECT 1::int AS value`);
    assert.equal(rows[0].value, 1);
    const auth = createAuth(db, env);
    const email = `researcher-${randomBytes(8).toString("hex")}@example.invalid`;
    const password = randomBytes(24).toString("hex");
    const result = await auth.api.signUpEmail({ body: { email, password, name: "Test Researcher" } });
    assert.equal(result.user.email, email);
    const signed = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
    assert.equal(signed.status, 200);
    const cookies = signed.headers.getSetCookie().map(v => v.split(";")[0]).join("; ");
    assert.ok(cookies);
    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookies }) });
    assert.equal(session?.user.id, result.user.id);
    await auth.api.signOut({ headers: new Headers({ cookie: cookies }) });
    assert.equal(await auth.api.getSession({ headers: new Headers({ cookie: cookies }) }), null);
  } finally { await db.$disconnect(); }
});

test("rollback is atomic and auth/runtime cannot migrate or cross database privileges", async () => {
  const env = getEnv();
  const db = createDatabase(env.AUTH_DATABASE_URL);
  const runtime = createDatabase(env.DATABASE_URL);
  const id = randomBytes(16).toString("hex");
  try {
    await assert.rejects(db.$transaction(async tx => {
      await tx.user.create({ data: { id, name: "Rollback Fixture", email: `${id}@example.invalid` } });
      throw new Error("intentional rollback");
    }), /intentional rollback/);
    assert.equal(await db.user.findUnique({ where: { id } }), null);
    await assert.rejects(runtime.$queryRaw`SELECT id FROM identity.users`);
    await assert.rejects(db.$executeRaw`CREATE TABLE identity.forbidden_runtime_ddl(id int)`);
    await assert.rejects(runtime.$executeRaw`CREATE SCHEMA forbidden_runtime_schema`);
  } finally { await db.$disconnect(); await runtime.$disconnect(); }
});
