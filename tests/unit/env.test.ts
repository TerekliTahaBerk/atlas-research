import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { parseEnv } from "../../src/server/env";

test("configuration fails closed without printing supplied secrets", () => {
  const secret = randomBytes(24).toString("hex");
  assert.throws(() => parseEnv({ BETTER_AUTH_SECRET: secret }), error => {
    assert.ok(error instanceof Error);
    assert.ok(!error.message.includes(secret));
    return true;
  });
});
test("production origin must be HTTPS", () => {
  assert.throws(() => parseEnv({ NODE_ENV: "production", APP_ORIGIN: "http://example.invalid", BETTER_AUTH_SECRET: randomBytes(24).toString("hex"), AUTH_DATABASE_URL: "postgresql://127.0.0.1/atlas", DATABASE_URL: "postgresql://127.0.0.1/atlas" }), /HTTPS/);
});
