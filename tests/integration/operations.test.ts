import { test } from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "../../src/server/db/client";
import { getEnv } from "../../src/server/env";
import { ready } from "../../src/server/readiness";
import { createMailQueue } from "../../src/server/mail/outbox";
test("runtime readiness fails closed and queue/auth privileges are independent", async () => {
  const env = getEnv(),
    runtime = createDatabase(env.DATABASE_URL),
    auth = createDatabase(env.AUTH_DATABASE_URL),
    queue = createDatabase(env.QUEUE_DATABASE_URL),
    mail = createMailQueue(env);
  try {
    assert.equal(await ready(runtime), false);
    await mail.heartbeat();
    assert.equal(await ready(runtime), true);
    await queue.$executeRaw`UPDATE ops.service_heartbeat SET "checkedAt"=now()-interval '1 minute'`;
    assert.equal(await ready(runtime), false);
    await mail.heartbeat();
    assert.equal(await ready(runtime), true);
    await assert.rejects(auth.mailOutbox.findMany());
    await assert.rejects(queue.user.findMany());
    await assert.rejects(queue.project.findMany());
    await assert.rejects(runtime.mailOutbox.findMany());
    for (const db of [runtime, auth, queue]) {
      await assert.rejects(db.$executeRaw`SET ROLE atlas_backup`);
      await assert.rejects(db.$executeRaw`CREATE TABLE ops.forbidden(id int)`);
    }
  } finally {
    await Promise.all([
      runtime.$disconnect(),
      auth.$disconnect(),
      queue.$disconnect(),
      mail.close(),
    ]);
  }
});
