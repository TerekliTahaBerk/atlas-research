import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
import type { Tx } from "../domain/access";
import { AppError } from "../errors";
import { lockUsage, resolveWorkspaceEntitlement } from "./entitlements";

const resourceLimit = {
  aiCredits: "monthlyAiCredits",
  pythonMilliseconds: "monthlyPythonMilliseconds",
  latexCompiles: "monthlyLatexCompiles",
  automations: "automations",
} as const;
type Resource = keyof typeof resourceLimit;
type Metered = {
  workspaceId: string;
  actorId: string;
  resource: Resource;
  operationId: string;
  quantity: number;
};
type Allocation = { grantId: string | null; quantity: number };

const capacity = (row: {
  status: string;
  requested: bigint;
  charged: bigint;
}) =>
  row.status === "held"
    ? Number(row.requested)
    : row.status === "settled"
      ? Number(row.charged)
      : 0;

function allocationsFor(raw: Prisma.JsonValue, quantity: number): Allocation[] {
  if (!Array.isArray(raw) || raw.length === 0)
    throw new Error("Missing resource allocation");
  const slices = raw as unknown as Allocation[];
  let left = quantity;
  return slices.map((slice) => {
    if (!Number.isSafeInteger(slice.quantity) || slice.quantity <= 0)
      throw new Error("Invalid resource allocation");
    const applied = Math.min(left, slice.quantity);
    left -= applied;
    return { grantId: slice.grantId, quantity: applied };
  });
}

function limit(resource: Resource): never {
  throw new AppError(
    resource === "aiCredits" ? "AI_LIMITED" : "RESOURCE_QUOTA",
    429,
  );
}

function key(input: Metered) {
  return {
    workspaceId_operationId_resource: {
      workspaceId: input.workspaceId,
      operationId: input.operationId,
      resource: input.resource,
    },
  };
}

export async function reserveResource(tx: Tx, input: Metered) {
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1)
    throw new AppError("INVALID_INPUT");
  const { workspaceId, actorId, operationId, resource, quantity } = input;
  await lockUsage(tx, workspaceId);
  const prior = await tx.billingUsageReservation.findUnique({
    where: key(input),
  });
  if (prior) {
    if (prior.actorId !== actorId || prior.requested !== BigInt(quantity))
      throw new AppError("CONFLICT", 409);
    return { quantity, remaining: 0 };
  }

  const entitlement = await resolveWorkspaceEntitlement(tx, workspaceId);
  const { periodStart, periodEnd, limits } = entitlement;
  const [clock] = await tx.$queryRaw<
    Array<{ now: Date; dayStart: Date }>
  >`SELECT now() AS now,date_trunc('day',now(),'UTC') AS "dayStart"`;
  const grants =
    resource === "aiCredits" || resource === "pythonMilliseconds"
      ? await tx.billingResourceGrant.findMany({
          where: {
            workspaceId,
            resource,
            revokedAt: null,
            validFrom: { lte: clock.now },
            expiresAt: { gt: clock.now },
          },
          orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
        })
      : [];
  // A top-up can span billing periods. Only receipts at or after that lot's purchase can consume it.
  const oldest = grants.reduce(
    (date, grant) => (grant.validFrom < date ? grant.validFrom : date),
    periodStart,
  );
  const existing = await tx.billingUsageReservation.findMany({
    where: {
      workspaceId,
      resource,
      OR: [{ periodStart }, { createdAt: { gte: oldest } }],
    },
    select: {
      status: true,
      requested: true,
      charged: true,
      allocations: true,
      periodStart: true,
      actorId: true,
      createdAt: true,
    },
  });
  let usedIncluded = 0,
    usedByActor = 0,
    today = 0;
  const usedByGrant = new Map<string, number>();
  for (const receipt of existing) {
    const samePeriod = receipt.periodStart.getTime() === periodStart.getTime();
    const used = capacity(receipt);
    if (receipt.actorId === actorId) {
      if (receipt.createdAt >= clock.dayStart) today++;
      if (samePeriod) usedByActor += used;
    }
    if (!used) continue;
    for (const slice of allocationsFor(receipt.allocations, used)) {
      if (slice.grantId !== null)
        usedByGrant.set(
          slice.grantId,
          (usedByGrant.get(slice.grantId) ?? 0) + slice.quantity,
        );
      else if (samePeriod) usedIncluded += slice.quantity;
    }
  }
  const included = limits[resourceLimit[resource]];
  if (resource === "aiCredits") {
    if (today >= limits.dailyAiOperationsPerMember) limit(resource);
    if (entitlement.planCode === "TEAM") {
      const pool =
        included +
        grants.reduce((total, grant) => total + Number(grant.quantity), 0);
      if (
        usedByActor + quantity >
        Math.floor((pool * entitlement.memberAiPercent) / 100)
      )
        limit(resource);
    }
  }
  if (resource === "pythonMilliseconds") {
    if (quantity > limits.maxPythonRunMilliseconds) limit(resource);
    const concurrency = entitlement.planCode === "TEAM" ? 2 : 1;
    const running = await tx.billingUsageReservation.count({
      where: { workspaceId, resource, status: "held" },
    });
    if (running >= concurrency) limit(resource);
  }

  let remaining = quantity;
  const allocations: Allocation[] = [];
  function allocate(grantId: string | null, available: number) {
    const applied = Math.min(remaining, Math.max(0, available));
    if (applied > 0) allocations.push({ grantId, quantity: applied });
    remaining -= applied;
  }
  const availableIncluded = Math.max(0, included - usedIncluded);
  allocate(null, availableIncluded);
  for (const grant of grants)
    allocate(
      grant.id,
      Number(grant.quantity) - (usedByGrant.get(grant.id) ?? 0),
    );
  if (remaining > 0) limit(resource);

  await tx.billingUsageReservation.create({
    data: {
      workspaceId,
      operationId,
      resource,
      actorId,
      requested: BigInt(quantity),
      allocations,
      periodStart,
      periodEnd,
    },
  });
  await tx.billingUsageEntry.create({
    data: {
      id: randomUUID(),
      workspaceId,
      operationId,
      resource,
      actorId,
      action: "reserve",
      quantity: BigInt(quantity),
    },
  });
  const purchased = grants.reduce(
    (total, grant) =>
      total +
      Math.max(0, Number(grant.quantity) - (usedByGrant.get(grant.id) ?? 0)),
    0,
  );
  return { quantity, remaining: availableIncluded + purchased - quantity };
}

export async function settleResource(
  tx: Tx,
  input: Metered & { outcome: "settle" | "release" },
) {
  const { workspaceId, operationId, resource, actorId, quantity, outcome } =
    input;
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 0 ||
    (outcome === "release" && quantity !== 0)
  )
    throw new AppError("INVALID_INPUT");
  await lockUsage(tx, workspaceId);
  const prior = await tx.billingUsageReservation.findUnique({
    where: key(input),
  });
  if (!prior || prior.actorId !== actorId)
    throw new AppError("UNAVAILABLE", 404);
  const status = outcome === "settle" ? "settled" : "released";
  if (prior.status === status && prior.charged === BigInt(quantity)) return;
  if (prior.status !== "held" || BigInt(quantity) > prior.requested)
    throw new AppError("CONFLICT", 409);
  await tx.billingUsageReservation.update({
    where: key(input),
    data: { charged: BigInt(quantity), status, closedAt: new Date() },
  });
  await tx.billingUsageEntry.create({
    data: {
      id: randomUUID(),
      workspaceId,
      operationId,
      resource,
      actorId,
      action: outcome,
      quantity: outcome === "release" ? prior.requested : BigInt(quantity),
    },
  });
}

export async function walletUsage(
  tx: Tx,
  workspaceId: string,
  periodStart: Date,
  now: Date,
) {
  const grants = await tx.billingResourceGrant.findMany({
    where: {
      workspaceId,
      resource: { in: ["aiCredits", "pythonMilliseconds"] },
      revokedAt: null,
      validFrom: { lte: now },
      expiresAt: { gt: now },
    },
    select: {
      id: true,
      validFrom: true,
      expiresAt: true,
      quantity: true,
      resource: true,
    },
  });
  const start = grants.reduce(
    (date, grant) => (grant.validFrom < date ? grant.validFrom : date),
    periodStart,
  );
  const receipts = await tx.billingUsageReservation.findMany({
    where: {
      workspaceId,
      status: { in: ["held", "settled"] },
      OR: [{ periodStart }, { createdAt: { gte: start } }],
    },
    select: {
      status: true,
      requested: true,
      charged: true,
      allocations: true,
      periodStart: true,
      resource: true,
    },
  });
  const included = {
    monthlyAiCredits: 0,
    monthlyPythonMilliseconds: 0,
    monthlyLatexCompiles: 0,
    automations: 0,
  };
  const remaining = new Map(
    grants.map((grant) => [grant.id, Number(grant.quantity)]),
  );
  for (const receipt of receipts) {
    for (const slice of allocationsFor(
      receipt.allocations,
      capacity(receipt),
    )) {
      if (slice.grantId && remaining.has(slice.grantId))
        remaining.set(
          slice.grantId,
          remaining.get(slice.grantId)! - slice.quantity,
        );
      else if (
        slice.grantId === null &&
        receipt.periodStart.getTime() === periodStart.getTime() &&
        receipt.resource in resourceLimit
      ) {
        const field = resourceLimit[receipt.resource as Resource];
        included[field] += slice.quantity;
      }
    }
  }
  return {
    included,
    topUps: grants.map((grant) => ({
      resource: grant.resource,
      remaining: Math.max(0, remaining.get(grant.id) ?? 0),
      expiresAt: grant.expiresAt,
    })),
  };
}
