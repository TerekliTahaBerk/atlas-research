import { z } from "zod";
import { entry,uuid } from "@/server/entry";
import { readMutation } from "@/server/http";
import { revokeWorkspaceMember,setWorkspaceRole,transferWorkspaceOwner,updateWorkspace } from "@/server/domain/workspaces";
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("update"),name:z.string().trim().min(1).max(80).optional(),archived:z.boolean().optional()}).strict(),
  z.object({action:z.literal("role"),userId:z.string().min(1).max(128),role:z.enum(["admin","member"])}).strict(),
  z.object({action:z.enum(["revoke","transfer"]),userId:z.string().min(1).max(128)}).strict(),
]);
export async function PATCH(request:Request,context:{params:Promise<{workspaceId:string}>}) {
  return entry(request,async(actor,db)=>{
    const w=uuid((await context.params).workspaceId),body=await readMutation(request,schema);
    if(body.action==="update") return updateWorkspace(db,actor,w,body);
    if(body.action==="role") await setWorkspaceRole(db,actor,w,body.userId,body.role);
    else if(body.action==="transfer") await transferWorkspaceOwner(db,actor,w,body.userId);
    else await revokeWorkspaceMember(db,actor,w,body.userId);
    return {ok:true};
  });
}
