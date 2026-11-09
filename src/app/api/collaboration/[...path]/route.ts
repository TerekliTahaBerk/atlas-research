import { z } from "zod";
import { entry, uuid } from "@/server/entry";
import { readMutation } from "@/server/http";
import { AppError } from "@/server/errors";
import * as c from "@/server/collaboration/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return entry(request, async (a, db) => {
    const { path } = await context.params,
      method = request.method,
      url = new URL(request.url);
    if (path[0] === "inbox") {
      if (path.length === 1 && method === "GET") return c.inbox(db, a);
      if (path.length === 2 && method === "PATCH") {
        const input = await readMutation(
          request,
          z.object({ read: z.boolean() }).strict(),
        );
        return c.markNotification(db, a, uuid(path[1]), input.read);
      }
    }
    if (path.length < 3 || path.length > 6)
      throw new AppError("UNAVAILABLE", 404);
    const w = uuid(path[0]),
      p = uuid(path[1]),
      part = path.slice(2),
      id = part[1] ? uuid(part[1]) : "";
    if (part[0] === "documents") {
      if (part.length === 1) {
        if (method === "GET")
          return c.listDocuments(
            db,
            a,
            w,
            p,
            url.searchParams.has("page") ||
              url.searchParams.has("q") ||
              url.searchParams.has("sort")
              ? c.documentListInput.parse({
                  archived: url.searchParams.get("archived") === "true",
                  q: url.searchParams.get("q") ?? "",
                  sort: url.searchParams.get("sort") ?? "updated",
                  page: Number(url.searchParams.get("page") ?? 0),
                })
              : url.searchParams.get("archived") === "true",
          );
        if (method === "POST")
          return c.createDocument(
            db,
            a,
            w,
            p,
            await readMutation(request, c.createDocumentInput),
          );
      }
      if (part.length === 2) {
        if (method === "GET") return c.getDocument(db, a, w, p, id);
        if (method === "PATCH") {
          const input = await readMutation(
            request,
            z.discriminatedUnion("action", [
              c.saveDocumentInput,
              c.restoreInput,
              c.archiveInput,
            ]),
            524288,
          );
          if (input.action === "save")
            return c.saveDocument(db, a, w, p, id, input);
          if (input.action === "restore")
            return c.restoreDocument(db, a, w, p, id, input);
          return c.archiveArtifact(db, a, w, p, id, "document", input);
        }
      }
      if (part.length === 3 && part[2] === "citations" && method === "POST")
        return c.addCitation(
          db,
          a,
          w,
          p,
          id,
          await readMutation(request, c.originInput),
        );
      if (part.length === 3 && part[2] === "export" && method === "GET")
        return c.exportDocument(db, a, w, p, id);
      if (part.length === 4 && part[2] === "versions" && method === "GET")
        return c.getVersion(db, a, w, p, id, uuid(part[3]));
    }
    if (part[0] === "tasks") {
      if (part.length === 1) {
        if (method === "GET")
          return c.listTasks(
            db,
            a,
            w,
            p,
            url.searchParams.get("archived") === "true",
          );
        if (method === "POST")
          return c.createTask(
            db,
            a,
            w,
            p,
            await readMutation(request, c.taskInput, 65536),
          );
      }
      if (part.length === 2) {
        if (method === "GET") return c.getTask(db, a, w, p, id);
        if (method === "PATCH") {
          const input = await readMutation(
            request,
            z.union([c.taskEditInput, c.archiveInput]),
            65536,
          );
          return "action" in input
            ? c.archiveArtifact(db, a, w, p, id, "task", input)
            : c.editTask(db, a, w, p, id, input);
        }
      }
    }
    if (part[0] === "discussions") {
      if (part.length === 1) {
        if (method === "GET") return c.listDiscussions(db, a, w, p);
        if (method === "POST")
          return c.createDiscussion(
            db,
            a,
            w,
            p,
            await readMutation(request, c.discussionInput, 65536),
          );
      }
      if (part.length === 2 && method === "GET")
        return c.getDiscussion(db, a, w, p, id);
      if (part.length === 3 && part[2] === "messages" && method === "POST")
        return c.sendMessage(
          db,
          a,
          w,
          p,
          id,
          await readMutation(request, c.messageInput, 65536),
        );
      if (part.length === 4 && part[2] === "messages" && method === "PATCH")
        return c.editMessage(
          db,
          a,
          w,
          p,
          id,
          uuid(part[3]),
          await readMutation(request, c.messageEditInput, 65536),
        );
    }
    if (part[0] === "artifacts" && method === "GET") {
      if (part.length === 1) return c.artifactOptions(db, a, w, p);
      if (part.length === 3 && part[2] === "links")
        return c.getLinks(db, a, w, p, id);
    }
    throw new AppError("UNAVAILABLE", 404);
  });
}
export { handle as GET, handle as POST, handle as PATCH };
