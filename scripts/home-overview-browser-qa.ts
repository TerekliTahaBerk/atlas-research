import {
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
import {
  saveReading,
  addSource,
  addAnnotation,
} from "../src/server/research/library";
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
  folder = mkdtempSync(join(tmpdir(), "atlas-home-overview-browser-")),
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
const path = `/w/${w}/p/${p}`,
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
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + "/health/live")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(
    "Browser plugin not available; personal Home / project Overview with production Chromium and disposable PostgreSQL; synthetic records only, no external email or model call.",
  );
  await login(page);
  const homeUrl = origin + "/api/home?view=personal&today=" + calendarToday();
  let home = await (await context.request.get(homeUrl)).json();
  assert.equal(
    home.recent.length,
    0,
    "Creating a document is not evidence that this user opened it",
  );
  const teamDoc = await createDocument(db, b, w, p, {
    requestId: randomUUID(),
    title: "Team draft never opened by the owner",
  });
  for (let i = 0; i < 7; i++) {
    await createDocument(db, a, w, p, {
      requestId: randomUUID(),
      title: `Additional project document ${i}`,
    });
    await addSource(db, a, w, p, {
      title: `Additional project source ${i}`,
      authors: [],
      year: 2026,
      venue: "Synthetic fixture",
      doi: null,
      url: null,
      abstract: "",
      tags: [],
    });
  }
  await createDiscussion(db, b, w, p, {
    requestId: randomUUID(),
    title: "Discuss the evidence",
    body: "Review the linked research draft.",
    links: [doc.id, task.id],
    mentions: [],
  });
  await saveReading(db, a, w, p, source.id, {
    action: "reading",
    versionId: upload.versionId!,
    status: "reading",
    page: 1,
    zoom: 1.25,
    zoomMode: "manual",
    position: 0.3,
  });
  stage = "record actual opening and resume personal work";
  let visit = page.waitForResponse(
    (r) => r.url().endsWith("/api/home/visits") && r.status() === 200,
  );
  await page.goto(origin + path + "/docs/" + doc.id);
  await page.getByLabel("Document title", { exact: true }).waitFor();
  await visit;
  visit = page.waitForResponse(
    (r) => r.url().endsWith("/api/home/visits") && r.status() === 200,
  );
  await page.goto(
    origin + path + `/sources/${source.id}/read?version=${upload.versionId}`,
  );
  await page.getByLabel("PDF page", { exact: true }).waitFor();
  await visit;
  assert.equal(
    await page.getByLabel("PDF zoom", { exact: true }).inputValue(),
    "1.25",
  );
  await page.locator('.sidebar a[href="/home"]').click();
  await page
    .locator(".home-resume-card")
    .filter({ hasText: source.title })
    .waitFor();
  home = await (await context.request.get(homeUrl)).json();
  assert.equal(home.recent.length, 2);
  assert.ok(!home.recent.some((r: { id: string }) => r.id === teamDoc.id));
  assert.equal(home.assignedTotal, 1);
  assert.equal(home.dueTotal, 1);
  assert.equal(home.assigned[0].id, task.id);
  const resume = page
    .locator(".home-resume-card")
    .filter({ hasText: source.title });
  assert.ok(
    (await resume.getAttribute("href"))?.includes(
      "version=" + upload.versionId,
    ),
  );
  assert.ok(!(await resume.getAttribute("href"))?.includes("page="));
  await resume.click();
  await page.getByLabel("PDF zoom", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("PDF zoom", { exact: true }).inputValue(),
    "1.25",
  );
  await page.locator('.sidebar a[href="/home"]').click();
  await page.getByRole("button", { name: /Due in 7 days/ }).click();
  await page
    .locator(".home-personal-tasks a")
    .filter({ hasText: task.title })
    .waitFor();
  await page
    .getByRole("group", { name: "Project view", exact: true })
    .getByRole("button", { name: "List", exact: true })
    .click();
  await page.locator(".home-project-list").waitFor();
  await page
    .getByRole("group", { name: "Project view", exact: true })
    .getByRole("button", { name: "Grid", exact: true })
    .click();
  await page.screenshot({ path: join(folder, "home-after.png") });
  stage = "Home → project → new document → Overview";
  await page
    .locator(".home-project-card")
    .filter({ hasText: "Connected research verification" })
    .click();
  const overviewUrl = origin + `/api/projects/${p}/overview?workspaceId=${w}`;
  await page
    .getByRole("heading", { name: "Project documents", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("heading", { name: "Start your research", exact: true })
      .count(),
    0,
  );
  let overview = await (await context.request.get(overviewUrl)).json();
  assert.equal(overview.counts.documents, 9);
  assert.equal(overview.documents.length, 6);
  assert.equal(overview.counts.sources, 8);
  assert.equal(overview.sources.length, 6);
  assert.equal(overview.sources[0].id, source.id);
  assert.equal(overview.sources[0].references, 1);
  assert.ok(
    overview.discussions.some(
      (t: { title: string }) => t.title === "Discuss the evidence",
    ),
  );
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await page
    .getByLabel("Document title", { exact: true })
    .fill("New research note from Overview");
  visit = page.waitForResponse(
    (r) => r.url().endsWith("/api/home/visits") && r.status() === 200,
  );
  await page
    .getByRole("button", { name: "Create document", exact: true })
    .click();
  await page.getByLabel("Document title", { exact: true }).waitFor();
  await visit;
  await page.locator(`.sidebar a[href="${path}"]`).click();
  await page
    .locator(".overview-columns")
    .getByRole("link", { name: /New research note from Overview/ })
    .first()
    .waitFor();
  overview = await (await context.request.get(overviewUrl)).json();
  assert.equal(overview.counts.documents, 10);
  assert.ok(
    overview.activity.some(
      (r: { title: string }) => r.title === "New research note from Overview",
    ),
  );
  stage = "purpose editing is team-authored and conflict safe";
  await page
    .getByRole("button", { name: "Add research purpose", exact: true })
    .click();
  await page
    .getByLabel("Research purpose", { exact: true })
    .fill(
      "Compare evidence, record its limits, and plan the next research step.",
    );
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page
    .getByText(
      "Compare evidence, record its limits, and plan the next research step.",
      { exact: true },
    )
    .waitFor();
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  await page
    .getByLabel("Research purpose", { exact: true })
    .fill("Keep this local purpose during a concurrent rename.");
  const remote = await context.request.patch(
    origin + `/api/projects/${p}?workspaceId=${w}`,
    {
      headers: { origin },
      data: { action: "update", name: "Connected research — reviewed project" },
    },
  );
  assert.equal(remote.status(), 200);
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page
    .getByText("Project details changed. Your text is kept.", { exact: true })
    .waitFor();
  assert.ok(
    (
      await page.getByLabel("Research purpose", { exact: true }).inputValue()
    ).includes("Keep this local purpose"),
  );
  await page
    .getByRole("button", { name: "Review my changed fields", exact: true })
    .click();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page
    .getByRole("heading", {
      name: "Connected research — reviewed project",
      exact: true,
    })
    .waitFor();
  await page.screenshot({ path: join(folder, "overview-after.png") });
  stage = "narrow and AI coexistence";
  await page.getByLabel("Dock AI", { exact: true }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(folder, "overview-ai.png") });
  await page.getByLabel("Compact AI", { exact: true }).click();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(250);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: join(folder, "overview-narrow.png") });
  await page.locator(".content").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(250);
  const lastRow = await page
    .locator(".overview-recent .dashboard-row")
    .last()
    .boundingBox();
  const island = await page.locator(".ai-island").boundingBox();
  assert.ok(
    lastRow && island && lastRow.y + lastRow.height <= island.y,
    "Last Overview card clears the compact AI island",
  );
  await page.screenshot({ path: join(folder, "overview-bottom.png") });
  await page
    .locator(".project-overview")
    .getByRole("link", { name: /View all.*10/ })
    .waitFor();
  await page.goto(origin + "/home");
  await page.locator(".home-resume-card").first().waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: join(folder, "home-narrow.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await page.screenshot({ path: join(folder, "home-dark.png") });
  await page.getByRole("button", { name: "Light theme", exact: true }).click();
  stage = "empty project onboarding / true project pagination";
  const empty = await createProject(db, a, w, {
    requestId: randomUUID(),
    name: "An empty controlled project",
  });
  await page.goto(origin + `/w/${w}/p/${empty.id}`);
  await page
    .getByRole("heading", { name: "Start your research", exact: true })
    .waitFor();
  await page.screenshot({ path: join(folder, "overview-empty.png") });
  for (let i = 0; i < 12; i++)
    await createProject(db, a, w, {
      requestId: randomUUID(),
      name: `Pagination project ${i}`,
    });
  home = await (await context.request.get(homeUrl)).json();
  const second = await (await context.request.get(homeUrl + "&page=1")).json();
  assert.equal(home.projectTotal, 14);
  assert.equal(home.projects.length, 12);
  assert.equal(second.projects.length, 2);
  assert.equal(home.recent.length, 3);
  const search = await (
    await context.request.get(homeUrl + "&q=empty%20controlled")
  ).json();
  assert.equal(search.projectTotal, 1);
  assert.equal(
    search.recent.length,
    3,
    "Project-name search does not erase personal resume cards",
  );
  await context.request.patch(
    origin + `/api/projects/${empty.id}?workspaceId=${w}`,
    { headers: { origin }, data: { action: "update", archived: true } },
  );
  const archived = await (
    await context.request.get(homeUrl + "&status=archived")
  ).json();
  assert.ok(archived.projects.some((r: { id: string }) => r.id === empty.id));
  stage = "current authorization and no revoked-title leaks";
  const ec = await browser.newContext(),
    ep = await ec.newPage();
  await login(ep, editor);
  const editorHome = await (await ec.request.get(homeUrl)).json();
  assert.equal(
    editorHome.recent.length,
    0,
    "Other members do not inherit this user's opened work",
  );
  const vc = await browser.newContext(),
    vp = await vc.newPage();
  await login(vp, viewer);
  await vp.goto(origin + path);
  await vp
    .getByRole("heading", { name: "Project documents", exact: true })
    .waitFor();
  assert.equal(
    await vp.getByRole("button", { name: "New document", exact: true }).count(),
    0,
  );
  assert.equal(
    (
      await vc.request.patch(origin + `/api/projects/${p}?workspaceId=${w}`, {
        headers: { origin },
        data: { action: "update", description: "Viewer change" },
      })
    ).status(),
    404,
  );
  const invalid = await context.request.post(origin + "/api/home/visits", {
    headers: { origin },
    data: {
      workspaceId: w,
      projectId: p,
      artifactId: note.id,
      kind: "source",
      versionId: null,
    },
  });
  assert.equal(invalid.status(), 404);
  const oc = await browser.newContext(),
    op = await oc.newPage();
  await login(op, outsider);
  assert.equal((await oc.request.get(overviewUrl)).status(), 404);
  assert.equal(
    (
      await oc.request.post(origin + "/api/home/visits", {
        headers: { origin },
        data: {
          workspaceId: w,
          projectId: p,
          artifactId: doc.id,
          kind: "document",
        },
      })
    ).status(),
    404,
  );
  const revoked = await createProject(db, a, w, {
    requestId: randomUUID(),
    name: "Revocation probe",
  });
  await createInvitation(db, a, mail, origin, w, revoked.id, {
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
  const secret = await createDocument(db, a, w, revoked.id, {
    requestId: randomUUID(),
    title: "Revoked confidential draft",
  });
  const record = await ec.request.post(origin + "/api/home/visits", {
    headers: { origin },
    data: {
      workspaceId: w,
      projectId: revoked.id,
      artifactId: secret.id,
      kind: "document",
    },
  });
  assert.equal(record.status(), 200);
  assert.ok(
    JSON.stringify(await (await ec.request.get(homeUrl)).json()).includes(
      secret.title,
    ),
  );
  await revokeProjectMember(db, a, w, revoked.id, b.id);
  assert.ok(
    !JSON.stringify(await (await ec.request.get(homeUrl)).json()).includes(
      secret.title,
    ),
  );
  assert.equal(
    (
      await ec.request.get(
        origin + `/api/projects/${revoked.id}/overview?workspaceId=${w}`,
      )
    ).status(),
    404,
  );
  const bulk = origin + `/api/research/${w}/${p}/sources/bulk`;
  assert.equal(
    (
      await context.request.post(bulk, {
        headers: { origin },
        data: { action: "archive", ids: [source.id] },
      })
    ).status(),
    200,
  );
  home = await (await context.request.get(homeUrl)).json();
  assert.ok(!home.recent.some((r: { id: string }) => r.id === source.id));
  overview = await (await context.request.get(overviewUrl)).json();
  assert.ok(!JSON.stringify(overview.activity).includes(source.title));
  assert.equal(
    (
      await context.request.post(bulk, {
        headers: { origin },
        data: { action: "restore", ids: [source.id] },
      })
    ).status(),
    200,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS Home resume → saved PDF position → project → create document → Overview; genuine personal visits, full counts/pagination, purpose conflict review, narrow/dark/AI, empty-only guide, Viewer/outsider/invalid visit denial, revoked/archived-title exclusion. No paid AI.",
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
      error.stack?.match(/home-overview-browser-qa\.ts:\d+:\d+/)?.[0],
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
