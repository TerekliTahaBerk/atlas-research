import { createTask } from "../src/server/collaboration/service";
import { calendarToday, calendarAfter } from "../src/lib/task-model";
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
  folder = mkdtempSync(join(tmpdir(), "atlas-tasks-browser-")),
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
async function step(name: string) {
  stage = name;
  console.log("Stage: " + name);
}
async function saved() {
  await page
    .locator('.task-editor-save [role="status"]')
    .filter({ hasText: /^Saved$/ })
    .waitFor();
}
async function closeTask() {
  await page
    .getByRole("button", { name: "Close task details", exact: true })
    .click();
  await page.locator(".task-detail-rail").waitFor({ state: "hidden" });
}
async function waitTask(
  id: string,
  check: (t: Record<string, unknown>) => boolean,
) {
  for (let i = 0; i < 100; i++) {
    const r = await context.request.get(origin + endpoint + "/tasks/" + id);
    const d = await r.json();
    if (check(d.task)) return d;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error("Task did not reach expected server state");
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + "/health/live")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(
    "Browser plugin not available; focused Tasks production Chromium + disposable PostgreSQL, synthetic PDF and controlled accounts. No email/paid AI.",
  );
  await login(page);
  assert.equal(await page.title(), "Atlas Research");
  await step(
    "PDF note context → title-only task, optional fields and one Inbox assignment",
  );
  await page.goto(
    origin +
      path +
      `/sources/${source.id}/read?version=${upload.versionId}&page=1&annotation=${note.id}`,
  );
  await page
    .locator(
      "#annotation-" + note.id + " .research-connected .action-menu > summary",
    )
    .click();
  await page
    .locator("#annotation-" + note.id)
    .getByRole("button", { name: "Create task", exact: true })
    .click();
  const title = "Research evidence — verify source conclusions";
  await page
    .getByRole("dialog")
    .getByLabel("Task title", { exact: true })
    .fill(title);
  assert.equal(await page.getByLabel("Assignee", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await page
    .locator(".task-editor")
    .getByLabel("Task title", { exact: true })
    .waitFor();
  const id = new URL(page.url()).pathname.split("/").at(-1)!,
    taskApi = origin + endpoint + "/tasks/" + id;
  let detail = await (await context.request.get(taskApi)).json();
  assert.ok(detail.links.some((l: { id: string }) => l.id === note.id));
  await page.getByLabel("Assignee", { exact: true }).selectOption(b.id);
  await page.getByLabel("Priority", { exact: true }).selectOption("high");
  const today = calendarToday(),
    tomorrow = calendarAfter(today, 1);
  await page.getByLabel("Due date", { exact: true }).fill(tomorrow);
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await saved();
  assert.equal(
    (await waitTask(id, (t) => t.assigneeId === b.id)).task.dueDate,
    tomorrow,
  );
  await closeTask();
  await step(
    "column quick creation, persistent native drag and same-column order",
  );
  await page
    .getByRole("button", { name: "Add task to In progress", exact: true })
    .click();
  await page
    .locator(".task-composer")
    .getByLabel("Task title", { exact: true })
    .fill("Research evidence — compare assumptions");
  await page
    .locator(".task-composer")
    .getByLabel("Task title", { exact: true })
    .press("Enter");
  await page.locator(".task-editor").waitFor();
  const second = new URL(page.url()).pathname.split("/").at(-1)!;
  await closeTask();
  await page
    .locator(`[data-task="${id}"]`)
    .dragTo(page.locator('.task-column[data-status="in_progress"] > header'));
  await waitTask(id, (t) => t.status === "in_progress");
  await page
    .locator(`.task-column[data-status="in_progress"] [data-task="${id}"]`)
    .waitFor();
  const card2 = page.locator(`[data-task="${id}"]`),
    box = (await card2.boundingBox())!;
  await page
    .locator(`[data-task="${second}"]`)
    .dragTo(card2, { targetPosition: { x: 70, y: box.height - 3 } });
  await page.waitForFunction(
    ({ id, second }) => {
      const cards = [
        ...document.querySelectorAll(
          '.task-column[data-status="in_progress"] [data-task]',
        ),
      ].map((e) => e.getAttribute("data-task"));
      return cards.indexOf(id) < cards.indexOf(second);
    },
    { id, second },
  );
  await page.reload();
  await page.locator(`[data-task="${id}"]`).waitFor();
  const ids = await page
    .locator('.task-column[data-status="in_progress"] [data-task]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-task")));
  assert.ok(ids.indexOf(id) < ids.indexOf(second));
  await step("List inline status, assignee, priority and date");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page
    .getByLabel("Priority for " + title, { exact: true })
    .selectOption("urgent");
  await waitTask(id, (t) => t.priority === "urgent");
  await page
    .getByLabel("Assignee for " + title, { exact: true })
    .selectOption(a.id);
  await waitTask(id, (t) => t.assigneeId === a.id);
  await page.getByLabel("Due date for " + title, { exact: true }).fill(today);
  await page
    .getByLabel("Due date for " + title, { exact: true })
    .press("Enter");
  await waitTask(id, (t) => t.dueDate === today);
  await page
    .getByLabel("Status for " + title, { exact: true })
    .selectOption("in_review");
  await waitTask(id, (t) => t.status === "in_review");
  await step(
    "uncertain acknowledgement retries without extra notification or revision",
  );
  let aborted = false,
    accepted = 0;
  await page.route(taskApi, async (route) => {
    if (route.request().method() === "PATCH" && !aborted) {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      accepted = (await response.json()).revision;
      aborted = true;
      await route.abort();
    } else await route.continue();
  });
  await page
    .getByLabel("Assignee for " + title, { exact: true })
    .selectOption(b.id);
  await page
    .getByRole("button", { name: "Retry change", exact: true })
    .waitFor();
  assert.equal(await page.locator(`[data-task="${id}"]`).count(), 1);
  await page.getByRole("button", { name: "Retry change", exact: true }).click();
  await page
    .getByRole("button", { name: "Retry change", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(
    (await waitTask(id, (t) => t.assigneeId === b.id)).task.revision,
    accepted,
  );
  await page.unroute(taskApi);
  const ec = await browser.newContext(),
    ep = await ec.newPage();
  await login(ep, editor);
  const notifications = await (
    await ec.request.get(origin + "/api/collaboration/inbox")
  ).json();
  assert.equal(
    notifications.filter(
      (n: { event: string; target: { id: string } }) =>
        n.event === "assignment" && n.target?.id === id,
    ).length,
    2,
  );
  await step(
    "two-session stale detail retains inputs and applies only reviewed fields",
  );
  await page.locator(`[data-task="${id}"] .task-title-link`).click();
  await page.locator(".task-editor").waitFor();
  const original = (await (await context.request.get(taskApi)).json()).task;
  const remote = await ec.request.patch(taskApi, {
    headers: { origin },
    data: {
      action: "edit",
      requestId: randomUUID(),
      revision: original.revision,
      changes: { title: "Research evidence — reviewed remote title" },
    },
  });
  assert.equal(remote.status(), 200);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Local review: preserve this field during a concurrent change.");
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await page.getByLabel("Latest server task").waitFor();
  assert.ok(
    (
      await page.getByLabel("Description", { exact: true }).inputValue()
    ).includes("Local review"),
  );
  assert.ok(
    (await page.getByLabel("Latest server task").inputValue()).includes(
      "reviewed remote title",
    ),
  );
  await page
    .getByRole("button", {
      name: "Keep my changed fields for review",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await saved();
  detail = await waitTask(id, (t) =>
    String(t.description).includes("Local review"),
  );
  assert.equal(detail.task.title, "Research evidence — reviewed remote title");
  await step("research link search, PDF locator and linked discussion");
  await page
    .getByRole("button", { name: "Add research link", exact: true })
    .click();
  await page.getByLabel("Find related research").fill("Metadata-only");
  await page.getByLabel("Add research link").selectOption(metadataOnly.id);
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await saved();
  await page
    .locator(".task-linked .artifact-cards a")
    .filter({ hasText: "PDF note" })
    .click();
  await page.waitForURL("**/read?*");
  assert.equal(new URL(page.url()).searchParams.get("annotation"), note.id);
  await page.goBack();
  await page.locator(".task-editor").waitFor();
  await page
    .getByRole("button", { name: "Discuss this task", exact: true })
    .click();
  await page.getByLabel("Topic title").fill("Controlled task discussion");
  await page
    .getByLabel("First message")
    .fill("Follow the linked evidence-review task.");
  await page
    .getByRole("button", { name: "Create discussion", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Controlled task discussion", exact: true })
    .waitFor();
  await page
    .locator(`.discussion-messages .artifact-cards a[href$="/tasks/${id}"]`)
    .click();
  await page.locator(".task-editor").waitFor();
  assert.ok(
    (await page.locator(".task-linked").innerText()).includes(
      "Controlled task discussion",
    ),
  );
  await step("Inbox deep link, access boundaries and ineligible assignee");
  await ep.goto(origin + "/inbox");
  await ep.locator(`a[href*="/tasks/${id}"]`).first().click();
  await ep.locator(".task-editor").waitFor();
  assert.equal(new URL(ep.url()).pathname, path + `/tasks/${id}`);
  detail = await (await context.request.get(taskApi)).json();
  const revision = detail.task.revision;
  const bad = await context.request.patch(taskApi, {
    headers: { origin },
    data: {
      action: "edit",
      requestId: randomUUID(),
      revision,
      changes: { assigneeId: v.id },
    },
  });
  assert.equal(bad.status(), 400);
  assert.equal(
    (await (await context.request.get(taskApi)).json()).task.revision,
    revision,
  );
  const vc = await browser.newContext(),
    vp = await vc.newPage();
  await login(vp, viewer);
  await vp.goto(origin + path + "/tasks/" + id);
  await vp.locator(".task-editor").waitFor();
  assert.equal(
    await vp.getByLabel("Task title", { exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    (
      await vc.request.patch(taskApi, {
        headers: { origin },
        data: {
          action: "move",
          requestId: randomUUID(),
          revision,
          status: "done",
          beforeId: null,
        },
      })
    ).status(),
    404,
  );
  const oc = await browser.newContext(),
    op = await oc.newPage();
  await login(op, outsider);
  assert.equal((await oc.request.get(taskApi)).status(), 404);
  assert.equal(
    (
      await oc.request.get(
        origin + endpoint + "/tasks?view=list&today=" + today,
      )
    ).status(),
    404,
  );
  await oc.close();
  await vc.close();
  await ec.close();
  await step(
    "server pagination, combined filters and completed overdue exclusion",
  );
  await closeTask();
  for (let i = 0; i < 51; i++)
    await createTask(db, a, w, p, {
      requestId: randomUUID(),
      title: "Pagination fixture " + String(i).padStart(2, "0"),
      description: "Controlled list fixture",
      status: "backlog",
      priority: "medium",
      assigneeId: null,
      dueDate: null,
      links: [],
    });
  await page.getByLabel("Search tasks").fill("Pagination fixture");
  await page.locator(".task-list-row").nth(49).waitFor();
  assert.equal(await page.locator(".task-list-row").count(), 50);
  await page
    .getByRole("navigation", { name: "Task pages" })
    .getByRole("button", { name: "Next", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".task-list-row").length === 1,
  );
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await page.locator(".task-experience-card").nth(29).waitFor();
  assert.equal(await page.locator(".task-experience-card").count(), 30);
  await page
    .locator('.task-column[data-status="backlog"] .task-column-pages')
    .getByRole("button", { name: "Next", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".task-experience-card").length === 21,
  );
  await page.getByLabel("Search tasks").fill("Research evidence");
  await page.locator(".task-experience-card").nth(1).waitFor();
  await page.getByLabel("Sort tasks").selectOption("priority");
  assert.ok(
    (await page.locator(".task-order-hint").innerText()).includes(
      "Board order",
    ),
  );
  await page.getByLabel("Sort tasks").selectOption("position");
  await page.locator(".task-filter-menu > summary").click();
  await page.getByLabel("Filter assignee").selectOption("mine");
  await page.getByLabel("Filter priority").selectOption("urgent");
  await page.getByLabel("Filter due date").selectOption("today");
  await page.locator(".task-filter-menu > summary").click();
  await page
    .getByRole("heading", { name: "No matching tasks", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page.getByLabel("Search tasks").fill("Research evidence");
  await page.locator(".task-experience-card").nth(1).waitFor();
  const current = (await (await context.request.get(taskApi)).json()).task;
  await context.request.patch(taskApi, {
    headers: { origin },
    data: {
      action: "edit",
      requestId: randomUUID(),
      revision: current.revision,
      changes: { status: "done", dueDate: calendarAfter(today, -1) },
    },
  });
  const overdue = await (
    await context.request.get(
      origin +
        endpoint +
        "/tasks?view=list&q=reviewed%20remote&due=overdue&today=" +
        today,
    )
  ).json();
  assert.equal(overdue.total, 0);
  await step("desktop/dark/List/detail and narrow column navigation");
  await page.reload();
  await page.locator(".task-experience-card").nth(1).waitFor();
  await page.screenshot({ path: join(folder, "tasks-board.png") });
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(folder, "tasks-dark.png") });
  await page.getByRole("button", { name: "Light theme", exact: true }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.locator(".task-list-row").nth(1).waitFor();
  await page.screenshot({ path: join(folder, "tasks-list.png") });
  await page.locator(`[data-task="${id}"] .task-title-link`).click();
  await page.locator(".task-editor").waitFor();
  await page.screenshot({ path: join(folder, "tasks-detail.png") });
  await closeTask();
  await page.setViewportSize({ width: 390, height: 900 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: join(folder, "tasks-list-narrow.png") });
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await page.getByLabel("Board column", { exact: true }).selectOption("done");
  await page.locator(`[data-task="${id}"]`).waitFor({ state: "visible" });
  await page.screenshot({ path: join(folder, "tasks-board-narrow.png") });
  await page.locator(`[data-task="${id}"] .task-title-link`).click();
  await page
    .getByRole("dialog", { name: "Task details", exact: true })
    .waitFor();
  await page.locator(".task-editor").waitFor();
  await page.screenshot({ path: join(folder, "tasks-detail-narrow.png") });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: note → quick task → eligible assignment/priority/date → native Board status and intra-column order persisted → inline List edits → lost-response retry without extra notification → stale-detail field review → real research links/PDF/discussion/Inbox return → access/eligibility denial → List/column pagination/combined filters/date semantics → desktop/dark/narrow.",
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
    console.error(error.stack?.match(/tasks-browser-qa\.ts:\d+:\d+/)?.[0]);
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
