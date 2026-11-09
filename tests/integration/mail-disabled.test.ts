import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { getEnv } from "../../src/server/env";
import { createDatabase } from "../../src/server/db/client";
import { createMailQueue } from "../../src/server/mail/outbox";
import { createAuth } from "../../src/server/auth/create-auth";
import { createAuthHandler } from "../../src/server/auth/handler";
import { startMailServer } from "../helpers/mail";
test("disabled mail denies registration/reset/resend before user creation, sends nothing and expires old encrypted payloads", async () => {
  const smtp = await startMailServer(),
    env = {
      ...getEnv(),
      SMTP_PORT: smtp.port,
      MAIL_DELIVERY: "disabled" as const,
    };
  const db = createDatabase(env.AUTH_DATABASE_URL),
    queueDb = createDatabase(env.QUEUE_DATABASE_URL),
    mail = createMailQueue(env),
    auth = createAuth(db, env, mail),
    handler = createAuthHandler(auth, env);
  try {
    const email = `disabled-${randomBytes(8).toString("hex")}@example.invalid`;
    for (const path of [
      "sign-up/email",
      "request-password-reset",
      "send-verification-email",
    ]) {
      const response = await handler(
        new Request(`${env.APP_ORIGIN}/api/auth/${path}`, {
          method: "POST",
          headers: {
            origin: env.APP_ORIGIN,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email,
            password: randomBytes(24).toString("hex"),
            name: "Disabled fixture",
          }),
        }),
      );
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error, "MAIL_DISABLED");
    }
    assert.equal(await db.user.findUnique({ where: { email } }), null);
    await assert.rejects(
      mail.enqueue({
        to: email,
        subject: "Disabled mail",
        text: "No delivery permitted",
      }),
    );
    const id = randomUUID();
    await queueDb.mailOutbox.create({
      data: {
        id,
        payload: mail.encrypt({
          to: email,
          subject: "Old queued mail",
          text: "Not delivered",
        }),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    await mail.flush();
    assert.equal(smtp.messages.length, 0);
    assert.equal(
      (await queueDb.mailOutbox.findUniqueOrThrow({ where: { id } })).state,
      "pending",
    );
    await queueDb.mailOutbox.update({
      where: { id },
      data: { expiresAt: new Date(0) },
    });
    await mail.flush();
    assert.equal(
      (await queueDb.mailOutbox.findUniqueOrThrow({ where: { id } })).payload,
      null,
    );
  } finally {
    await Promise.all([
      mail.close(),
      smtp.close(),
      db.$disconnect(),
      queueDb.$disconnect(),
    ]);
  }
});
