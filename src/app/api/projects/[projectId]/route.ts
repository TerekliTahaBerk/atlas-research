import { z } from "zod";
import { entry,uuid } from "@/server/entry";
import { readMutation } from "@/server/http";
import { readProject,revokeProjectMember,setProjectRole,transferProjectOwner,updateProject } from "@/server/domain/projects";
import { createInvitation,invitationInput,revokeInvitation } from "@/server/domain/invitations";
import { getMailQueue } from "@/server/auth";
import { getEnv } from "@/server/env";
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("update"),name:z.string().trim().min(1).max(100).optional(),description:z.string().max(500).optional(),archived:z.boolean().optional(),deletion:z.enum(["request","restore"]).optional()}).strict(),
  z.object({action:z.literal("role"),userId:z.string().min(1).max(128),role:z.enum(["admin","editor","viewer"])}).strict(),
  z.object({action:z.enum(["revoke","transfer"]),userId:z.string().min(1).max(128)}).strict(),
  invitationInput.extend({action:z.literal("invite")}).strict(),
  z.object({action:z.literal("cancel-invite"),invitationId:z.uuid()}).strict(),
]);
type Context={params:Promise<{projectId:string}>};
async function scope(request:Request,context:Context) { return {w:uuid(new URL(request.url).searchParams.get("workspaceId")),p:uuid((await context.params).projectId)}; }
export const GET=(request:Request,context:Context)=>entry(request,async(actor,db)=>{const {w,p}=await scope(request,context);return readProject(db,actor,w,p);});
export const PATCH=(request:Request,context:Context)=>entry(request,async(actor,db)=>{
  const {w,p}=await scope(request,context),body=await readMutation(request,schema);
  if(body.action==="update") return updateProject(db,actor,w,p,body);
  if(body.action==="invite") { const {email,role}=body;return createInvitation(db,actor,getMailQueue(),getEnv().APP_ORIGIN,w,p,{email,role}); }
  if(body.action==="role") await setProjectRole(db,actor,w,p,body.userId,body.role);
  else if(body.action==="revoke") await revokeProjectMember(db,actor,w,p,body.userId);
  else if(body.action==="transfer") await transferProjectOwner(db,actor,w,p,body.userId);
  else if(body.action==="cancel-invite") await revokeInvitation(db,actor,w,p,body.invitationId);
  return {ok:true};
});
