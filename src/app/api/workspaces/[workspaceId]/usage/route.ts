import { z } from "zod";
import { entry, uuid } from "@/server/entry";
import { readMutation } from "@/server/http";
import { changeMemberAiCap, readWorkspaceUsage } from "@/server/billing/usage";

type Context = { params: Promise<{ workspaceId: string }> };
const settings = z
  .object({ memberAiPercent: z.number().int().min(1).max(100) })
  .strict();

export function GET(request: Request, context: Context) {
  return entry(request, async (actor, db) =>
    readWorkspaceUsage(db, actor, uuid((await context.params).workspaceId)),
  );
}
export function PATCH(request: Request, context: Context) {
  return entry(request, async (actor, db) => {
    const body = await readMutation(request, settings);
    return changeMemberAiCap(
      db,
      actor,
      uuid((await context.params).workspaceId),
      body.memberAiPercent,
    );
  });
}
