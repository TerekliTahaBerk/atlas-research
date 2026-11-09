import { chromium, type Page } from "playwright";
import { spawn } from "node:child_process";
import { createServer as socketServer } from "node:net";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { getEnv } from "../src/server/env";
import { createDatabase } from "../src/server/db/client";
import { createAuth } from "../src/server/auth/create-auth";
import { requireIdentity } from "../src/server/auth/identity";
import { createMailQueue } from "../src/server/mail/outbox";
import { createFileWorker } from "../src/server/files/worker";
import { createSharedWorkspace } from "../src/server/domain/workspaces";
import { createProject } from "../src/server/domain/projects";
import { addSource, getSource } from "../src/server/research/library";
import { uploadPdf } from "../src/server/research/storage";
import { createDocument } from "../src/server/collaboration/service";
import { verifiedUser } from "../tests/helpers/identity";
import { startMailServer } from "../tests/helpers/mail";
import { syntheticPdf } from "../tests/helpers/pdf";
import { asIdentity } from "../src/server/db/transaction";
import {
  contextData,
  providerInput,
  validateAnswer,
  getPolicy,
  setPolicy,
  startRun,
  preview,
  getConversation,
} from "../src/server/ai/service";
import { MODEL } from "../src/server/ai/provider";
if (
  process.env.NODE_ENV !== "test" ||
  !process.env.MIGRATION_DATABASE_URL?.includes("/atlas_test")
)
  throw new Error("Disposable harness required");
const socket = socketServer();
await new Promise<void>((r) => socket.listen(0, "127.0.0.1", r));
const port = (socket.address() as { port: number }).port;
await new Promise<void>((r) => socket.close(() => r()));
let calls = 0;
const mock = createServer(async (req, res) => {
  if (req.url !== "/v1/responses") {
    res.writeHead(404).end();
    return;
  }
  let raw = "";
  for await (const c of req) raw += c;
  const body = JSON.parse(raw),
    input = JSON.parse(body.input);
  assert.equal(body.store, false);
  assert.deepEqual(body.tools, []);
  assert.equal(body.model, MODEL);
  calls++;
  const e = input.evidence[0];
  const answer = {
    status: "answered",
    segments: [
      {
        text: "The controlled source describes connected research.",
        citations: [{ evidenceId: e.id, quote: e.quote.slice(0, 60) }],
      },
    ],
    limitations:
      "LOCAL SYNTHETIC TEST: adapter fixture, not a real model answer.",
  };
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      status: "completed",
      model: MODEL,
      usage: { input_tokens: 100, output_tokens: 70 },
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(answer) }],
        },
      ],
    }),
  );
});
await new Promise<void>((r) => mock.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${port}`,
  folder = mkdtempSync(join(tmpdir(), "atlas-ai-browser-")),
  smtp = await startMailServer();
process.env.APP_ORIGIN = origin;
process.env.SMTP_PORT = String(smtp.port);
process.env.FILE_STORAGE_PATH = join(folder, "private-files");
process.env.ATLAS_AI_CALLS_ENABLED = "true";
process.env.OPENAI_API_KEY = "atlas-synthetic-fixture";
process.env.ATLAS_AI_TEST_ORIGIN = `http://127.0.0.1:${(mock.address() as { port: number }).port}`;
const env = getEnv(),
  authDb = createDatabase(env.AUTH_DATABASE_URL),
  db = createDatabase(env.DATABASE_URL),
  mail = createMailQueue(env),
  auth = createAuth(authDb, env, mail),
  worker = createFileWorker(process.env),
  owner = await verifiedUser(auth, mail, smtp),
  a = await requireIdentity(auth, owner.headers),
  w = (
    await createSharedWorkspace(db, a, {
      name: "AI fixture workspace",
      requestId: randomUUID(),
    })
  ).id,
  p = (
    await createProject(db, a, w, {
      name: "Evidence verification",
      requestId: randomUUID(),
    })
  ).id;
const source = (
    await addSource(db, a, w, p, {
      title: "Controlled connected research paper",
      authors: ["Synthetic Researcher"],
      year: 2026,
      venue: "Local test fixture",
      doi: "10.1234/ai-browser-fixture",
      url: null,
      abstract: "Synthetic fixture only.",
    })
  ).source,
  bytes = syntheticPdf("A stable source for connected research writing."),
  upload = await uploadPdf(
    new Request(origin + "/upload", {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/pdf",
        "content-length": String(bytes.length),
        "x-file-name": "synthetic.pdf",
      },
      body: new Uint8Array(bytes),
    }),
    db,
    a,
    w,
    p,
    source.id,
    randomUUID(),
  );
await worker.heartbeat();
await worker.flush();
assert.ok(
  (await getSource(db, a, w, p, source.id)).versions.some(
    (v) => v.id === upload.versionId && v.extractionStatus === "ready",
  ),
);
const doc = await createDocument(db, a, w, p, {
    requestId: randomUUID(),
    title: "Reviewed synthesis target",
  }),
  path = `/w/${w}/p/${p}`;
const server = spawn(
  process.execPath,
  [
    resolve("node_modules/next/dist/bin/next"),
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  { env: process.env, stdio: ["ignore", "ignore", "pipe"] },
);
server.stderr.on("data", () => {});
const heartbeat = setInterval(() => {
  void Promise.all([worker.heartbeat(), mail.heartbeat()]).catch(() => {});
}, 5000);
const browser = await chromium.launch({ headless: true }),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    recordVideo: {
      dir: resolve(".atlas-local/island-recording"),
      size: { width: 1440, height: 1000 },
    },
  }),
  page = await context.newPage();
page.setDefaultTimeout(15000);
page.setDefaultNavigationTimeout(20000);
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.name));
page.on("console", (e) => {
  if (
    e.type() === "error" &&
    !/Failed to load resource|net::ERR_FAILED|Executing inline (?:script|event handler) violates/.test(
      e.text(),
    )
  )
    errors.push("console-error");
});
async function login(target: Page) {
  await target.goto(origin + "/sign-in");
  await target.getByLabel("Email", { exact: true }).fill(owner.email);
  await target.getByLabel("Password", { exact: true }).fill(owner.password);
  await target.getByRole("button", { name: "Sign in", exact: true }).click();
  await target.waitForURL("**/home");
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + "/health/live")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(
    "Browser plugin not available; persistent AI island, no provider calls.",
  );
  await login(page);
  await page.goto(origin + path + "/sources");
  const artifactPreview = await context.request.post(
    origin + `/api/ai/${w}/${p}/preview`,
    {
      headers: { origin },
      data: {
        conversationId: null,
        versionIds: [],
        artifactIds: [doc.id],
        question: "Review this document.",
      },
    },
  );
  assert.equal(artifactPreview.status(), 200);
  const snapshot = await artifactPreview.json();
  const stored = await (
    await context.request.get(
      origin +
        `/api/ai/${w}/${p}/conversations/${snapshot.context.conversationId}`,
    )
  ).json();
  assert.equal(stored.contexts[0].artifacts[0].revision, doc.revision);
  assert.equal(stored.contexts[0].artifacts[0].id, doc.id);
  const grounded = await asIdentity(db, a, async (tx) =>
    providerInput(await contextData(tx, a, w, p, snapshot.context.id)),
  );
  const evidence = grounded.evidence.find((e) => e.id === doc.id)!;
  assert.ok(evidence.quote.includes(doc.title));
  assert.equal(
    validateAnswer(
      {
        status: "answered",
        segments: [
          {
            text: "Controlled synthesis",
            citations: [
              { evidenceId: doc.id, quote: evidence.quote.slice(0, 24) },
            ],
          },
        ],
        limitations: "Synthetic validation",
      },
      grounded.evidence,
    ).status,
    "answered",
  );
  assert.throws(() =>
    validateAnswer(
      {
        status: "answered",
        segments: [
          {
            text: "Invalid",
            citations: [
              {
                evidenceId: randomUUID(),
                quote: "Unsupported fabricated quote",
              },
            ],
          },
        ],
        limitations: "",
      },
      grounded.evidence,
    ),
  );
  const denied = await context.request.post(
    origin + `/api/ai/${w}/${p}/preview`,
    {
      headers: { origin },
      data: {
        conversationId: null,
        versionIds: [],
        artifactIds: [randomUUID()],
        question: "Unavailable research",
      },
    },
  );
  assert.equal(denied.status(), 404);

  await page.locator(".ai-island").waitFor();
  const input = page.getByLabel("Research question", { exact: true });
  await input.fill("Compare the controlled evidence.");
  for (const name of ["Floating AI", "Focus AI", "Dock AI", "Compact AI"]) {
    await page.getByLabel(name, { exact: true }).click();
    assert.equal(await input.inputValue(), "Compare the controlled evidence.");
  }
  await page.getByLabel("Floating AI", { exact: true }).click();
  await page
    .getByRole("checkbox", { name: /Controlled connected research paper · v2/ })
    .check();
  await page
    .getByRole("button", { name: "Preview evidence", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Evidence from your papers", exact: true })
    .waitFor();
  assert.equal(calls, 0);
  await page.waitForFunction(
    () =>
      !!document.querySelector<HTMLSelectElement>(
        '[aria-label="Private AI history"]',
      )?.value,
  );
  const historyId = await page.getByLabel("Private AI history").inputValue();
  await input.fill("Draft remains across research routes.");
  for (const route of ["/tasks", "/docs", "/sources"]) {
    await page
      .locator(`a[href="${path + route}"]`)
      .first()
      .click();
    await page.waitForURL("**" + path + route);
    assert.equal(
      await input.inputValue(),
      "Draft remains across research routes.",
    );
    assert.equal(
      await page.getByLabel("Private AI history").inputValue(),
      historyId,
    );
  }
  for (const name of ["Compact AI", "Floating AI", "Focus AI", "Dock AI"]) {
    await page.getByLabel(name, { exact: true }).click();
    await page.waitForTimeout(250);
    await page.screenshot({
      path: resolve(
        ".atlas-local/island-" + name.split(" ")[0].toLowerCase() + ".png",
      ),
    });
  }
  const policy = await getPolicy(db, a, w);
  await setPolicy(db, a, w, {
    revision: policy.revision,
    enabled: true,
    dailyBudgetMicros: 1000000,
    termsVersion: policy.terms,
  });
  const queuedContext = await preview(db, a, w, p, {
    conversationId: historyId,
    versionIds: [upload.versionId!],
    question: "What stable source supports connected research?",
  });
  const queued = await startRun(db, a, w, p, {
    contextId: queuedContext.context.id,
    requestId: randomUUID(),
    consent: true,
  });
  await page.getByLabel("Floating AI", { exact: true }).click();
  await page
    .getByRole("button", { name: "Refresh history", exact: true })
    .click();
  await page.getByText("Request in progress", { exact: true }).waitFor();
  for (const mode of ["Compact AI", "Focus AI", "Dock AI", "Floating AI"]) {
    await page.getByLabel(mode, { exact: true }).click();
    const current = await getConversation(db, a, w, p, historyId);
    assert.equal(current.contexts.at(-1)?.run?.id, queued.id);
    assert.equal(current.contexts.at(-1)?.run?.state, "queued");
  }
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/runs/${queued.id}/cancel`) && r.status() === 200,
    ),
    page.getByRole("button", { name: "Cancel request", exact: true }).click(),
  ]);
  assert.equal(
    (await getConversation(db, a, w, p, historyId)).contexts.at(-1)?.run?.state,
    "cancelled",
  );
  assert.equal(calls, 0);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByLabel("Focus AI", { exact: true }).click();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: resolve(".atlas-local/island-narrow.png") });
  assert.deepEqual(errors, []);
  console.log(
    "PASS persistent modes/draft/conversation/routes, narrow, zero provider calls",
  );
} catch (e) {
  await page.screenshot({ path: resolve(".atlas-local/island-failure.png") });
  console.error(
    "FAIL island",
    e instanceof Error ? e.message.slice(0, 350) : "unknown",
  );
  process.exitCode = 1;
} finally {
  clearInterval(heartbeat);
  await browser.close();
  server.kill("SIGTERM");
  await Promise.all([
    authDb.$disconnect(),
    db.$disconnect(),
    mail.close(),
    worker.close(),
    smtp.close(),
    new Promise<void>((r) => mock.close(() => r())),
  ]);
  rmSync(folder, { recursive: true, force: true });
}
