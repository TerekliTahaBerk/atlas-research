import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Identity } from "../auth/identity";
import type { Database } from "../db/client";
import type { AiCostReport } from "../../lib/ai-types";
import { AppError } from "../errors";
import { PLAN_VERSION, PLANS, resolveFoundingLimits } from "./catalog";
import { quotaNames } from "./descriptor";
import { lockUsage, resolveWorkspaceEntitlement } from "./entitlements";
import { foundingOverview } from "./founding";
import { asBillingOperator, billingAudit } from "./operations";

const overrides = z.partialRecord(
  z.enum(quotaNames),
  z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
);
const workspaceId = z.uuid();
const reason = z.string().trim().min(6).max(500);
export const operatorAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("quota"),
      workspaceId,
      limits: overrides,
      reason,
    })
    .strict(),
  z
    .object({
      action: z.literal("credit"),
      workspaceId,
      quantity: z.number().int().min(1).max(10_000),
      validityDays: z.number().int().min(1).max(365),
      requestId: z.uuid(),
      reason,
    })
    .strict(),
  z
    .object({
      action: z.literal("contract"),
      workspaceId,
      seats: z.number().int().min(1).max(10_000),
      unitAmountMinor: z.number().int().min(0).max(2_000_000_000),
      periodEnd: z.iso.datetime(),
      limits: overrides,
      reason,
    })
    .strict(),
]);

export function readAdminResources(db: Database, actor: Identity) {
  return asBillingOperator(db, actor, false, async (tx) => {
    const [stats] = await tx.$queryRaw<
      Array<{
        workspaces: Record<string, number>;
        costs: AiCostReport | null;
        academic: unknown;
        storage: {
          storageBytes: number;
          indexedBytes: number;
          pendingIndexJobs: number;
          runningIndexJobs: number;
          failedIndexJobs: number;
        };
      }>
    >`SELECT app.billing_workspace_distribution() AS workspaces, app.billing_ai_cost_report() AS costs,
      app.billing_academic_queue() AS academic, app.billing_resource_totals() AS storage`;
    const subscriptions = await tx.billingSubscription.findMany({
      take: 80,
      orderBy: { updatedAt: "desc" },
      select: {
        workspaceId: true,
        planCode: true,
        status: true,
        seats: true,
        periodEnd: true,
        provider: true,
        currency: true,
      },
    });
    const institutions = await tx.academicInstitution.findMany({
      take: 100,
      orderBy: { domain: "asc" },
    });
    const auditEvents = await tx.billingAudit.findMany({
      take: 80,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        actorId: true,
        workspaceId: true,
        targetId: true,
        kind: true,
        createdAt: true,
      },
    });
    return {
      ...stats,
      subscriptions,
      institutions,
      auditEvents,
      founding: await foundingOverview(tx),
      planVersion: PLAN_VERSION,
      plans: PLANS,
    };
  });
}

export function adjustAdminResources(
  db: Database,
  actor: Identity,
  input: z.output<typeof operatorAction>,
) {
  return asBillingOperator(db, actor, true, async (tx) => {
    const w = input.workspaceId;
    await lockUsage(tx, w);
    const [{ kind }] = await tx.$queryRaw<
      Array<{ kind: string | null }>
    >`SELECT app.billing_workspace_kind(${w}::uuid) AS kind`;
    if (!kind) throw new AppError("UNAVAILABLE", 404);
    if (input.action === "credit") {
      const sourceKey = "operator:" + input.requestId;
      const prior = await tx.billingResourceGrant.findUnique({
        where: { sourceKey },
      });
      if (prior) {
        if (
          prior.workspaceId !== w ||
          prior.quantity !== BigInt(input.quantity)
        )
          throw new AppError("CONFLICT", 409);
        return { ok: true };
      }
      const validFrom = new Date(),
        expiresAt = new Date(
          validFrom.getTime() + input.validityDays * 86_400_000,
        );
      await tx.billingResourceGrant.create({
        data: {
          id: randomUUID(),
          workspaceId: w,
          sourceKey,
          resource: "aiCredits",
          quantity: BigInt(input.quantity),
          validFrom,
          expiresAt,
        },
      });
      await billingAudit(
        tx,
        actor,
        "operator_ai_credit",
        sourceKey,
        { quantity: input.quantity, reason: input.reason },
        w,
      );
      return { ok: true };
    }
    if (input.action === "contract") {
      const previous = await tx.billingSubscription.findUnique({
        where: { workspaceId: w },
      });
      if (kind !== "shared" || (previous && previous.provider !== "manual"))
        throw new AppError("CONFLICT", 409);
      const now = new Date(),
        periodEnd = new Date(input.periodEnd);
      if (
        periodEnd <= now ||
        !quotaNames.every((key) => Object.hasOwn(input.limits, key))
      )
        throw new AppError("INVALID_INPUT");
      const data = {
        provider: "manual",
        providerId: "manual-" + w,
        currency: "USD",
        planCode: "INSTITUTION",
        planVersion: PLAN_VERSION,
        status: "active",
        interval: "contract",
        seats: input.seats,
        unitAmountMinor: input.unitAmountMinor,
        periodStart: now,
        periodEnd,
        revision: (previous?.revision ?? 0) + 1,
        updatedAt: now,
      };
      await tx.billingSubscription.upsert({
        where: { workspaceId: w },
        create: { workspaceId: w, ...data },
        update: data,
      });
    }
    if (input.action === "quota") {
      const e = await resolveWorkspaceEntitlement(tx, w);
      if (e.foundingProfile) {
        const maximum = resolveFoundingLimits(e.foundingProfile);
        if (quotaNames.some((key) => (input.limits[key] ?? 0) > maximum[key]))
          throw new AppError("INVALID_INPUT");
      }
    }
    await tx.billingWorkspaceSetting.upsert({
      where: { workspaceId: w },
      create: { workspaceId: w, quotaOverrides: input.limits },
      update: { quotaOverrides: input.limits },
    });
    await billingAudit(
      tx,
      actor,
      "operator_" + input.action,
      w,
      { reason: input.reason, limits: input.limits },
      w,
    );
    return { ok: true };
  });
}
