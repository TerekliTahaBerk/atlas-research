import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import assert from "node:assert/strict";
import pg from "pg";
import { createDatabase } from "../src/server/db/client";
import { createSharedWorkspace } from "../src/server/domain/workspaces";
import {
  createProject,
  readProject,
  listProjects,
} from "../src/server/domain/projects";
import type { Identity } from "../src/server/auth/identity";
import { addSource, addAnnotation } from "../src/server/research/library";
import { uploadPdf } from "../src/server/research/storage";
import { createFileWorker } from "../src/server/files/worker";
import {
  createDocument,
  getDocument,
  createTask,
  getTask,
  createDiscussion,
  getDiscussion,
  taskInput,
  discussionInput,
} from "../src/server/collaboration/service";
import { preview, getConversation } from "../src/server/ai/service";
import { syntheticPdf } from "../tests/helpers/pdf";
import images from "../ops/images.json";
import { SCHEMA_REVISION } from "../src/server/release";

// No external connection URL is accepted. All resources have our fresh prefix.
const prefix = `atlas-drill-${randomBytes(6).toString("hex")}`,
  folder = mkdtempSync(join(tmpdir(), "atlas-ops-"));
const containers: string[] = [],
  volumes: string[] = [],
  network = prefix;
let operation = "";
const docker = (...args: string[]) => {
  operation = args[0];
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
};
const secret = () => randomBytes(32).toString("hex");
const passwords = Object.fromEntries(
  [
    "postgres",
    "atlas_migrator",
    "atlas_auth",
    "atlas_runtime",
    "atlas_queue",
    "atlas_backup",
  ].map((r) => [r, secret()]),
);
const authSecret = secret(),
  nodeImage = `${images.node.tag}@${images.node.index}`;
let stage = "resource creation",
  networkCreated = false;
const clients: ReturnType<typeof createDatabase>[] = [];
function envFile(name: string, values: Record<string, string>) {
  const path = join(folder, name + ".env");
  writeFileSync(
    path,
    Object.entries(values)
      .map(([k, v]) => `${k}=${v}\n`)
      .join(""),
    { mode: 0o600 },
  );
  return path;
}
function volume(suffix: string) {
  const name = prefix + "-" + suffix;
  docker("volume", "create", "--label", `atlas.drill=${prefix}`, name);
  volumes.push(name);
  return name;
}
function run(
  name: string,
  args: string[],
  image: string,
  command: string[] = [],
) {
  containers.push(name);
  return docker(
    "run",
    "--detach",
    "--name",
    name,
    "--label",
    `atlas.drill=${prefix}`,
    ...args,
    image,
    ...command,
  );
}
function url(role: string, host: string, port = "5432") {
  return `postgresql://${role}:${passwords[role]}@${host}:${port}/atlas`;
}
async function database(suffix: string) {
  const name = prefix + "-" + suffix;
  run(
    name,
    [
      "--network",
      network,
      "--publish",
      "127.0.0.1::5432",
      "--env-file",
      envFile(suffix, {
        POSTGRES_DB: "atlas",
        POSTGRES_PASSWORD: passwords.postgres,
      }),
      "--volume",
      `${volume(suffix)}:/var/lib/postgresql`,
    ],
    images.postgres,
  );
  const port = docker("port", name, "5432/tcp").split(":").at(-1)!;
  for (let i = 0; i < 100; i++) {
    const client = new pg.Client({
      connectionString: url("postgres", "127.0.0.1", port),
      connectionTimeoutMillis: 500,
    });
    try {
      await client.connect();
      await client.end();
      break;
    } catch {
      await client.end().catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  const bootstrap = envFile(suffix + "-bootstrap", {
    ALLOW_ATLAS_BOOTSTRAP: "atlas",
    ADMIN_DATABASE_URL: url("postgres", name),
    ...Object.fromEntries(
      Object.entries(passwords)
        .filter(([r]) => r !== "postgres")
        .map(([r, p]) => [r.toUpperCase() + "_PASSWORD", p]),
    ),
  });
  docker(
    "run",
    "--rm",
    "--network",
    network,
    "--env-file",
    bootstrap,
    "--read-only",
    "--cap-drop",
    "ALL",
    "atlas-research:migrator-local",
    "node",
    "ops/provision-db.mjs",
  );
  return { name, port };
}
async function waitReady(origin: string) {
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch(origin + "/health/ready", {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        assert.equal((await response.json()).schema, SCHEMA_REVISION);
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Readiness failed");
}
function startMail(host: string, suffix: string) {
  const name = prefix + "-mail-" + suffix;
  run(
    name,
    [
      "--network",
      network,
      "--env-file",
      envFile("mail-" + suffix, {
        BETTER_AUTH_SECRET: authSecret,
        DATABASE_URL: url("atlas_runtime", host),
        QUEUE_DATABASE_URL: url("atlas_queue", host),
        MAIL_DELIVERY: "disabled",
      }),
      "--read-only",
      "--tmpfs",
      "/tmp",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
    ],
    "atlas-research:mail-local",
  );
  return name;
}
function startWeb(
  host: string,
  suffix: string,
  image = "atlas-research:web-local",
) {
  const name = prefix + "-web-" + suffix;
  run(
    name,
    [
      "--network",
      network,
      "--publish",
      "127.0.0.1::3000",
      "--env-file",
      envFile("web-" + suffix, {
        APP_ORIGIN: "https://atlas.example.test",
        BETTER_AUTH_SECRET: authSecret,
        AUTH_DATABASE_URL: url("atlas_auth", host),
        DATABASE_URL: url("atlas_runtime", host),
        QUEUE_DATABASE_URL: url("atlas_queue", host),
        MAIL_DELIVERY: "disabled",
      }),
      "--read-only",
      "--tmpfs",
      "/tmp",
      "--tmpfs",
      "/app/.next/cache:uid=1000,gid=1000,mode=0700",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
    ],
    image,
  );
  return {
    name,
    origin: `http://127.0.0.1:${docker("port", name, "3000/tcp").split(":").at(-1)}`,
  };
}
async function fixture(port: string) {
  const auth = createDatabase(url("atlas_auth", "127.0.0.1", port)),
    runtime = createDatabase(url("atlas_runtime", "127.0.0.1", port));
  clients.push(auth, runtime);
  const actors: Identity[] = [];
  for (const label of ["A", "C"]) {
    const id = randomUUID(),
      sessionId = randomUUID(),
      now = new Date();
    // Synthetic operations-only identities; this is not email-verification evidence.
    await auth.user.create({
      data: {
        id,
        name: `Synthetic ${label}`,
        email: `${id}@example.invalid`,
        emailVerified: true,
      },
    });
    await auth.session.create({
      data: {
        id: sessionId,
        userId: id,
        token: secret(),
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });
    actors.push({
      id,
      sessionId,
      name: `Synthetic ${label}`,
      email: `${id}@example.invalid`,
      sessionCreatedAt: now,
    });
  }
  Object.assign(process.env, {
    NODE_ENV: "test",
    APP_ORIGIN: "http://127.0.0.1:3000",
    BETTER_AUTH_SECRET: authSecret,
    AUTH_DATABASE_URL: url("atlas_auth", "127.0.0.1", port),
    DATABASE_URL: url("atlas_runtime", "127.0.0.1", port),
    QUEUE_DATABASE_URL: url("atlas_queue", "127.0.0.1", port),
    FILE_STORAGE_PATH: join(folder, "private-files"),
    ATLAS_AI_CALLS_ENABLED: "false",
  });
  const worker = createFileWorker(process.env),
    artifacts = [];
  const records = [];
  for (const actor of actors) {
    const w = await createSharedWorkspace(runtime, actor, {
      name: actor.name,
      requestId: randomUUID(),
    });
    const p = await createProject(runtime, actor, w.id, {
      name: `Study ${actor.name}`,
      requestId: randomUUID(),
    });
    records.push(p);
    const source = (
      await addSource(runtime, actor, w.id, p.id, {
        title: "Synthetic recovery paper",
        authors: ["Fixture Author"],
        year: 2026,
        venue: "Recovery fixture",
        doi: "10.1234/recovery-fixture",
        url: null,
        abstract: "",
      })
    ).source;
    const bytes = syntheticPdf();
    const uploaded = await uploadPdf(
      new Request(process.env.APP_ORIGIN + "/upload", {
        method: "POST",
        headers: {
          origin: process.env.APP_ORIGIN!,
          "content-type": "application/pdf",
          "content-length": String(bytes.length),
        },
        body: new Uint8Array(bytes),
      }),
      runtime,
      actor,
      w.id,
      p.id,
      source.id,
      randomUUID(),
    );
    await worker.heartbeat();
    await worker.flush();
    const note = await addAnnotation(
      runtime,
      actor,
      w.id,
      p.id,
      source.id,
      uploaded.versionId!,
      {
        kind: "note",
        page: 1,
        body: "Synthetic restored note",
        quote: "",
        rects: [],
        color: "yellow",
      },
    );
    const document = await createDocument(runtime, actor, w.id, p.id, {
      requestId: randomUUID(),
      title: "Synthetic restored writing",
      origin: {
        sourceId: source.id,
        versionId: uploaded.versionId!,
        annotationId: note.id,
      },
    });
    const task = await createTask(
      runtime,
      actor,
      w.id,
      p.id,
      taskInput.parse({
        requestId: randomUUID(),
        title: "Synthetic restored task",
        assigneeId: actor.id,
        links: [document.id, note.id],
      }),
    );
    const topic = await createDiscussion(
      runtime,
      actor,
      w.id,
      p.id,
      discussionInput.parse({
        requestId: randomUUID(),
        title: "Synthetic restored thread",
        body: "Synthetic first message",
        links: [document.id, task.id],
      }),
    );
    const context = await preview(runtime, actor, w.id, p.id, {
      conversationId: null,
      versionIds: [uploaded.versionId!],
      question: "What stable source supports connected research?",
    });
    assert.ok(context.evidence.length > 0);
    artifacts.push({
      documentId: document.id,
      taskId: task.id,
      topicId: topic.id,
      conversationId: context.context.conversationId,
      evidenceHash: context.evidence[0].quoteHash,
    });
  }
  await worker.close();
  return { actors, records, artifacts };
}
async function verifyRestored(
  port: string,
  data: Awaited<ReturnType<typeof fixture>>,
) {
  const db = createDatabase(url("atlas_runtime", "127.0.0.1", port));
  clients.push(db);
  for (const [i, actor] of data.actors.entries()) {
    assert.equal((await listProjects(db, actor)).length, 1);
    assert.equal(
      (
        await readProject(
          db,
          actor,
          data.records[i].workspaceId,
          data.records[i].id,
        )
      ).project.name,
      data.records[i].name,
    );
    const item = data.artifacts[i],
      w = data.records[i].workspaceId,
      p = data.records[i].id;
    const doc = await getDocument(db, actor, w, p, item.documentId);
    assert.equal(doc.document.revision, 1);
    assert.ok(doc.citations.length > 0);
    assert.ok(doc.versions.length > 0);
    assert.ok(await getTask(db, actor, w, p, item.taskId));
    assert.ok(await getDiscussion(db, actor, w, p, item.topicId));
    const conversation = await getConversation(
      db,
      actor,
      w,
      p,
      item.conversationId,
    );
    assert.equal(
      conversation.contexts[0].evidence[0].quoteHash,
      item.evidenceHash,
    );
    assert.equal(conversation.contexts[0].run, null);
    await assert.rejects(
      getDocument(db, data.actors[1 - i], w, p, item.documentId),
    );
    await assert.rejects(
      getConversation(db, data.actors[1 - i], w, p, item.conversationId),
    );
    const other = data.records[1 - i];
    await assert.rejects(readProject(db, actor, other.workspaceId, other.id));
  }
  assert.deepEqual(await db.project.findMany(), []);
}
try {
  for (const image of ["web", "mail", "migrator"]) {
    assert.equal(
      docker(
        "image",
        "inspect",
        `atlas-research:${image}-local`,
        "--format",
        "{{.Config.User}}",
      ),
      "node",
    );
  }
  docker("network", "create", "--label", `atlas.drill=${prefix}`, network);
  networkCreated = true;
  const source = await database("source");
  stage = "migration";
  docker(
    "run",
    "--rm",
    "--network",
    network,
    "--env-file",
    envFile("migration", {
      MIGRATION_DATABASE_URL: url("atlas_migrator", source.name),
    }),
    "--read-only",
    "--tmpfs",
    "/tmp",
    "atlas-research:migrator-local",
    "node",
    "node_modules/prisma/build/index.js",
    "migrate",
    "deploy",
  );
  stage = "rootless health and persistence";
  const mail = startMail(source.name, "a"),
    web = startWeb(source.name, "a");
  await waitReady(web.origin);
  const runtimeEnv = JSON.parse(
    docker("inspect", web.name, "--format", "{{json .Config.Env}}"),
  ) as string[];
  assert.ok(
    runtimeEnv.every(
      (v) =>
        !v.startsWith("MIGRATION_DATABASE_URL=") &&
        !v.startsWith("ADMIN_DATABASE_URL=") &&
        !v.startsWith("SMTP_PASSWORD="),
    ),
  );
  const data = await fixture(source.port);
  docker("restart", source.name);
  const previousPort = source.port;
  source.port = docker("port", source.name, "5432/tcp").split(":").at(-1)!;
  console.log(
    JSON.stringify({
      event: "loopback_binding_after_restart",
      changed: previousPort !== source.port,
    }),
  );
  await waitReady(web.origin);
  await verifyRestored(source.port, data);
  docker("restart", web.name);
  web.origin = `http://127.0.0.1:${docker("port", web.name, "3000/tcp").split(":").at(-1)}`;
  await waitReady(web.origin);
  await verifyRestored(source.port, data);
  // Liveness survives a DB outage; readiness does not.
  docker("stop", source.name);
  assert.equal((await fetch(web.origin + "/health/live")).status, 200);
  assert.equal((await fetch(web.origin + "/health/ready")).status, 503);
  docker("start", source.name);
  await waitReady(web.origin);
  stage = "fenced synthetic backup";
  docker("stop", web.name, mail);
  const files = volume("files"),
    fileContainer = prefix + "-files";
  run(fileContainer, ["--volume", `${files}:/synthetic`], nodeImage, [
    "node",
    "-e",
    "require('fs').writeFileSync('/synthetic/synthetic.txt','Atlas operational fixture; no PDF feature or private data.\\n')",
  ]);
  docker("wait", fileContainer);
  docker(
    "cp",
    join(folder, "private-files") + "/.",
    `${fileContainer}:/synthetic`,
  );
  const snapshot = join(folder, "snapshot");
  mkdirSync(snapshot);
  docker("cp", `${fileContainer}:/synthetic`, join(snapshot, "files"));
  function manifest(
    root: string,
    relative = "",
  ): { name: string; bytes: number; sha256: string }[] {
    return readdirSync(join(root, relative), { withFileTypes: true }).flatMap(
      (e) =>
        e.isDirectory()
          ? manifest(root, join(relative, e.name))
          : [
              {
                name: join(relative, e.name),
                bytes: readFileSync(join(root, relative, e.name)).length,
                sha256: createHash("sha256")
                  .update(readFileSync(join(root, relative, e.name)))
                  .digest("hex"),
              },
            ],
    );
  }
  const allFiles = manifest(join(snapshot, "files"));
  assert.equal(allFiles.filter((f) => f.name.endsWith(".pdf")).length, 2);
  const bytes = readFileSync(join(snapshot, "files", "synthetic.txt")),
    hash = createHash("sha256").update(bytes).digest("hex"),
    capturedAt = new Date().toISOString();
  writeFileSync(
    join(snapshot, "manifest.json"),
    JSON.stringify({
      schema: SCHEMA_REVISION,
      image: docker(
        "image",
        "inspect",
        "atlas-research:web-local",
        "--format",
        "{{.Id}}",
      ),
      capturedAt,
      files: allFiles,
    }),
  );
  const pgpass = join(folder, "backup.pgpass");
  writeFileSync(
    pgpass,
    `127.0.0.1:5432:atlas:atlas_backup:${passwords.atlas_backup}\n`,
    { mode: 0o600 },
  );
  docker("cp", pgpass, `${source.name}:/tmp/atlas-backup.pgpass`);
  docker(
    "exec",
    "--env",
    "PGPASSFILE=/tmp/atlas-backup.pgpass",
    source.name,
    "pg_dump",
    "--host",
    "127.0.0.1",
    "--username",
    "atlas_backup",
    "--dbname",
    "atlas",
    "--format=custom",
    "--file=/tmp/atlas.dump",
  );
  docker("cp", `${source.name}:/tmp/atlas.dump`, join(snapshot, "atlas.dump"));
  const archive = join(folder, "snapshot.tar.gz");
  execFileSync("tar", ["-czf", archive, "-C", snapshot, "."]);
  const key = randomBytes(32),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv),
    encrypted = Buffer.concat([
      cipher.update(readFileSync(archive)),
      cipher.final(),
    ]);
  writeFileSync(join(folder, "recovery.key"), key, { mode: 0o600 });
  writeFileSync(
    join(folder, "snapshot.aes"),
    Buffer.concat([iv, cipher.getAuthTag(), encrypted]),
    { mode: 0o600 },
  );
  const stored = readFileSync(join(folder, "snapshot.aes")),
    decipher = createDecipheriv(
      "aes-256-gcm",
      readFileSync(join(folder, "recovery.key")),
      stored.subarray(0, 12),
    );
  decipher.setAuthTag(stored.subarray(12, 28));
  writeFileSync(
    join(folder, "recovered.tar.gz"),
    Buffer.concat([decipher.update(stored.subarray(28)), decipher.final()]),
  );
  rmSync(snapshot, { recursive: true });
  mkdirSync(snapshot);
  execFileSync("tar", [
    "-xzf",
    join(folder, "recovered.tar.gz"),
    "-C",
    snapshot,
  ]);
  stage = "disposable restore";
  const started = Date.now(),
    restored = await database("restore");
  const restorePass = join(folder, "restore.pgpass");
  writeFileSync(
    restorePass,
    `127.0.0.1:5432:atlas:postgres:${passwords.postgres}\n`,
    { mode: 0o600 },
  );
  docker("cp", restorePass, `${restored.name}:/tmp/restore.pgpass`);
  docker(
    "cp",
    join(snapshot, "atlas.dump"),
    `${restored.name}:/tmp/restore.dump`,
  );
  docker(
    "exec",
    "--env",
    "PGPASSFILE=/tmp/restore.pgpass",
    restored.name,
    "pg_restore",
    "--host",
    "127.0.0.1",
    "--username",
    "postgres",
    "--dbname",
    "atlas",
    "--clean",
    "--if-exists",
    "--exit-on-error",
    "--single-transaction",
    "/tmp/restore.dump",
  );
  const restoredFiles = volume("restored-files"),
    restoreHelper = prefix + "-restore-files";
  run(restoreHelper, ["--volume", `${restoredFiles}:/synthetic`], nodeImage, [
    "sleep",
    "120",
  ]);
  docker("cp", join(snapshot, "files") + "/.", `${restoreHelper}:/synthetic`);
  const restoredHash = docker(
    "exec",
    restoreHelper,
    "node",
    "-e",
    "process.stdout.write(require('crypto').createHash('sha256').update(require('fs').readFileSync('/synthetic/synthetic.txt')).digest('hex'))",
  );
  assert.equal(restoredHash, hash);
  const restoredManifest = JSON.parse(
    docker(
      "exec",
      restoreHelper,
      "node",
      "-e",
      "const fs=require('fs'),path=require('path'),crypto=require('crypto');function walk(rel=''){return fs.readdirSync(path.join('/synthetic',rel),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(rel,e.name)):[{name:path.join(rel,e.name),bytes:fs.readFileSync(path.join('/synthetic',rel,e.name)).length,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join('/synthetic',rel,e.name))).digest('hex')}]);}process.stdout.write(JSON.stringify(walk()));",
    ),
  );
  assert.deepEqual(
    restoredManifest.sort((a: { name: string }, b: { name: string }) =>
      a.name.localeCompare(b.name),
    ),
    allFiles.sort((a, b) => a.name.localeCompare(b.name)),
  );
  startMail(restored.name, "restore");
  const restoredWeb = startWeb(restored.name, "restore");
  await waitReady(restoredWeb.origin);
  await verifyRestored(restored.port, data);
  stage = "compatible image rollback";
  // Separate metadata revision of the same application/schema; no old-code compatibility claim.
  const revised = prefix + "-revision",
    metaContainer = docker("create", "atlas-research:web-local");
  containers.push(metaContainer);
  docker(
    "commit",
    "--change",
    "LABEL atlas.drill.revision=b",
    metaContainer,
    revised,
  );
  assert.notEqual(
    docker("image", "inspect", revised, "--format", "{{.Id}}"),
    docker(
      "image",
      "inspect",
      "atlas-research:web-local",
      "--format",
      "{{.Id}}",
    ),
  );
  docker("stop", restoredWeb.name);
  const newer = startWeb(restored.name, "newer", revised);
  await waitReady(newer.origin);
  docker("stop", newer.name);
  docker("start", restoredWeb.name);
  restoredWeb.origin = `http://127.0.0.1:${docker("port", restoredWeb.name, "3000/tcp").split(":").at(-1)}`;
  await waitReady(restoredWeb.origin);
  await verifyRestored(restored.port, data);
  console.log(
    JSON.stringify({
      result: "PASS",
      scope: "local synthetic operations only",
      schema: SCHEMA_REVISION,
      restoreMilliseconds: Date.now() - started,
      checks: [
        "rootless web/mail/migrator",
        "no migration/admin/SMTP secret in web",
        "live/ready DB outage",
        "DB+web restart persistence",
        "backup-role pg_dump",
        "AES-GCM bundle roundtrip",
        "fresh-cluster restore with owners/policies",
        "synthetic PDFs and file-tree SHA-256",
        "source/page evidence, private AI preview, document versions/citations, linked task/thread survive restore",
        "two-team RLS after restore",
        "compatible metadata-image rollback",
      ],
      limitations: [
        "No independent off-host destination",
        "No external SMTP/TLS",
        "No Coolify deployment",
        "No older application-image compatibility claim",
      ],
    }),
  );
} catch (error) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "Error";
  console.error(
    JSON.stringify({
      result: "FAIL",
      stage,
      operation,
      diagnostic:
        error && typeof error === "object" && "stderr" in error
          ? String(error.stderr)
              .replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]")
              .replace(/[a-f0-9]{32,}/g, "[redacted]")
              .slice(0, 600)
          : undefined,
      code: /^[a-zA-Z0-9_]+$/.test(code) ? code : "Error",
    }),
  );
  process.exitCode = 1;
} finally {
  await Promise.all(clients.map((c) => c.$disconnect()));
  for (const name of containers.reverse())
    try {
      docker("rm", "--force", name);
    } catch {}
  try {
    docker("image", "rm", prefix + "-revision");
  } catch {}
  for (const name of volumes)
    try {
      docker("volume", "rm", name);
    } catch {}
  if (networkCreated)
    try {
      docker("network", "rm", network);
    } catch {}
  rmSync(folder, { recursive: true, force: true });
}
