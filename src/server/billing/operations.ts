import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
import type { Identity } from "../auth/identity";
import type { Database } from "../db/client";
import { asIdentity } from "../db/transaction";
import { fresh, type Tx } from "../domain/access";
import { AppError } from "../errors";

export async function requireBillingOperator(
  tx: Tx,
  actor: Identity,
  mutation = false,
) {
  const [result] = await tx.$queryRaw<
    Array<{ allowed: boolean }>
  >`SELECT app.billing_operator() AS allowed`;
  if (!result?.allowed) throw new AppError("UNAVAILABLE", 404);
  if (mutation) fresh(actor);
}
export function asBillingOperator<T>(
  db: Database,
  actor: Identity,
  mutation: boolean,
  action: (tx: Tx) => Promise<T>,
) {
  return asIdentity(db, actor, async (tx) => {
    await requireBillingOperator(tx, actor, mutation);
    return action(tx);
  });
}
export async function billingAudit(
  tx: Tx,
  actor: Identity,
  kind: string,
  targetId: string,
  details: Prisma.InputJsonObject = {},
  workspaceId: string | null = null,
) {
  await tx.billingAudit.create({
    data: {
      id: randomUUID(),
      actorId: actor.id,
      kind,
      targetId,
      details,
      workspaceId,
    },
  });
}
