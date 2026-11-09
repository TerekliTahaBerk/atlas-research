import { z } from "zod";
import type { Database } from "../db/client";
import type { Identity } from "../auth/identity";
import { asIdentity } from "../db/transaction";
import { AppError } from "../errors";
import { audit, fresh, inProject, requireRole, workspaceLock, type ProjectRole } from "./access";

export const projectInput = z.object({ name: z.string().trim().min(1).max(100), description: z.string().trim().max(500).default(""), requestId: z.uuid() }).strict();
export function listProjects(db: Database, actor: Identity) {
  return asIdentity(db, actor, tx => tx.project.findMany({ where: { members: { some: { userId: actor.id, active: true, workspaceMember: { active: true } } } }, orderBy: { updatedAt: "desc" } }));
}
export function createProject(db: Database, actor: Identity, workspaceId: string, raw: z.input<typeof projectInput>) {
  const input = projectInput.parse(raw);
  return asIdentity(db, actor, async tx => {
    const { workspace } = await workspaceLock(tx, actor, workspaceId);
    if (workspace.archivedAt) throw new AppError("ARCHIVED", 409);
    const existing = await tx.project.findUnique({ where: { id: input.requestId } });
    if (existing) {
      if (existing.workspaceId !== workspaceId || existing.createdBy !== actor.id || existing.name !== input.name) throw new AppError("CONFLICT", 409);
      return existing;
    }
    await tx.project.createMany({ data: [{ id: input.requestId, workspaceId, name: input.name, description: input.description, createdBy: actor.id }] });
    await tx.projectMember.createMany({ data: [{ workspaceId, projectId: input.requestId, userId: actor.id, role: "owner" }] });
    await audit(tx, actor, workspaceId, input.requestId, "project_created");
    return tx.project.findUniqueOrThrow({ where: { id: input.requestId } });
  });
}
export function readProject(db: Database, actor: Identity, w: string, p: string) {
  return inProject(db, actor, w, p, false, async (_tx, scope) => ({ project: scope.project, workspace: scope.workspace, role: scope.projectRole }));
}
export function updateProject(db: Database, actor: Identity, w: string, p: string, change: { name?: string; description?: string; archived?: boolean; deletion?: "request" | "restore" }) {
  return inProject(db, actor, w, p, true, async (tx, scope) => {
    requireRole(scope.projectRole, change.deletion ? ["owner"] : ["owner", "admin"]);
    if (scope.workspace.archivedAt) throw new AppError("ARCHIVED", 409);
    if ((change.name !== undefined || change.description !== undefined) && (scope.project.archivedAt || scope.project.deletedAt)) throw new AppError("ARCHIVED", 409);
    if (change.deletion) fresh(actor);
    await audit(tx, actor, w, p, change.deletion ? `project_deletion_${change.deletion}` : "project_updated");
    if (change.deletion === "request") await tx.invitation.updateMany({ where: { workspaceId: w, projectId: p, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    return tx.project.update({ where: { id: p }, data: {
      ...(change.name !== undefined ? { name: z.string().trim().min(1).max(100).parse(change.name) } : {}),
      ...(change.description !== undefined ? { description: z.string().max(500).parse(change.description) } : {}),
      ...(change.archived !== undefined ? { archivedAt: change.archived ? new Date() : null } : {}),
      ...(change.deletion === "request" ? { archivedAt: new Date(), deletedAt: new Date() } : {}),
      ...(change.deletion === "restore" ? { archivedAt: null, deletedAt: null } : {}),
    } });
  });
}
export function setProjectRole(db: Database, actor: Identity, w: string, p: string, userId: string, role: Exclude<ProjectRole,"owner">) {
  return inProject(db, actor, w, p, true, async (tx, scope) => {
    requireRole(scope.projectRole, ["owner", "admin"]);
    const target = await tx.projectMember.findUnique({ where: { workspaceId_projectId_userId: { workspaceId: w, projectId: p, userId } } });
    if (!target?.active) throw new AppError("UNAVAILABLE", 404);
    if (target.role === "owner") throw new AppError("OWNER_REQUIRED", 409);
    if (scope.projectRole === "admin" && (target.role === "admin" || role === "admin")) throw new AppError("UNAVAILABLE", 404);
    await audit(tx, actor, w, p, "project_role_changed", userId);
    await tx.projectMember.updateMany({ where: { workspaceId: w, projectId: p, userId }, data: { role } });
  });
}
export function revokeProjectMember(db: Database, actor: Identity, w: string, p: string, userId: string) {
  return inProject(db, actor, w, p, true, async (tx, scope) => {
    requireRole(scope.projectRole, ["owner", "admin"]);
    const target = await tx.projectMember.findUnique({ where: { workspaceId_projectId_userId: { workspaceId: w, projectId: p, userId } } });
    if (!target?.active) throw new AppError("UNAVAILABLE", 404);
    if (scope.projectRole === "admin" && ["owner", "admin"].includes(target.role)) throw new AppError("UNAVAILABLE", 404);
    if (target.role === "owner") fresh(actor);
    await audit(tx, actor, w, p, "project_member_revoked", userId);
    await tx.projectMember.updateMany({ where: { workspaceId: w, projectId: p, userId }, data: { active: false } });
  });
}
export function transferProjectOwner(db: Database, actor: Identity, w: string, p: string, userId: string) {
  fresh(actor);
  return inProject(db, actor, w, p, true, async (tx, scope) => {
    requireRole(scope.projectRole, ["owner"]);
    if (userId === actor.id) throw new AppError("INVALID_INPUT");
    const target = await tx.projectMember.findUnique({ where: { workspaceId_projectId_userId: { workspaceId: w, projectId: p, userId } } });
    if (!target?.active) throw new AppError("UNAVAILABLE", 404);
    await audit(tx, actor, w, p, "project_owner_transferred", userId);
    await tx.projectMember.updateMany({ where: { workspaceId: w, projectId: p, userId }, data: { role: "owner" } });
    await tx.projectMember.updateMany({ where: { workspaceId: w, projectId: p, userId: actor.id }, data: { role: "admin" } });
  });
}
