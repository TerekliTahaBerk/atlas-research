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
let stage = "start";
try {
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(origin + "/health/live")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const ownerIdentity = await requireIdentity(auth, user.headers),
    viewerIdentity = await requireIdentity(auth, viewer.headers);
  const w = (
    await createSharedWorkspace(db, ownerIdentity, {
      name: "Library verification",
      requestId: randomUUID(),
    })
  ).id;
  const p = (
    await createProject(db, ownerIdentity, w, {
      name: "Library controlled journey",
      requestId: randomUUID(),
    })
  ).id;
  await createInvitation(db, ownerIdentity, mail, origin, w, p, {
    email: viewer.email,
    role: "viewer",
  });
  await mail.flush();
  await acceptInvitation(
    db,
    viewerIdentity,
    smtp
      .latest(viewer.email, "Your Atlas project invitation")
      .pathname.split("/")
      .at(-1)!,
  );
  const path = `/w/${w}/p/${p}`,
    base = `${origin}/api/research/${w}/${p}`,
    headers = { origin };
  async function login(
    email = user.email,
    password = user.password,
    target = page,
  ) {
    await target.goto(origin + "/sign-in");
    await target.getByLabel("Email", { exact: true }).fill(email);
    await target.getByLabel("Password", { exact: true }).fill(password);
    await target.getByRole("button", { name: "Sign in", exact: true }).click();
    await target.waitForURL("**/home");
  }
  async function post(url: string, data: unknown) {
    const r = await context.request.post(url, { headers, data });
    assert.equal(r.ok(), true, `POST failed (${r.status()})`);
    return r.json();
  }
  async function state() {
    return (await context.request.get(base + "/sources/" + s)).json();
  }
  async function bulk(action: string, extra: Record<string, string> = {}) {
    await page.getByLabel("Bulk action", { exact: true }).selectOption(action);
    const dialog = page.getByRole("dialog");
    if (action.startsWith("tag-"))
      await dialog.getByLabel("Tag", { exact: true }).fill(extra.tag);
    if (action.startsWith("collection-"))
      await dialog
        .getByLabel("Collection", { exact: true })
        .selectOption(extra.collectionId);
    if (action === "reading")
      await dialog
        .getByLabel("My reading status", { exact: true })
        .selectOption(extra.status);
    await dialog
      .getByRole("button", { name: "Apply to selection", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
  }
  console.log(
    "Library only: production Chromium + disposable PostgreSQL; real Crossref metadata, controlled paper. No paid AI calls.",
  );
  stage = "discover, save, duplicate";
  await login();
  await page.goto(origin + path + "/discover");
  await page
    .getByLabel("Search academic papers")
    .fill("10.1371/journal.pbio.1002106");
  await page
    .getByRole("button", { name: "Search papers", exact: true })
    .click();
  const paper = page
    .locator(".discovery-row")
    .filter({ hasText: "10.1371/journal.pbio.1002106" })
    .first();
  await paper
    .getByRole("button", { name: "Save to library", exact: true })
    .click();
  await paper.getByRole("link", { name: "Open saved source" }).click();
  await page.locator(".source-title").waitFor();
  const s = new URL(page.url()).searchParams.get("source")!;
  assert.ok(s);
  await page.getByRole("button", { name: "My Library", exact: true }).click();
  await page.getByRole("button", { name: "Add source", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("DOI", { exact: true })
    .fill("10.1371/journal.pbio.1002106");
  await dialog
    .getByLabel("Title", { exact: true })
    .fill("Same DOI, no second source");
  await dialog.getByRole("button", { name: "Add to library" }).click();
  await dialog.getByText("Already in this project", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Open existing source" }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    (await (await context.request.get(base + "/sources")).json()).total,
    1,
  );
  stage = "collection and normalized tags";
  await page
    .getByRole("button", { name: "Create collection", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Collection name", { exact: true }).fill("Methods");
  await dialog
    .getByRole("button", { name: "Create collection", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  await page
    .getByRole("button", {
      name: "Edit details, tags & collections",
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Tags comma separated", { exact: true })
    .fill("  Methods, methods, #METHODS ");
  await dialog.getByLabel("Methods", { exact: true }).check();
  await dialog.getByRole("button", { name: "Save source details" }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.deepEqual((await state()).source.tags, ["methods"]);
  const c = (
    await (await context.request.get(base + "/collections")).json()
  )[0];
  await page
    .getByRole("link", { name: "Close source details", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search library", exact: true })
    .fill("P-Hacking");
  await page
    .getByRole("button", { name: "Search library", exact: true })
    .click();
  await page.getByLabel("Sort sources").selectOption("title");
  await page.locator(".library-filter-menu > summary").click();
  stage = "filter PDF availability";
  await page.getByLabel("PDF availability").selectOption("no");
  stage = "filter Publication year";
  await page.getByLabel("Publication year").selectOption("2015");
  stage = "filter Collection";
  await page.getByLabel("Collection", { exact: true }).selectOption(c.id);
  stage = "filter Tag";
  await page.getByLabel("Tag", { exact: true }).selectOption("methods");
  await page.keyboard.press("Escape");
  await page
    .getByRole("link", {
      name: "The Extent and Consequences of P-Hacking in Science",
      exact: true,
    })
    .last()
    .click();
  await page.locator(".source-title").waitFor();
  stage = "PDF upload, exact version, Library return";
  await page.getByRole("button", { name: "Upload PDF", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .locator("input[type=file]")
    .setInputFiles("/private/tmp/atlas-phase02-paper.pdf");
  await dialog.getByRole("button", { name: "Upload PDF", exact: true }).click();
  await page.waitForURL("**/read?version=*");
  await page
    .locator(".textLayer span")
    .filter({ hasText: "P-Hacking" })
    .first()
    .waitFor();
  const version = new URL(page.url()).searchParams.get("version");
  await page.getByLabel("PDF page", { exact: true }).fill("2");
  await page
    .getByRole("status")
    .filter({ hasText: "Reading position saved" })
    .waitFor();
  await page.getByRole("link", { name: "Source details", exact: true }).click();
  await page.locator(".source-title").waitFor();
  assert.equal(new URL(page.url()).searchParams.get("q"), "P-Hacking");
  assert.equal(new URL(page.url()).searchParams.get("sort"), "title");
  await page
    .getByRole("link", { name: "Close source details", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove Without PDF", exact: true })
    .click();
  await page.locator(".paper-row").waitFor();
  stage = "bulk, preserved failure selection, BibTeX/RIS downloads";
  await page
    .getByLabel("Select all sources on this page", { exact: true })
    .check();
  await bulk("tag-add", { tag: "Reviewed" });
  await bulk("reading", { status: "done" });
  await bulk("collection-remove", { collectionId: c.id });
  // The collection filter now has no matches. Clear it and select the returned source.
  await page
    .getByRole("button", { name: "Remove Collection: Methods", exact: true })
    .click();
  await page.locator(".paper-row").waitFor();
  await page
    .getByLabel("Select all sources on this page", { exact: true })
    .check();
  await bulk("collection-add", { collectionId: c.id });
  expectedNetworkFailure = true;
  await page.route("**/sources/bulk", (r) => r.abort());
  await page.getByLabel("Bulk action").selectOption("tag-add");
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tag", { exact: true }).fill("Retry-kept");
  await dialog.getByRole("button", { name: "Apply to selection" }).click();
  await dialog
    .getByText(
      "Could not connect. Your input is still here; please try again.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await page.getByLabel("Select all sources on this page").isChecked(),
    true,
  );
  await page.unroute("**/sources/bulk");
  await dialog.getByRole("button", { name: "Apply to selection" }).click();
  await dialog.waitFor({ state: "hidden" });
  expectedNetworkFailure = false;
  for (const [label, extension] of [
    ["BibTeX", "bib"],
    ["RIS", "ris"],
  ]) {
    const pending = page.waitForEvent("download");
    await page
      .locator(".library-selection")
      .getByRole("link", { name: label, exact: true })
      .click();
    const d = await pending;
    const saved = join(folder, "selected." + extension);
    await d.saveAs(saved);
    assert.match(readFileSync(saved, "utf8"), /10.1371\/journal.pbio.1002106/);
  }
  stage = "atomic writes, revisions and access boundaries";
  const before = await state();
  assert.equal(before.reading.status, "done");
  assert.ok(before.source.tags.includes("reviewed"));
  const unchanged = before.source.revision;
  await post(base + "/sources/bulk", {
    action: "collection-add",
    ids: [s],
    collectionId: c.id,
  });
  assert.equal((await state()).source.revision, unchanged);
  const foreignP = (
      await createProject(db, ownerIdentity, w, {
        name: "Separate project",
        requestId: randomUUID(),
      })
    ).id,
    foreignBase = `${origin}/api/research/${w}/${foreignP}`;
  const foreign = (
    await post(foreignBase + "/sources", {
      title: "Controlled foreign source",
      authors: [],
      year: null,
      venue: "",
      doi: null,
      url: null,
      abstract: "",
    })
  ).source;
  assert.equal(
    (
      await context.request.post(base + "/sources/bulk", {
        headers,
        data: { action: "tag-add", ids: [s, foreign.id], tag: "must-not-land" },
      })
    ).status(),
    404,
  );
  assert.ok(!(await state()).source.tags.includes("must-not-land"));
  const vc = await browser.newContext(),
    vp = await vc.newPage();
  await login(viewer.email, viewer.password, vp);
  for (const input of [
    { action: "tag-add", ids: [s], tag: "forbidden" },
    { action: "collection-remove", ids: [s], collectionId: c.id },
    { action: "archive", ids: [s] },
  ])
    assert.equal(
      (
        await vc.request.post(base + "/sources/bulk", { headers, data: input })
      ).status(),
      404,
    );
  assert.equal(
    (
      await vc.request.patch(base + "/collections/" + c.id, {
        headers,
        data: { action: "remove", expectedName: "Methods" },
      })
    ).status(),
    404,
  );
  assert.equal(
    (
      await vc.request.post(base + "/sources/bulk", {
        headers,
        data: { action: "reading", ids: [s], status: "reading" },
      })
    ).status(),
    200,
  );
  assert.equal((await state()).reading.status, "done");
  assert.equal((await vc.request.get(foreignBase + "/sources")).status(), 404);
  await vc.close();
  stage = "rename, remove collection preserves content, archive and restore";
  let r = await context.request.patch(base + "/collections/" + c.id, {
    headers,
    data: {
      action: "rename",
      name: "Evidence methods",
      expectedName: "Methods",
    },
  });
  assert.equal(r.status(), 200);
  r = await context.request.patch(base + "/collections/" + c.id, {
    headers,
    data: { action: "rename", name: "Stale write", expectedName: "Methods" },
  });
  assert.equal(r.status(), 409);
  r = await context.request.patch(base + "/collections/" + c.id, {
    headers,
    data: { action: "remove", expectedName: "Evidence methods" },
  });
  assert.equal(r.status(), 200);
  assert.equal(
    (await state()).versions.find((v: { id: string }) => v.id === version)
      .fileId,
    before.versions.find((v: { id: string }) => v.id === version).fileId,
  );
  await post(base + "/sources/bulk", { action: "archive", ids: [s] });
  assert.equal(
    (await (await context.request.get(base + "/sources")).json()).total,
    0,
  );
  await post(base + "/sources/bulk", { action: "restore", ids: [s] });
  assert.equal((await state()).source.archivedAt, null);
  stage = "complete pagination and preserved list scroll";
  for (let n = 0; n < 32; n++)
    await post(base + "/sources", {
      title: `Controlled source ${String(n).padStart(2, "0")}${n === 0 ? " — a deliberately long title ".repeat(12) : ""}`,
      authors: n % 2 ? ["Controlled Author"] : [],
      year: n % 2 ? 2024 : null,
      venue: "",
      doi: null,
      url: null,
      abstract: "",
    });
  const first = await (
      await context.request.get(base + "/sources?sort=title")
    ).json(),
    second = await (
      await context.request.get(base + "/sources?sort=title&page=1")
    ).json();
  assert.equal(first.total, 33);
  assert.equal(first.items.length, 30);
  assert.equal(second.items.length, 3);
  assert.equal(
    new Set([...first.items, ...second.items].map((s: { id: string }) => s.id))
      .size,
    33,
  );
  await page.goto(origin + path + "/sources?sort=title");
  await page.locator(".paper-row").first().waitFor();
  await page.locator(".library-main").evaluate((el) => (el.scrollTop = 500));
  await page.locator(".paper-title").nth(10).click();
  await page.locator(".source-title").waitFor();
  await page
    .getByRole("link", { name: "Close source details", exact: true })
    .click();
  assert.ok(
    (await page.locator(".library-main").evaluate((el) => el.scrollTop)) > 0,
  );
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByText("Page 2 of 2", { exact: true }).waitFor();
  await page.reload();
  await page.getByText("Page 2 of 2", { exact: true }).waitFor();
  assert.equal(await page.locator(".paper-row").count(), 3);
  stage = "desktop and narrow visual states";
  await page.goto(origin + path + "/sources?q=P-Hacking");
  await page.locator(".paper-row").waitFor();
  await page.screenshot({ path: join(folder, "library-desktop.png") });
  await page.locator(".paper-title").click();
  await page.locator(".source-title").waitFor();
  await page.screenshot({ path: join(folder, "library-panel-desktop.png") });
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await page.screenshot({ path: join(folder, "library-panel-dark.png") });
  await page.getByRole("button", { name: "Light theme", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 900 });
  await page
    .getByRole("dialog", { name: "Source details", exact: true })
    .waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: join(folder, "library-panel-narrow.png") });
  await page.keyboard.press("Escape");
  await page.getByLabel("Collections and reading filters").click();
  await page
    .getByRole("dialog", { name: "Collections and reading", exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  await page.screenshot({ path: join(folder, "library-narrow.png") });
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await page.screenshot({ path: join(folder, "discover-narrow.png") });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real discovery/save/duplicate → collections/tags → combined filters/sort → private PDF/exact version/return → bulk retry/atomicity → actual BibTeX/RIS downloads → reload/reopen; viewer-own status, denied shared writes/foreign project, rename CAS, unlink preservation, archive/restore, all 33 sources paginated, desktop/dark/narrow.",
  );
  console.log(`Controlled evidence: ${folder}`);
} catch (error) {
  if (error && typeof error === "object" && "actual" in error)
    console.error({
      actual: error.actual,
      expected: "expected" in error ? error.expected : undefined,
      at:
        error instanceof Error
          ? error.stack?.match(/library-browser-qa\.ts:\d+:\d+/)?.[0]
          : undefined,
    });
  if (error instanceof Error)
    console.error(error.message.split("\n")[0].slice(0, 220));
  console.error(
    `FAIL at ${stage}: ${error instanceof Error ? error.name : "Error"}; private values omitted.`,
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
    db.$disconnect(),
    authDb.$disconnect(),
    mail.close(),
    worker.close(),
    smtp.close(),
  ]);
}
