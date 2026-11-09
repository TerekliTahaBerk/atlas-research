import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
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
  };
  const args = [
    "--project-directory",
    process.cwd(),
    "--project-name",
    "atlas-validation",
    "--file",
    file,
    "config",
    "--quiet",
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
  console.log(
    "PASS: Compose config; only documented Coolify health exclusions normalized; no real environment or daemon changes.",
  );
} catch {
  console.error("FAIL: Compose config validation");
  process.exitCode = 1;
} finally {
  rmSync(folder, { recursive: true, force: true });
}
