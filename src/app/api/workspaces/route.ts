import { entry } from "@/server/entry";
import { readMutation } from "@/server/http";
import { createSharedWorkspace,listWorkspaces,workspaceInput } from "@/server/domain/workspaces";
export const GET=(request:Request)=>entry(request,(actor,db)=>listWorkspaces(db,actor));
export const POST=(request:Request)=>entry(request,async(actor,db)=>createSharedWorkspace(db,actor,await readMutation(request,workspaceInput)));
