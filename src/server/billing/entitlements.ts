import type { Tx } from "../domain/access";
import { AppError } from "../errors";
import { resolveBillingDescriptor, type BillingDescriptor } from "./descriptor";

export async function lockUsage(tx: Tx, workspaceId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('atlas.usage:'||${workspaceId}::uuid::text,0))`;
}

export async function resolveWorkspaceEntitlement(tx: Tx, workspaceId: string) {
  const [row] = await tx.$queryRaw<
    Array<{ descriptor: BillingDescriptor | null; measuredAt: Date }>
  >`
    SELECT app.billing_descriptor(${workspaceId}::uuid) AS descriptor, now() AS "measuredAt"`;
  if (!row?.descriptor) throw new AppError("UNAVAILABLE", 404);
  return resolveBillingDescriptor(row.descriptor, row.measuredAt);
}

export const resourceLimitsEnabled = () =>
  process.env.ATLAS_RESOURCE_LIMITS_ENABLED === "1";
