import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import images from "../ops/images.json";

// Never reads a developer/production DATABASE_URL. All credentials and data are disposable.
const folder = mkdtempSync(join(tmpdir(), "atlas-integration-"));
const name = `atlas-test-${randomUUID()}`;
const useInstalledPostgres = process.env.ATLAS_TEST_POSTGRES_LOCAL === "1";
const dataDirectory = join(folder, "postgres-data");
const localPostgres = (...args: string[]) => execFileSync(args[0], args.slice(1), {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
}).trim();
function freeLoopbackPort() {
  return new Promise<number>((done, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => {
        if (!address || typeof address === "string") reject(new Error("A test port could not be allocated"));
        else done(address.port);
      });
    });
  });
}
const passwords = Object.fromEntries(["postgres", "atlas_migrator", "atlas_auth", "atlas_runtime", "atlas_queue", "atlas_backup"].map(role => [role, randomBytes(32).toString("hex")]));
const docker = (...args: string[]) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
let created = false;
let admin: pg.Client | undefined;
try {
  let port: number | string;
  if (useInstalledPostgres) {
    const passwordFile = join(folder, "postgres.password");
    writeFileSync(passwordFile, passwords.postgres + "\n", { mode: 0o600 });
    localPostgres("initdb", "-D", dataDirectory, "--username=postgres", "--encoding=UTF8",
      "--no-locale", "--auth-local=trust", "--auth-host=scram-sha-256", "--pwfile=" + passwordFile);
    port = await freeLoopbackPort();
    localPostgres("pg_ctl", "-D", dataDirectory, "-l", join(folder, "postgres.log"),
      "-o", `-h 127.0.0.1 -p ${port} -k '' -c timezone=UTC`, "-w", "start");
    created = true;
  } else {
    const envFile = join(folder, "postgres.env");
    writeFileSync(envFile, `POSTGRES_PASSWORD=${passwords.postgres}\nPOSTGRES_DB=atlas_test\n`, { mode: 0o600 });
    docker("run", "--detach", "--name", name, "--label", "app=atlas-disposable-test", "--publish", "127.0.0.1::5432", "--env-file", envFile, images.postgres);
    created = true;
    port = docker("port", name, "5432/tcp").split(":").at(-1)!;
  }
  const url = (role: string, database = "atlas_test") =>
    `postgresql://${role}:${passwords[role]}@127.0.0.1:${port}/${database}`;
  for (let attempt = 0; attempt < 60; attempt++) {
    const candidate = new pg.Client({ connectionString: url("postgres", useInstalledPostgres ? "postgres" : "atlas_test") });
    try { await candidate.connect(); admin = candidate; break; }
    catch { await candidate.end().catch(() => {}); await new Promise(r => setTimeout(r, 250)); }
  }
  if (!admin) throw new Error("Disposable PostgreSQL did not become ready");
  if (useInstalledPostgres) {
    await admin.query("CREATE DATABASE atlas_test");
    await admin.end();
    admin = new pg.Client({ connectionString: url("postgres") });
    await admin.connect();
  }
  const version = (await admin.query("SHOW server_version")).rows[0]?.server_version;
  for (const role of ["atlas_migrator", "atlas_auth", "atlas_runtime", "atlas_queue"]) {
    await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${passwords[role]}'`);
  }
  await admin.query(`CREATE ROLE atlas_backup LOGIN NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${passwords.atlas_backup}'; ALTER ROLE atlas_backup SET default_transaction_read_only=on`);
  await admin.query("CREATE ROLE atlas_policy NOLOGIN BYPASSRLS; GRANT atlas_policy TO atlas_migrator");
  await admin.query("CREATE ROLE atlas_lifecycle NOLOGIN BYPASSRLS; GRANT atlas_lifecycle TO atlas_migrator");
  await admin.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT CREATE ON DATABASE atlas_test TO atlas_migrator; GRANT USAGE,CREATE ON SCHEMA public TO atlas_migrator");
  const env: NodeJS.ProcessEnv = {
    ...process.env, NODE_ENV: "test", APP_ORIGIN: "http://127.0.0.1:3000",
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    MIGRATION_DATABASE_URL: url("atlas_migrator"), AUTH_DATABASE_URL: url("atlas_auth"), DATABASE_URL: url("atlas_runtime"), QUEUE_DATABASE_URL:url("atlas_queue"),
  };
  const migration = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], { env, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  if (migration.status !== 0) {
    let detail = migration.stderr.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]");
    for (const password of Object.values(passwords)) detail = detail.replaceAll(password, "[redacted]");
    throw new Error(`Migration failed (${migration.status}): ${detail.slice(0, 1500)}`);
  }
  const files = readdirSync("tests/integration").filter(f => f.endsWith(".test.ts")&&(!process.argv.includes("--ai")||f==="ai.test.ts")&&(!process.argv.includes("--collaboration")||f==="collaboration.test.ts")&&(!process.argv.includes("--library")||f==="library.test.ts")&&(!process.argv.includes("--resources")||f==="resources.test.ts")&&(!process.argv.includes("--compute")||f==="compute.test.ts")).sort().map(f => `tests/integration/${f}`);
  console.log(`PostgreSQL ${version}: isolated migration/auth/runtime roles; loopback-only disposable ${useInstalledPostgres ? "cluster" : "container"}`);
  const browserMode=process.argv.includes("--public-browser")||process.argv.includes("--connected-browser")||process.argv.includes("--inbox-browser")||process.argv.includes("--home-browser")||process.argv.includes("--discussions-browser")||process.argv.includes("--ai-island")||process.argv.includes("--tasks-browser")||process.argv.includes("--documents-browser")||process.argv.includes("--reader-browser")||process.argv.includes("--beta-browser")||process.argv.includes("--ai-browser")||process.argv.includes("--browser")||process.argv.includes("--library-browser")||process.argv.includes("--collaboration-browser");
  const computeBrowser = process.argv.includes("--compute-browser");
  const result = spawnSync(process.execPath, computeBrowser ? ["--import", "tsx", "scripts/compute-browser-qa.ts"] : browserMode?["--import","tsx",process.argv.includes("--public-browser")?"scripts/public-auth-qa.ts":process.argv.includes("--connected-browser")?"scripts/connected-workspace-qa.ts":process.argv.includes("--inbox-browser")?"scripts/inbox-settings-browser-qa.ts":process.argv.includes("--home-browser")?"scripts/home-overview-browser-qa.ts":process.argv.includes("--discussions-browser")?"scripts/discussions-browser-qa.ts":process.argv.includes("--ai-island")?"scripts/ai-island-qa.ts":process.argv.includes("--tasks-browser")?"scripts/tasks-browser-qa.ts":process.argv.includes("--documents-browser")?"scripts/documents-browser-qa.ts":process.argv.includes("--reader-browser")?"scripts/reader-browser-qa.ts":(process.argv.includes("--ai-browser")||process.argv.includes("--beta-browser"))?"scripts/ai-browser-qa.ts":process.argv.includes("--collaboration-browser")?"scripts/collaboration-browser-qa.ts":process.argv.includes("--library-browser")?"scripts/library-browser-qa.ts":"scripts/browser-qa.ts",...(process.argv.includes("--beta-browser")?["--beta"]:[])]:["--import", "tsx", "--test", "--test-concurrency=1", ...files], { env, stdio: "inherit" });
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} catch (error) {
  // No command arguments, environment, connection URL or raw database error is logged.
  console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]") : "Integration harness failed");
  process.exitCode = 1;
} finally {
  await admin?.end();
  try {
    if (created && useInstalledPostgres) localPostgres("pg_ctl", "-D", dataDirectory, "-w", "-m", "fast", "stop");
    else if (created) docker("rm", "--force", "--volumes", name);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
