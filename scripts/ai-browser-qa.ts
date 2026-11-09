import { chromium, type Page } from "playwright";
import { spawn } from "node:child_process";
import { createServer as socketServer } from "node:net";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, copyFileSync } from "node:fs";
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
import {
  createDocument,
  getDocument,
} from "../src/server/collaboration/service";
import { verifiedUser } from "../tests/helpers/identity";
import { startMailServer } from "../tests/helpers/mail";
import { syntheticPdf } from "../tests/helpers/pdf";
import { asIdentity } from "../src/server/db/transaction";
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
const browser = await chromium.launch({ headless: true }),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage();
page.setDefaultTimeout(15000);
page.setDefaultNavigationTimeout(20000);
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.name));
page.on("console", (e) => {
  if (
    e.type() === "error" &&
    !/Failed to load resource|net::ERR_FAILED/.test(e.text())
  )
    errors.push("console-error");
});
let stage = "start";
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
    "Browser plugin not available; Playwright production build + local synthetic HTTP provider only. No OpenAI request.",
  );
  await login(page);
  assert.equal(await page.title(), "Atlas Research");
  await page.goto(origin + path + "/sources");
  await page.getByRole("button", { name: "Ask Atlas", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Ask Atlas" });
  stage = "scope + free preview";
  await panel
    .getByText("Workspace sharing or its daily budget is disabled.", {
      exact: false,
    })
    .waitFor();
  await panel
    .getByRole("checkbox", { name: /Controlled connected research paper · v2/ })
    .check();
  await panel
    .getByLabel("Research question")
    .fill("What stable source supports connected research?");
  await panel
    .getByRole("button", { name: "Preview evidence", exact: true })
    .click();
  await panel.getByRole("heading", { name: "Review before sharing" }).waitFor();
  assert.equal(calls, 0);
  assert.equal(
    await panel
      .getByRole("button", { name: "Send approved evidence" })
      .isDisabled(),
    true,
  );
  stage = "owner policy";
  await panel.getByRole("button", { name: "Usage & sharing" }).click();
  await panel
    .getByLabel("Enable external AI sharing for this workspace")
    .check();
  await panel.getByLabel("Daily workspace cap").fill("0.10");
  await panel
    .getByLabel("I accept these provider and data conditions.")
    .check();
  await panel.getByRole("button", { name: "Save sharing policy" }).click();
  await panel
    .getByText("Workspace sharing or its daily budget is disabled.", {
      exact: false,
    })
    .waitFor({ state: "hidden" });
  stage = "consent + buffered result";
  await panel
    .getByLabel("I approve sending this question and the displayed excerpts.")
    .check();
  await panel.getByRole("button", { name: "Send approved evidence" }).click();
  await panel
    .getByText("The controlled source describes connected research.", {
      exact: true,
    })
    .waitFor();
  assert.equal(calls, 1);
  await panel
    .getByLabel("Review support for claim 1")
    .selectOption("supported");
  await panel
    .getByText("Scientific support · supported", { exact: false })
    .waitFor();
  const conv = await panel.getByLabel("Private AI history").inputValue();
  assert.ok(conv);
  await panel.getByRole("button", { name: "Usage & sharing" }).click();
  await panel.locator(".ai-content").evaluate((e) => {
    e.scrollTop = 0;
  });
  await page.screenshot({ path: join(folder, "ai-desktop.png") });
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await page.screenshot({ path: join(folder, "ai-dark.png") });
  await page.getByRole("button", { name: "Light theme", exact: true }).click();
  stage = "exact version citation + stable scope";
  await panel.locator(".ai-segment summary").first().click();
  await panel
    .getByRole("link", { name: "Read cited PDF version · page 1" })
    .click();
  await page.waitForURL("**/read?version=" + upload.versionId + "&page=1");
  await page.locator(".pdf-paper canvas").first().waitFor();
  await page.getByRole("complementary", { name: "Ask Atlas" }).waitFor();
  assert.equal(await page.getByLabel("Private AI history").inputValue(), conv);
  stage = "proposal diff apply undo";
  const rail = page.getByRole("complementary", { name: "Ask Atlas" });
  await rail.getByRole("button", { name: "Propose into a document" }).click();
  const dialog = page.getByRole("dialog", { name: "Review document proposal" });
  await dialog.getByLabel("Target document").selectOption(doc.id);
  await dialog.getByRole("button", { name: "Preview proposal" }).click();
  await dialog
    .getByRole("heading", { name: "Proposed", exact: true })
    .waitFor();
  assert.equal((await getDocument(db, a, w, p, doc.id)).document.revision, 1);
  await dialog.getByRole("button", { name: "Apply reviewed proposal" }).click();
  await dialog.getByText("Proposal applied as a new revision.").waitFor();
  assert.equal((await getDocument(db, a, w, p, doc.id)).document.revision, 2);
  await dialog.getByRole("button", { name: "Undo applied proposal" }).click();
  await dialog.getByText("Proposal undone as a new revision.").waitFor();
  assert.equal((await getDocument(db, a, w, p, doc.id)).document.revision, 3);
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  stage = "responsive sheet + keyboard";
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = page.getByRole("dialog", { name: "Ask Atlas" });
  await mobile.waitFor();
  assert.equal(
    await mobile.getByLabel("Private AI history").inputValue(),
    conv,
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: join(folder, "ai-narrow.png") });
  await page.keyboard.press("Escape");
  await mobile.waitFor({ state: "hidden" });
  assert.equal(
    await page
      .getByRole("button", { name: "Ask Atlas", exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  const toggleRect = await page
    .getByRole("button", { name: "Ask Atlas", exact: true })
    .boundingBox();
  assert.ok(
    toggleRect && toggleRect.x >= 0 && toggleRect.x + toggleRect.width <= 390,
  );
  await page.screenshot({ path: join(folder, "ai-reader-narrow.png") });
  stage = "new project closes conversation";
  const p2 = (
    await createProject(db, a, w, {
      name: "Other controlled project",
      requestId: randomUUID(),
    })
  ).id;
  await page.goto(origin + `/w/${w}/p/${p2}`);
  await page.getByRole("button", { name: "Ask Atlas", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("dialog", { name: "Ask Atlas" }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  assert.equal(calls, 1);
  const artifacts = process.env.ATLAS_QA_ARTIFACT_DIR;
  if (artifacts)
    for (const f of [
      "ai-desktop.png",
      "ai-narrow.png",
      "ai-reader-narrow.png",
      "ai-dark.png",
    ])
      copyFileSync(join(folder, f), join(artifacts, "atlas-phase04-" + f));
  console.log(
    "PASS: rendered evidence preview, explicit local policy/consent, one synthetic response, exact PDF citation, private scope across screens, proposal diff/apply/undo, 390px sheet/focus and project reset. Real model evaluation NOT RUN.",
  );
} catch (e) {
  console.error("AI browser failed at " + stage);
  console.error(
    await page.evaluate(() => ({
      url: location.pathname,
      dialogs: [...document.querySelectorAll("dialog")].map((d) => ({
        open: d.open,
        text: d.querySelector("h2")?.textContent,
      })),
      buttons: [...document.querySelectorAll("#atlas-ai-toggle button")].map(
        (b) => ({
          label: b.getAttribute("aria-label"),
          hidden: !b.getClientRects().length,
        }),
      ),
      active: document.activeElement?.tagName,
    })),
  );
  if (process.env.ATLAS_QA_ARTIFACT_DIR)
    await page.screenshot({
      path: join(
        process.env.ATLAS_QA_ARTIFACT_DIR,
        "atlas-phase04-failure.png",
      ),
    });
  console.error({
    syntheticCalls: calls,
    states: await asIdentity(db, a, (tx) =>
      tx.aiRun.findMany({ select: { state: true, error: true } }),
    ),
  });
  throw e;
} finally {
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
