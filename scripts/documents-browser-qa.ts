import { chromium, type Page } from "playwright";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync } from "node:fs";
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
import {
  createInvitation,
  acceptInvitation,
} from "../src/server/domain/invitations";
import { addSource, addAnnotation } from "../src/server/research/library";
import { uploadPdf } from "../src/server/research/storage";
import { verifiedUser } from "../tests/helpers/identity";
import { startMailServer } from "../tests/helpers/mail";
import { syntheticPdf } from "../tests/helpers/pdf";
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
  folder = mkdtempSync(join(tmpdir(), "atlas-documents-browser-")),
  smtp = await startMailServer();
process.env.APP_ORIGIN = origin;
process.env.SMTP_PORT = String(smtp.port);
process.env.FILE_STORAGE_PATH = join(folder, "private-files");
const env = getEnv(),
  authDb = createDatabase(env.AUTH_DATABASE_URL),
  db = createDatabase(env.DATABASE_URL),
  mail = createMailQueue(env),
  auth = createAuth(authDb, env, mail),
  worker = createFileWorker(process.env),
  owner = await verifiedUser(auth, mail, smtp),
  editor = await verifiedUser(auth, mail, smtp),
  viewer = await verifiedUser(auth, mail, smtp),
  outsider = await verifiedUser(auth, mail, smtp);
const [a, b, v] = await Promise.all(
    [owner, editor, viewer].map((u) => requireIdentity(auth, u.headers)),
  ),
  w = (
    await createSharedWorkspace(db, a, {
      name: "Writing verification",
      requestId: randomUUID(),
    })
  ).id,
  p = (
    await createProject(db, a, w, {
      name: "Connected research verification",
      requestId: randomUUID(),
    })
  ).id;
for (const [who, role] of [
  [b, "editor"],
  [v, "viewer"],
] as const) {
  await createInvitation(db, a, mail, origin, w, p, { email: who.email, role });
  await mail.flush();
  await acceptInvitation(
    db,
    who,
    smtp
      .latest(who.email, "Your Atlas project invitation")
      .pathname.split("/")
      .at(-1)!,
  );
}
const source = (
    await addSource(db, a, w, p, {
      title: "Controlled methods paper",
      authors: ["A. Researcher"],
      year: 2026,
      venue: "Verification fixture",
      doi: "10.1234/controlled-writing",
      url: null,
      abstract: "Synthetic metadata for a controlled writing journey.",
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
        "x-file-name": "controlled.pdf",
      },
      body: new Uint8Array(bytes),
    }),
    db,
    a,
    w,
    p,
    source.id,
    randomUUID(),
  ),
  note = await addAnnotation(db, a, w, p, source.id, upload.versionId!, {
    kind: "highlight",
    page: 1,
    body: "Check how the equation supports this observation.",
    quote: "A stable source for connected research writing.",
    rects: [[0.1, 0.1, 0.6, 0.02]],
    color: "yellow",
  });
const metadataOnly = (
  await addSource(db, a, w, p, {
    title: "Metadata-only supporting record",
    authors: ["B. Researcher"],
    year: 2025,
    venue: "Verification fixture",
    doi: "10.1234/controlled-metadata",
    url: null,
    abstract: "",
  })
).source;
const path = `/w/${w}/p/${p}`,
  endpoint = `/api/collaboration/${w}/${p}`,
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
page.setDefaultTimeout(15000);
page.setDefaultNavigationTimeout(20000);
let stage = "start";
const errors: string[] = [];
page.on("pageerror", (e) => {
  errors.push(e.name);
  console.error("Browser exception: " + e.stack);
});
page.on("console", (e) => {
  if (
    e.type() === "error" &&
    !/Failed to load resource|net::ERR_FAILED/.test(e.text())
  ) {
    errors.push("console-error");
    console.error("Browser console: " + e.text());
  }
});
async function login(target: Page, who = owner) {
  await target.goto(origin + "/sign-in");
  await target.getByLabel("Email", { exact: true }).fill(who.email);
  await target.getByLabel("Password", { exact: true }).fill(who.password);
  await target.getByRole("button", { name: "Sign in", exact: true }).click();
  await target.waitForURL("**/home");
}
async function append(target: Page, text: string) {
  const body = target.getByRole("textbox", {
    name: "Document body",
    exact: true,
  });
  await body.focus();
  await body.press(
    process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End",
  );
  await body.press("Enter");
  await body.pressSequentially(text);
}
async function saved(target: Page) {
  await target
    .locator(".save-indicator")
    .filter({ hasText: /^Saved$/ })
    .waitFor({ timeout: 10000 });
}
async function insertMath(kind: "Inline math" | "Block math", latex: string) {
  await page.locator(".editor-insert > summary").click();
  await page.getByRole("button", { name: kind, exact: true }).click();
  await page.getByLabel("LaTeX expression").fill("\\frac{");
  assert.equal(
    await page
      .getByRole("button", { name: "Insert expression", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await page.getByLabel("LaTeX expression").inputValue(),
    "\\frac{",
  );
  await page.getByLabel("LaTeX expression").fill(latex);
  await page
    .getByRole("button", { name: "Insert expression", exact: true })
    .click();
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + "/health/live")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(
    "Browser plugin not available; focused Documents production journey with disposable PostgreSQL, controlled accounts and synthetic PDF. No paid AI.",
  );
  await login(page);
  assert.equal(await page.title(), "Atlas Research");
  stage = "create, real writing and formatting";
  console.log("Stage: " + stage);
  await page.goto(origin + path + "/docs");
  await page
    .getByRole("button", { name: "New document", exact: true })
    .first()
    .click();
  const title = "Research writing — transparent evidence synthesis";
  await page.getByLabel("Document title", { exact: true }).fill(title);
  await page
    .getByRole("button", { name: "Create document", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Document body", exact: true })
    .waitFor();
  const docUrl = page.url(),
    docId = new URL(docUrl).pathname.split("/").at(-1)!,
    docApi = origin + endpoint + "/documents/" + docId;
  const getDoc = async () => await (await context.request.get(docApi)).json();
  const body = page.getByRole("textbox", {
    name: "Document body",
    exact: true,
  });
  await body.fill(
    "This controlled review examines transparent reporting and evidence synthesis. These are working notes, not experimental findings.",
  );
  await append(page, "Research question");
  await page.getByLabel("Text style").selectOption("2");
  await body.press("Enter");
  await body.pressSequentially(
    "How can a review preserve uncertainty while tracing each claim to its original source?",
  );
  await body.press("ControlOrMeta+Shift+ArrowLeft");
  await page
    .locator(".selection-toolbar")
    .getByRole("button", { name: "Bold", exact: true })
    .click();
  await body.press("ArrowRight");
  await append(page, "Review steps");
  await page.locator(".editor-insert > summary").click();
  await page.getByRole("button", { name: "Bullet list", exact: true }).click();
  await body.press("Enter");
  await body.pressSequentially("Compare assumptions");
  await body.press("Tab");
  await body.press("Shift+Tab");
  await body.press("Enter");
  await body.press("Enter");
  await page.locator(".editor-insert > summary").click();
  await page.getByRole("button", { name: "Divider", exact: true }).click();
  await insertMath("Inline math", "\\frac{p}{1-p}");
  const matrix =
    "\\begin{bmatrix} \\sum_{i=1}^{n} x_i & \\int_0^1 x^2\\,dx \\\\ \\frac{a_1^2}{b} & 0 \\end{bmatrix}";
  await insertMath("Block math", matrix);
  await page.locator(".katex").first().waitFor();
  await saved(page);
  assert.ok((await getDoc()).document.body.content.length > 2);
  stage = "library source, PDF-note quotation and exact citation";
  console.log("Stage: " + stage);
  await page
    .locator(".document-controls")
    .getByRole("button", { name: "Sources", exact: true })
    .click();
  await page.getByRole("button", { name: "Add citation", exact: true }).click();
  await page.getByLabel("Find a source").fill("Metadata-only");
  await page
    .getByLabel("Source", { exact: true })
    .selectOption(metadataOnly.id);
  await page.getByLabel("Source version", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Insert citation", exact: true })
    .click();
  await page.locator(".document-citation").first().waitFor();
  await page.getByRole("button", { name: "Add citation", exact: true }).click();
  await page.getByLabel("Source", { exact: true }).selectOption(source.id);
  await page.getByLabel("PDF note (optional)").selectOption(note.id);
  await page.getByLabel("Include selected quotation").check();
  await page
    .getByRole("button", { name: "Insert citation", exact: true })
    .click();
  await saved(page);
  assert.ok((await body.innerText()).includes(note.quote));
  const linked = (await getDoc()).citations.find(
    (c: { annotationId: string }) => c.annotationId === note.id,
  );
  assert.equal(linked.versionId, upload.versionId);
  await page.locator(`[data-atlas-citation="${linked.id}"]`).click();
  await page
    .getByRole("link", { name: "Read PDF location", exact: true })
    .click();
  await page.waitForURL("**/read?*");
  assert.equal(new URL(page.url()).searchParams.get("annotation"), note.id);
  assert.equal(
    new URL(page.url()).searchParams.get("version"),
    upload.versionId,
  );
  await page.goto(docUrl);
  await body.waitFor();
  stage = "checkpoint, non-destructive preview and restore";
  console.log("Stage: " + stage);
  await page
    .locator(".document-controls")
    .getByRole("button", { name: "History", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save checkpoint", exact: true })
    .click();
  await saved(page);
  await append(
    page,
    "A temporary alternative interpretation for history comparison.",
  );
  await saved(page);
  const beforeRestore = (await getDoc()).document.revision;
  await page.locator(".version-list button").first().click();
  assert.ok((await body.innerText()).includes("temporary alternative"));
  await page
    .getByRole("button", { name: "Restore as a new revision", exact: true })
    .click();
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  await saved(page);
  await page.waitForFunction(
    () =>
      !document
        .querySelector('.document-page [aria-label="Document body"]')
        ?.textContent?.includes("temporary alternative"),
  );
  assert.ok((await getDoc()).document.revision > beforeRestore);
  stage = "lost save acknowledgement, retained input and idempotent retry";
  console.log("Stage: " + stage);
  let lost = false,
    lostRevision = 0;
  await page.route(docApi, async (route) => {
    if (
      route.request().method() === "PATCH" &&
      !lost &&
      route.request().postDataJSON().action === "save"
    ) {
      const r = await route.fetch();
      assert.equal(r.status(), 200);
      lostRevision = (await r.json()).revision;
      lost = true;
      await route.abort();
    } else await route.continue();
  });
  await append(page, "Network recovery must preserve this accepted paragraph.");
  await page.getByRole("button", { name: "Retry save", exact: true }).waitFor();
  assert.ok((await body.innerText()).includes("Network recovery"));
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await saved(page);
  assert.equal((await getDoc()).document.revision, lostRevision);
  await page.unroute(docApi);
  stage = "two-session conflict retains both and checkpoints server copy";
  console.log("Stage: " + stage);
  const ec = await browser.newContext(),
    ep = await ec.newPage();
  await login(ep, editor);
  await ep.goto(docUrl);
  await ep
    .getByRole("textbox", { name: "Document body", exact: true })
    .waitFor();
  await append(ep, "Other session: a preserved alternative argument.");
  await saved(ep);
  await append(page, "My session: a separate argument to recover.");
  const conflict = page.getByRole("dialog", {
    name: "Recover your writing",
    exact: true,
  });
  await conflict.waitFor();
  assert.ok(
    (
      await conflict.getByLabel("Your draft", { exact: true }).inputValue()
    ).includes("My session"),
  );
  assert.ok(
    (
      await conflict.getByLabel("Server copy", { exact: true }).inputValue()
    ).includes("Other session"),
  );
  const dl = page.waitForEvent("download");
  await conflict
    .getByRole("button", { name: "Download server copy", exact: true })
    .click();
  assert.ok(await (await dl).path());
  await conflict
    .getByRole("button", { name: "Keep my draft and resume", exact: true })
    .click();
  await conflict.waitFor({ state: "hidden" });
  await saved(page);
  const recovered = await getDoc();
  assert.ok(JSON.stringify(recovered.document.body).includes("My session"));
  let kept = false;
  for (const v of recovered.versions) {
    const r = await (
      await context.request.get(docApi + "/versions/" + v.id)
    ).json();
    if (JSON.stringify(r.version.body).includes("Other session")) kept = true;
  }
  assert.equal(kept, true);
  await ec.close();
  stage = "search, sort, rename, archive/restore and return context";
  console.log("Stage: " + stage);
  await page
    .getByRole("link", { name: "Back to Documents", exact: true })
    .click();
  await page.getByLabel("Search documents").fill("transparent reporting");
  await page.locator(".documents-row").waitFor();
  assert.equal(await page.locator(".documents-row").count(), 1);
  await page.getByLabel("Sort documents").selectOption("title");
  await page.locator(".documents-row a").click();
  await body.waitFor();
  await page
    .getByRole("link", { name: "Back to Documents", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Search documents").inputValue(),
    "transparent reporting",
  );
  assert.equal(await page.getByLabel("Sort documents").inputValue(), "title");
  await page.locator(".documents-row .action-menu > summary").click();
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  const renamed = "Research writing — verified review";
  await page
    .getByRole("dialog")
    .getByLabel("Document title", { exact: true })
    .fill(renamed);
  await page.getByRole("button", { name: "Save title", exact: true }).click();
  await page.getByRole("link", { name: new RegExp(renamed) }).waitFor();
  await page.locator(".documents-row .action-menu > summary").click();
  await page
    .getByRole("button", { name: "Archive document", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "No matching documents", exact: true })
    .waitFor();
  await page.getByLabel("Archived", { exact: true }).check();
  await page.locator(".documents-row .action-menu > summary").click();
  await page
    .getByRole("button", { name: "Restore document", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "No matching documents", exact: true })
    .waitFor();
  await page.getByLabel("Archived", { exact: true }).uncheck();
  await page.locator(".documents-row a").click();
  await body.waitFor();
  stage = "export flushes unsaved writing with math, references and locators";
  console.log("Stage: " + stage);
  await append(page, "Export includes the very latest unsaved sentence.");
  const exportEvent = page.waitForEvent("download");
  await page
    .locator(".document-controls")
    .getByRole("button", { name: "Export Markdown", exact: true })
    .click();
  const exported = await exportEvent;
  const { readFileSync } = await import("node:fs");
  const markdown = readFileSync((await exported.path())!, "utf8");
  assert.ok(exported.suggestedFilename().startsWith(renamed));
  for (const expected of [
    "latest unsaved sentence",
    "\\frac{p}{1-p}",
    matrix,
    "10.1234/controlled-writing",
    upload.versionId!,
    note.id,
  ])
    assert.ok(markdown.includes(expected), expected);
  stage = "viewer, anonymous and foreign project document boundaries";
  console.log("Stage: " + stage);
  const vc = await browser.newContext(),
    vp = await vc.newPage();
  await login(vp, viewer);
  await vp.goto(docUrl);
  await vp
    .getByRole("textbox", { name: "Document body", exact: true })
    .waitFor();
  assert.equal(
    await vp
      .getByRole("textbox", { name: "Document body", exact: true })
      .getAttribute("contenteditable"),
    "false",
  );
  const current = (await getDoc()).document;
  assert.ok(
    [403, 404].includes(
      (
        await vc.request.patch(docApi, {
          headers: { origin },
          data: {
            action: "save",
            requestId: randomUUID(),
            revision: current.revision,
            title: current.title,
            body: current.body,
            checkpoint: false,
          },
        })
      ).status(),
    ),
  );
  assert.equal(
    (
      await vc.request.get(
        docApi.replace("/" + p + "/", "/" + randomUUID() + "/"),
      )
    ).status(),
    404,
  );
  const anon = await browser.newContext();
  assert.equal((await anon.request.get(docApi)).status(), 401);
  assert.equal((await anon.request.get(docApi + "/export")).status(), 401);
  await anon.close();
  await vc.close();
  const oc = await browser.newContext(),
    op = await oc.newPage();
  await login(op, outsider);
  assert.equal((await oc.request.get(docApi)).status(), 404);
  assert.equal((await oc.request.get(docApi + "/export")).status(), 404);
  await oc.close();
  stage = "desktop/dark/narrow, panels and connected task";
  console.log("Stage: " + stage);
  await page.reload();
  await body.waitFor();
  assert.ok((await body.innerText()).includes("latest unsaved sentence"));
  await page.locator(".document-scroll").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: join(folder, "documents-desktop.png") });
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(folder, "documents-dark.png") });
  await page.getByRole("button", { name: "Light theme", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(150);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: join(folder, "documents-narrow.png") });
  await page
    .locator(".document-controls")
    .getByRole("button", { name: "Sources", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Document tools", exact: true })
    .waitFor();
  await page.screenshot({ path: join(folder, "documents-sources-narrow.png") });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".document-controls .action-menu > summary").click();
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await page
    .getByLabel("Task title", { exact: true })
    .fill("Follow the documented research question");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await page.getByLabel("Task title", { exact: true }).waitFor();
  await page
    .locator(".artifact-cards a")
    .filter({ hasText: renamed })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: create → formatted research writing + inline/block fraction/sum/integral/subscript/matrix → library/PDF-note quotation + exact citation → save/reload/history restore → lost-response retry → two-session conflict recovery → list search/sort/rename/archive/restore/context → current-revision Markdown → linked task; viewer/anonymous/foreign denial; desktop/dark/narrow.",
  );
  console.log("Controlled evidence: " + folder);
} catch (error) {
  console.error(
    "FAIL at " +
      stage +
      "; " +
      (error instanceof Error
        ? error.message.split("\n")[0].slice(0, 220)
        : "unknown"),
  );
  if (error instanceof Error)
    console.error(error.stack?.match(/documents-browser-qa\.ts:\d+:\d+/)?.[0]);
  await page.screenshot({ path: join(folder, "failure.png") }).catch(() => {});
  console.log("Controlled evidence: " + folder);
  process.exitCode = 1;
} finally {
  clearInterval(timer);
  await browser.close();
  if (server.exitCode === null && server.signalCode === null) {
    server.kill("SIGTERM");
    await new Promise<void>((r) => server.once("exit", () => r()));
  }
  await Promise.all([
    db.$disconnect(),
    authDb.$disconnect(),
    mail.close(),
    worker.close(),
    smtp.close(),
  ]);
}
