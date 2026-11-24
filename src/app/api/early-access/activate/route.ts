import { z } from "zod";
import { activateFounding } from "@/server/billing/founding";
import { entry } from "@/server/entry";
import { readMutation } from "@/server/http";

const schema = z
  .object({ workspaceId: z.uuid(), token: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export function POST(request: Request) {
  return entry(request, async (actor, db) => {
    const { workspaceId, token } = await readMutation(request, schema);
    return activateFounding(db, actor, workspaceId, token);
  });
}
