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
  folder = mkdtempSync(join(tmpdir(), "atlas-collaboration-browser-")),
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
  viewer = await verifiedUser(auth, mail, smtp);
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
    kind: "note",
    page: 1,
    body: "Check how the equation supports this observation.",
    quote: "",
    rects: [],
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
  await body.press("ControlOrMeta+End");
  await body.press("Enter");
  await body.pressSequentially(text);
}
async function saved(target: Page) {
  await target
    .locator(".save-indicator")
    .filter({ hasText: /^Saved$/ })
    .waitFor({ timeout: 10000 });
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + "/health/live")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(
    "Browser plugin not available; Playwright Chromium production journey, disposable PostgreSQL/SMTP and synthetic PDF only.",
  );
  await login(page);
  assert.equal(await page.title(), "Atlas Research");
  stage = "real Crossref discovery → saved library selection";
  console.log("Stage: " + stage);
  await page.goto(origin + path + "/discover");
  await page
    .getByLabel("Search academic papers")
    .fill("10.1371/journal.pbio.1002106");
  await page
    .getByRole("button", { name: "Search papers", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save to library", exact: true })
    .first()
    .waitFor({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Save to library", exact: true })
    .first()
    .click();
  await page
    .getByRole("link", { name: "Open saved source", exact: true })
    .first()
    .waitFor();
  await page.goto(origin + path + "/sources");
  await page.getByLabel("Sort sources").selectOption("title");
  await page
    .getByRole("button", { name: "Create collection", exact: true })
    .click();
  await page
    .getByLabel("Collection name", { exact: true })
    .fill("Evidence review");
  await page
    .getByRole("button", { name: "Create collection", exact: true })
    .last()
    .click();
  await page.getByLabel("Select all visible sources").check();
  await page
    .getByLabel("Add selected to collection")
    .selectOption({ label: "Evidence review" });
  await page
    .getByRole("status")
    .filter({ hasText: /papers added to collection/ })
    .waitFor();
  await page
    .getByRole("button", { name: "Evidence review", exact: true })
    .click();
  await page.locator(".paper-row").first().waitFor();
  assert.equal(await page.locator(".paper-row").count(), 3);
  await page.getByLabel("Select " + source.title, { exact: true }).check();
  const selectedExport = await context.request.get(
    (origin +
      (await page
        .getByRole("link", { name: "BibTeX", exact: true })
        .getAttribute("href"))) as string,
  );
  const selectedText = await selectedExport.text();
  assert.ok(
    selectedText.includes(source.title) &&
      !selectedText.includes(metadataOnly.title),
  );
  const collectionId = await page
    .getByLabel("Add selected to collection")
    .getByRole("option", { name: "Evidence review", exact: true })
    .getAttribute("value");
  assert.ok(collectionId);
  const invalidBulk = await context.request.post(
    origin + `/api/research/${w}/${p}/sources/collect`,
    {
      headers: { origin },
      data: { ids: [source.id, randomUUID()], collectionId },
    },
  );
  assert.equal(invalidBulk.status(), 404);
  const sourceAfterBulk = await (
    await context.request.get(
      origin + `/api/research/${w}/${p}/sources/${source.id}`,
    )
  ).json();
  assert.equal(sourceAfterBulk.source.revision, 2);
  await context.request.post(
    origin + `/api/research/${w}/${p}/sources/collect`,
    { headers: { origin }, data: { ids: [source.id], collectionId } },
  );
  assert.equal(
    (
      await (
        await context.request.get(
          origin + `/api/research/${w}/${p}/sources/${source.id}`,
        )
      ).json()
    ).source.revision,
    2,
  );
  assert.equal(
    (
      await context.request.get(
        origin + `/api/research/${w}/${p}/export?format=bib&ids=bad`,
      )
    ).status(),
    400,
  );
  await page.screenshot({ path: join(folder, "library-desktop.png") });
  stage = "PDF note → source-linked document";
  console.log("Stage: " + stage);
  await page.goto(
    origin +
      path +
      `/sources/${source.id}/read?version=${upload.versionId}&page=1&annotation=${note.id}`,
  );
  await page.locator(".pdf-paper canvas").first().waitFor({ timeout: 15000 });
  await page
    .getByRole("button", { name: "Add page note", exact: true })
    .click();
  await page
    .getByLabel("Annotation note", { exact: true })
    .fill("A new observation saved through the reader.");
  await page
    .getByRole("button", { name: "Save page note", exact: true })
    .click();
  await page
    .locator(".annotation-card")
    .getByText("A new observation saved through the reader.", { exact: true })
    .waitFor();
  await page.locator(".textLayer").evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.locator(".pdf-scroll").dispatchEvent("mouseup");
  await page
    .getByRole("toolbar", { name: "Selected PDF text" })
    .getByRole("button", { name: "Highlight", exact: true })
    .click();
  await page.locator(".pdf-highlight").first().waitFor();
  await page.screenshot({ path: join(folder, "reader-desktop.png") });
  await page
    .locator(".annotation-card")
    .filter({ hasText: note.body })
    .getByRole("button", { name: "Write from this" })
    .click();
  await page
    .getByLabel("Document title", { exact: true })
    .fill("Evidence-linked research draft");
  await page
    .getByRole("button", { name: "Create document", exact: true })
    .click();
  await page.waitForURL("**/docs/*");
  const docUrl = page.url(),
    docId = docUrl.split("/").at(-1)!;
  await page.getByRole("textbox", { name: "Document body" }).waitFor();
  assert.ok(await page.locator(".document-citation").count());
  stage = "text/math/autosave";
  console.log("Stage: " + stage);
  await append(page, "A controlled research argument.");
  await page
    .getByRole("textbox", { name: "Document body", exact: true })
    .press("Shift+ArrowLeft");
  await page.locator(".selection-toolbar").waitFor({ state: "visible" });
  await page
    .locator(".selection-toolbar")
    .getByRole("button", { name: "Bold", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Document body", exact: true })
    .press("ArrowRight");
  await page.locator(".editor-insert > summary").click();
  await page.getByRole("button", { name: "Inline math", exact: true }).click();
  await page.getByLabel("LaTeX expression").fill("E=mc^2");
  await page
    .getByRole("button", { name: "Insert expression", exact: true })
    .click();
  await page.locator(".editor-insert > summary").click();
  await page.getByRole("button", { name: "Block math", exact: true }).click();
  await page.getByLabel("LaTeX expression").fill("\\sum_{i=1}^{n}x_i");
  await page
    .getByRole("button", { name: "Insert expression", exact: true })
    .click();
  await saved(page);
  await page.locator(".katex").first().waitFor();
  await page.locator(".document-scroll").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: join(folder, "document-desktop.png") });
  const exportResponse = await context.request.get(
      origin + endpoint + `/documents/${docId}/export`,
    ),
    markdown = await exportResponse.text();
  assert.ok(
    markdown.includes("E=mc^2") &&
      markdown.includes("\\sum") &&
      markdown.includes("10.1234/controlled-writing") &&
      markdown.includes(upload.versionId!),
  );
  stage = "library citation picker";
  console.log("Stage: " + stage);
  await page.getByRole("button", { name: "Add citation", exact: true }).click();
  await page
    .getByLabel("Source", { exact: true })
    .selectOption(metadataOnly.id);
  await page.getByLabel("Source version", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Insert citation", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Add source citation", exact: true })
    .waitFor({ state: "hidden" });
  await page.locator(".document-citation").nth(1).waitFor();
  await saved(page);
  stage = "PDF note → existing writing";
  console.log("Stage: " + stage);
  await page.goto(
    origin +
      path +
      `/sources/${source.id}/read?version=${upload.versionId}&page=1&annotation=${note.id}`,
  );
  await page
    .locator(".annotation-card")
    .filter({ hasText: note.body })
    .getByRole("button", { name: "Write from this", exact: true })
    .click();
  await page.getByLabel("Writing destination").selectOption(docId);
  await page.getByRole("link", { name: "Open and cite", exact: true }).click();
  await page
    .getByRole("heading", { name: "Add source citation", exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Source", { exact: true }).inputValue(),
    source.id,
  );
  assert.equal(
    await page.getByLabel("Source version", { exact: true }).inputValue(),
    upload.versionId,
  );
  await page
    .getByRole("button", { name: "Insert citation", exact: true })
    .click();
  await saved(page);
  await page
    .getByRole("heading", { name: "Add source citation", exact: true })
    .waitFor({ state: "hidden" });
  await saved(page);
  assert.equal(new URL(page.url()).searchParams.has("citeSource"), false);
  stage = "save failure retains text";
  console.log("Stage: " + stage);
  await page.route("**" + endpoint + `/documents/${docId}`, (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "STORAGE_UNAVAILABLE" }),
        })
      : route.continue(),
  );
  await append(page, "Retained after a failed save.");
  await page
    .getByText("Saving failed. Your text is still here.", { exact: true })
    .waitFor();
  assert.ok(
    (
      await page.getByRole("textbox", { name: "Document body" }).innerText()
    ).includes("Retained after a failed save."),
  );
  await page.unroute("**" + endpoint + `/documents/${docId}`);
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await saved(page);
  stage = "two tabs conflict/recovery";
  console.log("Stage: " + stage);
  const second = await context.newPage();
  await second.goto(docUrl);
  await second.getByRole("textbox", { name: "Document body" }).waitFor();
  await append(page, "First tab accepted content.");
  await saved(page);
  await append(second, "Second tab recoverable content.");
  await second.getByRole("heading", { name: "Recover your writing" }).waitFor();
  assert.ok(
    (
      await second.getByLabel("Your draft", { exact: true }).inputValue()
    ).includes("Second tab recoverable content."),
  );
  assert.ok(
    (
      await second.getByLabel("Server copy", { exact: true }).inputValue()
    ).includes("First tab accepted content."),
  );
  await second
    .getByRole("button", { name: "Keep my draft and resume" })
    .click();
  await saved(second);
  await second.close();
  await page.reload();
  await page.getByRole("textbox", { name: "Document body" }).waitFor();
  assert.ok(
    (
      await page.getByRole("textbox", { name: "Document body" }).innerText()
    ).includes("Second tab recoverable content."),
  );
  stage = "checkpoint/history";
  await page
    .locator('.action-menu > summary[aria-label="Document options"]')
    .click();
  console.log("Stage: " + stage);
  await page
    .getByRole("button", { name: "Save checkpoint", exact: true })
    .click();
  await saved(page);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("heading", { name: "Version history" }).waitFor();
  await page.locator("dialog .version-list button").last().click();
  await page
    .getByRole("button", { name: "Restore as a new revision" })
    .waitFor();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  stage = "task creation/assignment";
  console.log("Stage: " + stage);
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await page
    .getByLabel("Task title", { exact: true })
    .fill("Review the equation and source");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Return to the document and PDF note.");
  await page.getByLabel("Assignee", { exact: true }).selectOption(b.id);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await page.waitForURL("**/tasks/*");
  const taskUrl = page.url();
  await page.getByLabel("Task title").waitFor();
  assert.equal(
    await page.getByLabel("Assignee", { exact: true }).inputValue(),
    b.id,
  );
  await page.getByLabel("Status", { exact: true }).selectOption("in_progress");
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await page.getByRole("status").filter({ hasText: /Saved/ }).waitFor();
  await page.screenshot({ path: join(folder, "task-detail.png") });
  await page.goto(origin + path + "/tasks");
  await page
    .getByRole("button", {
      name: "Quick edit Review the equation and source",
      exact: true,
    })
    .click();
  await page.getByLabel("Priority", { exact: true }).selectOption("high");
  await page.getByLabel("Due date", { exact: true }).fill("2026-11-20");
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.goto(taskUrl);
  assert.equal(
    await page.getByLabel("Priority", { exact: true }).inputValue(),
    "high",
  );
  assert.equal(
    await page.getByLabel("Due date", { exact: true }).inputValue(),
    "2026-11-20",
  );
  stage = "linked discussion";
  console.log("Stage: " + stage);
  await page.getByRole("button", { name: "Discuss", exact: true }).click();
  await page
    .getByLabel("Topic title", { exact: true })
    .fill("Review the evidence together");
  await page
    .getByLabel("First message")
    .fill("Review the linked argument and its PDF note.");
  await page.getByLabel("Add research link").selectOption(docId);
  await page.getByLabel("Add research link").selectOption(note.id);
  await page
    .getByRole("button", { name: "Create discussion", exact: true })
    .click();
  await page.waitForURL("**/discussions/*");
  const threadUrl = page.url();
  await page
    .getByRole("heading", { name: "Review the evidence together" })
    .waitFor();
  assert.equal(
    await page.locator(".discussion-message .artifact-card").count(),
    3,
  );
  await page
    .getByLabel("Reply", { exact: true })
    .fill("A recoverable unsent observation.");
  await page.goto(origin + path + "/sources");
  await page.goto(threadUrl);
  assert.equal(
    await page.getByLabel("Reply", { exact: true }).inputValue(),
    "A recoverable unsent observation.",
  );
  await page
    .getByRole("button", { name: "Discard draft", exact: true })
    .click();
  const homeData = await (
    await context.request.get(origin + "/api/home")
  ).json();
  assert.equal(
    homeData.projects.find((x: { projectId: string }) => x.projectId === p)
      .documents,
    1,
  );
  assert.equal(
    homeData.projects.find((x: { projectId: string }) => x.projectId === p)
      .sources,
    3,
  );
  assert.ok(
    homeData.projects
      .find((x: { projectId: string }) => x.projectId === p)
      .recent.some((x: { id: string }) => x.id === docId),
  );
  const ec = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    ep = await ec.newPage();
  await login(ep, editor);
  await ep.goto(origin + "/inbox");
  await ep
    .getByRole("link", { name: "Review the equation and source", exact: true })
    .click();
  await ep.waitForURL(taskUrl);
  assert.equal(ep.url(), taskUrl);
  await ep.goto(threadUrl);
  await ep
    .getByLabel("Reply", { exact: true })
    .fill("The equation links back to the original evidence.");
  await ep.getByRole("button", { name: "Send reply", exact: true }).click();
  await ep
    .locator(".discussion-message")
    .getByText("The equation links back to the original evidence.", {
      exact: true,
    })
    .waitFor();
  await ec.close();
  stage = "Inbox → discussion → document → exact PDF note";
  console.log("Stage: " + stage);
  await page.goto(origin + "/inbox");
  await page
    .getByRole("link", { name: "Review the evidence together", exact: true })
    .click();
  await page
    .getByText("The equation links back to the original evidence.", {
      exact: true,
    })
    .waitFor();
  await page.screenshot({ path: join(folder, "discussion-desktop.png") });
  await page
    .locator(".discussion-message")
    .first()
    .getByRole("link")
    .filter({ hasText: "Evidence-linked research draft" })
    .click();
  await page.getByRole("textbox", { name: "Document body" }).waitFor();
  await page.locator(`.document-citation[href*="${note.id}"]`).first().click();
  await page.waitForURL("**/read?*");
  assert.ok(
    page.url().includes(upload.versionId!) && page.url().includes(note.id),
  );
  stage = "reload and sign-in persistence";
  console.log("Stage: " + stage);
  await page.goto(docUrl);
  await page.reload();
  await page.getByRole("textbox", { name: "Document body" }).waitFor();
  assert.ok(
    (
      await page.getByRole("textbox", { name: "Document body" }).innerText()
    ).includes("Second tab recoverable content."),
  );
  await context.request.post(origin + "/api/auth/sign-out", {
    headers: { origin },
    data: {},
  });
  await login(page);
  await page.goto(docUrl);
  await page.getByRole("textbox", { name: "Document body" }).waitFor();
  assert.ok(
    (
      await page.getByRole("textbox", { name: "Document body" }).innerText()
    ).includes("Second tab recoverable content."),
  );
  stage = "viewer HTTP read/write and private project denial";
  console.log("Stage: " + stage);
  const vc = await browser.newContext(),
    vp = await vc.newPage();
  await login(vp, viewer);
  await vp.goto(docUrl);
  await vp.getByRole("textbox", { name: "Document body" }).waitFor();
  assert.equal(
    await vp
      .getByRole("textbox", { name: "Document body" })
      .getAttribute("contenteditable"),
    "false",
  );
  assert.equal(
    (
      await vc.request.patch(origin + endpoint + `/documents/${docId}`, {
        headers: { origin },
        data: { action: "archive", revision: 1, archived: true },
      })
    ).status(),
    404,
  );
  assert.equal(
    (
      await vc.request.get(
        origin + endpoint.replace(p, randomUUID()) + `/documents/${docId}`,
      )
    ).status(),
    404,
  );
  assert.equal(
    (
      await vc.request.post(
        origin + `/api/research/${w}/${p}/sources/collect`,
        { headers: { origin }, data: { ids: [source.id], collectionId } },
      )
    ).status(),
    404,
  );
  await vc.close();
  stage = "working tabs, project search and live home data";
  console.log("Stage: " + stage);
  await page.goto(docUrl);
  await page
    .getByRole("textbox", { name: "Document body", exact: true })
    .waitFor();
  await page
    .getByRole("navigation", { name: "Open pages" })
    .getByRole("link", { name: "Evidence-linked research draft", exact: true })
    .waitFor();
  await page.goto(origin + "/home");
  await page.locator(".project-counts").first().waitFor();
  await page.locator(".continue-grid").getByRole("link").first().waitFor();
  await page.screenshot({ path: join(folder, "home-desktop.png") });
  await page
    .getByRole("button", {
      name: "Connected research verification",
      exact: true,
    })
    .click();
  await page.getByLabel("Search projects").fill("Connected research");
  assert.equal(await page.locator(".project-picker > a").count(), 1);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  stage = "desktop/narrow main surfaces";
  console.log("Stage: " + stage);
  await page.goto(origin + path + "/tasks");
  await page.locator(".task-card").waitFor();
  await page.screenshot({ path: join(folder, "tasks-board.png") });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(docUrl);
  await page.getByRole("textbox", { name: "Document body" }).waitFor();
  await page.screenshot({ path: join(folder, "document-narrow.png") });
  assert.equal(
    await page.evaluate("document.documentElement.scrollWidth <= innerWidth"),
    true,
  );
  await page.goto(origin + path + "/tasks");
  await page.locator(".task-card").waitFor();
  assert.equal(
    await page.evaluate("document.documentElement.scrollWidth <= innerWidth"),
    true,
  );
  await page.goto(threadUrl);
  await page.getByLabel("Reply", { exact: true }).waitFor();
  await page.screenshot({ path: join(folder, "discussion-narrow.png") });
  assert.equal(
    await page.evaluate("document.documentElement.scrollWidth <= innerWidth"),
    true,
  );
  stage = "focused screen comparison and closed AI surface";
  console.log("Stage: " + stage);
  const surfaces = [
    ["home", "/home", ".project-counts"],
    ["research", path + "/discover", ".discovery-search"],
    ["library", path + "/sources", ".paper-row"],
    [
      "reader",
      path + `/sources/${source.id}/read?version=${upload.versionId}&page=1`,
      ".pdf-paper canvas",
    ],
    ["document", new URL(docUrl).pathname, ".atlas-prose"],
    ["tasks", path + "/tasks", ".task-card"],
    ["discussion", new URL(threadUrl).pathname, ".discussion-composer"],
    ["inbox", "/inbox", ".inbox-page"],
    ["settings", "/settings", ".settings-section"],
  ];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 900 });
    for (const [name, route, ready] of surfaces) {
      await page.goto(origin + route);
      await page.locator(ready).first().waitFor();
      if (name === "home")
        await page.locator(".continue-grid a").first().waitFor();
      await page.screenshot({ path: join(folder, `${name}-${width}.png`) });
      assert.equal(
        await page.evaluate(
          "document.documentElement.scrollWidth <= innerWidth",
        ),
        true,
        name + " overflow at " + width,
      );
    }
    await page.goto(origin + path + "/sources");
    await page.getByRole("button", { name: "Ask Atlas", exact: true }).click();
    await page
      .getByText(
        "AI answers are turned off. You can still search your papers for evidence.",
        { exact: true },
      )
      .waitFor();
    await page.screenshot({ path: join(folder, `ai-closed-${width}.png`) });
    await page.keyboard.press("Escape");
  }
  await page.goto(origin + "/settings");
  await page
    .locator(".settings-section")
    .filter({ hasText: "Appearance" })
    .getByRole("button", { name: "Dark theme", exact: true })
    .click();
  await page.goto(docUrl);
  await page.locator(".atlas-prose").waitFor();
  await page.screenshot({ path: join(folder, "document-dark-390.png") });
  await page.getByLabel("Switch open page", { exact: true }).click();
  await page
    .locator(".tab-switch-menu a")
    .first()
    .waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await authDb.session.updateMany({
    where: { userId: a.id },
    data: { createdAt: new Date(Date.now() - 360000) },
  });
  const staleSessions = await context.request.get(origin + "/api/me/sessions");
  assert.equal(staleSessions.status(), 403);
  assert.equal((await staleSessions.json()).error, "REAUTH_REQUIRED");
  await page.goto(origin + "/settings");
  await page
    .getByRole("link", { name: "sign in again", exact: true })
    .waitFor();
  assert.ok(
    await page
      .getByRole("navigation", { name: "Open pages" })
      .getByRole("link")
      .count(),
  );
  assert.equal(await page.locator("nextjs-portal").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: note→cited math document→acknowledged save/error/retry→two-tab recovery/history→assigned task→linked discussion→Inbox→original PDF locator; reload/re-login/export/viewer/other-scope and desktop/narrow checks.",
  );
  console.log("Evidence folder: " + folder);
} catch (e) {
  console.error("Failed stage: " + stage);
  await page.screenshot({ path: join(folder, "failure.png") }).catch(() => {});
  throw e;
} finally {
  clearInterval(timer);
  server.kill("SIGTERM");
  await browser.close();
  await Promise.all([
    authDb.$disconnect(),
    db.$disconnect(),
    mail.close(),
    worker.close(),
    smtp.close(),
  ]);
}
