import type { Identity } from "../auth/identity";
import type { Database } from "../db/client";
import { asIdentity } from "../db/transaction";
import { audit, requireRole, workspaceLock } from "../domain/access";
import { AppError } from "../errors";
import { getWorkspaceResourceUsage } from "../research/resource-usage";
import {
  FOUNDING_FEEDBACK_DAY,
  FOUNDING_FIRST_YEAR_DISCOUNT_PERCENT,
  FOUNDING_OFFER_DAY,
} from "./catalog";
import { emptyUsage } from "./descriptor";
import { foundingIntakeEnabled } from "./founding";
import {
  resourceLimitsEnabled,
  resolveWorkspaceEntitlement,
} from "./entitlements";
import { walletUsage } from "./ledger";

export function readWorkspaceUsage(db: Database, actor: Identity, w: string) {
  return asIdentity(db, actor, async (tx) => {
    const scope = await workspaceLock(tx, actor, w);
    const e = await resolveWorkspaceEntitlement(tx, w);
    const canManage = ["owner", "admin"].includes(scope.role);
    const now = new Date();
    const [{ count }] = await tx.$queryRaw<
      Array<{ count: number }>
    >`SELECT app.workspace_editing_seats(${w}::uuid) AS count`;
    const resources = await getWorkspaceResourceUsage(
      tx,
      w,
      e.periodStart,
      e.periodEnd,
    );
    const wallet = await walletUsage(tx, w, e.periodStart, now);
    const receipts = await tx.billingUsageEntry.findMany({
      where: {
        workspaceId: w,
        action: "settle",
        ...(canManage ? {} : { actorId: actor.id }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
      select: { resource: true, quantity: true, createdAt: true },
    });
    const subscription = await tx.billingSubscription.findUnique({
      where: { workspaceId: w },
      select: {
        status: true,
        planCode: true,
        periodEnd: true,
        cancelAtPeriodEnd: true,
      },
    });
    const daily = await tx.billingUsageReservation.count({
      where: {
        workspaceId: w,
        actorId: actor.id,
        resource: "aiCredits",
        createdAt: {
          gte: new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
          ),
        },
      },
    });
    const foundingDaysElapsed =
      e.foundingProfile && e.startsAt
        ? (now.getTime() - e.startsAt.getTime()) / 86_400_000
        : null;
    const { activeProjects, storageBytes, monthlyUploads, indexedBytes } =
      resources;
    return {
      planCode: e.planCode,
      planVersion: e.planVersion,
      source: e.source,
      endsAt: e.endsAt,
      periodStart: e.periodStart,
      periodEnd: e.periodEnd,
      limits: e.limits,
      seats: e.seats,
      memberAiPercent: e.memberAiPercent,
      foundingProfile: e.foundingProfile,
      foundingDaysRemaining:
        e.foundingProfile && e.endsAt
          ? Math.ceil((e.endsAt.getTime() - now.getTime()) / 86400_000)
          : null,
      foundingMilestones:
        foundingDaysElapsed === null
          ? null
          : {
              feedbackDue: foundingDaysElapsed >= FOUNDING_FEEDBACK_DAY,
              offerEligible: foundingDaysElapsed >= FOUNDING_OFFER_DAY,
              firstYearDiscountPercent: FOUNDING_FIRST_YEAR_DISCOUNT_PERCENT,
            },
      seatUsage: count,
      canManage,
      enforced: resourceLimitsEnabled(),
      subscription,
      topUps: wallet.topUps,
      usage: {
        ...emptyUsage,
        ...wallet.included,
        activeProjects,
        storageBytes,
        monthlyUploads,
        indexedBytes,
        dailyAiOperationsPerMember: daily,
      },
      history: receipts.map((entry) => ({
        ...entry,
        quantity: Number(entry.quantity),
      })),
      capabilities: {
        checkout: false,
        pythonExecution: false,
        latexCompilation: false,
        automationExecution: false,
        indexing: true,
        foundingIntake: foundingIntakeEnabled(),
      },
    };
  });
}
export function changeMemberAiCap(
  db: Database,
  actor: Identity,
  workspaceId: string,
  percent: number,
) {
  return asIdentity(db, actor, async (tx) => {
    const { role } = await workspaceLock(tx, actor, workspaceId);
    requireRole(role, ["owner", "admin"]);
    const [result] = await tx.$queryRaw<
      Array<{ ok: boolean }>
    >`SELECT app.set_billing_ai_percent(${workspaceId}::uuid,${percent}::int) AS ok`;
    if (!result?.ok) throw new AppError("UNAVAILABLE", 404);
    await audit(
      tx,
      actor,
      workspaceId,
      null,
      "member_ai_cap_changed",
      String(percent),
    );
    return { memberAiPercent: percent };
  });
}
