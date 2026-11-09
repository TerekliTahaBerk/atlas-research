import { z } from "zod";
import { entry } from "@/server/entry";
import { readMutation } from "@/server/http";
import { createProject,listProjects,projectInput } from "@/server/domain/projects";
export const GET=(request:Request)=>entry(request,(actor,db)=>listProjects(db,actor));
export const POST=(request:Request)=>entry(request,async(actor,db)=>{
  const body=await readMutation(request,projectInput.extend({workspaceId:z.uuid()}).strict());
  const {workspaceId,...input}=body;
  return createProject(db,actor,workspaceId,input);
});
