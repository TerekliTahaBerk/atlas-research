import { chromium, type Page } from "playwright";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { getEnv } from "../src/server/env";
import { createMailQueue } from "../src/server/mail/outbox";
import { startMailServer } from "../tests/helpers/mail";

// This entry is called only by the disposable database harness, never live.
if (
  process.env.NODE_ENV !== "test" ||
  !process.env.MIGRATION_DATABASE_URL?.includes("/atlas_test")
)
  throw new Error("Disposable harness required");
const socket = createServer();
await new Promise<void>((r) => socket.listen(0, "127.0.0.1", r));
const address = socket.address();
if (!address || typeof address === "string")
  throw new Error("Port unavailable");
const port = address.port;
await new Promise<void>((r) => socket.close(() => r()));
const origin = `http://127.0.0.1:${port}`,
  smtp = await startMailServer();
process.env.APP_ORIGIN = origin;
process.env.SMTP_PORT = String(smtp.port);
const mail = createMailQueue(getEnv()),
  folder = mkdtempSync(join(tmpdir(), "atlas-browser-qa-"));
function startServer(delivery: "smtp" | "disabled" = "smtp") {
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
      env: { ...process.env, MAIL_DELIVERY: delivery },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  server.stderr?.on("data", (chunk) => {
    for (const line of String(chunk).split("\n")) {
      try {
        const event = JSON.parse(line);
        if (event.event === "request_failed")
          console.log({
            event: event.event,
            kind: event.kind,
            code: event.code,
          });
      } catch {}
    }
  });
  return server;
}
let server = startServer();
async function stopServer() {
  if (server.exitCode !== null) return;
  await new Promise<void>((r) => {
    server.once("exit", () => r());
    server.kill("SIGTERM");
  });
}
const browser = await chromium.launch({ headless: true });
const errors: string[] = [];
let profileRestartAt = 0;
function observe(page: Page) {
  page.on("pageerror", (error) => errors.push(error.name));
  page.on("console", (message) => {
    if (!["warning", "error"].includes(message.type())) return;
    const value = message.text();
    if (
      value.startsWith("Failed to load resource:") &&
      Date.now() - profileRestartAt < 10_000 &&
      /net::ERR_(CONNECTION_REFUSED|CONNECTION_RESET|EMPTY_RESPONSE)/.test(
        value,
      )
    )
      return;
    if (
      value.startsWith("Failed to load resource:") &&
      (/\b(401|403|404|429)\b/.test(value) || value.includes("net::ERR_FAILED"))
    )
      return;
    errors.push("browser-console-" + message.type());
  });
}
const timer = setInterval(() => void mail.flush().catch(() => {}), 250);
let stage = "server start";
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + "/health/live")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(
    "Browser plugin not available; Playwright Chromium against production build + disposable PostgreSQL/SMTP.",
  );
  const a = await browser.newContext(),
    b = await browser.newContext(),
    c = await browser.newContext();
  const pa = await a.newPage(),
    pb = await b.newPage(),
    pc = await c.newPage();
  [pa, pb, pc].forEach(observe);
  async function account(page: Page, name: string) {
    const email = `qa-${randomBytes(8).toString("hex")}@example.invalid`,
      password = randomBytes(24).toString("hex");
    await page.goto(origin + "/sign-up");
    assert.equal(await page.title(), "Atlas Research");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    stage = "browser sign-up response";
    const signupResponse = page.waitForResponse((r) =>
      r.url().endsWith("/api/auth/sign-up/email"),
    );
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    const response = await signupResponse;
    if (!response.ok()) {
      const body = await response.json().catch(() => ({}));
      const code = body.error ?? body.code;
      console.log({
        status: response.status(),
        code:
          typeof code === "string" && /^[A-Z_]+$/.test(code)
            ? code
            : "SAFE_ERROR",
      });
      throw new Error("SignUpFailed");
    }
    await page
      .getByRole("status")
      .filter({ hasText: "verification email" })
      .waitFor();
    for (
      let i = 0;
      i < 60 && !smtp.messages.some((m) => m.recipients.includes(email));
      i++
    )
      await new Promise((r) => setTimeout(r, 100));
    await page.goto(smtp.latest(email, "Verify your Atlas email").href);
    await page.waitForURL(
      (url) =>
        url.pathname === "/sign-in" && url.searchParams.get("verified") === "1",
    );
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/home");
    await page
      .getByRole("heading", {
        name: `Hello, ${name.split(" ")[0]}`,
        exact: true,
      })
      .waitFor();
    assert.equal(await page.locator(".project-card").count(), 0);
    return { email, password };
  }
  const ua = await account(pa, "Researcher A"),
    ub = await account(pb, "Researcher B");
  await account(pc, "Researcher C");
  stage = "workspace creation";
  console.log(
    "PASS: three browser registrations, SMTP verification, sign-in and empty personal workspaces.",
  );
  await pa
    .getByRole("button", { name: "Shared workspace", exact: true })
    .click();
  await pa
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("Synthetic Team");
  await pa
    .getByRole("dialog")
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await pa.getByRole("dialog").waitFor({ state: "hidden" });
  await pa.getByRole("link", { name: "S Synthetic Team" }).waitFor();
  await pa
    .locator("#main")
    .getByRole("button", { name: "New project", exact: true })
    .click();
  await pa
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("Synthetic study");
  await pa
    .getByRole("dialog")
    .getByLabel("Workspace", { exact: true })
    .selectOption({ label: "Synthetic Team · shared" });
  await pa
    .getByRole("dialog")
    .getByLabel("Description", { exact: false })
    .fill("A controlled collaboration study.");
  await pa
    .getByRole("dialog")
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await pa.waitForURL("**/p/*");
  const projectUrl = pa.url();
  stage = "project invitation";
  await pa
    .getByRole("heading", { name: "Synthetic study", exact: true })
    .waitFor();
  await pa.getByRole("link", { name: "Members", exact: true }).click();
  await pa.getByRole("button", { name: "Invite member", exact: true }).click();
  await pa
    .getByRole("dialog")
    .getByLabel("Email", { exact: true })
    .fill(ub.email);
  await pa
    .getByRole("dialog")
    .getByRole("button", { name: "Send invitation", exact: true })
    .click();
  await pa.getByRole("dialog").waitFor({ state: "hidden" });
  for (
    let i = 0;
    i < 60 &&
    !smtp.messages.some(
      (m) =>
        m.recipients.includes(ub.email) &&
        m.text.includes("Your Atlas project invitation"),
    );
    i++
  )
    await new Promise((r) => setTimeout(r, 100));
  const invitation = smtp.latest(
    ub.email,
    "Your Atlas project invitation",
  ).href;
  await pb.goto(invitation);
  await pb
    .getByRole("heading", { name: "Synthetic study", exact: true })
    .waitFor();
  await pb
    .getByRole("button", { name: "Accept invitation", exact: true })
    .click();
  await pb.waitForURL(projectUrl);
  stage = "team isolation and viewer";
  await pb
    .getByRole("heading", { name: "Synthetic study", exact: true })
    .waitFor();
  await pc.goto(projectUrl);
  await pc
    .getByRole("heading", { name: "This page is unavailable", exact: true })
    .waitFor();
  assert.equal(
    await pc.getByText("Synthetic study", { exact: true }).count(),
    0,
  );
  await pa.reload();
  await pa
    .getByLabel(`Role for ${ub.email}`, { exact: true })
    .selectOption("viewer");
  await pa.getByRole("status").filter({ hasText: "Saved to Atlas" }).waitFor();
  await pb.reload();
  await pb
    .getByRole("heading", { name: "Synthetic study", exact: true })
    .waitFor();
  assert.equal(
    await pb.getByRole("button", { name: "Edit project", exact: true }).count(),
    0,
  );

  // Eight viewport/theme pairs across auth, empty home, project, members, settings and invite.
  stage = "responsive screenshots";
  for (const width of [390, 768, 1024, 1440])
    for (const theme of ["light", "dark"]) {
      for (const [name, page, url] of [
        ["sign-in", pc, origin + "/sign-in"],
        ["empty-home", pc, origin + "/home"],
        ["project", pa, projectUrl],
        ["members", pa, projectUrl + "/members"],
        ["settings", pa, origin + "/settings"],
        ["invite", pb, invitation],
      ] as const) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(url);
        await page.locator("main").waitFor();
        await page.evaluate((t) => {
          localStorage.setItem("atlas-theme", t);
        }, theme);
        await page.reload();
        if (name !== "sign-in")
          await page
            .getByRole("status")
            .filter({ hasText: "Loading your workspace" })
            .waitFor({ state: "hidden" });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        );
        assert.equal(overflow, false, `${name} ${width} ${theme}: overflow`);
        assert.equal(await page.locator("nextjs-portal").count(), 0);
        await page.screenshot({
          path: join(folder, `${name}-${width}-${theme}.png`),
          fullPage: true,
        });
      }
    }
  await pa.setViewportSize({ width: 390, height: 900 });
  stage = "keyboard drawer";
  await pa.goto(origin + "/home");
  await pa
    .getByRole("heading", { name: "Hello, Researcher", exact: true })
    .waitFor();
  await pa
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await pa.getByRole("dialog").waitFor();
  for (let i = 0; i < 15; i++) {
    await pa.keyboard.press("Tab");
    assert.equal(
      await pa.evaluate(() => !!document.activeElement?.closest("dialog")),
      true,
    );
  }
  await pa.keyboard.press("Escape");
  assert.equal(
    await pa
      .getByRole("button", { name: "Open navigation", exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await pa.emulateMedia({ reducedMotion: "reduce" });
  await pa.setViewportSize({ width: 320, height: 900 });
  assert.equal(
    await pa.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  assert.equal(
    await pa.locator("body").evaluate((e) => getComputedStyle(e).animationName),
    "none",
  );
  await pa.setViewportSize({ width: 1440, height: 900 });
  await pa.goto(projectUrl + "/members");
  await pa
    .getByRole("heading", { name: "Project members", exact: true })
    .waitFor();
  await pa
    .locator(".member-list li")
    .filter({ hasText: ub.email })
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await pa.getByRole("status").filter({ hasText: "Saved to Atlas" }).waitFor();
  await pb.goto(projectUrl);
  await pb
    .getByRole("heading", { name: "This page is unavailable", exact: true })
    .waitFor();
  // Actual fetch failures preserve input and offer retry; no success is simulated.
  await pc.goto(invitation);
  await pc
    .getByRole("heading", { name: "This page is unavailable", exact: true })
    .waitFor();
  assert.equal(
    await pc.getByText("Synthetic study", { exact: true }).count(),
    0,
  );
  await pc.goto(origin + "/sign-in");
  await pc.getByLabel("Email", { exact: true }).fill(ua.email);
  await pc.getByLabel("Password", { exact: true }).fill(ua.password);
  await pc.route("**/api/auth/sign-in/email", (route) => route.abort());
  await pc.getByRole("button", { name: "Sign in", exact: true }).click();
  await pc
    .getByRole("alert")
    .filter({ hasText: "Could not connect" })
    .waitFor();
  assert.equal(
    await pc.getByLabel("Email", { exact: true }).inputValue(),
    ua.email,
  );
  await pc.unroute("**/api/auth/sign-in/email");
  stage = "profile and password recovery";
  await pa.goto(origin + "/settings");
  await pa.getByLabel("Name", { exact: true }).fill("Researcher Alpha");
  await pa.getByRole("button", { name: "Save profile", exact: true }).click();
  await pa.getByRole("status").filter({ hasText: "Profile saved" }).waitFor();
  await pb.goto(origin + "/reset");
  await pb.getByLabel("Email", { exact: true }).fill(ub.email);
  await pb
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await pb.getByRole("status").filter({ hasText: "reset link" }).waitFor();
  for (
    let i = 0;
    i < 60 &&
    !smtp.messages.some(
      (m) =>
        m.recipients.includes(ub.email) &&
        m.text.includes("Reset your Atlas password"),
    );
    i++
  )
    await new Promise((r) => setTimeout(r, 100));
  await pb.goto(smtp.latest(ub.email, "Reset your Atlas password").href);
  await pb.waitForURL((url) => url.pathname === "/reset/new");
  const password = randomBytes(24).toString("hex");
  await pb.getByLabel("Password", { exact: true }).fill(password);
  await pb
    .getByRole("button", { name: "Save new password", exact: true })
    .click();
  await pb
    .getByRole("status")
    .filter({ hasText: "password was changed" })
    .waitFor();
  assert.equal((await b.request.get(origin + "/api/me")).status(), 401);
  await pb.getByRole("link", { name: "Go to sign in", exact: true }).click();
  await pb.getByLabel("Email", { exact: true }).fill(ub.email);
  await pb.getByLabel("Password", { exact: true }).fill(password);
  await pb.getByRole("button", { name: "Sign in", exact: true }).click();
  await pb.waitForURL("**/home");
  await pa.reload();
  await pa.getByRole("button", { name: "Revoke session", exact: true }).click();
  await pa.waitForURL("**/sign-in");
  stage = "anonymous and retry state";
  await pa.goto(origin + "/home");
  await pa
    .getByRole("heading", { name: "Sign in to continue", exact: true })
    .waitFor();
  await pa.screenshot({ path: join(folder, "unauthenticated-1440-dark.png") });
  await pc.goto(origin + "/home");
  await pc.route("**/api/projects", (route) => route.abort());
  await pc.reload();
  await pc
    .getByRole("heading", { name: "This page is unavailable", exact: true })
    .waitFor();
  await pc.unroute("**/api/projects");
  await pc.getByRole("button", { name: "Try again", exact: true }).click();
  await pc
    .getByRole("heading", { name: "Hello, Researcher", exact: true })
    .waitFor();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await pc.route("**/api/projects", async (route) => {
    await gate;
    await route.continue();
  });
  await pc.reload();
  await pc
    .getByRole("status")
    .filter({ hasText: "Loading your workspace" })
    .waitFor();
  await pc.screenshot({ path: join(folder, "loading-1440-dark.png") });
  release();
  await pc
    .getByRole("heading", { name: "Hello, Researcher", exact: true })
    .waitFor();
  await pc.unroute("**/api/projects");
  stage = "disabled mail deployment profile";
  profileRestartAt = Date.now();
  await stopServer();
  server = startServer("disabled");
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + "/health/live")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  for (const path of ["/sign-up", "/reset", "/verify"]) {
    await pa.goto(origin + path);
    await pa
      .getByRole("heading", {
        name: "Email delivery is currently unavailable",
        exact: true,
      })
      .waitFor();
    assert.equal(await pa.locator("form").count(), 0);
  }
  assert.equal(
    (
      await a.request.post(origin + "/api/auth/sign-up/email", {
        headers: { origin },
        data: {
          name: "Disabled browser",
          email: "disabled-browser@example.invalid",
          password: randomBytes(24).toString("hex"),
        },
      })
    ).status(),
    503,
  );
  await pa.goto(origin + "/sign-in");
  await pa.getByLabel("Email", { exact: true }).fill(ua.email);
  await pa.getByLabel("Password", { exact: true }).fill(ua.password);
  await pa.getByRole("button", { name: "Sign in", exact: true }).click();
  await pa.waitForURL("**/home");
  await pa.goto(projectUrl + "/members");
  await pa
    .getByRole("heading", { name: "Project members", exact: true })
    .waitFor();
  assert.equal(
    await pa
      .getByRole("button", { name: "Invite member", exact: true })
      .isEnabled(),
    false,
  );
  const scope = new URL(projectUrl).pathname.split("/");
  assert.equal(
    (
      await a.request.patch(
        `${origin}/api/projects/${scope[4]}?workspaceId=${scope[2]}`,
        {
          headers: { origin },
          data: {
            action: "invite",
            email: "disabled-invite@example.invalid",
            role: "viewer",
          },
        },
      )
    ).status(),
    503,
  );
  await pa.setViewportSize({ width: 390, height: 900 });
  await pa.goto(origin + "/sign-up");
  await pa
    .getByRole("heading", {
      name: "Email delivery is currently unavailable",
      exact: true,
    })
    .waitFor();
  await pa.screenshot({
    path: join(folder, "mail-disabled-390-dark.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real registration/verification/sign-in, empty accounts, workspace/project creation, invite acceptance, viewer and team isolation, live revocation, keyboard drawer/focus return, reduced motion, recoverable network error, disabled-mail UI and HTTP denial; 48 screenshots across four widths/two themes.",
  );
  console.log(`Synthetic screenshot evidence: ${folder}`);
} catch (error) {
  console.error(
    `FAIL: browser QA at ${stage}; ${error instanceof Error ? error.name : "Error"}. Raw URLs, tokens and credentials omitted.`,
  );
  for (const [index, page] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await page
      .screenshot({ path: join(folder, `failure-${index}.png`) })
      .catch(() => {});
  console.log(`Synthetic failure evidence: ${folder}`);
  process.exitCode = 1;
} finally {
  clearInterval(timer);
  await browser.close();
  await stopServer();
  await mail.close();
  await smtp.close();
}
