import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import type { Identity } from "../auth/identity";
import type { Database } from "../db/client";
import { AppError } from "../errors";
import type { Tx } from "../domain/access";
import { eligibleStudent } from "./academic";
import {
  ADD_ONS,
  PLAN_VERSION,
  PLANS,
  priceFor,
  type AddOnCode,
  type PlanCode,
} from "./catalog";
import { lockUsage, resolveWorkspaceEntitlement } from "./entitlements";
import { asBillingOperator, billingAudit } from "./operations";

const common = {
  eventId: z.string().regex(/^[\w-]{1,120}$/),
  workspaceId: z.uuid(),
  currency: z.literal("USD"),
};
const addonNames = Object.keys(ADD_ONS) as AddOnCode[];
const providerReference = z.string().regex(/^[\w-]{1,120}$/);
const date = z.iso.datetime();
const eventShape = z.discriminatedUnion("kind", [
  z
    .object({
      ...common,
      kind: z.literal("subscription"),
      providerId: providerReference,
      revision: z.number().int().positive(),
      planCode: z.enum(["PLUS", "PRO", "TEAM", "PLUS_STUDENT", "PRO_STUDENT"]),
      interval: z.enum(["month", "year"]),
      status: z.enum([
        "active",
        "trialing",
        "past_due",
        "cancelled",
        "incomplete",
      ]),
      seats: z.number().int().min(1).max(100),
      amountMinor: z.number().int().nonnegative(),
      periodStart: date,
      periodEnd: date,
      cancelAtPeriodEnd: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal("purchase"),
      purchaseId: providerReference,
      addon: z.enum(addonNames),
      quantity: z.number().int().min(1).max(100),
      amountMinor: z.number().int().nonnegative(),
      validFrom: date,
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal("refund"),
      purchaseId: providerReference,
    })
    .strict(),
]);
type SandboxEvent = z.output<typeof eventShape>;

export function verifySandboxSignature(
  raw: Buffer,
  signature: string | null,
  secret: string,
  now = Date.now(),
) {
  const match = /^t=(\d{10}),v1=([a-f0-9]{64})$/.exec(signature ?? "");
  if (
    !match ||
    secret.length < 32 ||
    Math.abs(now - Number(match[1]) * 1000) > 300_000
  ) {
    throw new AppError("UNAVAILABLE", 404);
  }
  const expected = createHmac("sha256", secret)
    .update(match[1] + ".")
    .update(raw)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(match[2], "hex")))
    throw new AppError("UNAVAILABLE", 404);
  let body: unknown;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new AppError("INVALID_INPUT");
  }
  const parsed = eventShape.safeParse(body);
  if (!parsed.success) throw new AppError("INVALID_INPUT");
  return {
    event: parsed.data,
    digest: createHash("sha256").update(raw).digest("hex"),
  };
}

async function applySubscription(
  tx: Tx,
  event: Extract<SandboxEvent, { kind: "subscription" }>,
) {
  const existing = await tx.billingSubscription.findUnique({
    where: { workspaceId: event.workspaceId },
  });
  if (
    existing &&
    (existing.provider !== "sandbox" ||
      existing.providerId !== event.providerId)
  )
    throw new AppError("CONFLICT", 409);
  if (existing && existing.revision >= event.revision) return "stale";
  if (
    (event.planCode === "TEAM" && event.seats < 3) ||
    (event.planCode !== "TEAM" && event.seats !== 1)
  )
    throw new AppError("INVALID_INPUT");
  const [scope] = await tx.$queryRaw<
    Array<{ kind: string | null }>
  >`SELECT app.billing_workspace_kind(${event.workspaceId}::uuid) AS kind`;
  if (scope?.kind !== PLANS[event.planCode].scope)
    throw new AppError("INVALID_INPUT");
  const price = priceFor(
    event.planCode,
    event.interval === "month" ? "monthly" : "yearly",
    event.seats,
  );
  if (price === null || price !== event.amountMinor)
    throw new AppError("INVALID_INPUT");
  if (
    PLANS[event.planCode].student &&
    ["active", "trialing"].includes(event.status) &&
    !(
      existing?.status === "active" &&
      existing.planCode === event.planCode &&
      existing.periodEnd.toISOString() ===
        new Date(event.periodEnd).toISOString()
    )
  ) {
    const [row] = await tx.$queryRaw<
      Array<{ owner: string | null }>
    >`SELECT app.academic_owner(${event.workspaceId}::uuid) AS owner`;
    if (!row?.owner || !(await eligibleStudent(tx, row.owner)))
      throw new AppError("ACADEMIC_UNAVAILABLE", 409);
  }
  const periodStart = new Date(event.periodStart);
  const periodEnd = new Date(event.periodEnd);
  const days = (periodEnd.getTime() - periodStart.getTime()) / 86_400_000;
  if (days <= 0 || days > (event.interval === "month" ? 32 : 367))
    throw new AppError("INVALID_INPUT");
  if (event.status === "incomplete" || event.status === "past_due") {
    // A failed renewal does not revoke already paid time or extend it.
    if (
      existing &&
      ["active", "trialing", "past_due", "cancelled"].includes(
        existing.status,
      ) &&
      existing.periodEnd > new Date()
    ) {
      await tx.billingSubscription.update({
        where: { workspaceId: event.workspaceId },
        data: {
          status: "past_due",
          revision: event.revision,
          updatedAt: new Date(),
        },
      });
      return "payment_failed";
    }
    // An unfinished initial payment provides no paid entitlement.
    if (event.status === "past_due") return "payment_failed";
  }
  const data = {
    provider: "sandbox",
    providerId: event.providerId,
    planCode: event.planCode,
    planVersion: PLAN_VERSION,
    currency: "USD",
    status: event.status,
    interval: event.interval,
    seats: event.seats,
    revision: event.revision,
    unitAmountMinor: event.amountMinor / event.seats,
    periodStart,
    periodEnd,
    cancelAtPeriodEnd: event.cancelAtPeriodEnd,
    updatedAt: new Date(),
  };
  await tx.billingSubscription.upsert({
    where: { workspaceId: event.workspaceId },
    create: { workspaceId: event.workspaceId, ...data },
    update: data,
  });
  return "applied";
}

const addonResources = {
  monthlyAiCredits: "aiCredits",
  storageBytes: "storageBytes",
  monthlyPythonMilliseconds: "pythonMilliseconds",
  seats: "teamSeats",
} as const;
async function applyAddOn(
  tx: Tx,
  event: Extract<SandboxEvent, { kind: "purchase" | "refund" }>,
) {
  const sourceKey = "sandbox:" + event.purchaseId;
  const existing = await tx.billingResourceGrant.findUnique({
    where: { sourceKey },
  });
  if (existing && existing.workspaceId !== event.workspaceId)
    throw new AppError("CONFLICT", 409);
  if (event.kind === "refund") {
    if (!existing) throw new AppError("CONFLICT", 409);
    if (existing.revokedAt) return "stale";
    await tx.billingResourceGrant.update({
      where: { sourceKey },
      data: { revokedAt: new Date() },
    });
    return "applied";
  }
  const addon = ADD_ONS[event.addon];
  if (event.amountMinor !== addon.cents * event.quantity)
    throw new AppError("INVALID_INPUT");
  const resource = addonResources[addon.resource],
    quantity = BigInt(addon.quantity * event.quantity);
  const validFrom = new Date(event.validFrom);
  if (existing) {
    if (
      existing.resource === resource &&
      existing.quantity === quantity &&
      existing.validFrom.getTime() === validFrom.getTime()
    )
      return "stale";
    throw new AppError("CONFLICT", 409);
  }
  const e = await resolveWorkspaceEntitlement(tx, event.workspaceId);
  if (
    e.source !== "subscription" ||
    !(addon.compatiblePlans as readonly PlanCode[]).includes(e.planCode)
  )
    throw new AppError("INVALID_INPUT");
  const expiresAt =
    addon.validMonths === null
      ? new Date(
          Math.min(e.endsAt!.getTime(), validFrom.getTime() + 32 * 86_400_000),
        )
      : new Date(validFrom);
  if (addon.validMonths !== null) {
    const purchaseDay = expiresAt.getUTCDate();
    expiresAt.setUTCDate(1);
    expiresAt.setUTCMonth(expiresAt.getUTCMonth() + addon.validMonths);
    const days = new Date(
      Date.UTC(expiresAt.getUTCFullYear(), expiresAt.getUTCMonth() + 1, 0),
    ).getUTCDate();
    expiresAt.setUTCDate(Math.min(purchaseDay, days));
  }
  if (expiresAt <= validFrom) throw new AppError("INVALID_INPUT");
  await tx.billingResourceGrant.create({
    data: {
      id: randomUUID(),
      sourceKey,
      workspaceId: event.workspaceId,
      resource,
      quantity,
      validFrom,
      expiresAt,
    },
  });
  return "applied";
}

export function processSandboxEvent(
  db: Database,
  actor: Identity,
  raw: Buffer,
  signature: string | null,
  secret: string,
) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ATLAS_BILLING_SANDBOX_ENABLED !== "1"
  )
    throw new AppError("BILLING_DISABLED", 503);
  const { event, digest } = verifySandboxSignature(raw, signature, secret);
  return asBillingOperator(db, actor, true, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('atlas.billing-event:'||${event.eventId},0))`;
    await lockUsage(tx, event.workspaceId);
    const where = {
      provider_eventId: { provider: "sandbox", eventId: event.eventId },
    };
    const old = await tx.billingEvent.findUnique({ where });
    if (old) {
      if (old.digest !== digest) throw new AppError("CONFLICT", 409);
      return { result: old.result, duplicate: true };
    }
    const result =
      event.kind === "subscription"
        ? await applySubscription(tx, event)
        : await applyAddOn(tx, event);
    await tx.billingEvent.create({
      data: {
        provider: "sandbox",
        eventId: event.eventId,
        digest,
        workspaceId: event.workspaceId,
        kind: event.kind,
        result,
      },
    });
    await billingAudit(
      tx,
      actor,
      "sandbox_billing_" + event.kind,
      event.eventId,
      { result },
      event.workspaceId,
    );
    return { result, duplicate: false };
  });
}
