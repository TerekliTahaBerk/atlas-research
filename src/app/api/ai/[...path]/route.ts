import { after } from "next/server";
import { z } from "zod";
import { entry, uuid } from "@/server/entry";
import { readMutation } from "@/server/http";
import { AppError } from "@/server/errors";
import * as a from "@/server/ai/service";
import * as proposals from "@/server/ai/proposals";
import { executeRun } from "@/server/ai/execution";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return entry(request, async (actor, db) => {
    const { path } = await context.params,
      method = request.method;
    if (path[0] === "policy" && path.length === 2) {
      const w = uuid(path[1]);
      if (method === "GET") return a.getPolicy(db, actor, w);
      if (method === "PATCH")
        return a.setPolicy(
          db,
          actor,
          w,
          await readMutation(request, a.policyInput),
        );
    }
    if (path.length < 3 || path.length > 5)
      throw new AppError("UNAVAILABLE", 404);
    const w = uuid(path[0]),
      p = uuid(path[1]),
      part = path.slice(2);
    if (part[0] === "options" && part.length === 1 && method === "GET")
      return a.options(db, actor, w, p);
    if (part[0] === "preview" && part.length === 1 && method === "POST")
      return a.preview(
        db,
        actor,
        w,
        p,
        await readMutation(request, a.previewInput, 20000),
      );
    if (part[0] === "conversations" && part.length === 2 && method === "GET")
      return a.getConversation(db, actor, w, p, uuid(part[1]));
    if (part[0] === "runs" && part.length === 1 && method === "POST") {
      const run = await a.startRun(
        db,
        actor,
        w,
        p,
        await readMutation(request, a.runInput),
      );
      if (run.state === "queued")
        after(() => executeRun(db, actor, w, p, run.id));
      return { id: run.id, conversationId: run.conversationId };
    }
    if (part[0] === "runs" && part.length === 3 && method === "POST") {
      const id = uuid(part[1]);
      if (part[2] === "cancel") {
        await readMutation(request, z.object({}).strict());
        return a.cancelRun(db, actor, w, p, id);
      }
      if (part[2] === "review") {
        const input = await readMutation(
          request,
          z
            .object({
              segment: z.number().int().min(0).max(11),
              verdict: z.enum([
                "supported",
                "partial",
                "unsupported",
                "contradicted",
              ]),
            })
            .strict(),
        );
        return a.reviewSegment(
          db,
          actor,
          w,
          p,
          id,
          input.segment,
          input.verdict,
        );
      }
    }
    if (part[0] === "proposals") {
      if (part.length === 1 && method === "POST")
        return proposals.createProposal(
          db,
          actor,
          w,
          p,
          await readMutation(request, proposals.proposalInput),
        );
      const id = uuid(part[1] ?? null);
      if (part.length === 2 && method === "GET")
        return proposals.getProposal(db, actor, w, p, id);
      if (part.length === 3 && method === "POST") {
        await readMutation(request, z.object({}).strict());
        if (part[2] === "apply")
          return proposals.applyProposal(db, actor, w, p, id);
        if (part[2] === "undo")
          return proposals.undoProposal(db, actor, w, p, id);
      }
    }
    throw new AppError("UNAVAILABLE", 404);
  });
}
export { handle as GET, handle as POST, handle as PATCH };
