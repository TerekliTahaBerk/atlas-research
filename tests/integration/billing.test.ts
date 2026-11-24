import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { createAuth } from "../../src/server/auth/create-auth";
import { requireIdentity, type Identity } from "../../src/server/auth/identity";
import {
  readAcademicStatus,
  requestAcademicStatus,
  reviewAcademic,
} from "../../src/server/billing/academic";
import { readAdminResources } from "../../src/server/billing/admin";
import { resolveWorkspaceEntitlement } from "../../src/server/billing/entitlements";
import {
  activateFounding,
  foundingReview,
  submitFoundingApplication,
} from "../../src/server/billing/founding";
import {
  reserveResource,
  settleResource,
} from "../../src/server/billing/ledger";
import { processSandboxEvent } from "../../src/server/billing/sandbox-provider";
import {
  changeMemberAiCap,
  readWorkspaceUsage,
} from "../../src/server/billing/usage";
import { createDatabase } from "../../src/server/db/client";
import { asIdentity } from "../../src/server/db/transaction";
import {
  acceptInvitation,
  createInvitation,
} from "../../src/server/domain/invitations";
import { ensurePersonalWorkspace } from "../../src/server/domain/personal-workspace";
import {
  createProject,
  setProjectRole,
} from "../../src/server/domain/projects";
import { createSharedWorkspace } from "../../src/server/domain/workspaces";
import { getEnv } from "../../src/server/env";
import { AppError } from "../../src/server/errors";
import { createMailQueue } from "../../src/server/mail/outbox";
import { verifiedUser } from "../helpers/identity";
import { startMailServer } from "../helpers/mail";

const code = (expected: string) => (error: unknown) =>
  error instanceof AppError && error.code === expected;
const day = 86_400_000;

test("commercial entitlements, funding eligibility, seats, pool accounting and operator controls", async () => {
  process.env.ATLAS_RESOURCE_LIMITS_ENABLED = "1";
  process.env.ATLAS_FOUNDING_INTAKE_ENABLED = "1";
  process.env.ATLAS_BILLING_SANDBOX_ENABLED = "1";
  const smtp = await startMailServer();
  const env = {
    ...getEnv(),
    MAIL_DELIVERY: "smtp" as const,
    SMTP_PORT: smtp.port,
  };
  const authDb = createDatabase(env.AUTH_DATABASE_URL),
    db = createDatabase(env.DATABASE_URL);
  const mail = createMailQueue(env),
    auth = createAuth(authDb, env, mail);
  const provision = new pg.Client({
    connectionString: process.env.MIGRATION_DATABASE_URL,
  });
  const secret = randomBytes(32).toString("hex");
  const t = Date.now();
  const planStart = new Date(t - day).toISOString(),
    planEnd = new Date(t + 29 * day).toISOString();
  async function member() {
    return requireIdentity(
      auth,
      (await verifiedUser(auth, mail, smtp)).headers,
    );
  }
  function event(
    actor: Identity,
    payload: Record<string, unknown>,
    corrupt = false,
  ) {
    const raw = Buffer.from(JSON.stringify({ currency: "USD", ...payload }));
    const timestamp = Math.floor(Date.now() / 1000);
    const digest = createHmac("sha256", secret)
      .update(timestamp + ".")
      .update(raw)
      .digest("hex");
    return async () =>
      processSandboxEvent(
        db,
        actor,
        raw,
        `t=${timestamp},v1=${corrupt ? "0".repeat(64) : digest}`,
        secret,
      );
  }
  try {
    const owner = await member(),
      guest = await member(),
      reader = await member(),
      ops = await member(),
      extraEditor = await member();
    await provision.connect();
    await provision.query(
      'INSERT INTO ops.billing_operators("actorId") VALUES($1)',
      [ops.id],
    );
    const home = await ensurePersonalWorkspace(db, owner),
      outsider = await ensurePersonalWorkspace(db, guest);
    const team = await createSharedWorkspace(db, owner, {
      name: "Research group",
      requestId: randomUUID(),
    });

    const makePrice = (
      workspaceId: string,
      planCode: string,
      amountMinor: number,
      seats = 1,
      revision = 1,
    ) => ({
      eventId: randomUUID(),
      workspaceId,
      kind: "subscription",
      providerId: "fixture-" + workspaceId,
      planCode,
      revision,
      seats,
      amountMinor,
      interval: "month",
      periodStart: planStart,
      periodEnd: planEnd,
      status: "active",
      cancelAtPeriodEnd: false,
    });
    const buyTeam = makePrice(team.id, "TEAM", 4500, 3);
    await assert.rejects(event(ops, buyTeam, true), code("UNAVAILABLE"));
    await assert.rejects(event(owner, buyTeam), code("UNAVAILABLE"));
    const applyTeam = event(ops, buyTeam);
    assert.equal((await applyTeam()).result, "applied");
    assert.equal((await applyTeam()).duplicate, true);
    await assert.rejects(
      event(ops, { ...buyTeam, amountMinor: 4501 }),
      code("CONFLICT"),
    );
    const teamUsage = await readWorkspaceUsage(db, owner, team.id);
    assert.equal(teamUsage.limits.activeProjects, 110);
    assert.equal(teamUsage.limits.monthlyAiCredits, 750);
    assert.equal(teamUsage.memberAiPercent, 40);
    assert.equal(
      (await readWorkspaceUsage(db, owner, home.id)).limits.monthlyAiCredits,
      20,
    );
    await assert.rejects(
      readWorkspaceUsage(db, guest, team.id),
      code("UNAVAILABLE"),
    );
    await assert.rejects(readAdminResources(db, owner), code("UNAVAILABLE"));

    const project = await createProject(db, owner, team.id, {
      name: "Shared evidence",
      requestId: randomUUID(),
    });
    for (const [who, role] of [
      [guest, "editor"],
      [reader, "viewer"],
      [extraEditor, "editor"],
    ] as const) {
      await createInvitation(
        db,
        owner,
        mail,
        env.APP_ORIGIN,
        team.id,
        project.id,
        { email: who.email, role },
      );
      await mail.flush();
      const token = smtp
        .latest(who.email, "Your Atlas project invitation")
        .pathname.split("/")
        .at(-1)!;
      assert.equal((await acceptInvitation(db, who, token)).id, project.id);
    }
    assert.equal((await readWorkspaceUsage(db, reader, team.id)).seatUsage, 3);
    await assert.rejects(
      setProjectRole(db, owner, team.id, project.id, reader.id, "editor"),
      /seat_capacity/,
    );
    const memberRole = await asIdentity(db, reader, (tx) =>
      tx.projectMember.findFirst({
        where: { projectId: project.id, userId: reader.id },
      }),
    );
    assert.equal(memberRole?.role, "viewer");
    await assert.rejects(
      changeMemberAiCap(db, guest, team.id, 55),
      code("UNAVAILABLE"),
    );
    const reserve = (
      actor: Identity,
      w: string,
      quantity: number,
      operationId = randomUUID(),
    ) =>
      asIdentity(db, actor, (tx) =>
        reserveResource(tx, {
          actorId: actor.id,
          workspaceId: w,
          resource: "aiCredits",
          quantity,
          operationId,
        }),
      );
    const close = (
      w: string,
      operationId: string,
      quantity: number,
      outcome: "settle" | "release",
    ) =>
      asIdentity(db, owner, (tx) =>
        settleResource(tx, {
          actorId: owner.id,
          workspaceId: w,
          operationId,
          resource: "aiCredits",
          quantity,
          outcome,
        }),
      );
    await assert.rejects(reserve(owner, team.id, 301), code("AI_LIMITED"));
    const draw = randomUUID();
    await reserve(owner, team.id, 300, draw);
    await assert.rejects(reserve(owner, team.id, 1), code("AI_LIMITED"));
    await close(team.id, draw, 0, "release");
    await close(team.id, draw, 0, "release");
    assert.equal(
      (await readWorkspaceUsage(db, owner, team.id)).usage.monthlyAiCredits,
      0,
    );
    assert.equal(
      (await changeMemberAiCap(db, owner, team.id, 55)).memberAiPercent,
      55,
    );
    const shared = await Promise.allSettled([
      reserve(owner, team.id, 400),
      reserve(guest, team.id, 400),
    ]);
    assert.equal(shared.filter((row) => row.status === "fulfilled").length, 1);
    assert.equal(
      (await readWorkspaceUsage(db, owner, home.id)).usage.monthlyAiCredits,
      0,
    );

    // No school domain, suffix, or registry entry can self-approve a student.
    await assert.rejects(
      requestAcademicStatus(db, owner, "example.invalid"),
      code("ACADEMIC_UNAVAILABLE"),
    );
    await reviewAcademic(db, ops, {
      action: "institution",
      name: "Synthetic institution",
      domain: "example.invalid",
      verificationUrl: "https://registry.example.invalid",
      active: true,
    });
    assert.equal(
      (await requestAcademicStatus(db, owner, "example.invalid")).status,
      "pending",
    );
    const student = makePrice(home.id, "PLUS_STUDENT", 450);
    await assert.rejects(event(ops, student), code("ACADEMIC_UNAVAILABLE"));
    await reviewAcademic(db, ops, {
      action: "review",
      actorId: owner.id,
      decision: "verify",
      reason: "Verified fixture enrollment",
      enrollmentConfirmed: true,
      expiresInDays: 25,
    });
    assert.equal((await readAcademicStatus(db, owner)).status, "verified");
    assert.equal(
      (await requestAcademicStatus(db, owner, "example.invalid"))
        .renewalPending,
      true,
    );
    assert.equal((await event(ops, student)()).result, "applied");
    assert.equal(
      (await readWorkspaceUsage(db, owner, home.id)).limits.monthlyAiCredits,
      100,
    );
    await assert.rejects(
      event(ops, {
        ...makePrice(home.id, "PLUS_STUDENT", 450, 1, 2),
        interval: "year",
      }),
      code("INVALID_INPUT"),
    );
    await asIdentity(db, ops, (tx) =>
      tx.academicEligibility.update({
        where: { actorId: owner.id },
        data: { expiresAt: new Date(Date.now() - day) },
      }),
    );
    assert.equal((await readAcademicStatus(db, owner)).status, "expired");
    await assert.rejects(
      event(ops, {
        ...makePrice(home.id, "PLUS_STUDENT", 450, 1, 2),
        periodEnd: new Date(t + 28 * day).toISOString(),
      }),
      code("ACADEMIC_UNAVAILABLE"),
    );
    await event(ops, makePrice(home.id, "PLUS", 900, 1, 2))();
    assert.equal(
      (await readWorkspaceUsage(db, owner, home.id)).limits.activeProjects,
      25,
    );
    for (let i = 0; i < 25; i++)
      await createProject(db, owner, home.id, {
        name: "Capped Plus",
        requestId: randomUUID(),
      });
    await assert.rejects(
      createProject(db, owner, home.id, {
        name: "Beyond Plus",
        requestId: randomUUID(),
      }),
      code("PROJECT_QUOTA"),
    );
    await event(ops, makePrice(home.id, "PRO", 1900, 1, 3))();
    for (let i = 25; i < 100; i++)
      await createProject(db, owner, home.id, {
        name: "Capped Pro",
        requestId: randomUUID(),
      });
    await assert.rejects(
      createProject(db, owner, home.id, {
        name: "Beyond Pro",
        requestId: randomUUID(),
      }),
      code("PROJECT_QUOTA"),
    );

    const purchaseId = randomUUID();
    const purchase = {
      eventId: randomUUID(),
      workspaceId: home.id,
      kind: "purchase",
      purchaseId,
      addon: "AI_100",
      quantity: 1,
      amountMinor: 300,
      validFrom: new Date(t).toISOString(),
    };
    assert.equal((await event(ops, purchase)()).result, "applied");
    const spend = randomUUID();
    await reserve(owner, home.id, 410, spend);
    await close(home.id, spend, 401, "settle");
    const afterSpend = await readWorkspaceUsage(db, owner, home.id);
    assert.equal(afterSpend.usage.monthlyAiCredits, 400);
    assert.equal(afterSpend.topUps[0].remaining, 99);
    await event(ops, {
      eventId: randomUUID(),
      workspaceId: home.id,
      kind: "refund",
      purchaseId,
    })();
    assert.equal(
      (await readWorkspaceUsage(db, owner, home.id)).topUps.length,
      0,
    );
    assert.equal(
      (await event(ops, makePrice(home.id, "PLUS", 900, 1, 2))()).result,
      "stale",
    );
    assert.equal(
      (
        await event(ops, {
          ...makePrice(home.id, "PRO", 1900, 1, 4),
          status: "incomplete",
        })()
      ).result,
      "payment_failed",
    );
    const failedPayment = await readWorkspaceUsage(db, owner, home.id);
    assert.equal(failedPayment.source, "subscription");
    assert.equal(failedPayment.usage.activeProjects, 100);
    assert.equal(failedPayment.subscription?.status, "past_due");
    await event(ops, {
      ...makePrice(home.id, "PRO", 1900, 1, 5),
      status: "cancelled",
      periodStart: new Date(t - 30 * day).toISOString(),
      periodEnd: new Date(t - day).toISOString(),
    })();
    const downgraded = await readWorkspaceUsage(db, owner, home.id);
    assert.equal(downgraded.source, "free");
    assert.equal(downgraded.usage.activeProjects, 100);

    const run = randomUUID();
    const runtime = (quantity: number) =>
      asIdentity(db, guest, (tx) =>
        reserveResource(tx, {
          actorId: guest.id,
          workspaceId: outsider.id,
          operationId: run,
          quantity,
          resource: "pythonMilliseconds",
        }),
      );
    await assert.rejects(runtime(60_001), code("RESOURCE_QUOTA"));
    await runtime(55_000);
    await runtime(55_000);
    assert.equal(
      (await readWorkspaceUsage(db, guest, outsider.id)).usage
        .monthlyPythonMilliseconds,
      55_000,
    );
    await asIdentity(db, guest, async (tx) => {
      assert.equal(
        await tx.billingUsageEntry.count({ where: { workspaceId: home.id } }),
        0,
      );
      assert.equal(
        (
          await tx.$queryRaw<
            Array<{ descriptor: unknown }>
          >`SELECT app.billing_descriptor(${home.id}::uuid) AS descriptor`
        )[0].descriptor,
        null,
      );
    });
  } finally {
    await provision.end().catch(() => {});
    await Promise.all([
      mail.close(),
      smtp.close(),
      db.$disconnect(),
      authDb.$disconnect(),
    ]);
    delete process.env.ATLAS_RESOURCE_LIMITS_ENABLED;
    delete process.env.ATLAS_FOUNDING_INTAKE_ENABLED;
    delete process.env.ATLAS_BILLING_SANDBOX_ENABLED;
  }
});

test("Founding reservations, verified recipient, exclusive token use, expiry and audited extension", async () => {
  process.env.ATLAS_RESOURCE_LIMITS_ENABLED = "1";
  process.env.ATLAS_FOUNDING_INTAKE_ENABLED = "1";
  const smtp = await startMailServer();
  const env = {
    ...getEnv(),
    MAIL_DELIVERY: "smtp" as const,
    SMTP_PORT: smtp.port,
  };
  const authDb = createDatabase(env.AUTH_DATABASE_URL),
    db = createDatabase(env.DATABASE_URL);
  const mail = createMailQueue(env),
    auth = createAuth(authDb, env, mail);
  const provision = new pg.Client({
    connectionString: process.env.MIGRATION_DATABASE_URL,
  });
  try {
    const ops = await requireIdentity(
      auth,
      (await verifiedUser(auth, mail, smtp)).headers,
    );
    const applicant = await requireIdentity(
      auth,
      (await verifiedUser(auth, mail, smtp)).headers,
    );
    await provision.connect();
    await provision.query(
      'INSERT INTO ops.billing_operators("actorId") VALUES($1)',
      [ops.id],
    );
    const payload = {
      name: "Synthetic founding candidate",
      researchArea: "Open Science",
      applicantType: "team" as const,
      teamSize: 5,
      tools: ["pdf", "ai"] as ("pdf" | "ai")[],
      motivation: "A controlled test using synthetic research data.",
    };
    await submitFoundingApplication(db, { ...payload, email: applicant.email });
    await submitFoundingApplication(db, { ...payload, email: applicant.email });
    const requests = await asIdentity(db, ops, (tx) =>
      tx.foundingApplication.findMany({ where: { email: applicant.email } }),
    );
    assert.equal(requests.length, 1);
    const app = requests[0].id;
    await foundingReview(
      db,
      ops,
      { action: "approve", applicationId: app, profile: "RES_FOUNDING_TEAM" },
      env.APP_ORIGIN,
      mail,
    );
    await assert.rejects(
      foundingReview(
        db,
        ops,
        { action: "invite", applicationId: app, send: true },
        env.APP_ORIGIN,
        mail,
      ),
      code("MAIL_DISABLED"),
    );
    const invitation = await foundingReview(
      db,
      ops,
      { action: "invite", applicationId: app, send: false },
      env.APP_ORIGIN,
      mail,
    );
    assert.ok("link" in invitation && invitation.link);
    const token = new URLSearchParams(
      new URL(invitation.link).hash.slice(1),
    ).get("token")!;
    const own = await createSharedWorkspace(db, applicant, {
      name: "Pilot cohort lab",
      requestId: randomUUID(),
    });
    const wrong = await createSharedWorkspace(db, ops, {
      name: "Unrelated lab",
      requestId: randomUUID(),
    });
    await assert.rejects(
      activateFounding(db, ops, wrong.id, token),
      code("UNAVAILABLE"),
    );
    const approvals = await Promise.allSettled([
      activateFounding(db, applicant, own.id, token),
      activateFounding(db, applicant, own.id, token),
    ]);
    assert.equal(
      approvals.filter((row) => row.status === "fulfilled").length,
      1,
    );
    const entitlement = await asIdentity(db, applicant, (tx) =>
      resolveWorkspaceEntitlement(tx, own.id),
    );
    assert.equal(entitlement.foundingProfile, "RES_FOUNDING_TEAM");
    assert.equal(entitlement.limits.monthlyAiCredits, 500);
    assert.equal(entitlement.seats, 5);
    assert.equal(
      entitlement.endsAt!.getTime() - entitlement.startsAt!.getTime(),
      90 * day,
    );
    await foundingReview(
      db,
      ops,
      {
        action: "extend",
        applicationId: app,
        days: 30,
        note: "Synthetic extension",
      },
      env.APP_ORIGIN,
      mail,
    );
    await assert.rejects(
      foundingReview(
        db,
        ops,
        {
          action: "extend",
          applicationId: app,
          days: 1,
          note: "Reject extension beyond thirty",
        },
        env.APP_ORIGIN,
        mail,
      ),
      code("INVALID_INPUT"),
    );
    const previous = new Date(Date.now() - day);
    await asIdentity(db, ops, (tx) =>
      tx.foundingGrant.update({
        where: { workspaceId: own.id },
        data: {
          startedAt: new Date(previous.getTime() - 120 * day),
          endsAt: previous,
        },
      }),
    );
    assert.equal(
      (await readWorkspaceUsage(db, applicant, own.id)).source,
      "free",
    );
    const report = await readAdminResources(db, ops);
    assert.equal(
      report.founding.grants.find((row) => row.workspaceId === own.id)
        ?.extensionDays,
      30,
    );
    assert.ok(
      report.auditEvents.some((row) => row.kind === "founding_activated"),
    );

    const reservedStudent = Array.from(
      { length: 21 },
      () => randomUUID() + "@example.invalid",
    );
    for (const email of reservedStudent)
      await submitFoundingApplication(db, {
        ...payload,
        email,
        applicantType: "undergraduate",
        teamSize: 1,
      });
    const students = await asIdentity(db, ops, (tx) =>
      tx.foundingApplication.findMany({
        where: { email: { in: reservedStudent } },
        select: { id: true },
      }),
    );
    const approveStudent = (id: string) =>
      foundingReview(
        db,
        ops,
        {
          action: "approve",
          applicationId: id,
          profile: "RES_FOUNDING_STUDENT",
        },
        env.APP_ORIGIN,
        mail,
      );
    for (const student of students.slice(0, 19))
      await approveStudent(student.id);
    const cap = await Promise.allSettled(
      students.slice(19).map((student) => approveStudent(student.id)),
    );
    assert.equal(cap.filter((row) => row.status === "fulfilled").length, 1);
    assert.ok(
      cap.some(
        (row) =>
          row.status === "rejected" && code("FOUNDING_CAPACITY")(row.reason),
      ),
    );
  } finally {
    await provision.end().catch(() => {});
    await Promise.all([
      mail.close(),
      smtp.close(),
      db.$disconnect(),
      authDb.$disconnect(),
    ]);
    delete process.env.ATLAS_RESOURCE_LIMITS_ENABLED;
    delete process.env.ATLAS_FOUNDING_INTAKE_ENABLED;
  }
});
