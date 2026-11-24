import {
  lockUsage,
  resolveWorkspaceEntitlement,
} from "../billing/entitlements";
import type { Tx } from "../domain/access";
import { AppError } from "../errors";

export type WorkspaceResourceUsage = {
  activeProjects: number;
  storageBytes: number;
  monthlyUploads: number;
  indexedBytes: number;
  storageReservedBytes: number;
  monthlyUploadReservations: number;
  indexReservedBytes: number;
};

export async function getWorkspaceResourceUsage(
  tx: Tx,
  w: string,
  start: Date,
  end: Date,
) {
  const [row] = await tx.$queryRaw<
    Array<{ usage: WorkspaceResourceUsage | null }>
  >`
    SELECT app.workspace_resource_usage(${w}::uuid,${start.toISOString()}::timestamptz,${end.toISOString()}::timestamptz) AS usage
  `;
  if (!row?.usage) throw new AppError("UNAVAILABLE", 404);
  return row.usage;
}

export async function lockedWorkspaceUsage(tx: Tx, w: string) {
  await lockUsage(tx, w);
  const entitlement = await resolveWorkspaceEntitlement(tx, w);
  const usage = await getWorkspaceResourceUsage(
    tx,
    w,
    entitlement.periodStart,
    entitlement.periodEnd,
  );
  return { limits: entitlement.limits, usage };
}
