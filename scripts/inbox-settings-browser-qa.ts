import {
  sendMessage,
  createTask,
  createDocument,
  createDiscussion,
} from "../src/server/collaboration/service";
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
import {
  createProject,
  revokeProjectMember,
} from "../src/server/domain/projects";
import {
  createInvitation,
  acceptInvitation,
} from "../src/server/domain/invitations";
import { calendarToday, calendarAfter } from "../src/lib/task-model";
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
  folder = mkdtempSync(join(tmpdir(), "atlas-inbox-settings-browser-")),
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
const doc = await createDocument(db, a, w, p, {
  requestId: randomUUID(),
  title: "Controlled research draft",
  origin: {
    sourceId: source.id,
    versionId: upload.versionId!,
    annotationId: note.id,
  },
});
const task = await createTask(db, a, w, p, {
  requestId: randomUUID(),
  title: "Controlled research follow-up",
  description: "Check source evidence",
  status: "backlog",
  priority: "medium",
  assigneeId: a.id,
  dueDate: calendarAfter(calendarToday(), 3),
  links: [source.id],
});
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
    "Browser plugin not available; production Chromium, disposable PostgreSQL and synthetic research only. No external email or model call.",
  );
  await authDb.user.update({
    where: { id: b.id },
    data: { name: "Research collaborator" },
  });
  const topic = await createDiscussion(db, a, w, p, {
    requestId: randomUUID(),
    title: "Review the source evidence",
    body: "What should we check next?",
    links: [source.id],
    mentions: [],
  });
  const input = {
    clientId: randomUUID(),
    body: "Please review this source-linked reply.",
    links: [note.id, doc.id],
    mentions: [a.id],
  };
  const first = await sendMessage(db, b, w, p, topic.id, input);
  await sendMessage(db, b, w, p, topic.id, input);
  for (let i = 0; i < 54; i++)
    await sendMessage(db, b, w, p, topic.id, {
      clientId: randomUUID(),
      body: `Follow-up research reply ${i + 1}`,
      links: [],
      mentions: [],
    });
  await login(page);
  const base = "/api/collaboration/inbox",
    paged = base + "?view=paged&status=all";
  const json = async (path: string) =>
    (await context.request.get(origin + path)).json();
  const result = await json(paged);
  assert.equal(result.total, 56);
  assert.equal(result.items.length, 30);
  assert.ok(result.next);
  assert.equal((await json(base + "?view=summary")).unread, 56);
  const second = await json(
    paged + "&snapshot=" + result.snapshot + "&before=" + result.next,
  );
  assert.equal(second.items.length, 26);
  assert.ok(!second.next);
  const mention = second.items.find(
    (n: { event: string }) => n.event === "mention",
  );
  const assigned = second.items.find(
    (n: { event: string }) => n.event === "assignment",
  );
  assert.equal(mention.sender, "Research collaborator");
  assert.equal(mention.links.length, 2);
  assert.ok(mention.target.href.endsWith("?message=" + first.id));
  stage = "assignment → Inbox → target → read state";
  await page.goto(origin + "/inbox");
  await page
    .getByRole("combobox", { name: "Notification type", exact: true })
    .selectOption("assignment");
  await page.locator(".inbox-item").filter({ hasText: task.title }).click();
  await page.getByRole("link", { name: "Open task", exact: true }).click();
  await page.waitForURL("**/tasks/" + task.id);
  await page
    .getByRole("textbox", { name: "Task title", exact: true })
    .waitFor();
  await page.locator('.sidebar a[href="/inbox"]').click();
  await page
    .getByRole("button", { name: "Mark unread", exact: true })
    .waitFor();
  assert.ok((await json(paged + "&selected=" + assigned.id)).selected.readAt);
  stage = "mention exact old message and research cards";
  await page
    .getByRole("combobox", { name: "Notification type", exact: true })
    .selectOption("mention");
  await page.locator(".inbox-item").filter({ hasText: topic.title }).click();
  await page
    .locator(".inbox-detail")
    .getByRole("link", { name: /PDF note/ })
    .waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector(".inbox-list-panel")?.getAttribute("aria-busy") ===
      "false",
  );
  await page.screenshot({ path: join(folder, "inbox-after.png") });
  await page.getByRole("link", { name: "Open message", exact: true }).click();
  await page.waitForURL("**/discussions/" + topic.id + "?message=" + first.id);
  await page
    .locator(`[data-message="${first.id}"][data-inbox-focus="true"]`)
    .waitFor();
  assert.match(
    await page.locator(`[data-message="${first.id}"]`).innerText(),
    /source-linked reply/,
  );
  const focused = await page
      .locator(`[data-message="${first.id}"]`)
      .boundingBox(),
    scroll = await page.locator(".discussion-message-scroll").boundingBox();
  assert.ok(
    focused &&
      scroll &&
      focused.y + focused.height > scroll.y &&
      focused.y < scroll.y + scroll.height,
  );
  await page.locator('.sidebar a[href="/inbox"]').click();
  await page
    .getByRole("group", { name: "Inbox view", exact: true })
    .getByRole("button", { name: "All", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Notification type", exact: true })
    .selectOption("all");
  await page.locator(".inbox-item").first().click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(".inbox-pagination")
        ?.textContent?.includes("Page 2") &&
      document.querySelector(".inbox-list-panel")?.getAttribute("aria-busy") ===
        "false",
  );
  assert.equal(await page.locator(".inbox-item").count(), 26);
  await page
    .locator(".inbox-list-scroll")
    .evaluate((el) => (el.scrollTop = 180));
  const beforeTop = await page
    .locator(".inbox-list-scroll")
    .evaluate((el) => el.scrollTop);
  const firstTitle = await page.locator(".inbox-item").first().innerText();
  await sendMessage(db, b, w, p, topic.id, {
    clientId: randomUUID(),
    body: "A new update while reading history",
    links: [],
    mentions: [],
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByRole("button", { name: /1 new update.*Show latest/ })
    .waitFor();
  assert.equal(
    await page.locator(".inbox-item").first().innerText(),
    firstTitle,
  );
  assert.equal(
    await page.locator(".inbox-list-scroll").evaluate((el) => el.scrollTop),
    beforeTop,
  );
  await page
    .getByRole("button", { name: "Mark this page read", exact: true })
    .click();
  await page.waitForTimeout(300);
  assert.ok(
    (await json(base + "?view=summary")).unread >= 30,
    "Bulk read does not mark other pages/new arrivals",
  );
  await page.getByRole("button", { name: /1 new update.*Show latest/ }).click();
  await page.waitForFunction(
    () =>
      document.querySelector(".inbox-list-panel")?.getAttribute("aria-busy") ===
        "false" &&
      document
        .querySelector(".inbox-pagination")
        ?.textContent?.includes("Page 1"),
  );
  await page.locator(".inbox-item").first().click();
  await page
    .getByText("A new update while reading history", { exact: true })
    .waitFor();
  stage = "read acknowledgement loss retries without changing timestamp";
  let readStamp: string | null = null;
  await page.locator(".inbox-item").first().click();
  const selectedId = JSON.parse(
    await page.evaluate(() =>
      sessionStorage.getItem(
        Object.keys(sessionStorage).find(
          (k) => k.startsWith("atlas-inbox-v2:") && !k.endsWith(":scroll"),
        )!,
      )!,
    ),
  ).selected;
  await page.route(
    "**/api/collaboration/inbox/" + selectedId,
    async (route) => {
      await route.fetch();
      await route.abort("failed");
    },
  );
  await page.getByRole("button", { name: "Mark read", exact: true }).click();
  await page
    .getByText("Your selection is kept. Try the same action again.", {
      exact: true,
    })
    .waitFor();
  readStamp = (await json(paged + "&selected=" + selectedId)).selected.readAt;
  await page.unroute("**/api/collaboration/inbox/" + selectedId);
  await page.getByRole("button", { name: "Mark read", exact: true }).click();
  await page
    .getByRole("button", { name: "Mark unread", exact: true })
    .waitFor();
  assert.equal(
    (await json(paged + "&selected=" + selectedId)).selected.readAt,
    readStamp,
  );
  stage = "profile failure preserves edit, actual device appearance persists";
  await page.goto(origin + "/settings");
  await page
    .getByLabel("Name", { exact: true })
    .fill("Controlled researcher profile");
  await page.route("**/api/me", async (route) =>
    route.request().method() === "PATCH"
      ? route.abort("failed")
      : route.continue(),
  );
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page
    .getByRole("button", { name: "Retry save profile", exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Name", { exact: true }).inputValue(),
    "Controlled researcher profile",
  );
  await page.unroute("**/api/me");
  await page
    .getByRole("button", { name: "Retry save profile", exact: true })
    .click();
  await page.getByText("Profile saved.", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Appearance", exact: true }).click();
  await page
    .getByRole("group", { name: "Color theme", exact: true })
    .getByRole("button", { name: /^Dark/ })
    .click();
  await page
    .getByText("Appearance saved on this browser.", { exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "Dark · Selected", exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => localStorage.getItem("atlas-theme")),
    "dark",
  );
  await page.screenshot({ path: join(folder, "settings-appearance-dark.png") });
  await page
    .getByRole("group", { name: "Color theme", exact: true })
    .getByRole("button", { name: /^Light/ })
    .click();
  await page.screenshot({ path: join(folder, "settings-after.png") });
  stage =
    "persisted event preferences govern real delivery without removing history";
  await page.getByRole("link", { name: "Notifications", exact: true }).click();
  await page.getByRole("checkbox", { name: /Mentions When/ }).uncheck();
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await page
    .getByText("Notification preferences saved.", { exact: true })
    .waitFor();
  const prefs = await json("/api/me/preferences");
  assert.equal(prefs.mention, false);
  const stale = await context.request.patch(origin + "/api/me/preferences", {
    headers: { origin },
    data: { ...{ assignment: true, reply: true, mention: true }, revision: 0 },
  });
  assert.equal(stale.status(), 409);
  const countBefore = (await json(paged)).total;
  await sendMessage(db, b, w, p, topic.id, {
    clientId: randomUUID(),
    body: "Muted mention should not deliver",
    links: [],
    mentions: [a.id],
  });
  assert.equal((await json(paged)).total, countBefore);
  await sendMessage(db, b, w, p, topic.id, {
    clientId: randomUUID(),
    body: "Reply delivery still enabled",
    links: [],
    mentions: [],
  });
  assert.equal((await json(paged)).total, countBefore + 1);
  await page.reload();
  assert.equal(
    await page.getByRole("checkbox", { name: /Mentions When/ }).isChecked(),
    false,
  );
  await page.screenshot({ path: join(folder, "settings-notifications.png") });
  await page.getByRole("checkbox", { name: /Mentions When/ }).check();
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  stage = "workspace/project separation and permissions";
  await page.goto(origin + `/w/${w}/settings`);
  await page
    .getByRole("heading", { name: "Workspace members", exact: true })
    .waitFor();
  await page
    .getByRole("link", {
      name: /Connected research verification Project settings/,
    })
    .click();
  await page
    .getByRole("heading", { name: "Research purpose", exact: true })
    .waitFor();
  await page.screenshot({ path: join(folder, "settings-project.png") });
  await page
    .getByRole("link", { name: "Open project members", exact: true })
    .click();
  await page
    .getByText(
      "Email invitations are currently unavailable. Existing member access can still be managed.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Invite member", exact: true })
      .isDisabled(),
    true,
  );
  const vc = await browser.newContext(),
    vp = await vc.newPage();
  await login(vp, viewer);
  await vp.goto(origin + `/w/${w}/settings`);
  await vp.getByText("You are a workspace member.", { exact: false }).waitFor();
  assert.equal(
    await vp
      .getByRole("button", { name: "Save workspace", exact: true })
      .count(),
    0,
  );
  assert.equal(
    (
      await vc.request.patch(origin + `/api/workspaces/${w}`, {
        headers: { origin },
        data: { action: "update", name: "Denied" },
      })
    ).status(),
    404,
  );
  assert.equal(
    (
      await vc.request.patch(origin + base + "/" + assigned.id, {
        headers: { origin },
        data: { read: true },
      })
    ).status(),
    404,
  );
  await vc.close();
  stage = "revoked target redaction, narrow inbox/settings";
  const secretProject = (
    await createProject(db, a, w, {
      requestId: randomUUID(),
      name: "Private project for revoked member",
    })
  ).id;
  await createInvitation(db, a, mail, origin, w, secretProject, {
    email: editor.email,
    role: "editor",
  });
  await mail.flush();
  await acceptInvitation(
    db,
    b,
    smtp
      .latest(editor.email, "Your Atlas project invitation")
      .pathname.split("/")
      .at(-1)!,
  );
  const privateTask = await createTask(db, a, w, secretProject, {
    requestId: randomUUID(),
    title: "Private title must disappear",
    description: "",
    status: "backlog",
    priority: "medium",
    assigneeId: b.id,
    dueDate: null,
    links: [],
  });
  const bc = await browser.newContext(),
    bp = await bc.newPage();
  await login(bp, editor);
  const bBefore = await (await bc.request.get(origin + paged)).json();
  const target = bBefore.items.find(
    (n: { target: { id: string } | null }) => n.target?.id === privateTask.id,
  );
  assert.ok(target);
  await revokeProjectMember(db, a, w, secretProject, b.id);
  const bAfter = await (
    await bc.request.get(origin + paged + "&selected=" + target.id)
  ).json();
  assert.equal(bAfter.selected.target, null);
  assert.equal(bAfter.selected.sender, null);
  assert.equal(bAfter.selected.excerpt, null);
  assert.equal(bAfter.selected.projectName, null);
  assert.equal(bAfter.selected.links.length, 0);
  assert.ok(!JSON.stringify(bAfter).includes(privateTask.title));
  await bc.close();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(origin + "/inbox");
  await page
    .getByRole("button", { name: "← Back to updates", exact: true })
    .click();
  await page.locator(".inbox-item").first().waitFor();
  await page.screenshot({ path: join(folder, "inbox-narrow-list.png") });
  await page.locator(".inbox-item").first().click();
  await page.screenshot({ path: join(folder, "inbox-narrow-detail.png") });
  await page.goto(origin + "/settings?tab=notifications");
  await page
    .getByRole("heading", { name: "Notifications", exact: true })
    .waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: join(folder, "settings-narrow.png") });
  const oc = await browser.newContext(),
    op = await oc.newPage();
  await login(op, outsider);
  assert.equal(
    (await oc.request.get(origin + `/api/workspaces/${w}`)).status(),
    404,
  );
  await oc.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS assignment/reply/mention → Inbox → exact task/old message and linked source → acknowledged read; page-only read, stable snapshot/selection/scroll, no duplicate event, redaction, profile retry, persisted browser theme/event preferences, member permissions, narrow layout. No external email or AI call.",
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
      error.stack?.match(/inbox-settings-browser-qa\.ts:\d+:\d+/)?.[0],
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
