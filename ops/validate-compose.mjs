import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const folder = mkdtempSync(join(tmpdir(), "atlas-compose-"));
try {
  const source = readFileSync("compose.coolify.yaml", "utf8");
  if ((source.match(/^    exclude_from_hc: true$/gm) ?? []).length !== 2)
    throw new Error("Expected Coolify one-shot exclusions");
  // Coolify consumes this documented extension before invoking standard Compose.
  const file = join(folder, "compose.yaml");
  writeFileSync(file, source.replace(/^    exclude_from_hc: true\n/gm, ""));
  const variables = {
    SERVICE_HEX_64_ATLASPOSTGRES: "0".repeat(64),
    SERVICE_HEX_64_ATLASMIGRATOR: "1".repeat(64),
    SERVICE_HEX_64_ATLASAUTH: "2".repeat(64),
    SERVICE_HEX_64_ATLASRUNTIME: "3".repeat(64),
    SERVICE_HEX_64_ATLASQUEUE: "4".repeat(64),
    SERVICE_HEX_64_ATLASBACKUP: "5".repeat(64),
    SERVICE_HEX_64_ATLASSESSION: "6".repeat(64),
    ATLAS_RELEASE: "local",
    APP_ORIGIN: "https://atlas.example.invalid",
    SMTP_HOST: "smtp.example.invalid",
    MAIL_FROM: "atlas@example.invalid",
    ATLAS_INITIAL_USER_ACK: "owner-requested-first-identity",
    ATLAS_INITIAL_EMAIL: "fixture@example.invalid",
    ATLAS_INITIAL_PASSWORD: "synthetic-initial-secret",
    SMTP_PASSWORD: "synthetic-smtp-secret",
    OPENAI_API_KEY: "synthetic-openai-isolation-secret",
  };
  // Reproduce Coolify 4.6's unconditional global env_file injection. No daemon.
  const envFile = join(folder, "injected.env");
  writeFileSync(
    envFile,
    Object.entries(variables)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  const overlay = join(folder, "injection.json");
  writeFileSync(
    overlay,
    JSON.stringify({
      services: Object.fromEntries(
        ["postgres", "bootstrap", "migrate", "web", "mail", "files"].map((name) => [
          name,
          { env_file: [envFile] },
        ]),
      ),
    }),
  );
  const args = [
    "--project-directory",
    process.cwd(),
    "--project-name",
    "atlas-validation",
    "--file",
    file,
    "--file",
    overlay,
    "config",
    "--format",
    "json",
  ];
  let result = spawnSync("docker-compose", args, {
    env: { PATH: process.env.PATH, ...variables },
    encoding: "utf8",
  });
  if (result.error && "code" in result.error && result.error.code === "ENOENT")
    result = spawnSync("docker", ["compose", ...args], {
      env: { PATH: process.env.PATH, ...variables },
      encoding: "utf8",
    });
  if (result.status !== 0) throw new Error("Compose configuration rejected");
  const services = JSON.parse(result.stdout).services;
  const secrets = Object.fromEntries(
    Object.entries(variables).filter(
      ([k]) =>
        k.startsWith("SERVICE_HEX_") ||
        ["SMTP_PASSWORD", "ATLAS_INITIAL_PASSWORD", "OPENAI_API_KEY"].includes(k),
    ),
  );
  const allowed = {
    files: ["SERVICE_HEX_64_ATLASRUNTIME", "SERVICE_HEX_64_ATLASQUEUE"],
    postgres: ["SERVICE_HEX_64_ATLASPOSTGRES"],
    bootstrap: [
      "SERVICE_HEX_64_ATLASPOSTGRES",
      "SERVICE_HEX_64_ATLASMIGRATOR",
      "SERVICE_HEX_64_ATLASAUTH",
      "SERVICE_HEX_64_ATLASRUNTIME",
      "SERVICE_HEX_64_ATLASQUEUE",
      "SERVICE_HEX_64_ATLASBACKUP",
    ],
    migrate: ["SERVICE_HEX_64_ATLASMIGRATOR", "ATLAS_INITIAL_PASSWORD"],
    web: [
      "OPENAI_API_KEY",
      "SERVICE_HEX_64_ATLASAUTH",
      "SERVICE_HEX_64_ATLASRUNTIME",
      "SERVICE_HEX_64_ATLASQUEUE",
      "SERVICE_HEX_64_ATLASSESSION",
    ],
    mail: [
      "SERVICE_HEX_64_ATLASRUNTIME",
      "SERVICE_HEX_64_ATLASQUEUE",
      "SERVICE_HEX_64_ATLASSESSION",
      "SMTP_PASSWORD",
    ],
  };
  for (const [name, service] of Object.entries(services)) {
    const text = JSON.stringify(service.environment);
    for (const [key, value] of Object.entries(secrets))
      if (!allowed[name].includes(key))
        assert.ok(!text.includes(value), "Cross-process credential injection");
    for (const key of Object.keys(secrets).filter((k) =>
      k.startsWith("SERVICE_HEX_"),
    ))
      assert.equal(service.environment[key], "");
  }
  console.log(
    "PASS: Compose config and credential separation under simulated Coolify global env_file injection; no real environment or daemon changes.",
  );
} catch {
  console.error("FAIL: Compose config validation");
  process.exitCode = 1;
} finally {
  rmSync(folder, { recursive: true, force: true });
}
