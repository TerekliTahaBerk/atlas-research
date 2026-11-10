import { createDocument } from "../src/server/collaboration/service";
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
  folder = mkdtempSync(join(tmpdir(), "atlas-connected-workspace-")),
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
  {
    env: { ...process.env, MAIL_DELIVERY: "disabled" },
    stdio: ["ignore", "ignore", "pipe"],
  },
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
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + "/health/live")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(
    "Browser plugin not available; production Chromium / disposable PostgreSQL. Real public arXiv PDF, real Crossref lookup, synthetic collaborators only. No external email or paid AI call.",
  );
  const paper = "Attention Is All You Need",
    paperUrl = "https://arxiv.org/abs/1706.03762";
  const pdfResponse = await fetch("https://arxiv.org/pdf/1706.03762");
  assert.ok(pdfResponse.ok);
  const pdf = Buffer.from(await pdfResponse.arrayBuffer());
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  const path = `/w/${w}/p/${p}`,
    apiBase = `/api/research/${w}/${p}`;
  const json = async (url: string) =>
    (await context.request.get(origin + url)).json();
  let previewCount = 0,
    runCount = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/preview")) previewCount++;
    if (r.method() === "POST" && r.url().endsWith("/runs")) runCount++;
  });
  await login(page);
  await page
    .getByRole("link", {
      name: "Connected research verification",
      exact: false,
    })
    .filter({ has: page.locator("strong") })
    .first()
    .click();
  await page
    .getByRole("heading", {
      name: "Connected research verification",
      exact: true,
    })
    .waitFor();
  stage = "Home → project → Discover → Library, real paper";
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "Library", exact: true })
    .click();
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await page.getByLabel("Search academic papers", { exact: true }).fill(paper);
  const discovery = page.waitForResponse(
    (r) => r.url().includes("/discover?") && r.request().method() === "GET",
  );
  await page
    .getByRole("button", { name: "Search papers", exact: true })
    .click();
  const found = await discovery;
  console.log("Live Crossref lookup HTTP " + found.status());
  // arXiv preprints are outside guaranteed Crossref DOI coverage. The real paper
  // is added explicitly with its arXiv URL and matching PDF, not a different DOI.
  await page
    .locator(".discover-toolbar")
    .getByRole("button", { name: "Add source", exact: true })
    .click();
  await page.getByLabel("Title", { exact: true }).fill(paper);
  await page.getByLabel("Article URL", { exact: true }).fill(paperUrl);
  await page
    .getByLabel("Authors", { exact: false })
    .fill(
      "Ashish Vaswani; Noam Shazeer; Niki Parmar; Jakob Uszkoreit; Llion Jones; Aidan N. Gomez; Lukasz Kaiser; Illia Polosukhin",
    );
  await page.getByLabel("Year", { exact: true }).fill("2017");
  await page
    .getByLabel("Journal or venue", { exact: true })
    .fill("NeurIPS 2017 / arXiv preprint");
  await page.locator('input[type="file"]').setInputFiles({
    name: "attention-is-all-you-need.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await page
    .getByRole("button", { name: "Add to library", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Read PDF: " + paper, exact: true })
    .waitFor({ timeout: 45000 });
  const library = await json(apiBase + "/sources"),
    source = library.items.find((r: { title: string }) => r.title === paper);
  assert.ok(source);
  await page
    .getByRole("link", { name: "Read PDF: " + paper, exact: true })
    .click();
  await page
    .locator(".pdf-paper.is-rendered")
    .first()
    .waitFor({ timeout: 45000 });
  const pageInput = page.getByLabel("PDF page", { exact: true });
  await pageInput.fill("2");
  await pageInput.press("Enter");
  await page.locator('.pdf-paper[data-page="2"].is-rendered').waitFor();
  await page.getByLabel("PDF zoom", { exact: true }).selectOption("1.25");
  await page.getByLabel("Add page note", { exact: true }).click();
  await page
    .getByLabel("Annotation note", { exact: true })
    .fill("Compare multi-head attention against recurrent baselines.");
  await page
    .getByRole("button", { name: "Save page note", exact: true })
    .click();
  await page
    .locator(".annotation-card")
    .filter({ hasText: "Compare multi-head attention" })
    .waitFor();
  const detail = await json(apiBase + "/sources/" + source.id);
  const note = detail.annotations.find((n: { body: string }) =>
    n.body.startsWith("Compare multi-head"),
  );
  assert.ok(note);
  const version = detail.versions.find(
    (r: { fileId: string | null }) => r.fileId,
  );
  assert.ok(version);
  stage =
    "one AI controller, draft/scope through all presentation states and routes";
  await page.getByRole("button", { name: "Ask Atlas", exact: true }).click();
  await page
    .locator(".ai-island textarea")
    .fill("Compare the paper’s attention mechanism using its evidence.");
  await page.getByRole("button", { name: "Floating AI", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Suggest current page as context",
      exact: true,
    })
    .click();
  const expectedQuestion = await page
    .locator(".ai-island textarea")
    .inputValue();
  await page.locator('.ai-sources input[type="checkbox"]').first().check();
  await page
    .locator(".ai-sources")
    .getByText("Evidence ready", { exact: false })
    .first()
    .waitFor({ timeout: 45000 });
  await page
    .getByRole("button", { name: "Preview evidence", exact: true })
    .click();
  await page.locator(".ai-preview").waitFor();

  await page.getByRole("button", { name: "Focus AI", exact: true }).click();
  assert.equal(
    await page.locator(".ai-island textarea").inputValue(),
    expectedQuestion,
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Dock AI", exact: true }).click();
  await page.getByRole("button", { name: "Compact AI", exact: true }).click();
  await page.screenshot({ path: join(folder, "reader-connected.png") });
  await page
    .locator(".annotation-card")
    .filter({ hasText: "Compare multi-head attention" })
    .getByRole("button", { name: "Write from this", exact: true })
    .click();
  await page
    .getByLabel("Document title", { exact: true })
    .fill("Attention evidence synthesis");
  await page
    .getByRole("button", { name: "Create document", exact: true })
    .click();
  await page.waitForURL("**/docs/**");
  await page.locator(".tiptap").waitFor();
  const docId = new URL(page.url()).pathname.split("/").at(-1)!;
  assert.equal(
    await page.locator(".ai-island textarea").inputValue(),
    expectedQuestion,
  );
  assert.equal(await page.locator(".ai-island").count(), 1);
  await page
    .getByLabel("Document title", { exact: true })
    .fill("Attention evidence synthesis — saved");
  await page.locator(".tiptap").click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(
    " The multi-head design is the next evidence check.",
  );
  await page.locator(".save-indicator").filter({ hasText: "Saved" }).waitFor();
  await page.screenshot({ path: join(folder, "document-connected.png") });
  await page.getByLabel("Document options", { exact: true }).click();
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await page
    .getByLabel("Task title", { exact: true })
    .fill("Check attention evidence against baselines");
  await page.getByRole("button", { name: "More details", exact: true }).click();
  await page.getByLabel("Assignee", { exact: true }).selectOption(a.id);
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await page.waitForURL("**/tasks/**");
  assert.equal(
    await page.locator(".ai-island textarea").inputValue(),
    expectedQuestion,
  );
  const savedDoc = await json(
    `/api/collaboration/${w}/${p}/documents/${docId}`,
  );
  assert.ok(
    JSON.stringify(savedDoc.document.body).includes("multi-head design"),
  );
  assert.equal(savedDoc.document.title, "Attention evidence synthesis — saved");
  await page
    .getByRole("button", { name: "Discuss this task", exact: true })
    .click();
  await page
    .getByLabel("Topic title", { exact: true })
    .fill("Review the attention evidence");
  await page
    .getByLabel("First message", { exact: true })
    .fill("Please review the original PDF note and the synthesis.");
  await page
    .getByLabel("Find related research", { exact: true })
    .fill("Compare multi-head");
  await page
    .getByLabel("Add research link", { exact: true })
    .selectOption(note.id);
  await page
    .getByRole("button", { name: "Create discussion", exact: true })
    .click();
  await page.waitForURL("**/discussions/**");
  const topicId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.screenshot({ path: join(folder, "discussion-connected.png") });
  const bc = await browser.newContext(),
    bp = await bc.newPage();
  await login(bp, editor);
  await bp.goto(origin + path + "/discussions/" + topicId);
  await bp
    .getByLabel("Reply", { exact: true })
    .fill("I checked the PDF note. Let’s return to the original page.");
  await bp
    .getByText("Attach research or mention a teammate", { exact: true })
    .click();
  await bp.getByLabel("Mention members", { exact: true }).selectOption(a.id);
  const acknowledgedReply = bp.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().endsWith("/messages"),
  );
  await bp.getByRole("button", { name: "Send reply", exact: true }).click();
  assert.equal((await acknowledgedReply).status(), 200);
  await bp
    .locator(".discussion-message")
    .filter({ hasText: "I checked the PDF note." })
    .waitFor();
  await bp
    .getByText("I checked the PDF note. Let’s return to the original page.", {
      exact: true,
    })
    .waitFor();
  await bc.close();
  stage = "Inbox → exact reply → original PDF note";
  await page.locator('.sidebar a[href="/inbox"]').click();
  await page
    .locator(".inbox-item")
    .filter({ hasText: "Mention" })
    .first()
    .click();
  assert.equal(
    await page.locator(".ai-island textarea").inputValue(),
    expectedQuestion,
  );
  await page.getByRole("link", { name: "Open message", exact: true }).waitFor();
  const inboxFooter = await page.locator(".inbox-pagination").boundingBox(),
    compactIsland = await page.locator(".ai-island").boundingBox();
  assert.ok(
    inboxFooter &&
      compactIsland &&
      inboxFooter.y + inboxFooter.height <= compactIsland.y,
    "Inbox page controls clear the shared AI island",
  );
  await page.screenshot({ path: join(folder, "inbox-connected.png") });
  await page.getByRole("link", { name: "Open message", exact: true }).click();
  await page.locator("[data-inbox-focus=true]").waitFor();
  await page.locator(".discussion-research").locator("summary").click();
  await page
    .locator(".discussion-research")
    .getByRole("link", { name: /PDF note/ })
    .click();
  await page.waitForURL("**annotation=" + note.id);
  await page.locator('.pdf-paper[data-page="2"].is-rendered').waitFor();
  assert.equal(
    await page.getByLabel("PDF page", { exact: true }).inputValue(),
    "2",
  );
  assert.equal(
    await page.getByLabel("PDF zoom", { exact: true }).inputValue(),
    "1.25",
  );
  assert.equal(
    await page
      .locator('.working-tab[data-work-key$="source:' + source.id + '"]')
      .count(),
    1,
  );
  await page.locator('.sidebar a[href="/home"]').click();
  assert.equal(
    await page.locator(".ai-island textarea").inputValue(),
    expectedQuestion,
  );
  await page.locator(".home-resume-card").filter({ hasText: paper }).click();
  await page.locator(".pdf-paper.is-rendered").first().waitFor();
  assert.equal(
    await page
      .locator('.working-tab[data-work-key$="source:' + source.id + '"]')
      .count(),
    1,
  );
  await page.locator(".account-menu > summary").click();
  await page.locator(`.account-popover a[href="/w/${w}/settings"]`).click();
  await page
    .getByRole("heading", { name: "Workspace details", exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".ai-island textarea").inputValue(),
    expectedQuestion,
  );
  await page.locator('.sidebar a[href="/home"]').click();
  stage = "shared search and list context";
  await page.keyboard.press("ControlOrMeta+k");
  await page
    .getByRole("dialog", { name: "Search your workspace", exact: true })
    .getByRole("searchbox")
    .fill("attention");
  await page
    .locator(".workspace-search-results")
    .getByRole("link", { name: /Attention evidence synthesis/ })
    .waitFor();
  await page.screenshot({ path: join(folder, "global-search.png") });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "Library", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search library", exact: true })
    .fill("Attention");
  await page
    .getByRole("textbox", { name: "Search library", exact: true })
    .press("Enter");
  await page.locator('.sidebar a[href="/home"]').click();
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "Library", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("textbox", { name: "Search library", exact: true })
      .inputValue(),
    "Attention",
  );
  stage = "project switch explicitly reviews an unsent scoped AI draft";
  const otherProject = await createProject(db, a, w, {
    requestId: randomUUID(),
    name: "Other controlled project",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.locator(".project-switcher").click();
  await page
    .getByRole("dialog", { name: "Switch project", exact: true })
    .getByRole("link", { name: /Other controlled project/ })
    .click();
  await page
    .getByRole("dialog", { name: "Save before leaving", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Stay and review", exact: true })
    .click();
  assert.ok(page.url().includes(p));
  await page.locator(".project-switcher").click();
  await page
    .getByRole("dialog", { name: "Switch project", exact: true })
    .getByRole("link", { name: /Other controlled project/ })
    .click();
  await page
    .getByRole("button", {
      name: "Discard unsent AI draft and continue",
      exact: true,
    })
    .click();
  await page.waitForURL("**/p/" + otherProject.id);
  assert.equal(await page.locator(".ai-island textarea").inputValue(), "");
  assert.ok(
    !(await page.locator(".workspace-tabs").innerText()).includes("Attention"),
  );
  await page.locator(".project-switcher").click();
  await page
    .getByRole("dialog", { name: "Switch project", exact: true })
    .getByRole("link", { name: /Connected research verification/ })
    .click();
  await page.waitForURL("**/p/" + p);
  assert.equal(
    (await json(`/api/ai/${w}/${p}/options`)).conversations.length,
    1,
  );
  await page.locator(".ai-island textarea").fill("");
  stage = "pending document close recovery / saved Back and Forward";
  await page
    .locator(".workspace-tabs")
    .getByRole("link", { name: /Attention evidence synthesis/ })
    .click();
  await page
    .getByLabel("Document title", { exact: true })
    .fill("Attention synthesis with a recoverable edit");
  const docEndpoint = `**/api/collaboration/${w}/${p}/documents/${docId}`;
  await page.route(docEndpoint, (route) =>
    route.request().method() === "PATCH"
      ? route.abort("failed")
      : route.continue(),
  );
  await page
    .locator('.working-tab[data-work-key$="document:' + docId + '"]')
    .getByRole("button", { name: /Close tab/ })
    .click();
  await page
    .getByRole("dialog", { name: "Save before leaving", exact: true })
    .waitFor();
  assert.ok(new URL(page.url()).pathname.endsWith(docId));
  await page
    .getByRole("button", { name: "Leave with document recovery", exact: true })
    .click();
  await page.waitForFunction((id) => !location.pathname.endsWith(id), docId);
  await page.unroute(docEndpoint);
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "Documents", exact: true })
    .click();
  await page
    .getByRole("link", { name: /Attention evidence synthesis/ })
    .first()
    .click();
  await page
    .getByRole("dialog", { name: /review|conflict|recover/i })
    .waitFor();
  await page
    .getByRole("button", { name: "Keep my draft and resume", exact: true })
    .click();
  await page
    .getByLabel("Document title", { exact: true })
    .fill("Attention synthesis after navigation recovery");
  await page.evaluate(() => history.back());
  await page.waitForURL((url) => url.pathname === path + "/docs");
  await page.getByRole("heading", { name: "Documents", exact: true }).waitFor();
  assert.equal(
    (await json(`/api/collaboration/${w}/${p}/documents/${docId}`)).document
      .title,
    "Attention synthesis after navigation recovery",
  );
  await page.evaluate(() => history.forward());
  await page.waitForURL((url) => url.pathname === path + "/docs/" + docId);
  await page.getByLabel("Document title", { exact: true }).waitFor();
  stage = "more than ten object tabs, ordering, refresh metadata privacy";
  for (let i = 0; i < 12; i++)
    await createDocument(db, a, w, p, {
      requestId: randomUUID(),
      title: `Controlled navigation draft ${i + 1}`,
    });
  for (let i = 0; i < 12; i++) {
    await page
      .locator(".sidebar")
      .getByRole("link", { name: "Documents", exact: true })
      .click();
    await page
      .getByRole("link", {
        name: `Controlled navigation draft ${i + 1}`,
        exact: false,
      })
      .first()
      .click();
    await page.locator(".tiptap").waitFor();
  }
  assert.ok((await page.locator(".working-tab").count()) > 10);
  const tabCount = await page.locator(".working-tab").count();
  const beforeOrder = await page
    .locator(".working-tab")
    .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-work-key")));
  const moving = await page
    .locator(".working-tab")
    .filter({
      has: page.getByRole("link", {
        name: "Controlled navigation draft 12",
        exact: true,
      }),
    })
    .getAttribute("data-work-key");
  await page.getByLabel("Switch open page", { exact: true }).click();
  await page
    .getByRole("button", {
      name: "Move tab Controlled navigation draft 12 left",
      exact: true,
    })
    .click();
  await page.keyboard.press("Escape");
  const afterOrder = await page
    .locator(".working-tab")
    .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-work-key")));
  assert.equal(afterOrder.indexOf(moving), beforeOrder.indexOf(moving) - 1);
  await page.screenshot({ path: join(folder, "workspace-many-tabs.png") });
  const stored = await page.evaluate(
    (user) => sessionStorage.getItem(`atlas-navigation:${user}:v3`),
    a.id,
  );
  assert.ok(
    stored &&
      !stored.includes("Controlled") &&
      !stored.includes("Attention") &&
      !stored.includes("multi-head"),
  );
  await page.reload();
  await page.locator(".tiptap").waitFor();
  await page
    .locator(".workspace-tabs")
    .getByRole("link", { name: "Controlled navigation draft 12", exact: true })
    .waitFor();
  assert.equal(await page.locator(".working-tab").count(), tabCount);
  await page.evaluate(
    ({ user, sourceHref }) => {
      const key = `atlas-navigation:${user}:v3`,
        rows = JSON.parse(sessionStorage.getItem(key) ?? "[]");
      sessionStorage.removeItem(key);
      sessionStorage.setItem(
        `atlas-navigation:${user}`,
        JSON.stringify([
          ...rows.map((r: { href: string }) => ({
            ...r,
            path: r.href.split("?")[0],
            title: "Legacy private label must not persist",
          })),
          {
            href: sourceHref,
            path: sourceHref,
            title: "Legacy duplicate source tab",
          },
        ]),
      );
    },
    { user: a.id, sourceHref: path + "/sources/" + source.id },
  );
  await page.reload();
  await page
    .locator(".workspace-tabs")
    .getByRole("link", { name: "Controlled navigation draft 12", exact: true })
    .waitFor();
  assert.equal(await page.locator(".working-tab").count(), tabCount);
  assert.ok(
    !(
      await page.evaluate(
        (user) => sessionStorage.getItem(`atlas-navigation:${user}:v3`),
        a.id,
      )
    )?.includes("Legacy"),
  );
  await page
    .getByRole("button", { name: "Close sidebar", exact: true })
    .click();
  await page.reload();
  await page.locator(".app-shell.sidebar-closed").waitFor();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  const oc = await browser.newContext(),
    op = await oc.newPage();
  await login(op, outsider);
  const inaccessible = await (
    await oc.request.get(origin + "/api/search?q=attention")
  ).json();
  assert.equal(inaccessible.total, 0);
  const other = await oc.request.get(
    origin +
      "/api/navigation/tabs?href=" +
      encodeURIComponent(path + "/docs/" + docId),
  );
  assert.deepEqual(await other.json(), [null]);
  await oc.close();
  stage = "narrow sidebar/tab overflow/AI and direct version link";
  await page.setViewportSize({ width: 390, height: 900 });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.screenshot({ path: join(folder, "navigation-narrow.png") });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Ask Atlas", exact: true }).click();
  await page.getByRole("button", { name: "Focus AI", exact: true }).click();
  await page.screenshot({ path: join(folder, "ai-focus-narrow.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Compact AI", exact: true }).click();
  await page.goto(
    origin +
      path +
      `/sources/${source.id}/read?version=${version.id}&page=2&annotation=${note.id}`,
  );
  await page.locator('.pdf-paper[data-page="2"].is-rendered').waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: join(folder, "return-reader-narrow.png") });
  assert.equal(runCount, 0);
  assert.equal(previewCount, 1);
  assert.deepEqual(errors, []);
  console.log(
    "PASS Home → project → live Discover / manual public arXiv import → Library → real PDF page note → saved source-linked document → task → discussion / teammate reply → Inbox → exact PDF version/page/note; one AI draft/scope through compact/float/focus/dock and Home/Inbox; close recovery, Back/Forward, >10 stable object tabs/order/reload, identifier-only tab storage, authorized search, narrow surfaces. No model call.",
  );
  console.log("Controlled evidence: " + folder);
} catch (error) {
  console.error(
    "FAIL at " +
      stage +
      ": " +
      (error instanceof Error ? error.message.slice(0, 350) : "unknown"),
  );
  if (error instanceof Error)
    console.error(
      error.stack?.match(/connected-workspace-qa\.ts:\d+:\d+/)?.[0],
    );
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
