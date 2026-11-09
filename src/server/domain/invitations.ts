import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "../db/client";
import type { Identity } from "../auth/identity";
import type { MailQueue } from "../mail/outbox";
import { asIdentity } from "../db/transaction";
import { AppError } from "../errors";
import { audit, inProject, requireRole } from "./access";

export const invitationInput = z.object({ email: z.email().max(254).transform(v => v.trim().toLowerCase()), role: z.enum(["admin", "editor", "viewer"]) }).strict();
function hash(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new AppError("UNAVAILABLE", 404);
  return createHash("sha256").update(token).digest("hex");
}
export async function createInvitation(db: Database, actor: Identity, mail: MailQueue, origin: string, w: string, p: string, raw: z.input<typeof invitationInput>) {
  if(!mail.deliveryEnabled)throw new AppError("MAIL_DISABLED",503);
  const input = invitationInput.parse(raw);
  return inProject(db, actor, w, p, true, async (tx, scope) => {
    requireRole(scope.projectRole, input.role === "admin" ? ["owner"] : ["owner", "admin"]);
    if (scope.workspace.kind !== "shared") throw new AppError("UNAVAILABLE", 404);
    if (scope.workspace.archivedAt || scope.project.archivedAt || scope.project.deletedAt) throw new AppError("ARCHIVED", 409);
    const old = await tx.invitation.findFirst({ where: { projectId: p, email: input.email, revokedAt: null, acceptedAt: null } });
    if (old && scope.projectRole === "admin" && old.role === "admin") throw new AppError("UNAVAILABLE", 404);
    if (old) await tx.invitation.updateMany({ where: { id: old.id }, data: { revokedAt: new Date() } });
    const id = randomUUID(), token = randomBytes(32).toString("hex"), expiresAt = new Date(Date.now() + 7 * 86400_000 - 1000);
    await tx.invitation.createMany({ data: [{ id, workspaceId: w, projectId: p, email: input.email, role: input.role, tokenHash: hash(token), createdBy: actor.id, originSessionId: actor.sessionId, expiresAt }] });
    const payload = mail.encrypt({ to: input.email, subject: "Your Atlas project invitation", text: `A researcher invited you to an Atlas project. Sign in with this email to review and accept within seven days:\n${origin}/invite/${token}`, authorization: { actorId: actor.id, sessionId: actor.sessionId, workspaceId: w, projectId: p, invitationId: id } });
    await tx.$executeRaw`INSERT INTO ops.mail_outbox(id,payload,"expiresAt") VALUES (${randomUUID()}::uuid,${payload},${expiresAt})`;
    await audit(tx, actor, w, p, "invitation_created", id);
    return { id, email: input.email, role: input.role, expiresAt };
  });
}
export function revokeInvitation(db: Database, actor: Identity, w: string, p: string, id: string) {
  return inProject(db, actor, w, p, true, async (tx, scope) => {
    requireRole(scope.projectRole, ["owner", "admin"]);
    const inv = await tx.invitation.findFirst({ where: { id, workspaceId: w, projectId: p, acceptedAt: null } });
    if (!inv || (scope.projectRole === "admin" && inv.role === "admin")) throw new AppError("UNAVAILABLE", 404);
    await tx.invitation.updateMany({ where: { id }, data: { revokedAt: new Date() } });
    await audit(tx, actor, w, p, "invitation_revoked", id);
  });
}
export type InvitationPreview = { id: string; projectName: string; workspaceName: string; role: string; expiresAt: string; accepted: boolean };
export function previewInvitation(db: Database, actor: Identity, token: string) {
  const digest = hash(token);
  return asIdentity(db, actor, async tx => {
    const [row] = await tx.$queryRaw<Array<{ value: InvitationPreview | null }>>`SELECT app.invitation_preview(${digest}) AS value`;
    if (!row?.value) throw new AppError("UNAVAILABLE", 404);
    return row.value;
  });
}
export function acceptInvitation(db: Database, actor: Identity, token: string) {
  const digest = hash(token);
  return asIdentity(db, actor, async tx => {
    const [row] = await tx.$queryRaw<Array<{ id: string }>>`SELECT app.accept_invitation(${digest}) AS id`;
    return tx.project.findUniqueOrThrow({ where: { id: row.id } });
  });
}
