import { z } from "zod";
import { entry, uuid } from "@/server/entry";
import { readMutation } from "@/server/http";
import { AppError } from "@/server/errors";
import { getIdentityDatabase } from "@/server/auth";
import { inboxInput, inboxPage, inboxSummary, markPageRead, pageReadInput } from "@/server/collaboration/inbox";
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
      if (path.length === 1 && method === "GET") {
        if(url.searchParams.get("view")==="summary") return inboxSummary(db,a);
        if(url.searchParams.get("view")==="paged") return inboxPage(db,getIdentityDatabase(),a,inboxInput.parse({status:url.searchParams.get("status")??"unread",event:url.searchParams.get("event")??"all",before:url.searchParams.get("before")??undefined,snapshot:url.searchParams.get("snapshot")??undefined,selected:url.searchParams.get("selected")??undefined}));
        return c.inbox(db,a);
      }
      if(path.length===1 && method==="POST") return markPageRead(db,a,(await readMutation(request,pageReadInput)).ids);
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
            url.searchParams.has("view")
              ? c.taskListInput.parse({
                  ...Object.fromEntries(url.searchParams),
                  completed: url.searchParams.get("completed") !== "false",
                  archived: url.searchParams.get("archived") === "true",
                  page: Number(url.searchParams.get("page") ?? 0),
                })
              : url.searchParams.get("archived") === "true",
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
            z.union([
              c.taskChangeInput,
              c.taskMoveInput,
              c.taskEditInput,
              c.archiveInput,
            ]),
            65536,
          );
          if (
            "action" in input &&
            (input.action === "edit" || input.action === "move")
          )
            return c.changeTask(db, a, w, p, id, input);
          return "action" in input
            ? c.archiveArtifact(db, a, w, p, id, "task", input)
            : c.editTask(db, a, w, p, id, input);
        }
      }
    }
    if (part[0] === "discussions") {
      if (part.length === 1) {
        if (method === "GET")
          return c.listDiscussions(
            db,
            a,
            w,
            p,
            url.searchParams.has("page")
              ? c.discussionListInput.parse({
                  q: url.searchParams.get("q") ?? "",
                  page: Number(url.searchParams.get("page")),
                  archived: url.searchParams.get("archived") === "true",
                })
              : undefined,
          );
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
        return c.getDiscussion(
          db,
          a,
          w,
          p,
          id,
          url.searchParams.has("window")
            ? c.discussionPageInput.parse({
                before: url.searchParams.get("before") ?? undefined,
                focus: url.searchParams.get("focus") ?? undefined,
                after: url.searchParams.get("after") ?? undefined,
              })
            : undefined,
        );
      if (part.length === 2 && method === "PATCH")
        return c.editDiscussion(
          db,
          a,
          w,
          p,
          id,
          await readMutation(request, c.discussionEditInput),
        );
      if (part.length === 3 && part[2] === "messages" && method === "POST")
        return c.sendMessage(
          db,
          a,
          w,
          p,
          id,
          await readMutation(request, c.messageInput, 65536),
        );
      if (part.length === 4 && part[2] === "messages" && method === "GET")
        return c.getMessage(db, a, w, p, id, uuid(part[3]));
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
      if (part.length === 1)
        return c.artifactOptions(
          db,
          a,
          w,
          p,
          url.searchParams.has("q")
            ? z.string().max(200).parse(url.searchParams.get("q"))
            : undefined,
          url.searchParams.has("selected")
            ? z
                .array(z.uuid())
                .max(30)
                .parse(
                  url.searchParams.get("selected")!.split(",").filter(Boolean),
                )
            : [],
        );
      if (part.length === 3 && part[2] === "links")
        return c.getLinks(db, a, w, p, id);
    }
    throw new AppError("UNAVAILABLE", 404);
  });
}
export { handle as GET, handle as POST, handle as PATCH };
