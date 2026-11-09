import { z } from "zod";
import { entry } from "@/server/entry";
import { readMutation } from "@/server/http";
import { acceptInvitation,previewInvitation } from "@/server/domain/invitations";
type Context={params:Promise<{token:string}>};
export const GET=(request:Request,context:Context)=>entry(request,async(actor,db)=>previewInvitation(db,actor,(await context.params).token));
export const POST=(request:Request,context:Context)=>entry(request,async(actor,db)=>{
  await readMutation(request,z.object({}).strict());
  return acceptInvitation(db,actor,(await context.params).token);
});
