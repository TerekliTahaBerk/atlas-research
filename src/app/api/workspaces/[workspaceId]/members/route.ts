import { entry,uuid } from "@/server/entry";
import { getIdentityDatabase } from "@/server/auth";
import { workspaceMembers } from "@/server/domain/members";
export async function GET(request:Request,context:{params:Promise<{workspaceId:string}>}) {
  return entry(request,async(actor,db)=>workspaceMembers(db,getIdentityDatabase(),actor,uuid((await context.params).workspaceId)));
}
