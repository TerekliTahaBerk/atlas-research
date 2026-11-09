import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const read = (cmd, args) =>
  execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });
try {
  if (read("git", ["status", "--porcelain"]))
    throw new Error("Commit the candidate before release verification");
  const sha = read("git", ["rev-parse", "HEAD"]),
    startedAt = new Date().toISOString();
  for (const path of read("git", ["ls-files"]).split("\n")) {
    if (/(^|\/)\.env($|\.)/.test(path) && !path.endsWith(".example"))
      throw new Error("Tracked environment file");
    if (/\.(pdf|dump|pem|key)$/i.test(path))
      throw new Error("Tracked private-data extension");
    const text = readFileSync(path, "utf8");
    if (
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|sk-proj-[A-Za-z0-9_-]{30,}/.test(
        text,
      )
    )
      throw new Error("Possible tracked credential");
  }
  run("npm", ["run", "verify"]);
  run("node", ["ops/validate-compose.mjs"]);
  const imageIds = {};
  for (const target of ["web", "mail", "migrator", "files"]) {
    run("docker", [
      "build",
      "--target",
      target,
      "--build-arg",
      `ATLAS_SOURCE_COMMIT=${sha}`,
      "--tag",
      `atlas-research:${target}-local`,
      ".",
    ]);
    if (
      read("docker", [
        "image",
        "inspect",
        `atlas-research:${target}-local`,
        "--format",
        '{{index .Config.Labels "org.opencontainers.image.revision"}} ',
      ]) !== sha
    )
      throw new Error("Image source revision mismatch");
    imageIds[target] = read("docker", [
      "image",
      "inspect",
      `atlas-research:${target}-local`,
      "--format",
      "{{.Id}}",
    ]);
  }
  run(process.execPath, ["--import", "tsx", "scripts/test-operations.ts"]);
  if (read("git", ["status", "--porcelain"]))
    throw new Error("Candidate changed during verification");
  mkdirSync(".atlas-local", { recursive: true });
  const report = {
    commit: sha,
    startedAt,
    finishedAt: new Date().toISOString(),
    node: process.version,
    imageIds,
    result: "PASS",
    scope:
      "local only; Coolify, off-host backup and external SMTP require separate evidence",
  };
  writeFileSync(
    `.atlas-local/verified-${sha}.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(
    error instanceof Error && /^[A-Za-z ]+$/.test(error.message)
      ? error.message
      : "Release verification failed; raw command errors omitted",
  );
  process.exitCode = 1;
}
