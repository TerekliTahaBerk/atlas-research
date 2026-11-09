import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { getEnv } from "../../src/server/env";
import { createDatabase } from "../../src/server/db/client";
import { createAuth } from "../../src/server/auth/create-auth";
import { createMailQueue } from "../../src/server/mail/outbox";

test("operator first identity uses native Better Auth hashing, normal login and cannot replace existing identities", async () => {
  const env = { ...getEnv(), MAIL_DELIVERY: "disabled" as const };
  const db = createDatabase(env.AUTH_DATABASE_URL);
  const mail = createMailQueue(env);
  const auth = createAuth(db, env, mail);
  const email = `initial-${randomBytes(8).toString("hex")}@example.invalid`;
  // An explicitly supplied initial credential need not change the public 12-character creation policy.
  const password = randomBytes(6).toString("base64url") + "aZ+";
  const run = (extra: Record<string, string>) =>
    spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "import {provisionInitialUser} from './ops/provision-initial-user.mjs'; try { console.log(await provisionInitialUser()); } catch {process.exitCode=1}",
      ],
      {
        env: {
          ...process.env,
          ATLAS_INITIAL_USER_ACK: "owner-requested-first-identity",
          ATLAS_INITIAL_EMAIL: email,
          ATLAS_INITIAL_PASSWORD: password,
          ...extra,
        },
        encoding: "utf8",
      },
    );
  try {
    assert.equal(await db.user.count(), 0);
    assert.equal(run({ ATLAS_INITIAL_USER_ACK: "" }).status, 1);
    assert.equal(await db.user.count(), 0);
    assert.equal(run({}).stdout.trim(), "created-owner-asserted-identity");
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { email } })).emailVerified,
      true,
    );
    const response = await auth.api.signInEmail({
      body: { email, password },
      asResponse: true,
    });
    assert.equal(response.status, 200);
    const account = await db.account.findFirstOrThrow();
    assert.notEqual(account.password, password);
    assert.equal(
      run({
        ATLAS_INITIAL_PASSWORD: randomBytes(20).toString("hex"),
      }).stdout.trim(),
      "skipped-existing-identity",
    );
    assert.equal(
      (
        await auth.api.signInEmail({
          body: { email, password },
          asResponse: true,
        })
      ).status,
      200,
    );
    assert.equal(await db.user.count(), 1);
  } finally {
    await db.user.deleteMany({ where: { email } });
    await db.$disconnect();
    await mail.close();
  }
});
