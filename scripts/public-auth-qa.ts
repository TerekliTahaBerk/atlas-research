import { chromium } from "playwright";
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
  folder = mkdtempSync(join(tmpdir(), "atlas-public-auth-")),
  smtp = await startMailServer();
process.env.APP_ORIGIN = origin;
process.env.SMTP_PORT = String(smtp.port);
const mail = createMailQueue(getEnv());
function start(delivery: "smtp" | "disabled") {
  return spawn(
    process.execPath,
    [
      resolve("node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { env: { ...process.env, MAIL_DELIVERY: delivery }, stdio: "ignore" },
  );
}
let server = start("smtp");
async function stop() {
  if (server.exitCode !== null) return;
  server.kill("SIGTERM");
  await new Promise<void>((r) => server.once("exit", () => r()));
}
async function ready() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + "/health/live")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Test server unavailable");
}
const timer = setInterval(() => void mail.flush().catch(() => {}), 250),
  browser = await chromium.launch({ headless: true }),
  context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  }),
  page = await context.newPage();
const errors: string[] = [];
let stage = "start";
page.on("pageerror", (e) => errors.push(e.name));
page.on("console", (e) => {
  if (
    e.type() === "error" &&
    !/Failed to load resource|net::ERR_FAILED/.test(e.text())
  )
    errors.push("console-error");
});
page.setDefaultTimeout(15000);
const email = `public-qa-${randomBytes(8).toString("hex")}@example.invalid`,
  password = randomBytes(24).toString("hex");
try {
  await ready();
  console.log(
    "IAB design review completed separately; production Playwright uses disposable PostgreSQL and local test SMTP only.",
  );
  stage = "public landing and entry links";
  await page.goto(origin);
  assert.equal(await page.title(), "Atlas Research");
  await page
    .getByRole("heading", {
      name: "Your research, connected to its sources.",
      exact: true,
    })
    .waitFor();
  assert.equal(await page.getByRole("main").count(), 1);
  await page.getByRole("link", { name: "FAQ", exact: true }).first().click();
  await page.getByText("What can I do with Atlas?", { exact: true }).click();
  assert.notEqual(
    await page.locator("#faq details").first().getAttribute("open"),
    null,
  );
  await page.getByRole("link", { name: "Log in", exact: true }).first().click();
  await page
    .getByRole("heading", { name: "Welcome back", exact: true })
    .waitFor();
  await page.getByLabel("Email", { exact: true }).focus();
  await page.keyboard.press("Tab");
  assert.ok(
    await page
      .getByLabel("Password", { exact: true })
      .evaluate((e) => e === document.activeElement),
  );
  stage = "registration, visibility toggle and SMTP verification";
  await page
    .getByRole("link", { name: "Create an account", exact: true })
    .click();
  await page
    .getByLabel("Name", { exact: true })
    .fill("Synthetic entry researcher");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Password", { exact: true }).getAttribute("type"),
    "text",
  );
  await page
    .getByRole("button", { name: "Hide password", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Password", { exact: true }).getAttribute("type"),
    "password",
  );
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
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
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/home");
  assert.equal((await context.request.get(origin + "/api/me")).status(), 200);
  stage = "recovery and new-password sign in";
  await page.goto(origin + "/reset");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "reset link is on its way" })
    .waitFor();
  for (
    let i = 0;
    i < 60 &&
    !smtp.messages.some((m) => m.text.includes("Reset your Atlas password"));
    i++
  )
    await new Promise((r) => setTimeout(r, 100));
  await page.goto(smtp.latest(email, "Reset your Atlas password").href);
  const nextPassword = randomBytes(24).toString("hex");
  await page.getByLabel("Password", { exact: true }).fill(nextPassword);
  await page
    .getByRole("button", { name: "Save new password", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "password was changed" })
    .waitFor();
  await page.getByRole("link", { name: "Go to sign in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(nextPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/home");
  assert.equal((await context.request.get(origin + "/api/me")).status(), 200);
  stage = "responsive public and auth surfaces";
  for (const width of [320, 390, 768, 1024, 1440])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 900 });
      // This is fixture preference setup; theme controls were also exercised in IAB.
      await page.evaluate((t) => localStorage.setItem("atlas-theme", t), theme);
      for (const route of ["/", "/sign-in", "/sign-up", "/reset"]) {
        await page.goto(origin + route);
        await page.getByRole("main").waitFor();
        if (route === "/sign-up")
          await page.getByLabel("Name", { exact: true }).waitFor();
        if (route === "/reset")
          await page.getByLabel("Email", { exact: true }).waitFor();
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          `${route} ${width} ${theme}: overflow`,
        );
        assert.equal(await page.locator("nextjs-portal").count(), 0);
        await page.screenshot({
          path: join(
            folder,
            `${route.replaceAll("/", "") || "landing"}-${width}-${theme}.png`,
          ),
          fullPage: route === "/" && width === 1440,
        });
      }
    }
  stage = "invalid credentials error";
  await page.goto(origin + "/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("wrong-" + randomBytes(18).toString("hex"));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(new URL(page.url()).pathname, "/sign-in");
  stage = "disabled email capabilities";
  await stop();
  server = start("disabled");
  await ready();
  for (const route of ["/sign-up", "/reset", "/verify"]) {
    await page.goto(origin + route);
    await page
      .getByRole("heading", {
        name: "This service is unavailable",
        exact: true,
      })
      .waitFor();
    assert.equal(await page.locator("form").count(), 0);
    assert.equal(
      await page
        .getByRole("link", { name: "Back to sign in", exact: true })
        .count(),
      1,
    );
  }
  await page.screenshot({ path: join(folder, "email-disabled.png") });
  assert.deepEqual(errors, []);
  console.log(
    "PASS public landing → FAQ → login; registration → local SMTP verification → authenticated Home; password recovery → changed-password login; visibility toggle; invalid-credential error; disabled email remains unavailable. Five widths, both themes, no overflow/overlay/browser exceptions.",
  );
  console.log("Synthetic evidence: " + folder);
} catch (e) {
  console.error(
    `FAIL public/auth at ${stage}: ${e instanceof Error ? e.name : "unknown"}. No credentials or tokens logged.`,
  );
  console.error(
    e instanceof Error ? e.stack?.match(/public-auth-qa\.ts:\d+:\d+/)?.[0] : "",
  );
  // Never screenshot filled credentials on an authentication failure.
  process.exitCode = 1;
} finally {
  clearInterval(timer);
  await browser.close();
  await stop();
  await smtp.close();
}
