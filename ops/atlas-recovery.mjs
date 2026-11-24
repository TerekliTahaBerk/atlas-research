import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  chmod,
  copyFile,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

// Run as the backup operator with an existing age recipient and libpq credentials.
// All plaintext work stays inside the caller's explicitly selected private scratch.
const env = process.env;
const cleanEnvironment = { PATH: env.PATH, LC_ALL: "C", COPYFILE_DISABLE: "1" };
const mode = process.argv[2];
const releasePattern = /^[a-f0-9]{40}$/;
const revisionPattern = /^[0-9]{12}_[a-z0-9_]+$/;
let scratch;
let encryptedTemp;
let step = "configuration";

function required(name) {
  const value = env[name];
  assert.ok(value);
  return value;
}

function absolute(name) {
  const value = required(name);
  assert.ok(isAbsolute(value));
  return resolve(value);
}

function run(tool, args, { collect = false, database = false } = {}) {
  return new Promise((done, reject) => {
    const child = spawn(tool, args, {
      env: database ? { ...env, ...cleanEnvironment } : cleanEnvironment,
      stdio: ["ignore", collect ? "pipe" : "ignore", "ignore"],
    });
    const chunks = [];
    let bytes = 0;
    child.stdout?.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > 8_000_000) child.kill();
      else chunks.push(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 && bytes <= 8_000_000)
        done(collect ? Buffer.concat(chunks).toString("utf8") : undefined);
      else reject(new Error("Recovery command failed"));
    });
  });
}

function safePath(path) {
  return (
    typeof path === "string" &&
    path.length <= 1024 &&
    !path.includes("\\") &&
    !/[\x00-\x1f\x7f]/.test(path) &&
    path.split("/").every((part) => part && part !== "." && part !== "..")
  );
}

async function digest(file) {
  const metadata = await lstat(file);
  assert.ok(metadata.isFile());
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return { bytes: metadata.size, sha256: hash.digest("hex") };
}

async function fileManifest(root, copyTo, prefix = "") {
  const result = [];
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const path = prefix + entry.name;
    assert.ok(safePath(path));
    if (entry.isDirectory()) {
      if (copyTo) await mkdir(join(copyTo, path), { mode: 0o700 });
      result.push(...(await fileManifest(root, copyTo, path + "/")));
    } else {
      assert.ok(entry.isFile());
      const input = join(root, path);
      if (copyTo) await copyFile(input, join(copyTo, path));
      result.push({
        path,
        ...(await digest(copyTo ? join(copyTo, path) : input)),
      });
    }
  }
  return result;
}

function outside(parent, candidate) {
  const path = relative(parent, candidate);
  return path === ".." || path.startsWith(".." + sep) || isAbsolute(path);
}

async function capture(work) {
  assert.equal(env.ATLAS_RECOVERY_CONFIRM, "writers-fenced");
  const origin = await realpath(absolute("ATLAS_RECOVERY_FILES"));
  const bundle = absolute("ATLAS_RECOVERY_BUNDLE");
  const bundleParent = await realpath(dirname(bundle));
  assert.ok(outside(origin, work) && outside(origin, bundleParent));
  assert.match(
    required("ATLAS_RECOVERY_RECIPIENT"),
    /^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$/,
  );
  const release = required("ATLAS_RECOVERY_RELEASE");
  const schema = required("ATLAS_RECOVERY_SCHEMA");
  assert.match(release, releasePattern);
  assert.match(schema, revisionPattern);
  const db = required("PGDATABASE");
  const host = required("PGHOST");
  const port = required("PGPORT");
  assert.ok(["atlas", "atlas_test"].includes(db));
  assert.match(db, /^[a-z_]+$/);
  assert.match(port, /^\d{1,5}$/);
  assert.equal(required("PGUSER"), "atlas_backup");

  step = "source_identity";
  const pg = [
    "--no-password",
    "--host",
    host,
    "--port",
    port,
    "--username",
    "atlas_backup",
    "--dbname",
    db,
  ];
  const signature = await run(
    "psql",
    [
      ...pg,
      "-XAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "SELECT current_database(), current_user, current_setting('transaction_read_only'), revision FROM ops.schema_revision WHERE id=1",
    ],
    { collect: true, database: true },
  );
  assert.equal(signature.trim(), `${db}|atlas_backup|on|${schema}`);

  step = "database_dump";
  const dump = join(work, "atlas.dump");
  await run("pg_dump", [...pg, "--format=custom", "--file", dump], {
    database: true,
  });
  await run("pg_restore", ["--list", dump]);

  step = "files_and_manifest";
  const files = join(work, "files");
  await mkdir(files, { mode: 0o700 });
  const entries = await fileManifest(origin, files);
  assert.deepEqual(await fileManifest(origin), entries);
  await writeFile(
    join(work, "manifest.json"),
    JSON.stringify({
      version: 1,
      release,
      schema,
      createdAt: new Date().toISOString(),
      database: await digest(dump),
      files: entries,
    }),
    { mode: 0o600 },
  );

  step = "encryption";
  const archive = join(work, "atlas.tar");
  await run("tar", [
    "-cf",
    archive,
    "-C",
    work,
    "atlas.dump",
    "manifest.json",
    "files",
  ]);
  encryptedTemp = await mkdtemp(join(bundleParent, ".atlas-encryption-"));
  const ciphertext = join(encryptedTemp, "bundle.age");
  await run("age", [
    "--encrypt",
    "--recipient",
    env.ATLAS_RECOVERY_RECIPIENT,
    "--output",
    ciphertext,
    archive,
  ]);
  await chmod(ciphertext, 0o600);
  const result = await digest(ciphertext);
  await link(ciphertext, bundle); // Publish atomically and refuse to overwrite an existing backup.
  console.log(
    JSON.stringify({
      operation: "capture",
      release,
      schema,
      files: entries.length,
      ...result,
    }),
  );
}

async function verify(work) {
  step = "decrypt";
  const bundle = absolute("ATLAS_RECOVERY_BUNDLE");
  const identity = absolute("ATLAS_RECOVERY_IDENTITY");
  assert.equal((await lstat(identity)).mode & 0o077, 0);
  const archive = join(work, "atlas.tar");
  await run("age", [
    "--decrypt",
    "--identity",
    identity,
    "--output",
    archive,
    bundle,
  ]);

  step = "archive_paths";
  const list = (await run("tar", ["-tf", archive], { collect: true }))
    .trimEnd()
    .split("\n");
  const details = (await run("tar", ["-tvf", archive], { collect: true }))
    .trimEnd()
    .split("\n");
  assert.equal(list.length, details.length);
  assert.equal(new Set(list).size, list.length);
  assert.ok(
    list.includes("atlas.dump") &&
      list.includes("manifest.json") &&
      list.includes("files/"),
  );
  for (const [i, path] of list.entries()) {
    const type = details[i][0];
    const normalized = path.replace(/\/$/, "");
    assert.ok(safePath(normalized) && (type === "-" || type === "d"));
    assert.ok(
      (type === "-" && ["atlas.dump", "manifest.json"].includes(path)) ||
        (type === "d" && path === "files/") ||
        path.startsWith("files/"),
    );
  }
  const contents = join(work, "contents");
  await mkdir(contents, { mode: 0o700 });
  await run("tar", ["-xf", archive, "-C", contents]);

  step = "integrity";
  const manifest = JSON.parse(
    await readFile(join(contents, "manifest.json"), "utf8"),
  );
  assert.equal(manifest.version, 1);
  assert.match(manifest.release, releasePattern);
  assert.match(manifest.schema, revisionPattern);
  const dump = join(contents, "atlas.dump");
  assert.deepEqual(await digest(dump), manifest.database);
  assert.deepEqual(await fileManifest(join(contents, "files")), manifest.files);
  await run("pg_restore", ["--list", dump]);
  console.log(
    JSON.stringify({
      operation: "verify",
      release: manifest.release,
      schema: manifest.schema,
      files: manifest.files.length,
      ...(await digest(bundle)),
    }),
  );
}

try {
  assert.ok(["capture", "verify"].includes(mode));
  const root = absolute("ATLAS_RECOVERY_SCRATCH");
  const info = await lstat(root);
  assert.ok(info.isDirectory() && (info.mode & 0o077) === 0);
  scratch = await mkdtemp(join(root, "atlas-recovery-"));
  process.umask(0o077);
  await (mode === "capture" ? capture(scratch) : verify(scratch));
} catch {
  console.error(`Atlas recovery failed at ${step}`);
  process.exitCode = 1;
} finally {
  for (const dir of [scratch, encryptedTemp]) {
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}
