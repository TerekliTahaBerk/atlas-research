import type { Database } from "../db/client";
import type { Identity } from "../auth/identity";
import { asIdentity } from "../db/transaction";
import { inProject, requireRole, workspaceLock } from "./access";

async function profiles(auth: Database, rows: Array<{ userId: string; role: string; active: boolean }>) {
  // IDs are selected through runtime RLS before the auth-only profile lookup.
  const users = await auth.user.findMany({ where: { id: { in: rows.map(r => r.userId) } }, select: { id: true, name: true, email: true } });
  return rows.map(row => ({ ...row, ...users.find(u => u.id === row.userId) }));
}
export function workspaceMembers(db: Database, auth: Database, actor: Identity, w: string) {
  return asIdentity(db, actor, async tx => {
    const scope = await workspaceLock(tx,actor,w);
    requireRole(scope.role,["owner","admin"]);
    const rows = await tx.workspaceMember.findMany({where:{workspaceId:w,active:true},select:{userId:true,role:true,active:true}});
    return profiles(auth,rows);
  });
}
export function projectMembers(db: Database, auth: Database, actor: Identity, w: string,p: string) {
  return inProject(db,actor,w,p,false,async(tx,scope)=>{
    const rows = await tx.projectMember.findMany({where:{workspaceId:w,projectId:p,active:true},select:{userId:true,role:true,active:true}});
    const invitations = ["owner","admin"].includes(scope.projectRole) ? await tx.invitation.findMany({where:{workspaceId:w,projectId:p,acceptedAt:null,revokedAt:null,expiresAt:{gt:new Date()}},select:{id:true,email:true,role:true,expiresAt:true}}) : [];
    return { members:await profiles(auth,rows),invitations,role:scope.projectRole };
  });
}
