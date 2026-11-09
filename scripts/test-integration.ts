import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import images from "../ops/images.json";

// Never reads a developer/production DATABASE_URL. All credentials and data are disposable.
const folder = mkdtempSync(join(tmpdir(), "atlas-integration-"));
const name = `atlas-test-${randomUUID()}`;
const passwords = Object.fromEntries(["postgres", "atlas_migrator", "atlas_auth", "atlas_runtime"].map(role => [role, randomBytes(32).toString("hex")]));
const docker = (...args: string[]) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
let created = false;
let admin: pg.Client | undefined;
try {
  const envFile = join(folder, "postgres.env");
  writeFileSync(envFile, `POSTGRES_PASSWORD=${passwords.postgres}\nPOSTGRES_DB=atlas_test\n`, { mode: 0o600 });
  docker("run", "--detach", "--name", name, "--label", "app=atlas-disposable-test", "--publish", "127.0.0.1::5432", "--env-file", envFile, images.postgres);
  created = true;
  const port = docker("port", name, "5432/tcp").split(":").at(-1)!;
  const url = (role: string) => `postgresql://${role}:${passwords[role]}@127.0.0.1:${port}/atlas_test`;
  for (let attempt = 0; attempt < 60; attempt++) {
    const candidate = new pg.Client({ connectionString: url("postgres") });
    try { await candidate.connect(); admin = candidate; break; }
    catch { await candidate.end().catch(() => {}); await new Promise(r => setTimeout(r, 250)); }
  }
  if (!admin) throw new Error("Disposable PostgreSQL did not become ready");
  for (const role of ["atlas_migrator", "atlas_auth", "atlas_runtime"]) {
    await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${passwords[role]}'`);
  }
  await admin.query("CREATE ROLE atlas_policy NOLOGIN BYPASSRLS; GRANT atlas_policy TO atlas_migrator");
  await admin.query("CREATE ROLE atlas_lifecycle NOLOGIN BYPASSRLS; GRANT atlas_lifecycle TO atlas_migrator");
  await admin.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT CREATE ON DATABASE atlas_test TO atlas_migrator; GRANT USAGE,CREATE ON SCHEMA public TO atlas_migrator");
  const env: NodeJS.ProcessEnv = {
    ...process.env, NODE_ENV: "test", APP_ORIGIN: "http://127.0.0.1:3000",
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    MIGRATION_DATABASE_URL: url("atlas_migrator"), AUTH_DATABASE_URL: url("atlas_auth"), DATABASE_URL: url("atlas_runtime"),
  };
  const migration = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], { env, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  if (migration.status !== 0) {
    let detail = migration.stderr.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]");
    for (const password of Object.values(passwords)) detail = detail.replaceAll(password, "[redacted]");
    throw new Error(`Migration failed (${migration.status}): ${detail.slice(0, 1500)}`);
  }
  await admin.query("GRANT USAGE ON SCHEMA identity TO atlas_auth; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA identity TO atlas_auth");
  const files = readdirSync("tests/integration").filter(f => f.endsWith(".test.ts")).map(f => `tests/integration/${f}`);
  console.log("PostgreSQL 18.6: isolated migration/auth/runtime roles; loopback-only disposable container");
  const browserMode=process.argv.includes("--browser");
  const result = spawnSync(process.execPath, browserMode?["--import","tsx","scripts/browser-qa.ts"]:["--import", "tsx", "--test", "--test-concurrency=1", ...files], { env, stdio: "inherit" });
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} catch (error) {
  // No command arguments, environment, connection URL or raw database error is logged.
  console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]") : "Integration harness failed");
  process.exitCode = 1;
} finally {
  await admin?.end();
  if (created) docker("rm", "--force", "--volumes", name);
  rmSync(folder, { recursive: true, force: true });
}
