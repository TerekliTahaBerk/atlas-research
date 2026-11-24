import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright";
import { createAuth } from "../src/server/auth/create-auth";
import { requireIdentity } from "../src/server/auth/identity";
import { createComputeWorker } from "../src/server/compute/worker";
import { createDatabase } from "../src/server/db/client";
import { createInvitation } from "../src/server/domain/invitations";
import { createProject } from "../src/server/domain/projects";
import { createSharedWorkspace } from "../src/server/domain/workspaces";
import { getEnv } from "../src/server/env";
import { createMailQueue } from "../src/server/mail/outbox";
import { verifiedUser } from "../tests/helpers/identity";
import { startMailServer } from "../tests/helpers/mail";

if (
  process.env.NODE_ENV !== "test" ||
  !process.env.MIGRATION_DATABASE_URL?.includes("/atlas_test")
)
  throw new Error("Disposable PostgreSQL harness required");

const runnerUrl = process.env.ATLAS_TEST_COMPUTE_RUNNER_URL;
const runnerToken = process.env.ATLAS_TEST_COMPUTE_RUNNER_TOKEN;
if (!runnerUrl || !runnerToken || new URL(runnerUrl).hostname !== "127.0.0.1")
  throw new Error("An isolated loopback compute runner is required");

const probe = createServer();
await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
const address = probe.address();
if (!address || typeof address === "string")
  throw new Error("Test port unavailable");
await new Promise<void>((done) => probe.close(() => done()));

const origin = `http://127.0.0.1:${address.port}`;
const artifacts = await mkdtemp(join(tmpdir(), "atlas-compute-browser-"));
const smtp = await startMailServer();
Object.assign(process.env, {
  APP_ORIGIN: origin,
  MAIL_DELIVERY: "smtp",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: String(smtp.port),
  SMTP_SECURE: "false",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  MAIL_FROM: "compute-test@example.invalid",
  ATLAS_AI_CALLS_ENABLED: "false",
  ATLAS_RESOURCE_LIMITS_ENABLED: "1",
  ATLAS_COMPUTE_ENABLED: "1",
  ATLAS_COMPUTE_RUNNER_URL: runnerUrl,
  ATLAS_COMPUTE_RUNNER_TOKEN: runnerToken,
});
const env = getEnv();
const authDb = createDatabase(env.AUTH_DATABASE_URL);
const db = createDatabase(env.DATABASE_URL);
const mail = createMailQueue(env);
const auth = createAuth(authDb, env, mail);
const worker = createComputeWorker(process.env);
const errors: string[] = [];
let stage = "worker startup";
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let app: ReturnType<typeof spawn> | undefined;
let timer: NodeJS.Timeout | undefined;
let heartbeatTimer: NodeJS.Timeout | undefined;

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto(origin + "/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/home");
}

function observe(page: Page) {
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) => errors.push(error.name));
  page.on("console", (entry) => {
    if (
      entry.type() === "error" &&
      !/Failed to load resource/.test(entry.text())
    )
      errors.push("console-error");
  });
}

try {
  assert.equal(await worker.refreshHealth(true), true);
  timer = setInterval(
    () => void worker.cycle().catch(() => errors.push("worker-cycle")),
    150,
  );
  heartbeatTimer = setInterval(
    () =>
      void worker
        .refreshHealth(true)
        .catch(() => errors.push("worker-heartbeat")),
    5000,
  );
  stage = "fixture setup";
  const owner = await verifiedUser(auth, mail, smtp);
  const reader = await verifiedUser(auth, mail, smtp);
  const actor = await requireIdentity(auth, owner.headers);
  const workspaceId = (
    await createSharedWorkspace(db, actor, {
      name: "Compute verification workspace",
      requestId: randomUUID(),
    })
  ).id;
  const projectId = (
    await createProject(db, actor, workspaceId, {
      name: "Synthetic compute project",
      description: "Isolated Python and LaTeX verification.",
      requestId: randomUUID(),
    })
  ).id;
  const projectPath = `/w/${workspaceId}/p/${projectId}`;
  const computePath = projectPath + "/compute";
  const scope = new URLSearchParams({ workspaceId, projectId }).toString();

  app = spawn(
    process.execPath,
    [
      resolve("node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(address.port),
    ],
    { env: process.env, stdio: "ignore" },
  );
  let ready = false;
  for (let attempt = 0; attempt < 100 && !ready; attempt++) {
    try {
      ready = (await fetch(origin + "/health/live")).ok;
    } catch {}
    if (!ready) await new Promise((done) => setTimeout(done, 100));
  }
  assert.equal(ready, true);

  browser = await chromium.launch({
    headless: true,
    channel: process.env.ATLAS_TEST_CHROMIUM_CHANNEL || undefined,
  });
  const ownerContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const readerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await ownerContext.newPage();
  const viewer = await readerContext.newPage();
  observe(page);
  observe(viewer);

  stage = "authenticated Python execution";
  await login(page, owner);
  await page.goto(origin + projectPath);
  await page
    .getByRole("complementary", { name: "Workspace navigation" })
    .getByRole("link", { name: "Compute", exact: true })
    .click();
  await page.waitForURL("**/compute");
  await page.getByRole("heading", { name: "Compute", exact: true }).waitFor();
  const pythonSource = page.getByRole("textbox", {
    name: "Python source",
    exact: true,
  });
  const runPython = page.getByRole("button", {
    name: "Run Python",
    exact: true,
  });
  await pythonSource.fill("ş".repeat(16_385));
  await page
    .getByText("Reduce the source size before submitting.", { exact: true })
    .waitFor();
  assert.equal(await runPython.isEnabled(), false);
  await pythonSource.fill("print('Atlas Python total:', sum([4, 7, 9, 10]))");
  await runPython.click();
  const pythonResult = page.getByRole("region", {
    name: "Python output",
    exact: true,
  });
  await pythonResult
    .getByText("Completed", { exact: true })
    .waitFor({ timeout: 30_000 });
  assert.match(
    await pythonResult.getByLabel("Standard output").innerText(),
    /Atlas Python total: 30/,
  );

  stage = "authenticated LaTeX and PDF download";
  await page.getByRole("button", { name: "LaTeX", exact: true }).click();
  await page.getByRole("textbox", { name: "LaTeX source", exact: true })
    .fill(String.raw`\documentclass{article}
\begin{document}
A synthetic proof of compilation.
\end{document}
`);
  await page
    .getByRole("button", { name: "Compile LaTeX", exact: true })
    .click();
  const latexResult = page.getByRole("region", {
    name: "LaTeX output",
    exact: true,
  });
  const downloadLink = latexResult.getByRole("link", {
    name: "Download PDF",
    exact: true,
  });
  await downloadLink.waitFor({ timeout: 35_000 });
  const downloadUrl = await downloadLink.getAttribute("href");
  assert.ok(downloadUrl);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    downloadLink.click(),
  ]);
  assert.equal(download.suggestedFilename(), "document.pdf");
  const downloadedPath = await download.path();
  assert.ok(downloadedPath);
  assert.equal(
    (await readFile(downloadedPath)).subarray(0, 5).toString("ascii"),
    "%PDF-",
  );
  await page.screenshot({ path: join(artifacts, "compute-desktop.png") });

  stage = "history reload and mobile";
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const history = page.getByRole("region", {
    name: "Recent jobs",
    exact: true,
  });
  await history.getByRole("button", { name: /^Python.*Completed/ }).click();
  await pythonResult
    .getByText("Atlas Python total: 30", { exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: join(artifacts, "compute-mobile.png") });

  stage = "runtime cutoff and user feedback";
  await pythonSource.fill("import time\ntime.sleep(3)");
  await page
    .getByRole("spinbutton", { name: "Runtime limit (seconds)", exact: true })
    .fill("0.5");
  await runPython.click();
  await pythonResult
    .getByText("Timed out", { exact: true })
    .waitFor({ timeout: 20_000 });
  await pythonResult.getByText(/The job reached its runtime limit/).waitFor();

  stage = "viewer and private job access";
  await login(viewer, reader);
  assert.equal(
    (await viewer.request.get(origin + "/api/compute?" + scope)).status(),
    404,
  );
  await createInvitation(db, actor, mail, origin, workspaceId, projectId, {
    email: reader.email,
    role: "viewer",
  });
  await mail.flush();
  await viewer.goto(
    smtp.latest(reader.email, "Your Atlas project invitation").href,
  );
  await viewer
    .getByRole("button", { name: "Accept invitation", exact: true })
    .click();
  await viewer.waitForURL(origin + projectPath);
  await viewer.goto(origin + computePath);
  await viewer
    .getByText(/This project is read only for your account/)
    .waitFor();
  assert.equal(
    await viewer
      .getByRole("button", { name: "Run Python", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await viewer
      .getByRole("button", { name: "Compile LaTeX", exact: true })
      .count(),
    0,
  );
  await viewer
    .getByText("No compute jobs for this project yet.", { exact: true })
    .waitFor();
  assert.equal(
    (await viewer.request.get(new URL(downloadUrl, origin).href)).status(),
    404,
  );
  assert.equal(
    await viewer.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: production browser Python output, real LaTeX PDF, timeout, authenticated reload, viewer isolation and 390 px layout.",
  );
  console.log(`Synthetic screenshot evidence: ${artifacts}`);
} catch (problem) {
  console.error(
    `FAIL: compute browser at ${stage}; ${problem instanceof Error ? problem.name : "Error"}.`,
  );
  if (errors.length) console.error({ browserOrWorkerErrorClasses: errors });
  for (const [index, page] of (
    browser?.contexts().flatMap((context) => context.pages()) ?? []
  ).entries())
    await page
      .screenshot({ path: join(artifacts, `failure-${index}.png`) })
      .catch(() => {});
  console.log(`Synthetic failure evidence: ${artifacts}`);
  process.exitCode = 1;
} finally {
  clearInterval(timer);
  clearInterval(heartbeatTimer);
  await browser?.close();
  app?.kill("SIGTERM");
  await Promise.all([
    worker.close(),
    authDb.$disconnect(),
    db.$disconnect(),
    mail.close(),
    smtp.close(),
  ]);
}
