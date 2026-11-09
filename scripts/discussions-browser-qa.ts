import {
  createTask,
  createDocument,
  createDiscussion,
  sendMessage,
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
  folder = mkdtempSync(join(tmpdir(), "atlas-discussions-browser-")),
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
});
const task = await createTask(db, a, w, p, {
  requestId: randomUUID(),
  title: "Controlled research follow-up",
  description: "Check source evidence",
  status: "backlog",
  priority: "medium",
  assigneeId: null,
  dueDate: null,
  links: [source.id],
});
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
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + "/health/live")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(
    "Browser plugin not available; focused Discussions production Chromium with isolated PostgreSQL, synthetic source/accounts. No email or paid AI.",
  );
  await login(page);
  await page.goto(origin + path + "/tasks/" + task.id);
  await page
    .getByRole("button", { name: "Discuss this task", exact: true })
    .click();
  await page
    .getByLabel("Topic title", { exact: true })
    .fill("Methods review — source-linked team discussion");
  await page
    .getByLabel("First message", { exact: true })
    .fill("Start from the evidence follow-up task.");
  await page.getByLabel("Notify members", { exact: true }).selectOption(b.id);
  await page
    .getByRole("button", { name: "Create discussion", exact: true })
    .click();
  await page.waitForURL("**/discussions/*");
  const id = new URL(page.url()).pathname.split("/discussions/")[1],
    thread = origin + endpoint + "/discussions/" + id;
  await page
    .getByRole("heading", {
      name: "Methods review — source-linked team discussion",
      exact: true,
    })
    .waitFor();
  assert.ok(
    await page
      .locator(`.discussion-message a[href$="/tasks/${task.id}"]`)
      .isVisible(),
  );
  stage = "reply, real artifact cards and lost acknowledgement retry";
  const reply = page.getByLabel("Reply", { exact: true });
  await reply.fill(
    "Review the methods paper and its exact PDF note before revising the draft.",
  );
  await page.locator(".discussion-reply summary").click();
  for (const [q, target] of [
    ["Controlled methods", source.id],
    ["Controlled methods", note.id],
    ["Controlled research draft", doc.id],
  ] as const) {
    await page
      .locator(".discussion-reply")
      .getByLabel("Find related research", { exact: true })
      .fill(q);
    await page
      .locator(".discussion-reply")
      .getByLabel("Add research link", { exact: true })
      .selectOption(target);
  }
  await page.getByLabel("Mention members", { exact: true }).selectOption(b.id);
  assert.equal(
    await page
      .getByLabel("Mention members")
      .locator(`option[value="${outsider.id}"]`)
      .count(),
    0,
  );
  let lost = true;
  await page.route("**/discussions/" + id + "/messages", async (route) => {
    if (lost && route.request().method() === "POST") {
      lost = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await page
    .getByRole("button", { name: "Retry reply", exact: true })
    .waitFor();
  assert.ok((await reply.inputValue()).includes("Review the methods paper"));
  await page.getByRole("button", { name: "Retry reply", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLTextAreaElement>('[aria-label="Reply"]')
        ?.value === "",
  );
  await page.unroute("**/discussions/" + id + "/messages");
  let snapshot = await (
    await context.request.get(thread + "?window=50")
  ).json();
  assert.equal(
    snapshot.messages.filter((m: { body: string }) =>
      m.body.startsWith("Review the methods paper"),
    ).length,
    1,
  );
  const first = snapshot.messages[0],
    message = snapshot.messages.at(-1);
  const ec = await browser.newContext(),
    ep = await ec.newPage();
  await login(ep, editor);
  const inbox = await (
    await ec.request.get(origin + "/api/collaboration/inbox")
  ).json();
  assert.equal(
    inbox.filter((n: { target: { id: string } | null }) => n.target?.id === id)
      .length,
    2,
  );
  await ep.goto(origin + "/inbox");
  await ep.locator(`a[href$="/discussions/${id}"]`).first().click();
  await ep
    .getByLabel("Reply", { exact: true })
    .fill("I checked the note and will update the draft.");
  await Promise.all([
    ep.waitForResponse(
      (r) => r.url() === thread + "/messages" && r.status() === 200,
    ),
    ep.getByRole("button", { name: "Send reply", exact: true }).click(),
  ]);
  await page.goto(origin + "/inbox");
  await page.locator(`a[href$="/discussions/${id}"]`).first().click();
  await page
    .locator(".discussion-message")
    .filter({ hasText: "I checked the note" })
    .waitFor();
  stage = "PDF locator return, title and own message editing";
  await page
    .locator(`.discussion-message a[href*="annotation=${note.id}"]`)
    .click();
  await page.waitForURL("**/read?*");
  assert.equal(
    new URL(page.url()).searchParams.get("version"),
    upload.versionId,
  );
  await page.goBack();
  await page.getByLabel("Reply", { exact: true }).waitFor();
  await page.getByLabel("Topic actions").click();
  await page.getByRole("button", { name: "Rename topic", exact: true }).click();
  await page
    .getByLabel("Topic title", { exact: true })
    .fill("Methods review — agreed research next steps");
  await page.getByRole("button", { name: "Save title", exact: true }).click();
  await page
    .getByRole("heading", {
      name: "Methods review — agreed research next steps",
      exact: true,
    })
    .waitFor();
  await page
    .locator(`[data-message="${message.id}"]`)
    .getByRole("button", { name: "Edit message", exact: true })
    .click();
  await page
    .getByLabel("Edit message", { exact: true })
    .fill("Review the methods paper: preserve its exact note and draft link.");
  await page.getByRole("button", { name: "Save message", exact: true }).click();
  await page
    .locator(`[data-message="${message.id}"]`)
    .getByText("Edited", { exact: true })
    .waitFor();
  await page
    .locator(".discussion-message-scroll")
    .evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: join(folder, "discussions-research.png") });
  stage = "access and management enforcement";
  const editorDenied = await ec.request.patch(
    thread + "/messages/" + first.id,
    {
      headers: { origin },
      data: { body: "Wrong author", revision: first.revision },
    },
  );
  assert.ok([403, 404].includes(editorDenied.status()));
  const vc = await browser.newContext(),
    vp = await vc.newPage();
  await login(vp, viewer);
  await vp.goto(thread.replace(origin + endpoint, origin + path));
  await vp
    .getByText("Read only · viewers can follow this discussion.", {
      exact: true,
    })
    .waitFor();
  assert.equal(await vp.getByLabel("Reply", { exact: true }).count(), 0);
  assert.ok(
    [403, 404].includes(
      (
        await vc.request.post(thread + "/messages", {
          headers: { origin },
          data: {
            clientId: randomUUID(),
            body: "Viewer write",
            links: [],
            mentions: [],
          },
        })
      ).status(),
    ),
  );
  const oc = await browser.newContext(),
    op = await oc.newPage();
  await login(op, outsider);
  assert.equal((await oc.request.get(thread + "?window=50")).status(), 404);
  const bad = await context.request.post(thread + "/messages", {
    headers: { origin },
    data: {
      clientId: randomUUID(),
      body: "Invalid mention",
      links: [],
      mentions: [outsider.id],
    },
  });
  assert.equal(bad.status(), 400);
  stage =
    "long-topic cursors, stable history position and new-message indicator";
  for (let i = 0; i < 53; i++)
    await sendMessage(db, a, w, p, id, {
      clientId: randomUUID(),
      body: `Controlled history message ${i + 1}`,
      links: [],
      mentions: [],
    });
  await page.reload();
  await page
    .getByRole("button", { name: "Load earlier messages", exact: true })
    .waitFor();
  assert.equal(await page.locator("[data-message]").count(), 50);
  await page
    .getByRole("button", { name: "Load earlier messages", exact: true })
    .click();
  await page.locator(`[data-message="${first.id}"]`).waitFor();
  const oldMessage = page.locator(`[data-message="${first.id}"]`);
  await oldMessage
    .getByRole("button", { name: "Edit message", exact: true })
    .click();
  await page
    .getByLabel("Edit message", { exact: true })
    .fill("Retain this local edit during a concurrent change.");
  const concurrent = await context.request.patch(
    thread + "/messages/" + first.id,
    {
      headers: { origin },
      data: {
        revision: first.revision,
        body: "Remote revision of the earlier message.",
      },
    },
  );
  assert.equal(concurrent.status(), 200);
  await page.getByRole("button", { name: "Save message", exact: true }).click();
  await page
    .getByText("A newer edit is kept on the server. Your text is retained.", {
      exact: true,
    })
    .waitFor();
  assert.ok(
    (
      await page.getByLabel("Edit message", { exact: true }).inputValue()
    ).includes("Retain this local edit"),
  );
  await page
    .getByRole("button", { name: "Use latest message", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Edit message", { exact: true }).inputValue(),
    "Remote revision of the earlier message.",
  );
  await oldMessage.getByRole("button", { name: "Cancel", exact: true }).click();
  snapshot = await (await context.request.get(thread + "?window=50")).json();
  const older = await (
    await context.request.get(
      thread + "?window=50&before=" + snapshot.messages[0].id,
    )
  ).json();
  const all = new Set(
    [...snapshot.messages, ...older.messages].map((m: { id: string }) => m.id),
  );
  assert.equal(all.size, snapshot.total);
  const newer = await (
    await context.request.get(
      thread + "?window=50&after=" + snapshot.messages.at(-1).id,
    )
  ).json();
  assert.equal(newer.messages.length, 0);
  await page
    .locator(".discussion-message-scroll")
    .evaluate((el) => (el.scrollTop = 0));
  const scroll = await page
    .locator(".discussion-message-scroll")
    .evaluate((el) => el.scrollTop);
  await sendMessage(db, b, w, p, id, {
    clientId: randomUUID(),
    body: "New message while the earlier history is open.",
    links: [],
    mentions: [],
  });
  await page.getByLabel("Topic actions").click();
  await page
    .getByRole("button", { name: "Refresh messages", exact: true })
    .click();
  await page
    .getByRole("button", { name: /1 new message.*Jump to latest/ })
    .waitFor();
  assert.equal(
    await page
      .locator(".discussion-message-scroll")
      .evaluate((el) => el.scrollTop),
    scroll,
  );
  await page
    .getByRole("button", { name: /1 new message.*Jump to latest/ })
    .click();
  stage = "archive safety and restore";
  snapshot = await (await context.request.get(thread + "?window=50")).json();
  await context.request.patch(thread, {
    headers: { origin },
    data: { revision: snapshot.discussion.revision, archived: true },
  });
  assert.equal(
    (
      await context.request.post(thread + "/messages", {
        headers: { origin },
        data: {
          clientId: randomUUID(),
          body: "Archived write",
          links: [],
          mentions: [],
        },
      })
    ).status(),
    409,
  );
  snapshot = await (await context.request.get(thread + "?window=50")).json();
  await context.request.patch(thread, {
    headers: { origin },
    data: { revision: snapshot.discussion.revision, archived: false },
  });
  for (let i = 0; i < 31; i++)
    await createDiscussion(db, a, w, p, {
      requestId: randomUUID(),
      title: `Controlled pagination topic ${i}`,
      body: "Synthetic topic pagination fixture",
      links: [],
      mentions: [],
    });
  const topicPage = await (
    await context.request.get(
      origin + endpoint + "/discussions?page=0&q=Controlled%20pagination",
    )
  ).json();
  const topicPage2 = await (
    await context.request.get(
      origin + endpoint + "/discussions?page=1&q=Controlled%20pagination",
    )
  ).json();
  assert.equal(topicPage.total, 31);
  assert.equal(topicPage.items.length, 30);
  assert.equal(topicPage2.items.length, 1);
  stage = "desktop/dark/narrow with dynamic AI";
  await page.reload();
  await page.getByLabel("Reply", { exact: true }).waitFor();
  await page.screenshot({ path: join(folder, "discussions-desktop.png") });
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await page.screenshot({ path: join(folder, "discussions-dark.png") });
  await page.getByRole("button", { name: "Light theme", exact: true }).click();
  await page.getByLabel("Dock AI", { exact: true }).click();
  await page.waitForTimeout(250);
  assert.ok(
    await page
      .locator(".discussion-conversation")
      .evaluate((el) => el.getBoundingClientRect().width >= 350),
  );
  await page.screenshot({ path: join(folder, "discussions-ai.png") });
  await reply.fill("Draft kept while returning to topics.");
  await page.locator('.ai-island[data-presentation="compact"]').waitFor();
  await page.setViewportSize({ width: 390, height: 900 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: join(folder, "discussions-narrow-thread.png"),
  });
  await page.getByRole("link", { name: "Topics", exact: true }).click();
  await page
    .getByLabel("Search topics", { exact: true })
    .fill("agreed research");
  await page
    .getByRole("link", { name: /Methods review — agreed research next steps/ })
    .waitFor();
  await page.screenshot({
    path: join(folder, "discussions-narrow-topics.png"),
  });
  await page
    .getByRole("link", { name: /Methods review — agreed research next steps/ })
    .click();
  assert.equal(
    await page.getByLabel("Reply", { exact: true }).inputValue(),
    "Draft kept while returning to topics.",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS task-origin topic → research/annotation/document cards → retained lost-response reply retry without duplicate Inbox → editor reply/Inbox return → exact PDF → rename/edit → Viewer/outsider/wrong-author/invalid-mention denial → long-topic cursors/history position/new-message indicator → archive/restore → responsive and AI coexistence.",
  );
  console.log("Controlled evidence: " + folder);
} catch (error) {
  console.error(
    "FAIL at " +
      stage +
      ": " +
      (error instanceof Error ? error.message.slice(0, 300) : "unknown"),
  );
  if (error instanceof Error)
    console.error(
      error.stack?.match(/discussions-browser-qa\.ts:\d+:\d+/)?.[0],
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
