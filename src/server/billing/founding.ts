import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Identity } from "../auth/identity";
import type { Database } from "../db/client";
import { asIdentity } from "../db/transaction";
import type { Tx } from "../domain/access";
import { AppError } from "../errors";
import type { MailQueue } from "../mail/outbox";
import {
  FOUNDING_EXTENSION_MAX_DAYS,
  FOUNDING_PROFILES,
  resolveFoundingLimits,
  type FoundingProfile,
} from "./catalog";
import { cleanOverrides, quotaNames } from "./descriptor";
import { lockUsage } from "./entitlements";
import { asBillingOperator, billingAudit } from "./operations";

export const foundingIntakeEnabled = () =>
  process.env.ATLAS_FOUNDING_INTAKE_ENABLED === "1";
const hours = 3_600_000;
export const foundingApplicationInput = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    institution: z.string().trim().max(160).optional(),
    researchArea: z.string().trim().min(2).max(160),
    applicantType: z.enum([
      "undergraduate",
      "masters",
      "doctorate",
      "academic",
      "independent",
      "team",
      "lab",
    ]),
    teamSize: z.number().int().min(1).max(1000),
    tools: z.array(z.enum(["latex", "python", "pdf", "ai"])).max(4),
    motivation: z.string().trim().min(15).max(1600),
  })
  .strict();

const profileNames = Object.keys(FOUNDING_PROFILES) as FoundingProfile[];
const overridesSchema = z.partialRecord(
  z.enum(quotaNames),
  z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
);
const applicationId = z.uuid();
export const foundingReviewInput = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("approve"),
      applicationId,
      profile: z.enum(profileNames),
      overrides: overridesSchema.optional(),
      note: z.string().trim().max(500).optional(),
    })
    .strict(),
  z
    .object({
      action: z.enum(["reject", "expire", "revoke", "note"]),
      applicationId,
      note: z.string().trim().min(1).max(500),
    })
    .strict(),
  z
    .object({
      action: z.enum(["invite", "resend"]),
      applicationId,
      send: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      action: z.literal("extend"),
      applicationId,
      days: z.number().int().min(1).max(FOUNDING_EXTENSION_MAX_DAYS),
      note: z.string().trim().min(1).max(500),
    })
    .strict(),
]);
type FoundingReview = z.output<typeof foundingReviewInput>;

export async function submitFoundingApplication(
  db: Database,
  input: z.output<typeof foundingApplicationInput>,
) {
  if (!foundingIntakeEnabled()) throw new AppError("UNAVAILABLE", 404);
  await db.$executeRaw`SELECT app.submit_founding_application(${randomUUID()}::uuid,${input.email},${input.name},${input.institution || null},
    ${input.researchArea},${input.applicantType},${input.teamSize}::int,${[...new Set(input.tools)]}::text[],${input.motivation})`;
}

export function activateFounding(
  db: Database,
  actor: Identity,
  workspaceId: string,
  token: string,
) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new AppError("UNAVAILABLE", 404);
  const digest = createHash("sha256").update(token).digest("hex");
  return asIdentity(db, actor, async (tx) => {
    const [result] = await tx.$queryRaw<
      Array<{ activated: boolean }>
    >`SELECT app.activate_founding(${workspaceId}::uuid,${digest}) AS activated`;
    if (!result?.activated) throw new AppError("UNAVAILABLE", 404);
    return { workspaceId };
  });
}

async function lockFounding(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('atlas.founding.enrollment',0))`;
}
async function occupancy(
  tx: Tx,
  profile: FoundingProfile,
  now: Date,
  exclude?: string,
) {
  const active = await tx.foundingGrant.count({
    where: { profile, revokedAt: null, endsAt: { gt: now } },
  });
  const reserved = await tx.foundingApplication.count({
    where: {
      id: exclude ? { not: exclude } : undefined,
      profile,
      status: { in: ["approved", "invited"] },
      tokenExpiresAt: { gt: now },
    },
  });
  return { active, reserved, capacity: FOUNDING_PROFILES[profile].capacity };
}
async function requireFoundingCapacity(
  tx: Tx,
  profile: FoundingProfile,
  now: Date,
  exclude: string,
) {
  const { active, reserved, capacity } = await occupancy(
    tx,
    profile,
    now,
    exclude,
  );
  if (active + reserved >= capacity)
    throw new AppError("FOUNDING_CAPACITY", 409);
}

export function foundingReview(
  db: Database,
  actor: Identity,
  input: FoundingReview,
  origin: string,
  mail: MailQueue,
) {
  return asBillingOperator(db, actor, true, async (tx) => {
    await lockFounding(tx);
    const application = await tx.foundingApplication.findUnique({
      where: { id: input.applicationId },
    });
    if (!application) throw new AppError("UNAVAILABLE", 404);
    const [clock] = await tx.$queryRaw<
      Array<{ now: Date }>
    >`SELECT now() AS now`;
    const { now } = clock;
    const profile = application.profile as FoundingProfile | null;
    const where = { id: application.id };
    const event = (details = {}, workspaceId: string | null = null) =>
      billingAudit(
        tx,
        actor,
        "founding_" + input.action,
        application.id,
        details,
        workspaceId,
      );

    if (input.action === "approve") {
      if (
        !["pending", "rejected", "expired", "approved"].includes(
          application.status,
        )
      )
        throw new AppError("CONFLICT", 409);
      await requireFoundingCapacity(tx, input.profile, now, application.id);
      const overrides = cleanOverrides(input.overrides);
      const ceiling = resolveFoundingLimits(input.profile);
      if (quotaNames.some((key) => (overrides[key] ?? 0) > ceiling[key]))
        throw new AppError("INVALID_INPUT");
      await tx.foundingApplication.update({
        where,
        data: {
          profile: input.profile,
          overrides,
          status: "approved",
          note: input.note ?? application.note,
          tokenHash: null,
          tokenExpiresAt: new Date(now.getTime() + 72 * hours),
          updatedAt: now,
        },
      });
      await event({ profile: input.profile, overrides });
      return { ok: true };
    }
    if (input.action === "invite" || input.action === "resend") {
      if (
        !profile ||
        (input.action === "invite"
          ? application.status !== "approved"
          : !["invited", "expired"].includes(application.status))
      ) {
        throw new AppError("CONFLICT", 409);
      }
      if (
        input.send &&
        (!mail.deliveryEnabled ||
          process.env.ATLAS_FOUNDING_MAIL_ENABLED !== "1")
      )
        throw new AppError("MAIL_DISABLED", 503);
      await requireFoundingCapacity(tx, profile, now, application.id);
      const token = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const tokenExpiresAt = new Date(now.getTime() + 72 * hours);
      const link = origin + "/early-access/accept#token=" + token;
      const queueId = input.send ? randomUUID() : null;
      await tx.foundingApplication.update({
        where,
        data: {
          status: "invited",
          tokenHash,
          tokenExpiresAt,
          queueId,
          updatedAt: now,
        },
      });
      if (queueId) {
        const payload = mail.encrypt({
          to: application.email,
          subject: "Atlas Research Founding Access",
          text: `You have been invited to 90 days of Atlas Research early access. Sign in with this email and redeem this link within 72 hours. No card is required.\n${link}`,
          foundingAuthorization: {
            actorId: actor.id,
            sessionId: actor.sessionId,
            applicationId: application.id,
            tokenHash,
          },
        });
        await tx.$executeRaw`INSERT INTO ops.mail_outbox(id,payload,"expiresAt") VALUES (${queueId}::uuid,${payload},${tokenExpiresAt})`;
      }
      await event({
        mailQueued: Boolean(queueId),
        expiresAt: tokenExpiresAt.toISOString(),
      });
      return {
        ok: true,
        expiresAt: tokenExpiresAt,
        ...(queueId ? { queued: true } : { link }),
      };
    }
    if (
      input.action === "extend" ||
      (input.action === "revoke" && application.status === "activated")
    ) {
      const grant = await tx.foundingGrant.findUnique({
        where: { applicationId: application.id },
      });
      if (
        !grant ||
        grant.revokedAt ||
        (input.action === "extend" && grant.endsAt <= now)
      )
        throw new AppError("CONFLICT", 409);
      await lockUsage(tx, grant.workspaceId);
      if (input.action === "extend") {
        const extensionDays = grant.extensionDays + input.days;
        if (extensionDays > FOUNDING_EXTENSION_MAX_DAYS)
          throw new AppError("INVALID_INPUT");
        const endsAt = new Date(
          grant.endsAt.getTime() + input.days * 24 * hours,
        );
        await tx.foundingGrant.update({
          where: { workspaceId: grant.workspaceId },
          data: { endsAt, extensionDays },
        });
        await event(
          { days: input.days, reason: input.note },
          grant.workspaceId,
        );
        return { ok: true };
      }
      await tx.foundingGrant.update({
        where: { workspaceId: grant.workspaceId },
        data: { revokedAt: now },
      });
      await tx.foundingApplication.update({
        where,
        data: { status: "revoked", note: input.note, updatedAt: now },
      });
      await event({ reason: input.note }, grant.workspaceId);
      return { ok: true };
    }
    if (
      input.action === "note" ||
      input.action === "reject" ||
      input.action === "revoke" ||
      input.action === "expire"
    ) {
      if (application.status === "activated" && input.action !== "note")
        throw new AppError("CONFLICT", 409);
      const status =
        input.action === "reject"
          ? "rejected"
          : input.action === "revoke"
            ? "revoked"
            : "expired";
      await tx.foundingApplication.update({
        where,
        data: {
          ...(input.action !== "note"
            ? { status, tokenHash: null, tokenExpiresAt: null }
            : {}),
          note: input.note,
          updatedAt: now,
        },
      });
      await event({ reason: input.note });
      return { ok: true };
    }
    throw new AppError("INVALID_INPUT");
  });
}

export async function foundingOverview(tx: Tx, now = new Date()) {
  const profileOccupancy = await Promise.all(
    profileNames.map(async (profile) => ({
      profile,
      ...(await occupancy(tx, profile, now)),
    })),
  );
  const applications = await tx.foundingApplication.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      email: true,
      institution: true,
      researchArea: true,
      applicantType: true,
      teamSize: true,
      tools: true,
      motivation: true,
      status: true,
      note: true,
      profile: true,
      tokenExpiresAt: true,
      createdAt: true,
    },
  });
  const grants = await tx.foundingGrant.findMany({
    orderBy: { startedAt: "desc" },
    take: 100,
    select: {
      workspaceId: true,
      applicationId: true,
      profile: true,
      seats: true,
      startedAt: true,
      endsAt: true,
      extensionDays: true,
      revokedAt: true,
    },
  });
  return {
    profileOccupancy,
    applications,
    grants,
    intakeEnabled: foundingIntakeEnabled(),
    mailEnabled: process.env.ATLAS_FOUNDING_MAIL_ENABLED === "1",
  };
}
