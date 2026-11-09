import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { parseEnv, assertProductionEnvIsolation } from "../../src/server/env";

test("production processes reject leaked privileged credentials without logging values", () => {
  const secret = randomBytes(32).toString("hex");
  for (const role of ["web", "mail"] as const) {
    for (const key of [
      "SERVICE_HEX_64_ATLASMIGRATOR",
      "POSTGRES_PASSWORD",
      "MIGRATION_DATABASE_URL",
      "ATLAS_BACKUP_PASSWORD",
      "ATLAS_INITIAL_PASSWORD",
    ]) {
      assert.throws(
        () =>
          assertProductionEnvIsolation(
            { NODE_ENV: "production", [key]: secret },
            role,
          ),
        (error) => error instanceof Error && !error.message.includes(secret),
      );
      assert.doesNotThrow(() =>
        assertProductionEnvIsolation(
          { NODE_ENV: "production", [key]: "" },
          role,
        ),
      );
    }
  }
  assert.throws(() =>
    assertProductionEnvIsolation(
      { NODE_ENV: "production", SMTP_PASSWORD: secret },
      "web",
    ),
  );
  assert.throws(() =>
    assertProductionEnvIsolation(
      { NODE_ENV: "production", AUTH_DATABASE_URL: secret },
      "mail",
    ),
  );
  assert.doesNotThrow(() =>
    assertProductionEnvIsolation(
      { NODE_ENV: "production", SMTP_PASSWORD: secret },
      "mail",
    ),
  );
});

test("configuration fails closed without printing supplied secrets", () => {
  const secret = randomBytes(24).toString("hex");
  assert.throws(
    () => parseEnv({ BETTER_AUTH_SECRET: secret }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes(secret));
      return true;
    },
  );
});
test("production origin must be HTTPS", () => {
  assert.throws(
    () =>
      parseEnv({
        NODE_ENV: "production",
        APP_ORIGIN: "http://example.invalid",
        BETTER_AUTH_SECRET: randomBytes(24).toString("hex"),
        AUTH_DATABASE_URL: "postgresql://127.0.0.1/atlas",
        DATABASE_URL: "postgresql://127.0.0.1/atlas",
        QUEUE_DATABASE_URL: "postgresql://127.0.0.1/atlas",
      }),
    /HTTPS/,
  );
});
test("disabled delivery needs no fake production SMTP config, while SMTP mode fails closed", () => {
  const input = {
    NODE_ENV: "production",
    APP_ORIGIN: "https://atlas.example.invalid",
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    AUTH_DATABASE_URL: "postgresql://127.0.0.1/atlas",
    DATABASE_URL: "postgresql://127.0.0.1/atlas",
    QUEUE_DATABASE_URL: "postgresql://127.0.0.1/atlas",
    SMTP_HOST: "",
    MAIL_FROM: "",
  };
  assert.equal(
    parseEnv({ ...input, MAIL_DELIVERY: "disabled" }).MAIL_DELIVERY,
    "disabled",
  );
  assert.throws(
    () => parseEnv({ ...input, MAIL_DELIVERY: "smtp" }),
    /Production SMTP_HOST/,
  );
});
