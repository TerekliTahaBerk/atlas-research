import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createDatabase } from "../../src/server/db/client";
import { createAuth } from "../../src/server/auth/create-auth";
import { createMailQueue } from "../../src/server/mail/outbox";
import { requireIdentity } from "../../src/server/auth/identity";
import { ensurePersonalWorkspace } from "../../src/server/domain/personal-workspace";
import { asIdentity } from "../../src/server/db/transaction";
import { getEnv } from "../../src/server/env";
import { createAuthHandler } from "../../src/server/auth/handler";
import { revokeOwnSession } from "../../src/server/domain/sessions";
import { startMailServer } from "../helpers/mail";
import { verifiedUser, cookies } from "../helpers/identity";

test("verified personal identity, encrypted SMTP outbox, reset/revocation, idempotent empty workspace", async () => {
  const smtp = await startMailServer();
  const env = { ...getEnv(), SMTP_PORT: smtp.port };
  const db = createDatabase(env.AUTH_DATABASE_URL);
  const runtime = createDatabase(env.DATABASE_URL);
  const mail = createMailQueue(env);
  const auth = createAuth(db, env, mail);
  try {
    const email = `independent-${randomBytes(8).toString("hex")}@example.invalid`;
    const password = randomBytes(24).toString("hex");
    const signUp = await auth.api.signUpEmail({ body: { name: "Independent Researcher", email, password } });
    assert.equal(signUp.token, null);
    await assert.rejects(auth.api.signInEmail({ body: { email, password } }));
    const duplicate = await auth.api.signUpEmail({ body: { name: "Independent Researcher", email, password } });
    assert.equal(duplicate.token, null);
    const pending = await db.mailOutbox.findMany({ where: { state: "pending" } });
    assert.ok(pending.length);
    for (const row of pending) { assert.ok(!row.payload?.includes(email)); assert.ok(!row.payload?.includes("http")); }
    await mail.flush();
    const token = smtp.latest(email, "Verify your Atlas email").searchParams.get("token")!;
    await assert.rejects(auth.api.verifyEmail({ query: { token: `${token}invalid` } }));
    await auth.api.verifyEmail({ query: { token } });
    const signed = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
    const headers = new Headers({ cookie: cookies(signed) });
    assert.match(signed.headers.getSetCookie().join(";"), /HttpOnly/i);
    assert.match(signed.headers.getSetCookie().join(";"), /SameSite=Lax/i);
    const identity = await requireIdentity(auth, headers);
    const [w1, w2] = await Promise.all([ensurePersonalWorkspace(runtime, identity), ensurePersonalWorkspace(runtime, identity)]);
    assert.equal(w1.id, w2.id);
    assert.equal(w1.kind, "personal");
    const workspaces = await asIdentity(runtime, identity, tx => tx.workspace.findMany());
    assert.equal(workspaces.length, 1);
    await auth.api.updateUser({ headers, body: { name: "Updated Researcher" } });
    assert.equal((await requireIdentity(auth, headers)).name, "Updated Researcher");

    const unknown = await auth.api.requestPasswordReset({ body: { email: `unknown-${randomBytes(8).toString("hex")}@example.invalid`, redirectTo: `${env.APP_ORIGIN}/reset/new` } });
    const known = await auth.api.requestPasswordReset({ body: { email, redirectTo: `${env.APP_ORIGIN}/reset/new` } });
    assert.deepEqual(known, unknown);
    await mail.flush();
    const resetToken = smtp.latest(email, "Reset your Atlas password").pathname.split("/").at(-1)!;
    const nextPassword = randomBytes(24).toString("hex");
    await auth.api.resetPassword({ body: { token: resetToken, newPassword: nextPassword } });
    assert.equal(await auth.api.getSession({ headers }), null);
    await assert.rejects(auth.api.resetPassword({ body: { token: resetToken, newPassword: nextPassword } }));
    await assert.rejects(auth.api.signInEmail({ body: { email, password } }));
    const newSignIn = await auth.api.signInEmail({ body: { email, password: nextPassword }, asResponse: true });
    const nextHeaders = new Headers({ cookie: cookies(newSignIn) });
    const nextIdentity = await requireIdentity(auth, nextHeaders);
    await db.session.update({ where: { id: nextIdentity.sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal(await auth.api.getSession({ headers: nextHeaders }), null);
    await assert.rejects(ensurePersonalWorkspace(runtime, nextIdentity));
  } finally { await mail.close(); await smtp.close(); await db.$disconnect(); await runtime.$disconnect(); }
});

test("real auth handler denies cross-origin requests and enforces database rate limits", async () => {
  const smtp = await startMailServer();
  const env = { ...getEnv(), SMTP_PORT: smtp.port };
  const db = createDatabase(env.AUTH_DATABASE_URL);
  const mail = createMailQueue(env);
  const auth = createAuth(db, env, mail);
  const handle = createAuthHandler(auth, env);
  try {
    const request = (origin: string, ip: string) => new Request(`${env.APP_ORIGIN}/api/auth/sign-in/email`, { method: "POST", headers: { origin, "content-type": "application/json", "x-real-ip": ip }, body: JSON.stringify({ email: "absent@example.invalid", password: randomBytes(20).toString("hex") }) });
    const wrong = await handle(request("https://untrusted.example.invalid", "192.0.2.1"));
    assert.equal(wrong.status, 403);
    const oversize = await handle(new Request(`${env.APP_ORIGIN}/api/auth/sign-in/email`, { method: "POST", headers: { origin: env.APP_ORIGIN, "content-type": "application/json" }, body: "x".repeat(8193) }));
    assert.equal(oversize.status, 413);
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) last = await handle(request(env.APP_ORIGIN, "192.0.2.2"));
    assert.equal(last?.status, 429);
    assert.ok(last?.headers.get("retry-after"));
    const a = await verifiedUser(auth, mail, smtp);
    const b = await verifiedUser(auth, mail, smtp);
    const sessions = await auth.api.listSessions({ headers: a.headers });
    const other = await auth.api.listSessions({ headers: b.headers });
    assert.ok(sessions.every(s => s.userId === a.id));
    await assert.rejects(revokeOwnSession(auth, db, a.headers, other[0].id));
    assert.equal((await auth.api.getSession({ headers: b.headers }))?.user.id, b.id);
    const aIdentity = await requireIdentity(auth, a.headers);
    const bIdentity = await requireIdentity(auth, b.headers);
    const runtime = createDatabase(env.DATABASE_URL);
    try {
      const aSpace = await ensurePersonalWorkspace(runtime, aIdentity);
      await ensurePersonalWorkspace(runtime, bIdentity);
      assert.equal(await asIdentity(runtime, bIdentity, tx => tx.workspace.findUnique({ where: { id: aSpace.id } })), null);
      assert.deepEqual(await runtime.workspace.findMany(), []);
    } finally { await runtime.$disconnect(); }
    const secure = createAuth(db, { ...env, NODE_ENV: "production", APP_ORIGIN: "https://atlas.example.invalid" }, mail);
    const secureSignIn = await secure.api.signInEmail({ body: { email: a.email, password: a.password }, asResponse: true });
    assert.match(secureSignIn.headers.getSetCookie().join(";"), /; Secure/i);
    await revokeOwnSession(auth, db, a.headers, sessions[0].id);
    assert.equal(await auth.api.getSession({ headers: a.headers }), null);
  } finally { await mail.close(); await smtp.close(); await db.$disconnect(); }
});
