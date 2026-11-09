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
import { requireIdentity } from "../src/server/auth/identity";
import { createSharedWorkspace } from "../src/server/domain/workspaces";
import { createProject } from "../src/server/domain/projects";
import {
  createInvitation,
  acceptInvitation,
} from "../src/server/domain/invitations";
import { readerPdfFixture } from "../tests/helpers/reader-pdf";
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
  folder = mkdtempSync(join(tmpdir(), "atlas-reader-browser-")),
  smtp = await startMailServer();
process.env.APP_ORIGIN = origin;
process.env.SMTP_PORT = String(smtp.port);
process.env.FILE_STORAGE_PATH = join(folder, "private-files");
const env = getEnv(),
  authDb = createDatabase(env.AUTH_DATABASE_URL),
  db = createDatabase(env.DATABASE_URL),
  mail = createMailQueue(env),
  auth = createAuth(authDb, env, mail),
  worker = createFileWorker(process.env);
const user = await verifiedUser(auth, mail, smtp),
  viewer = await verifiedUser(auth, mail, smtp),
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
let expectedNetworkFailure = false;
page.on("pageerror", (e) => errors.push(e.name));
page.on("console", (e) => {
  if (
    e.type() === "error" &&
    !(expectedNetworkFailure && /ERR_FAILED/.test(e.text())) &&
    !/Failed to load resource:.*\b(401|403|404|429)\b/.test(e.text())
  )
    errors.push("console-error");
});
let stage = "setup";
try {
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(origin + "/health/live")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const a = await requireIdentity(auth, user.headers),
    v = await requireIdentity(auth, viewer.headers),
    w = (
      await createSharedWorkspace(db, a, {
        name: "Reader verification",
        requestId: randomUUID(),
      })
    ).id,
    p = (
      await createProject(db, a, w, {
        name: "Reader controlled journey",
        requestId: randomUUID(),
      })
    ).id;
  await createInvitation(db, a, mail, origin, w, p, {
    email: viewer.email,
    role: "viewer",
  });
  await mail.flush();
  await acceptInvitation(
    db,
    v,
    smtp
      .latest(viewer.email, "Your Atlas project invitation")
      .pathname.split("/")
      .at(-1)!,
  );
  const path = `/w/${w}/p/${p}`,
    base = `${origin}/api/research/${w}/${p}`,
    collab = `${origin}/api/collaboration/${w}/${p}`,
    headers = { origin };
  async function login(target = page, identity = user) {
    await target.goto(origin + "/sign-in");
    await target.getByLabel("Email", { exact: true }).fill(identity.email);
    await target
      .getByLabel("Password", { exact: true })
      .fill(identity.password);
    await target.getByRole("button", { name: "Sign in", exact: true }).click();
    await target.waitForURL("**/home");
  }
  async function post(url: string, data: unknown) {
    const r = await context.request.post(url, { headers, data });
    assert.equal(r.status(), 200);
    return r.json();
  }
  await login();
  await context.grantPermissions(["clipboard-write"], { origin });
  const source = (
      await post(base + "/sources", {
        title: "The Extent and Consequences of P-Hacking in Science",
        authors: ["Megan L. Head", "Luke Holman"],
        year: 2015,
        venue: "PLOS Biology",
        doi: "10.1371/journal.pbio.1002106",
        url: "https://doi.org/10.1371/journal.pbio.1002106",
        abstract: "",
      })
    ).source,
    s = source.id;
  const bytes = readFileSync("/private/tmp/atlas-phase02-paper.pdf");
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  const upload = await context.request.post(`${base}/sources/${s}/upload`, {
    headers: {
      ...headers,
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      "X-Upload-Id": randomUUID(),
      "X-File-Name": "public-plos-paper.pdf",
    },
    data: bytes,
  });
  assert.equal(upload.status(), 200);
  const version = (await upload.json()).versionId;
  async function state() {
    return (await context.request.get(`${base}/sources/${s}`)).json();
  }
  async function goPage(n: number) {
    await page.getByLabel("PDF page", { exact: true }).fill(String(n));
    await page.getByLabel("PDF page", { exact: true }).press("Enter");
    await page
      .locator(`.pdf-paper[data-page="${n}"] .textLayer span`)
      .first()
      .waitFor();
  }
  async function chooseTitle() {
    await goPage(1);
    const span = page
      .locator('.pdf-paper[data-page="1"] .textLayer span')
      .filter({ hasText: "P-Hacking" })
      .first();
    await span.evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
    await page
      .getByRole("toolbar", { name: "Selected PDF text", exact: true })
      .waitFor();
  }
  console.log(
    "Reader only: production Chromium + disposable PostgreSQL; real CC-BY PLOS PDF. Browser plugin not available. No paid AI call.",
  );
  stage = "Library entry, page navigation, zoom anchor and bounded rendering";
  await page.goto(origin + path + "/sources?sort=title");
  await page
    .getByRole("link", { name: "Read PDF: " + source.title, exact: true })
    .click();
  await page.locator(".pdf-paper.is-rendered").first().waitFor();
  await goPage(2);
  await page.locator(".pdf-scroll").evaluate((el) => {
    el.scrollTop += 180;
  });
  await page.waitForFunction(
    () =>
      Number(
        (
          document.querySelector(
            'input[aria-label="PDF page"]',
          ) as HTMLInputElement
        ).value,
      ) === 2,
  );
  const before = await page.locator(".pdf-scroll").evaluate((el) => {
    const paper = el.querySelector(
      '.pdf-page-slot[data-page="2"]',
    ) as HTMLElement;
    return (el.scrollTop + 24 - paper.offsetTop) / paper.offsetHeight;
  });
  await page.getByLabel("PDF zoom", { exact: true }).selectOption("1.25");
  await page.locator('.pdf-paper[data-page="2"].is-rendered').waitFor();
  const after = await page.locator(".pdf-scroll").evaluate((el) => {
    const paper = el.querySelector(
      '.pdf-page-slot[data-page="2"]',
    ) as HTMLElement;
    return (el.scrollTop + 24 - paper.offsetTop) / paper.offsetHeight;
  });
  assert.ok(
    Math.abs(before - after) < 0.04,
    `Zoom anchor drift ${before}/${after}`,
  );
  assert.ok((await page.locator(".pdf-paper canvas").count()) < 7);
  await page.getByRole("button", { name: "Notes (0)", exact: true }).click();
  await page.getByRole("button", { name: "Notes (0)", exact: true }).click();
  assert.equal(
    await page.getByLabel("PDF page", { exact: true }).inputValue(),
    "2",
  );
  await page.getByLabel("PDF zoom", { exact: true }).selectOption("page");
  await page.locator('.pdf-paper[data-page="2"].is-rendered').waitFor();
  await page.getByLabel("PDF zoom", { exact: true }).selectOption("1.25");
  stage = "all-match search, transient highlight and continued scrolling";
  await page
    .getByRole("button", { name: "Search in PDF", exact: true })
    .click();
  await page.getByLabel("Search PDF text", { exact: true }).fill("p-hacking");
  await page
    .locator(".reader-search-bar")
    .getByRole("button", { name: "Search", exact: true })
    .click();
  await page
    .locator(".reader-search-bar")
    .getByRole("status")
    .filter({ hasText: /of \d+/ })
    .waitFor();
  await page.locator(".pdf-search-highlight.current").first().waitFor();
  assert.equal((await state()).annotations.length, 0);
  await page
    .getByRole("button", { name: "Next search result", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Previous search result", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close PDF search", exact: true })
    .click();
  assert.equal(await page.locator(".pdf-search-highlight").count(), 0);
  await goPage(1);
  await page
    .locator('.pdf-paper[data-page="1"] .textLayer span')
    .first()
    .evaluate((node) => {
      const paper = node.closest(".pdf-paper")!.getBoundingClientRect();
      const siblings = [...node.parentElement!.querySelectorAll("span")].filter(
        (e) => e.textContent?.trim(),
      );
      const first = siblings.findIndex((e) => {
        const r = e.getBoundingClientRect();
        return (
          (e.textContent?.length ?? 0) > 30 &&
          (r.left - paper.left) / paper.width > 0.3 &&
          (r.top - paper.top) / paper.height > 0.5
        );
      });
      if (first < 0) throw new Error("Reading-column text not found");
      const last = Math.min(siblings.length - 1, first + 2),
        range = document.createRange();
      range.setStart(siblings[first].firstChild!, 0);
      range.setEnd(
        siblings[last].firstChild!,
        siblings[last].textContent!.length,
      );
      const selected = getSelection();
      selected?.removeAllRanges();
      selected?.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
  await page
    .getByRole("toolbar", { name: "Selected PDF text" })
    .getByRole("button", { name: "Copy", exact: true })
    .click();
  await page.getByText("Selected text copied", { exact: true }).waitFor();
  await page.getByLabel("Dismiss text selection", { exact: true }).click();
  stage = "selection, timeout-safe highlight/comment and edit";
  await chooseTitle();
  const selectionBounds = await page
    .getByRole("toolbar", { name: "Selected PDF text" })
    .boundingBox();
  assert.ok(
    selectionBounds &&
      selectionBounds.x >= 0 &&
      selectionBounds.x + selectionBounds.width <= 1440,
  );
  await page
    .getByRole("toolbar", { name: "Selected PDF text" })
    .getByRole("button", { name: "Comment", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Annotation note", { exact: true })
    .fill("Reader verification: exact selected evidence.");
  await dialog
    .getByRole("button", { name: "Highlight color blue", exact: true })
    .click();
  expectedNetworkFailure = true;
  await page.route(
    "**/versions/*/annotations",
    async (route) => {
      await route.fetch();
      await route.abort();
    },
    { times: 1 },
  );
  await dialog
    .getByRole("button", { name: "Save highlight", exact: true })
    .click();
  await dialog
    .getByText(
      "Could not connect. Your input is still here; please try again.",
      { exact: true },
    )
    .waitFor();
  await dialog
    .getByRole("button", { name: "Save highlight", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  expectedNetworkFailure = false;
  let data = await state();
  assert.equal(data.annotations.length, 1);
  const annotation = data.annotations[0];
  assert.equal(annotation.color, "blue");
  assert.ok(
    annotation.rects.every((r: number[]) => r.every((n) => n >= 0 && n <= 1)),
  );
  const card = page.locator("#annotation-" + annotation.id);
  await card.waitFor();
  await card.locator(".annotation-menu > summary").click();
  await card.getByRole("button", { name: "Edit note", exact: true }).click();
  await card
    .getByLabel("Edit note", { exact: true })
    .fill("Reader verification: exact selected evidence, edited.");
  await card
    .getByLabel("Highlight color", { exact: true })
    .selectOption("green");
  await card.getByRole("button", { name: "Save note", exact: true }).click();
  await card
    .getByText("Reader verification: exact selected evidence, edited.", {
      exact: true,
    })
    .waitFor();
  stage = "page note and source-linked existing writing";
  await goPage(2);
  await page
    .getByRole("button", { name: "Add page note", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Annotation note", { exact: true })
    .fill("Reader verification: independent page two note.");
  await dialog
    .getByRole("button", { name: "Save page note", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  await page
    .locator(".annotation-card")
    .filter({ hasText: "independent page two note" })
    .waitFor();
  const doc = await post(collab + "/documents", {
    requestId: randomUUID(),
    title: "Reader quoted research",
  });
  await card
    .getByRole("button", { name: "Write from this", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Writing destination", { exact: true })
    .selectOption(doc.id);
  await dialog
    .getByRole("link", { name: "Open and cite", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Add source citation" });
  await dialog
    .getByRole("button", { name: "Insert citation", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  await page
    .locator('[aria-label="Document body"] blockquote')
    .filter({ hasText: /[Pp].*[Hh]acking/ })
    .waitFor();
  await page.locator(".save-indicator").filter({ hasText: "Saved" }).waitFor();
  for (let retry = 0; retry < 50; retry++) {
    const current = await (
      await context.request.get(collab + "/documents/" + doc.id)
    ).json();
    if (current.document.revision >= 2) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const written = await (
    await context.request.get(collab + "/documents/" + doc.id)
  ).json();
  assert.ok(JSON.stringify(written.document.body).includes(annotation.quote));
  assert.equal(written.citations[0].versionId, version);
  assert.equal(written.citations[0].annotationId, annotation.id);
  stage = "citation returns to exact highlight, linked task";
  await page.locator(".document-citation").first().click();
  await page.waitForURL("**/read?*");
  await page
    .locator(`[data-annotation="${annotation.id}"].active`)
    .first()
    .waitFor();
  assert.equal(new URL(page.url()).searchParams.get("version"), version);
  assert.equal(
    new URL(page.url()).searchParams.get("annotation"),
    annotation.id,
  );
  const restoredCard = page
    .locator(".annotation-card")
    .filter({ hasText: "exact selected evidence, edited." });
  await restoredCard
    .locator(".research-connected .action-menu > summary")
    .click();
  await restoredCard
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Task title", { exact: true })
    .fill("Reader evidence follow-up");
  await dialog
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  await page.getByLabel("Task title", { exact: true }).waitFor();
  await page
    .locator(".artifact-cards")
    .getByRole("link")
    .filter({ hasText: source.title })
    .waitFor();
  await page.goto(
    origin +
      path +
      `/sources/${s}/read?version=${version}&page=2&library=sort%3Dtitle`,
  );
  await page.locator('.pdf-paper[data-page="2"].is-rendered').waitFor();
  await page.getByLabel("PDF zoom", { exact: true }).selectOption("1.25");
  await page
    .getByRole("status")
    .filter({ hasText: "Reading position saved" })
    .waitFor();
  stage = "immutable older version and independent version positions";
  const other = readerPdfFixture();
  const next = await context.request.post(`${base}/sources/${s}/upload`, {
    headers: {
      ...headers,
      "Content-Type": "application/pdf",
      "Content-Length": String(other.length),
      "X-Upload-Id": randomUUID(),
    },
    data: other,
  });
  assert.equal(next.status(), 200);
  const newer = (await next.json()).versionId;
  await page.reload();
  await page.locator('.pdf-paper[data-page="2"].is-rendered').waitFor();
  await page.locator(".reader-file-menu > summary").click();
  await page.getByLabel("PDF version", { exact: true }).selectOption(newer);
  await page.waitForFunction(
    (v) => new URL(location.href).searchParams.get("version") === v,
    newer,
  );
  await page.locator('.pdf-paper[data-page="1"].is-rendered').waitFor();
  await page.getByText("Label i", { exact: true }).waitFor();
  await page.locator(".reader-file-menu > summary").click();
  await page.getByRole("button", { name: "PDF outline", exact: true }).click();
  await page
    .locator(".reader-outline")
    .getByRole("button", { name: /Controlled bookmark/ })
    .click();
  await page
    .locator(".reader-panel-tabs")
    .getByRole("button", { name: "Notes", exact: true })
    .click();
  await page
    .getByText("No selectable text on page 1.", { exact: false })
    .waitFor();
  await page
    .locator(".reader-notes")
    .getByRole("button", { name: "Add page note", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Annotation note")
    .fill("Controlled note without selectable text.");
  await dialog
    .getByRole("button", { name: "Save page note", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByLabel("PDF zoom", { exact: true }).selectOption("0.75");
  await page
    .getByRole("status")
    .filter({ hasText: "Reading position saved" })
    .waitFor();
  await page.locator(".reader-file-menu > summary").click();
  await page.getByLabel("PDF version", { exact: true }).selectOption(version);
  await page.waitForFunction(
    (v) => new URL(location.href).searchParams.get("version") === v,
    version,
  );
  await page.locator('.pdf-paper[data-page="2"].is-rendered').waitFor();
  assert.equal(
    await page.getByLabel("PDF page", { exact: true }).inputValue(),
    "2",
  );
  assert.equal(
    await page.getByLabel("PDF zoom", { exact: true }).inputValue(),
    "1.25",
  );
  data = await state();
  assert.equal(data.positions.length, 2);
  assert.equal(
    data.positions.find((r: { versionId: string }) => r.versionId === version)
      .page,
    2,
  );
  assert.equal(
    data.positions.find((r: { versionId: string }) => r.versionId === newer)
      .zoom,
    0.75,
  );
  assert.equal(
    data.annotations.find((n: { id: string }) => n.id === annotation.id)
      .versionId,
    version,
  );
  stage = "relogin, viewer and private-file boundaries";
  await page
    .getByRole("status")
    .filter({ hasText: "Reading position saved" })
    .waitFor();
  await context.request.post(origin + "/api/auth/sign-out", {
    headers,
    data: {},
  });
  await login();
  await page.goto(
    origin +
      path +
      `/sources/${s}/read?version=${version}&library=sort%3Dtitle`,
  );
  await page.locator('.pdf-paper[data-page="2"].is-rendered').waitFor();
  assert.equal(
    await page.getByLabel("PDF zoom", { exact: true }).inputValue(),
    "1.25",
  );
  assert.equal(
    (await state()).annotations.filter(
      (a: { versionId: string }) => a.versionId === version,
    ).length,
    2,
  );
  const vc = await browser.newContext(),
    vp = await vc.newPage();
  await login(vp, viewer);
  await vp.goto(origin + path + `/sources/${s}/read?version=${version}`);
  await vp.locator(".pdf-paper.is-rendered").first().waitFor();
  assert.equal(
    await vp
      .getByRole("button", { name: "Add page note", exact: true })
      .count(),
    0,
  );
  assert.equal(
    (
      await vc.request.post(
        `${base}/sources/${s}/versions/${version}/annotations`,
        {
          headers,
          data: {
            kind: "note",
            page: 1,
            body: "denied",
            quote: "",
            rects: [],
            color: "yellow",
          },
        },
      )
    ).status(),
    404,
  );
  assert.equal(
    (
      await vc.request.patch(`${base}/annotations/${annotation.id}`, {
        headers,
        data: { body: "denied", revision: 1 },
      })
    ).status(),
    404,
  );
  const privateFile = `${base}/sources/${s}/versions/${version}/file`,
    anon = await browser.newContext();
  assert.equal((await anon.request.get(privateFile)).status(), 401);
  assert.equal(
    (
      await vc.request.get(privateFile.replace(`/${p}/`, `/${randomUUID()}/`))
    ).status(),
    404,
  );
  await vc.close();
  await anon.close();
  stage = "desktop, dark, narrow selection geometry and Library return";
  await page.goto(
    origin +
      path +
      `/sources/${s}/read?version=${version}&page=1&annotation=${annotation.id}&library=sort%3Dtitle`,
  );
  await page
    .locator(`[data-annotation="${annotation.id}"].active`)
    .first()
    .waitFor();
  await page.screenshot({ path: join(folder, "reader-desktop.png") });
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await page.locator('.pdf-paper[data-page="1"].is-rendered').waitFor();
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '.pdf-paper[data-page="1"] canvas',
    );
    if (!canvas?.width) return false;
    const pixels = canvas
      .getContext("2d")!
      .getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < pixels.length; i += 400)
      if (pixels[i + 3] && pixels[i] < 180) return true;
    return false;
  });
  await page.screenshot({ path: join(folder, "reader-dark.png") });
  await page.getByRole("button", { name: "Light theme", exact: true }).click();
  async function anchorCheck() {
    const m = await page
      .locator(`[data-annotation="${annotation.id}"]`)
      .first()
      .evaluate((el) => {
        const a = el.getBoundingClientRect(),
          p = el.closest(".pdf-paper")!.getBoundingClientRect();
        return [
          (a.left - p.left) / p.width,
          (a.top - p.top) / p.height,
          a.width / p.width,
          a.height / p.height,
        ];
      });
    assert.ok(
      m.every(
        (n: number, i: number) => Math.abs(n - annotation.rects[0][i]) < 0.01,
      ),
    );
  }
  await anchorCheck();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForFunction(() => {
    const paper = document.querySelector('.pdf-paper[data-page="1"]');
    return (
      paper?.classList.contains("is-rendered") &&
      paper.getBoundingClientRect().width < 500
    );
  });
  await page.locator('.pdf-paper[data-page="1"].is-rendered').waitFor();
  await page
    .locator(`[data-annotation="${annotation.id}"]`)
    .first()
    .waitFor({ state: "visible" });
  await anchorCheck();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: join(folder, "reader-narrow.png") });
  await page.getByRole("button", { name: "Notes (2)", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Notes & source", exact: true })
    .waitFor();
  await page.screenshot({ path: join(folder, "reader-notes-narrow.png") });
  await page.keyboard.press("Escape");
  await page
    .getByRole("link", { name: "Back to Library", exact: true })
    .click();
  await page.locator(".paper-row").waitFor();
  assert.equal(new URL(page.url()).searchParams.get("sort"), "title");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Library → continuous PDF/pages/zoom/fit → all-match search → normalized selected highlight, retry without duplicate, comment/color edit + page note → quoted existing document + exact citation → linked task → old version and independent positions → reload/relogin; viewer/anonymous/foreign-file denial; bounded canvases, desktop/dark/narrow geometry and Library context.",
  );
  console.log(`Controlled evidence: ${folder}`);
} catch (error) {
  if (error && typeof error === "object" && "actual" in error)
    console.error({
      actual: error.actual,
      expected: "expected" in error ? error.expected : undefined,
    });
  if (error instanceof Error)
    console.error(
      error.message.split("\n")[0].slice(0, 250),
      error.stack?.match(/reader-browser-qa\.ts:\d+:\d+/)?.[0],
    );
  console.error(`FAIL at ${stage}; private values omitted.`);
  if (errors.length) console.error({ classes: errors });
  await page.screenshot({ path: join(folder, "failure.png") }).catch(() => {});
  console.log(`Controlled evidence: ${folder}`);
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
