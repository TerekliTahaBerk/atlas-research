import { z } from "zod";
import type { Database } from "../db/client";
import type { Identity } from "../auth/identity";
import { asIdentity } from "../db/transaction";
import { AppError } from "../errors";
import { audit, fresh, requireRole, workspaceLock } from "./access";

export const workspaceInput = z.object({ name: z.string().trim().min(1).max(80), requestId: z.uuid() }).strict();
export function listWorkspaces(db: Database, actor: Identity) {
  return asIdentity(db, actor, tx => tx.workspace.findMany({ where: { members: { some: { userId: actor.id, active: true } } }, orderBy: [{ kind: "asc" }, { createdAt: "asc" }] }));
}
export function createSharedWorkspace(db: Database, actor: Identity, raw: z.input<typeof workspaceInput>) {
  const input = workspaceInput.parse(raw);
  return asIdentity(db, actor, async tx => {
    const existing = await tx.workspace.findUnique({ where: { id: input.requestId } });
    if (existing) {
      if (existing.createdBy !== actor.id || existing.name !== input.name || existing.kind !== "shared") throw new AppError("CONFLICT", 409);
      return existing;
    }
    await tx.workspace.createMany({ data: [{ id: input.requestId, kind: "shared", name: input.name, createdBy: actor.id }] });
    await tx.workspaceMember.createMany({ data: [{ workspaceId: input.requestId, userId: actor.id, role: "owner" }] });
    await audit(tx, actor, input.requestId, null, "workspace_created");
    return tx.workspace.findUniqueOrThrow({ where: { id: input.requestId } });
  });
}
export function updateWorkspace(db: Database, actor: Identity, id: string, change: { name?: string; archived?: boolean }) {
  return asIdentity(db, actor, async tx => {
    const { role } = await workspaceLock(tx, actor, id, true);
    requireRole(role, ["owner", "admin"]);
    await audit(tx, actor, id, null, "workspace_updated");
    return tx.workspace.update({ where: { id }, data: { ...(change.name !== undefined ? { name: z.string().trim().min(1).max(80).parse(change.name) } : {}), ...(change.archived !== undefined ? { archivedAt: change.archived ? new Date() : null } : {}) } });
  });
}
export function setWorkspaceRole(db: Database, actor: Identity, id: string, userId: string, role: "admin" | "member") {
  return asIdentity(db, actor, async tx => {
    const current = await workspaceLock(tx, actor, id, true);
    requireRole(current.role, ["owner"]);
    if (current.workspace.kind !== "shared") throw new AppError("UNAVAILABLE", 404);
    const target = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: id, userId } } });
    if (!target?.active || target.role === "owner") throw new AppError("OWNER_REQUIRED", 409);
    await audit(tx, actor, id, null, "workspace_role_changed", userId);
    await tx.workspaceMember.updateMany({ where: { workspaceId: id, userId }, data: { role } });
  });
}
export function revokeWorkspaceMember(db: Database, actor: Identity, id: string, userId: string) {
  return asIdentity(db, actor, async tx => {
    await tx.$executeRaw`SELECT app.revoke_workspace_member(${id}::uuid,${userId})`;
  });
}
export function transferWorkspaceOwner(db: Database, actor: Identity, id: string, userId: string) {
  fresh(actor);
  return asIdentity(db, actor, async tx => {
    const current = await workspaceLock(tx, actor, id, true);
    requireRole(current.role, ["owner"]);
    if (current.workspace.kind !== "shared" || userId === actor.id) throw new AppError("INVALID_INPUT");
    const target = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: id, userId } } });
    if (!target?.active) throw new AppError("UNAVAILABLE", 404);
    await audit(tx, actor, id, null, "workspace_owner_transferred", userId);
    await tx.workspaceMember.updateMany({ where: { workspaceId: id, userId }, data: { role: "owner" } });
    await tx.workspaceMember.updateMany({ where: { workspaceId: id, userId: actor.id }, data: { role: "admin" } });
  });
}

export function readWorkspace(db:Database,actor:Identity,id:string) {
 return asIdentity(db,actor,async tx=>{ const s=await workspaceLock(tx,actor,id);return {workspace:s.workspace,role:s.role}; });
}
