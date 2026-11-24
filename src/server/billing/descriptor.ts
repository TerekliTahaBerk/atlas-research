import {
  FOUNDING_PROFILES,
  PLAN_VERSION,
  PLANS,
  resolveFoundingLimits,
  resolvePlanLimits,
  type FoundingProfile,
  type PlanCode,
  type ResourceLimits,
} from "./catalog.ts";

export type BillingDescriptor = {
  planCode: PlanCode;
  planVersion: string | null;
  foundingProfile: FoundingProfile | null;
  seats: number;
  memberAiPercent: number;
  periodStart: string | null;
  periodEnd: string | null;
  endsAt: string | null;
  source: "free" | "subscription" | "founding";
  billingInterval: "month" | "year" | "contract" | null;
  overrides: Partial<ResourceLimits>;
  addOnStorageBytes: number;
};

const day = 86_400_000;
export const quotaNames = Object.keys(PLANS.FREE.limits!) as Array<
  keyof ResourceLimits
>;
export const emptyUsage: Record<keyof ResourceLimits, number> =
  Object.fromEntries(quotaNames.map((key) => [key, 0])) as Record<
    keyof ResourceLimits,
    number
  >;

function monthBoundary(anchor: Date, months: number) {
  const end = new Date(anchor);
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + months);
  const days = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();
  end.setUTCDate(Math.min(anchor.getUTCDate(), days));
  return end;
}

function quotaPeriod(row: BillingDescriptor, now: Date) {
  if (!row.periodStart || !row.periodEnd) {
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    return { periodStart, periodEnd: monthBoundary(periodStart, 1) };
  }
  const anchor = new Date(row.periodStart);
  const expiresAt = new Date(row.periodEnd);
  if (row.source === "founding") {
    const elapsed = Math.max(
      0,
      Math.floor((now.getTime() - anchor.getTime()) / (30 * day)),
    );
    return {
      periodStart: new Date(anchor.getTime() + elapsed * 30 * day),
      periodEnd: new Date(
        Math.min(
          anchor.getTime() + (elapsed + 1) * 30 * day,
          expiresAt.getTime(),
        ),
      ),
    };
  }
  if (row.billingInterval === "month")
    return { periodStart: anchor, periodEnd: expiresAt };
  const months =
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    now.getUTCMonth() -
    anchor.getUTCMonth();
  const offset = monthBoundary(anchor, months) > now ? months - 1 : months;
  return {
    periodStart: monthBoundary(anchor, Math.max(0, offset)),
    periodEnd: new Date(
      Math.min(
        monthBoundary(anchor, offset + 1).getTime(),
        expiresAt.getTime(),
      ),
    ),
  };
}

export function cleanOverrides(
  input: Partial<ResourceLimits> | undefined,
): Partial<ResourceLimits> {
  const entries = quotaNames.flatMap((key) => {
    const value = input?.[key];
    return typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= 0
      ? [[key, value]]
      : [];
  });
  return Object.fromEntries(entries) as Partial<ResourceLimits>;
}

export function resolveBillingDescriptor(
  row: BillingDescriptor,
  now = new Date(),
) {
  if (
    !(row.planCode in PLANS) ||
    (row.planVersion && row.planVersion !== PLAN_VERSION)
  ) {
    throw new Error("Unknown entitlement catalog version");
  }
  const profile = row.foundingProfile;
  if (profile && !(profile in FOUNDING_PROFILES))
    throw new Error("Unknown founding profile");
  const overrides = cleanOverrides(row.overrides);
  let base: ResourceLimits;
  if (profile) {
    base = resolveFoundingLimits(profile);
  } else if (row.planCode === "INSTITUTION") {
    if (!quotaNames.every((key) => Object.hasOwn(overrides, key)))
      throw new Error("Institution allocation required");
    base = overrides as ResourceLimits;
  } else {
    base = resolvePlanLimits(row.planCode, row.seats);
  }
  const limits = { ...base, ...overrides };
  const storageBytes = limits.storageBytes + row.addOnStorageBytes;
  if (!Number.isSafeInteger(storageBytes) || storageBytes < 0)
    throw new Error("Invalid storage allocation");
  return {
    ...row,
    ...quotaPeriod(row, now),
    limits: { ...limits, storageBytes },
    planVersion: row.planVersion ?? PLAN_VERSION,
    startsAt: row.periodStart ? new Date(row.periodStart) : null,
    endsAt: row.endsAt ? new Date(row.endsAt) : null,
  };
}
