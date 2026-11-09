import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { getEnv } from "../src/server/env";
import { createDatabase } from "../src/server/db/client";
import { createAuth } from "../src/server/auth/create-auth";
import { createMailQueue } from "../src/server/mail/outbox";
import { createFileWorker } from "../src/server/files/worker";
import { verifiedUser } from "../tests/helpers/identity";
import { startMailServer } from "../tests/helpers/mail";
if (
  process.env.NODE_ENV !== "test" ||
  !process.env.MIGRATION_DATABASE_URL?.includes("/atlas_test")
)
  throw new Error("Disposable harness required");
const socket = createServer();
await new Promise<void>((r) => socket.listen(0, "127.0.0.1", r));
const port = (socket.address() as { port: number }).port;
await new Promise<void>((r) => socket.close(() => r()));
const origin = `http://127.0.0.1:${port}`,
  folder = mkdtempSync(join(tmpdir(), "atlas-library-browser-")),
  smtp = await startMailServer();
process.env.APP_ORIGIN = origin;
process.env.SMTP_PORT = String(smtp.port);
process.env.FILE_STORAGE_PATH = join(folder, "private-files");
const env = getEnv(),
  authDb = createDatabase(env.AUTH_DATABASE_URL),
  mail = createMailQueue(env),
  auth = createAuth(authDb, env, mail),
  worker = createFileWorker(process.env);
const user = await verifiedUser(auth, mail, smtp),
  server = spawn(
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
const timer = setInterval(
    () =>
      void worker
        .heartbeat()
        .then(() => worker.flush())
        .catch(() => {}),
    250,
  ),
  browser = await chromium.launch({ headless: true }),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.name));
page.on("console", (e) => {
  if (
    e.type() === "error" &&
    !/Failed to load resource:.*\b(401|403|404|429)\b/.test(e.text())
  )
    errors.push("console-error");
});
let stage = "start";
try {
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(origin + "/health/live")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(
    "Browser plugin not available; Playwright Chromium, production build and disposable PostgreSQL. Public CC-BY PLOS paper used temporarily, never committed.",
  );
  async function login() {
    await page.goto(origin + "/sign-in");
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/home");
  }
  await login();
  assert.equal(await page.title(), "Atlas Research");
  const headers = { origin },
    me = await (await context.request.get(origin + "/api/me")).json(),
    w = me.personalWorkspace.id;
  const response = await context.request.post(origin + "/api/projects", {
    headers,
    data: {
      workspaceId: w,
      name: "Phase 02 reading verification",
      description: "Public paper and controlled verification notes",
      requestId: randomUUID(),
    },
  });
  assert.equal(response.ok(), true);
  const p = (await response.json()).id,
    path = `/w/${w}/p/${p}`,
    base = `${origin}/api/research/${w}/${p}`;
  stage = "real Crossref search and save";
  await page.goto(origin + path + "/discover");
  await page
    .getByLabel("Search academic papers")
    .fill("The Extent and Consequences of P-Hacking in Science");
  await page
    .getByRole("button", { name: "Search papers", exact: true })
    .click();
  const paper = page
    .locator(".paper-row")
    .filter({ hasText: "10.1371/journal.pbio.1002106" })
    .first();
  await paper
    .getByRole("button", { name: "Save to library", exact: true })
    .click();
  await paper
    .getByRole("link", { name: "Open saved source", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "The Extent and Consequences of P-Hacking in Science",
      exact: true,
    })
    .waitFor();
  const s = new URL(page.url()).pathname.split("/").at(-1)!;
  const detail = await (
      await context.request.get(`${base}/sources/${s}`)
    ).json(),
    duplicate = await context.request.post(`${base}/sources`, {
      headers,
      data: detail.source,
    });
  assert.equal((await duplicate.json()).source.id, s);
  assert.equal(
    (await (await context.request.get(`${base}/sources`)).json()).items.length,
    1,
  );
  stage = "PDF upload and text reader";
  await page.getByRole("button", { name: "Upload PDF", exact: true }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles("/private/tmp/atlas-phase02-paper.pdf");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Upload PDF", exact: true })
    .click();
  await page.waitForURL("**/read?version=*");
  await page
    .locator(".textLayer span")
    .filter({ hasText: "P-Hacking" })
    .first()
    .waitFor();
  await page.locator(".pdf-paper").waitFor({ state: "visible" });
  stage = "highlight and note";
  const span = page
    .locator(".textLayer span")
    .filter({ hasText: "P-Hacking" })
    .first();
  await span.evaluate((node) => {
    const r = document.createRange();
    r.selectNodeContents(node);
    const s = getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
  });
  await page.locator(".pdf-scroll").dispatchEvent("mouseup");
  await page
    .getByLabel("Annotation note", { exact: true })
    .fill("A persistent observation on the public paper.");
  await page
    .getByRole("button", { name: "Save highlight", exact: true })
    .click();
  await page
    .locator(".annotation-card")
    .filter({ hasText: "A persistent observation" })
    .waitFor();
  await page.getByLabel("PDF page", { exact: true }).fill("2");
  await page
    .getByLabel("Annotation note", { exact: true })
    .fill("Page two note survives a new session.");
  await page
    .getByRole("button", { name: "Save page note", exact: true })
    .click();
  await page
    .locator(".annotation-card")
    .filter({ hasText: "Page two note" })
    .waitFor();
  await page.getByLabel("PDF zoom", { exact: true }).selectOption("1.25");
  await page
    .getByRole("status")
    .filter({ hasText: "Reading position saved" })
    .waitFor();
  await page.screenshot({ path: join(folder, "reader-desktop.png") });
  stage = "reload and re-login persistence";
  const readerUrl = page.url().split("?")[0];
  await page.reload();
  await page
    .locator(".annotation-card")
    .filter({ hasText: "Page two note" })
    .waitFor();
  await context.request.post(origin + "/api/auth/sign-out", {
    headers,
    data: {},
  });
  await login();
  await page.goto(readerUrl);
  await page
    .locator(".annotation-card")
    .filter({ hasText: "A persistent observation" })
    .waitFor();
  assert.equal(
    await page.getByLabel("PDF page", { exact: true }).inputValue(),
    "2",
  );
  assert.equal(
    await page.getByLabel("PDF zoom", { exact: true }).inputValue(),
    "1.25",
  );
  stage = "private range and export";
  const persisted = await (
      await context.request.get(`${base}/sources/${s}`)
    ).json(),
    v = persisted.versions.find((v: { fileId: string | null }) => v.fileId),
    file = `${base}/sources/${s}/versions/${v.id}/file`;
  assert.equal(
    (
      await context.request.get(file, { headers: { range: "bytes=0-15" } })
    ).status(),
    206,
  );
  const anon = await browser.newContext();
  assert.equal((await anon.request.get(file)).status(), 401);
  await anon.close();
  assert.equal(
    (
      await context.request.get(file.replace(`/${p}/`, `/${randomUUID()}/`))
    ).status(),
    404,
  );
  for (const format of ["bib", "ris"]) {
    const exported = await context.request.get(
      `${base}/export?format=${format}`,
    );
    assert.equal(exported.status(), 200);
    assert.match(await exported.text(), /10.1371\/journal.pbio.1002106/);
  }
  stage = "library organization and narrow reader";
  await context.request.post(`${base}/collections`, {
    headers,
    data: { name: "Methods" },
  });
  await page.goto(origin + path + `/sources/${s}`);
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await page.getByLabel("Tags", { exact: false }).fill("methods");
  await page.getByLabel("Methods", { exact: true }).check();
  await page
    .getByRole("button", { name: "Save source details", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.goto(origin + path + "/sources");
  await page.locator(".paper-row").waitFor();
  await page.screenshot({ path: join(folder, "library-desktop.png") });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.reload();
  await page.locator(".paper-row").waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: join(folder, "library-narrow.png"),
    fullPage: true,
  });
  await page.goto(readerUrl);
  await page.locator(".pdf-paper").waitFor({ state: "visible" });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.getByRole("button", { name: "Notes (2)", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByText("Page two note survives a new session.", { exact: true })
    .waitFor();
  await page.screenshot({ path: join(folder, "reader-narrow-notes.png") });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.screenshot({ path: join(folder, "reader-narrow.png") });
  assert.deepEqual(errors, []);
  assert.ok(
    readFileSync("/private/tmp/atlas-phase02-paper.pdf")
      .subarray(0, 5)
      .toString() === "%PDF-",
  );
  console.log(
    "PASS: real Crossref paper, dedupe, PDF upload/render/selection, highlight+page note, reload/re-login reading persistence, authorized range, anonymous/wrong-project denial, exports, tags/collection, desktop+narrow UI, no framework/page/console errors.",
  );
  console.log(`Controlled evidence: ${folder}`);
} catch (error) {
  console.error(
    `FAIL at ${stage}: ${error instanceof Error ? error.name : "Error"}; raw credentials/URLs/provider content omitted.`,
  );
  if (errors.length) console.error({ browserErrorClasses: errors });
  await page.screenshot({ path: join(folder, "failure.png") }).catch(() => {});
  console.log(`Controlled evidence: ${folder}`);
  process.exitCode = 1;
} finally {
  clearInterval(timer);
  await browser.close();
  server.kill("SIGTERM");
  await new Promise<void>((r) => server.once("exit", () => r()));
  await Promise.all([
    authDb.$disconnect(),
    mail.close(),
    worker.close(),
    smtp.close(),
  ]);
}
