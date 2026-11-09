import type { Prisma } from "../../generated/prisma/client";
import type { Identity } from "../auth/identity";
import type { Database } from "../db/client";
import { asIdentity } from "../db/transaction";
import { AppError } from "../errors";
import { randomUUID } from "node:crypto";

export type Tx = Prisma.TransactionClient;
export type ProjectRole = "owner" | "admin" | "editor" | "viewer";
export const projectRoles = ["owner", "admin", "editor", "viewer"] as const;
export function fresh(identity: Identity) {
  if (Date.now() - identity.sessionCreatedAt.getTime() > 300_000) throw new AppError("REAUTH_REQUIRED", 403);
}
export function requireRole(role: string, allowed: readonly string[]) {
  if (!allowed.includes(role)) throw new AppError("UNAVAILABLE", 404);
}
export function audit(tx: Tx, actor: Identity, workspaceId: string, projectId: string | null, event: string, targetId?: string) {
  return tx.auditEvent.createMany({ data: [{ id: randomUUID(), workspaceId, projectId, actorId: actor.id, event, targetId }] });
}
export async function workspaceLock(tx: Tx, actor: Identity, id: string, exclusive = false) {
  const [row] = await tx.$queryRaw<Array<{ allowed: boolean }>>`SELECT app.lock_workspace(${id}::uuid,${exclusive}) AS allowed`;
  if (!row?.allowed) throw new AppError("UNAVAILABLE", 404);
  const workspace = await tx.workspace.findUniqueOrThrow({ where: { id } });
  const member = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: id, userId: actor.id } } });
  if (!member?.active) throw new AppError("UNAVAILABLE", 404);
  return { workspace, role: member.role };
}
export async function projectLock(tx: Tx, actor: Identity, workspaceId: string, projectId: string, exclusive = false) {
  const parent = await workspaceLock(tx, actor, workspaceId);
  const [row] = await tx.$queryRaw<Array<{ allowed: boolean }>>`SELECT app.lock_project(${workspaceId}::uuid,${projectId}::uuid,${exclusive}) AS allowed`;
  if (!row?.allowed) throw new AppError("UNAVAILABLE", 404);
  const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
  const member = await tx.projectMember.findUnique({ where: { workspaceId_projectId_userId: { workspaceId, projectId, userId: actor.id } } });
  if (!member?.active) throw new AppError("UNAVAILABLE", 404);
  return { ...parent, project, projectRole: member.role as ProjectRole };
}
export function inProject<T>(db: Database, actor: Identity, w: string, p: string, write: boolean, fn: (tx: Tx, scope: Awaited<ReturnType<typeof projectLock>>) => Promise<T>) {
  return asIdentity(db, actor, async tx => fn(tx, await projectLock(tx, actor, w, p, write)));
}
