import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import pg from "pg";
import { createAuth } from "../../src/server/auth/create-auth";
import { requireIdentity } from "../../src/server/auth/identity";
import { createDatabase } from "../../src/server/db/client";
import { asIdentity } from "../../src/server/db/transaction";
import {
  acceptInvitation,
  createInvitation,
} from "../../src/server/domain/invitations";
import { ensurePersonalWorkspace } from "../../src/server/domain/personal-workspace";
import { createProject } from "../../src/server/domain/projects";
import { createSharedWorkspace } from "../../src/server/domain/workspaces";
import { getEnv } from "../../src/server/env";
import { AppError } from "../../src/server/errors";
import { createMailQueue } from "../../src/server/mail/outbox";
import {
  cancelCompute,
  enqueueCompute,
  readCompute,
  readComputeJob,
  readComputePdf,
} from "../../src/server/compute/service";
import { createComputeWorker } from "../../src/server/compute/worker";
import { verifiedUser } from "../helpers/identity";
import { startMailServer } from "../helpers/mail";

const code = (value: string) => (error: unknown) =>
  error instanceof AppError && error.code === value;

async function runnerFixture() {
  const actual = process.env.ATLAS_TEST_COMPUTE_RUNNER_URL;
  if (actual) {
    const token = process.env.ATLAS_TEST_COMPUTE_RUNNER_TOKEN;
    assert.ok(
      token && /^[a-f0-9]{64}$/.test(token),
      "A disposable runner token is required",
    );
    return { url: actual, token, actual: true, close: async () => {} };
  }
  assert.notEqual(
    process.env.ATLAS_TEST_COMPUTE_REAL,
    "1",
    "The real-runner test requires a local Docker runner",
  );
  const token = randomBytes(32).toString("hex");
  const server = createServer(async (request, response) => {
    if (request.headers.authorization !== "Bearer " + token) {
      response.writeHead(404).end();
      return;
    }
    if (request.url === "/healthz") {
      response.end(JSON.stringify({ version: "synthetic-fixture" }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const { kind, source, timeoutMs } = JSON.parse(
      Buffer.concat(chunks).toString(),
    );
    const loops = source.includes("while True") || source.includes("\\loop");
    if (loops) await delay(timeoutMs);
    const pdf = Buffer.from("%PDF-1.4\nsynthetic transport fixture\n%%EOF\n");
    response.end(
      JSON.stringify({
        status: loops ? "timed_out" : "succeeded",
        elapsedMs: loops ? timeoutMs : 21,
        stdout: kind === "python" && !loops ? "atlas compute 42\n" : "",
        stderr: "",
        ...(kind === "latex" && !loops
          ? { pdfBase64: pdf.toString("base64") }
          : {}),
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    url: "http://127.0.0.1:" + address.port,
    token,
    actual: false,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

test(
  "compute jobs are scoped, leased once, wall-bounded, quota-metered and recoverable",
  { timeout: 30_000 },
  async () => {
    const fixture = await runnerFixture();
    process.env.ATLAS_RESOURCE_LIMITS_ENABLED = "1";
    process.env.ATLAS_COMPUTE_ENABLED = "1";
    const smtp = await startMailServer();
    const env = {
      ...getEnv(),
      MAIL_DELIVERY: "smtp" as const,
      SMTP_PORT: smtp.port,
    };
    const authDb = createDatabase(env.AUTH_DATABASE_URL),
      db = createDatabase(env.DATABASE_URL);
    const mail = createMailQueue(env),
      auth = createAuth(authDb, env, mail);
    const migrator = new pg.Client({
      connectionString: process.env.MIGRATION_DATABASE_URL,
    });
    const queue = new pg.Client({ connectionString: env.QUEUE_DATABASE_URL });
    const worker = createComputeWorker({
      ...process.env,
      QUEUE_DATABASE_URL: env.QUEUE_DATABASE_URL,
      ATLAS_COMPUTE_RUNNER_URL: fixture.url,
      ATLAS_COMPUTE_RUNNER_TOKEN: fixture.token,
    });
    try {
      await migrator.connect();
      await queue.connect();
      const owner = await requireIdentity(
        auth,
        (await verifiedUser(auth, mail, smtp)).headers,
      );
      const reader = await requireIdentity(
        auth,
        (await verifiedUser(auth, mail, smtp)).headers,
      );
      const other = await requireIdentity(
        auth,
        (await verifiedUser(auth, mail, smtp)).headers,
      );
      await ensurePersonalWorkspace(db, owner);
      await ensurePersonalWorkspace(db, other);
      const team = await createSharedWorkspace(db, owner, {
        name: "Compute experiments",
        requestId: randomUUID(),
      });
      const project = await createProject(db, owner, team.id, {
        name: "Isolated sandbox test",
        requestId: randomUUID(),
      });
      const scope = { workspaceId: team.id, projectId: project.id };
      await createInvitation(
        db,
        owner,
        mail,
        env.APP_ORIGIN,
        team.id,
        project.id,
        { email: reader.email, role: "viewer" },
      );
      await mail.flush();
      await acceptInvitation(
        db,
        reader,
        smtp
          .latest(reader.email, "Your Atlas project invitation")
          .pathname.split("/")
          .at(-1)!,
      );
      const response = await readCompute(db, owner, scope);
      assert.equal(response.available, false);
      const python = (
        source = "print('atlas compute', 6 * 7)",
        timeoutMs = 1000,
      ) => ({
        ...scope,
        kind: "python" as const,
        requestId: randomUUID(),
        source,
        timeoutMs,
      });
      await assert.rejects(
        enqueueCompute(db, owner, python()),
        code("COMPUTE_UNAVAILABLE"),
      );

      async function override(limits: Record<string, number>) {
        await migrator.query("BEGIN");
        try {
          await migrator.query("SET LOCAL ROLE atlas_policy");
          await migrator.query(
            `INSERT INTO app.billing_workspace_settings("workspaceId","quotaOverrides")
          VALUES($1,$2) ON CONFLICT("workspaceId") DO UPDATE SET "quotaOverrides"=excluded."quotaOverrides"`,
            [team.id, JSON.stringify(limits)],
          );
          await migrator.query("COMMIT");
        } catch (error) {
          await migrator.query("ROLLBACK");
          throw error;
        }
      }
      await override({
        maxPythonRunMilliseconds: 1500,
        monthlyPythonMilliseconds: 2500,
        monthlyLatexCompiles: 1,
      });
      assert.equal(await worker.refreshHealth(), true);
      const allowance = await readCompute(db, owner, scope);
      assert.equal(allowance.available, true);
      assert.equal(allowance.limits.pythonTimeoutMs, 1500);
      assert.equal(allowance.limits.latexRemaining, 1);
      assert.equal((await readCompute(db, reader, scope)).canRun, false);
      await assert.rejects(
        enqueueCompute(db, reader, python()),
        code("UNAVAILABLE"),
      );
      await assert.rejects(readCompute(db, other, scope), code("UNAVAILABLE"));
      await assert.rejects(
        enqueueCompute(db, owner, python(undefined, 1501)),
        code("RESOURCE_QUOTA"),
      );

      const job = python();
      const [first, duplicate] = await Promise.all([
        enqueueCompute(db, owner, job),
        enqueueCompute(db, owner, job),
      ]);
      assert.equal(first.id, duplicate.id);
      assert.equal(first.status, "queued");
      await assert.rejects(
        enqueueCompute(db, owner, { ...job, source: "print(0)" }),
        code("CONFLICT"),
      );
      await assert.rejects(
        enqueueCompute(db, owner, python()),
        code("RESOURCE_QUOTA"),
      );
      assert.equal(
        (await readCompute(db, owner, scope)).limits.pythonRemainingMs,
        1500,
      );
      const worked = await worker.cycle();
      assert.equal(worked, true);
      assert.equal(await worker.cycle(), false);
      const success = await readComputeJob(db, owner, scope, first.id);
      assert.equal(success.status, "succeeded");
      assert.match(success.stdout, /atlas compute 42/);
      assert.ok(success.elapsedMs && success.elapsedMs <= 1000);
      assert.equal(
        (await readCompute(db, owner, scope)).limits.pythonRemainingMs,
        2500 - success.elapsedMs,
      );
      assert.equal((await readCompute(db, reader, scope)).jobs.length, 0);
      await assert.rejects(
        readComputeJob(db, reader, scope, first.id),
        code("UNAVAILABLE"),
      );

      const timed = await enqueueCompute(
        db,
        owner,
        python("while True: pass", 400),
      );
      await worker.cycle();
      const timeout = await readComputeJob(db, owner, scope, timed.id);
      assert.equal(timeout.status, "timed_out");
      assert.equal(timeout.elapsedMs, 400);

      const queued = await enqueueCompute(db, owner, python());
      const cancel = await cancelCompute(db, owner, scope, queued.id);
      assert.equal(cancel.status, "canceled");
      assert.equal(cancel.elapsedMs, null);
      const active = await enqueueCompute(
        db,
        owner,
        python("while True: pass", 1200),
      );
      const doing = worker.cycle();
      for (
        let i = 0;
        i < 60 &&
        (await readComputeJob(db, owner, scope, active.id)).status === "queued";
        i++
      )
        await delay(10);
      await delay(120);
      await cancelCompute(db, owner, scope, active.id);
      await doing;
      assert.equal(
        (await readComputeJob(db, owner, scope, active.id)).status,
        "canceled",
      );

      const la = await enqueueCompute(db, owner, {
        ...scope,
        kind: "latex",
        requestId: randomUUID(),
        timeoutMs: 5000,
        source:
          "\\documentclass{article}\n\\begin{document}Atlas compile proof\\end{document}",
      });
      await worker.cycle();
      const compiled = await readComputeJob(db, owner, scope, la.id);
      assert.equal(compiled.status, "succeeded");
      assert.equal(compiled.hasPdf, true);
      const pdf = await readComputePdf(db, owner, scope, la.id);
      assert.match(pdf.headers.get("content-disposition")!, /^attachment;/);
      assert.equal(
        Buffer.from(await pdf.arrayBuffer())
          .subarray(0, 5)
          .toString(),
        "%PDF-",
      );
      await assert.rejects(
        readComputePdf(db, reader, scope, la.id),
        code("UNAVAILABLE"),
      );
      await assert.rejects(
        enqueueCompute(db, owner, {
          ...scope,
          kind: "latex",
          requestId: randomUUID(),
          source: "test",
        }),
        code("RESOURCE_QUOTA"),
      );
      const dead = await enqueueCompute(db, owner, python(undefined, 200));
      const lease = randomUUID();
      assert.equal(
        (await queue.query("SELECT * FROM ops.claim_compute_job($1)", [lease]))
          .rows[0].id,
        dead.id,
      );
      await migrator.query("BEGIN; SET LOCAL ROLE atlas_policy");
      await migrator.query(
        `UPDATE ops.compute_jobs SET "leaseUntil"=now()-interval '1 second' WHERE id=$1`,
        [dead.id],
      );
      await migrator.query(
        `UPDATE ops.compute_jobs SET "outputExpiresAt"=now()-interval '1 second' WHERE id=$1`,
        [la.id],
      );
      await migrator.query("COMMIT");
      await queue.query("SELECT ops.reap_compute_jobs()");
      const abandoned = await readComputeJob(db, owner, scope, dead.id);
      assert.equal(abandoned.status, "abandoned");
      assert.equal(abandoned.elapsedMs, null);
      await assert.rejects(
        readComputePdf(db, owner, scope, la.id),
        code("UNAVAILABLE"),
      );
      const ledger = await asIdentity(db, owner, (tx) =>
        tx.billingUsageEntry.findMany({ where: { workspaceId: team.id } }),
      );
      assert.equal(
        ledger.filter(
          (row) => row.operationId === first.id && row.action === "settle",
        ).length,
        1,
      );
      assert.equal(
        ledger.filter(
          (row) => row.operationId === dead.id && row.action === "release",
        ).length,
        1,
      );
      await override({
        monthlyPythonMilliseconds: 0,
        maxPythonRunMilliseconds: 1500,
        monthlyLatexCompiles: 2,
      });
      await assert.rejects(
        enqueueCompute(db, owner, python(undefined, 100)),
        code("RESOURCE_QUOTA"),
      );
      assert.equal(
        (await readCompute(db, owner, scope)).limits.latexRemaining,
        1,
      );
      const latexTimeout = await enqueueCompute(db, owner, {
        ...scope,
        kind: "latex",
        requestId: randomUUID(),
        timeoutMs: 400,
        source: String.raw`\documentclass{article}\begin{document}\loop\iftrue\repeat\end{document}`,
      });
      await worker.cycle();
      const stopped = await readComputeJob(db, owner, scope, latexTimeout.id);
      assert.equal(stopped.status, "timed_out");
      assert.equal(stopped.elapsedMs, 400);
      assert.equal(stopped.hasPdf, false);
      assert.equal(
        (await readCompute(db, owner, scope)).limits.latexRemaining,
        0,
      );
      await assert.rejects(
        queue.query("SELECT source FROM ops.compute_jobs LIMIT 1"),
        /permission denied/,
      );
      console.log(
        "PASS: " +
          (fixture.actual
            ? "real isolated Docker runner"
            : "synthetic runner transport") +
          ", PostgreSQL RLS, quota, timeout, cancellation, expiration and output access.",
      );
    } finally {
      await Promise.all([
        worker.close(),
        fixture.close(),
        queue.end(),
        migrator.end(),
        mail.close(),
        smtp.close(),
        db.$disconnect(),
        authDb.$disconnect(),
      ]);
      delete process.env.ATLAS_RESOURCE_LIMITS_ENABLED;
      delete process.env.ATLAS_COMPUTE_ENABLED;
    }
  },
);
