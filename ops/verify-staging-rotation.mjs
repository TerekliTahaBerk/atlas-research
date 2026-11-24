import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { hashPassword } from "better-auth/crypto";
import { serializeSignedCookie } from "better-call";
import pg from "pg";

const origin = "https://pgovi9zdf5jeuzzqtl70nsce.91.99.118.96.sslip.io";
const actor = randomUUID();
const email = `compute-qa+${actor}@example.invalid`;
const cookieName = "__Secure-better-auth.session_token";
const db = new pg.Client({
  connectionString: process.env.AUTH_DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
let phase = "staging_guard";
let seeded = false;
let cookie = "";

function request(path, { method = "GET", body, session = cookie } = {}) {
  return fetch(origin + path, {
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(6000),
    headers: {
      Origin: origin,
      ...(session && { Cookie: session }),
      ...(body && { "Content-Type": "application/json" }),
    },
    body: body && JSON.stringify(body),
  });
}

async function json(path, options, status = 200) {
  const response = await request(path, options);
  assert.equal(response.status, status);
  return response.json();
}

async function untilReady() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const ready = await json("/health/ready");
      if (
        ready.release === process.env.ATLAS_RELEASE &&
        ready.schema === "202611240104_compute_jobs"
      )
        return;
    } catch {
      // DNS, proxy, and application startup are asynchronous in Coolify.
    }
    await setTimeout(1000);
  }
  throw new Error("Staging readiness deadline exceeded");
}

async function seedIdentity() {
  await db.connect();
  const {
    rows: [target],
  } = await db.query("SELECT current_database() AS db,current_user AS role");
  assert.equal(target.db, "atlas");
  assert.equal(target.role, "atlas_auth");
  const {
    rows: [existing],
  } = await db.query(
    "SELECT count(*)::int AS count FROM identity.users WHERE email NOT LIKE 'compute-qa+%@example.invalid'",
  );
  assert.equal(existing.count, 0);
  const password = randomBytes(32).toString("hex");
  const digest = await hashPassword(password);
  await db.query("BEGIN");
  await db.query(
    'INSERT INTO identity.users(id,name,email,"emailVerified","updatedAt") VALUES($1,$2,$3,true,now())',
    [actor, "Synthetic staging Compute rotation", email],
  );
  await db.query(
    'INSERT INTO identity.accounts(id,"accountId","providerId","userId",password,"updatedAt") VALUES($1,$2,$3,$2,$4,now())',
    [randomUUID(), actor, "credential", digest],
  );
  await db.query("COMMIT");
  seeded = true;
  return password;
}

async function verifySession(password, oldSecret, newSecret) {
  const signIn = await request("/api/auth/sign-in/email", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(signIn.status, 200);
  cookie = signIn.headers
    .getSetCookie()
    .map((line) => line.split(";", 1)[0])
    .find((value) => value.startsWith(`${cookieName}=`));
  assert.ok(cookie);
  const active = decodeURIComponent(cookie.slice(cookieName.length + 1));
  const separator = active.lastIndexOf(".");
  assert.ok(separator > 0);
  const token = active.slice(0, separator);
  const options = { secure: true, httpOnly: true, path: "/" };
  const newSig = (
    await serializeSignedCookie(cookieName, token, newSecret, options)
  ).split(";", 1)[0];
  assert.equal(newSig, cookie);
  const oldSig = (
    await serializeSignedCookie(cookieName, token, oldSecret, options)
  ).split(";", 1)[0];
  assert.equal((await request("/api/me", { session: oldSig })).status, 401);
  const me = await json("/api/me");
  assert.equal(me.user.id, actor);
  console.log(
    "PASS new staging session accepted; identical active token signed by old key rejected with HTTP 401",
  );
  return me.personalWorkspace.id;
}

async function verifyCompute(workspaceId) {
  const projectId = (
    await json("/api/projects", {
      method: "POST",
      body: {
        workspaceId,
        name: "Synthetic staging rotation acceptance",
        requestId: randomUUID(),
      },
    })
  ).id;
  const endpoint = "/api/compute";
  const scope = { workspaceId, projectId };
  const query = `?${new URLSearchParams(scope)}`;
  const overview = () => json(endpoint + query);
  const input = (kind, source, timeoutMs) => ({
    ...scope,
    requestId: randomUUID(),
    kind,
    source,
    timeoutMs,
  });
  const submit = (body) => json(endpoint, { method: "POST", body });
  const checkQuota = async (body) => {
    assert.equal(
      (await json(endpoint, { method: "POST", body }, 429)).error,
      "RESOURCE_QUOTA",
    );
  };
  async function finish(job, expected) {
    const until = Date.now() + 15_000;
    while (Date.now() < until) {
      const result = await json(`${endpoint}/${job.id}${query}`);
      if (!["queued", "running"].includes(result.status)) {
        assert.equal(result.status, expected);
        return result;
      }
      await setTimeout(300);
    }
    throw new Error("Job acceptance deadline exceeded");
  }

  phase = "worker_readiness";
  let ready = await overview();
  for (let attempt = 0; !ready.available && attempt < 20; attempt++) {
    await setTimeout(1000);
    ready = await overview();
  }
  assert.equal(ready.available, true);
  assert.equal(ready.canRun, true);
  const { limits } = ready;
  assert.equal(limits.pythonTimeoutMs, 60_000);
  assert.equal(limits.pythonRemainingMs, 1_200_000);
  assert.equal(limits.latexTimeoutMs, 30_000);
  assert.equal(limits.latexRemaining, 20);

  phase = "python";
  const python = input("python", "print(6 * 7)", 4000);
  const output = await finish(await submit(python), "succeeded");
  assert.equal(output.stdout.trim(), "42");
  assert.equal((await submit(python)).id, output.id);
  const timeout = await finish(
    await submit(input("python", "while True: pass", 400)),
    "timed_out",
  );
  assert.equal(timeout.elapsedMs, 400);
  await checkQuota(input("python", "print(1)", 61_000));
  assert.equal(
    (await overview()).limits.pythonRemainingMs,
    limits.pythonRemainingMs - output.elapsedMs - timeout.elapsedMs,
  );
  console.log(
    "PASS Python output, 400 ms timeout, measured debit, idempotency and 60 s maximum",
  );

  phase = "latex";
  const document = (text) =>
    [
      "\\documentclass{article}",
      "\\begin{document}",
      text,
      "\\end{document}",
    ].join("\n");
  const pdfJob = await finish(
    await submit(input("latex", document("Atlas staging"), 4000)),
    "succeeded",
  );
  const pdfPath = `${endpoint}/${pdfJob.id}/pdf${query}`;
  assert.equal(pdfJob.hasPdf, true);
  const pdf = await request(pdfPath);
  assert.equal(pdf.status, 200);
  assert.equal(
    Buffer.from(await pdf.arrayBuffer())
      .subarray(0, 5)
      .toString(),
    "%PDF-",
  );
  assert.equal((await request(pdfPath, { session: "" })).status, 401);
  const latexTimeout = await finish(
    await submit(input("latex", document("\\loop\\iftrue\\repeat"), 400)),
    "timed_out",
  );
  assert.equal(latexTimeout.elapsedMs, 400);
  assert.equal(latexTimeout.hasPdf, false);
  await checkQuota(input("latex", document("Over limit"), 30_001));
  for (let count = 2; count < limits.latexRemaining; count++) {
    await finish(
      await submit(input("latex", document(`Atlas ${count}`), 4000)),
      "succeeded",
    );
  }
  assert.equal((await overview()).limits.latexRemaining, 0);
  await checkQuota(input("latex", document("Over monthly count"), 4000));
  console.log(
    "PASS LaTeX private PDF, 400 ms timeout, 30 s maximum and compile 21 rejected",
  );

  phase = "disabled_external_effects";
  const invite = await json(
    `/api/projects/${projectId}?workspaceId=${workspaceId}`,
    {
      method: "PATCH",
      body: {
        action: "invite",
        email: "nobody@example.invalid",
        role: "viewer",
      },
    },
    503,
  );
  assert.equal(invite.error, "MAIL_DISABLED");
  const pricing = await request("/pricing", { session: "" });
  assert.equal(pricing.status, 200);
  assert.match(
    await pricing.text(),
    /Checkout and custom automations are unavailable/,
  );
  console.log("PASS live invitations and checkout disabled");
}

try {
  assert.equal(process.env.APP_ORIGIN, origin);
  assert.equal(process.env.MAIL_DELIVERY, "disabled");
  assert.notEqual(process.env.ATLAS_FOUNDING_MAIL_ENABLED, "1");
  assert.notEqual(process.env.ATLAS_BILLING_SANDBOX_ENABLED, "1");
  const oldSecret = process.env.ATLAS_ROTATION_OLD_SESSION;
  const newSecret = process.env.ATLAS_ROTATION_NEW_SESSION;
  assert.match(oldSecret, /^[a-f0-9]{64}$/);
  assert.match(newSecret, /^[a-f0-9]{64}$/);
  assert.notEqual(oldSecret, newSecret);
  phase = "https_readiness";
  await untilReady();
  assert.equal((await json("/api/capabilities")).emailDelivery, "disabled");
  phase = "session_rotation";
  await verifyCompute(
    await verifySession(await seedIdentity(), oldSecret, newSecret),
  );
} catch {
  console.error(
    JSON.stringify({
      event: "atlas_staging_rotation_acceptance_failed",
      phase,
    }),
  );
  process.exitCode = 1;
} finally {
  if (seeded) {
    try {
      if (cookie)
        await request("/api/auth/sign-out", { method: "POST", body: {} }).catch(
          () => {},
        );
      await db.query(
        'UPDATE identity.accounts SET password=NULL WHERE "userId"=$1 AND "providerId"=$2',
        [actor, "credential"],
      );
      await db.query('DELETE FROM identity.sessions WHERE "userId"=$1', [
        actor,
      ]);
    } catch {
      console.error(
        JSON.stringify({
          event: "atlas_staging_test_identity_retirement_failed",
        }),
      );
      process.exitCode = 1;
    }
  }
  await db.end().catch(() => {});
}
if (!process.exitCode)
  console.log("PASS Atlas staging post-rotation acceptance");
