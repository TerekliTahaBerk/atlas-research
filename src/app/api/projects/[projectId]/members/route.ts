import { entry,uuid } from "@/server/entry";
import { getIdentityDatabase } from "@/server/auth";
import { projectMembers } from "@/server/domain/members";
export async function GET(request:Request,context:{params:Promise<{projectId:string}>}) {
  return entry(request,async(actor,db)=>projectMembers(db,getIdentityDatabase(),actor,uuid(new URL(request.url).searchParams.get("workspaceId")),uuid((await context.params).projectId)));
}
