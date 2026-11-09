import { z } from "zod";
import { entry, uuid } from "@/server/entry";
import { readMutation } from "@/server/http";
import { AppError } from "@/server/errors";
import {
  research,
  updateLibrarySources,
  libraryBulkInput,
  changeCollection,
  collectionChangeInput,
  listLibrary,
  addSource,
  getSource,
  editSource,
  editSourceInput,
  readingInput,
  saveReading,
  addCollection,
  annotationInput,
  addAnnotation,
  annotationEdit,
  editAnnotation,
  retryFile,
  collectSources,
  bulkSourcesInput,
} from "@/server/research/library";
import {
  metadataInput,
  discover,
  bibtex,
  ris,
} from "@/server/research/metadata";
import { uploadPdf, servePdf } from "@/server/research/storage";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
function pageValue(raw: string | null) {
  const page = Number(raw ?? 0);
  if (!Number.isInteger(page) || page < 0 || page > 1000000)
    throw new AppError("INVALID_INPUT");
  return page;
}
async function handle(request: Request, context: Context) {
  return entry(request, async (actor, db) => {
    const { path } = await context.params;
    if (path.length < 3 || path.length > 8)
      throw new AppError("UNAVAILABLE", 404);
    const w = uuid(path[0]),
      p = uuid(path[1]),
      parts = path.slice(2),
      url = new URL(request.url),
      method = request.method;
    if (parts[0] === "sources") {
      if (parts.length === 2 && parts[1] === "bulk" && method === "POST")
        return updateLibrarySources(
          db,
          actor,
          w,
          p,
          await readMutation(request, libraryBulkInput),
        );
      if (parts.length === 2 && parts[1] === "collect" && method === "POST")
        return collectSources(
          db,
          actor,
          w,
          p,
          await readMutation(request, bulkSourcesInput),
        );
      if (parts.length === 1) {
        if (method === "GET") {
          const collection = url.searchParams.get("collection") || undefined,
            status = url.searchParams.get("status") || undefined;
          const sort = url.searchParams.get("sort") || "added";
          if (!["added", "edited", "title", "year"].includes(sort))
            throw new AppError("INVALID_INPUT");
          if (status && !["unread", "reading", "done"].includes(status))
            throw new AppError("INVALID_INPUT");
          const pdf = url.searchParams.get("pdf") || undefined,
            year = url.searchParams.get("year");
          if (pdf && !["yes", "no"].includes(pdf))
            throw new AppError("INVALID_INPUT");
          if (
            year &&
            (!/^\d{4}$/.test(year) ||
              Number(year) < 1000 ||
              Number(year) > 2200)
          )
            throw new AppError("INVALID_INPUT");
          return listLibrary(
            db,
            actor,
            w,
            p,
            (url.searchParams.get("q") ?? "").slice(0, 200),
            pageValue(url.searchParams.get("page")),
            {
              collection: collection ? uuid(collection) : undefined,
              tag:
                (url.searchParams.get("tag") ?? "").slice(0, 40) || undefined,
              status,
              sort,
              pdf,
              year: year ? Number(year) : undefined,
              archived: url.searchParams.get("archived") === "true",
            },
          );
        }
        if (method === "POST")
          return addSource(
            db,
            actor,
            w,
            p,
            await readMutation(request, metadataInput, 65536),
          );
      }
      const s = uuid(parts[1] ?? null);
      if (parts.length === 2) {
        if (method === "GET") return getSource(db, actor, w, p, s);
        if (method === "PATCH") {
          const body = await readMutation(
            request,
            z.discriminatedUnion("action", [editSourceInput, readingInput]),
            65536,
          );
          return body.action === "reading"
            ? saveReading(db, actor, w, p, s, body)
            : editSource(db, actor, w, p, s, body);
        }
      }
      if (parts.length === 3 && parts[2] === "upload" && method === "POST")
        return uploadPdf(
          request,
          db,
          actor,
          w,
          p,
          s,
          uuid(request.headers.get("x-upload-id")),
        );
      if (parts.length === 5 && parts[2] === "versions") {
        const v = uuid(parts[3]);
        if (parts[4] === "file" && ["GET", "HEAD"].includes(method))
          return servePdf(request, db, actor, w, p, s, v);
        if (parts[4] === "annotations" && method === "POST")
          return addAnnotation(
            db,
            actor,
            w,
            p,
            s,
            v,
            await readMutation(request, annotationInput, 65536),
          );
        if (parts[4] === "retry" && method === "POST") {
          await readMutation(request, z.object({}).strict());
          return retryFile(db, actor, w, p, s, v);
        }
      }
    }
    if (parts[0] === "annotations" && parts.length === 2 && method === "PATCH")
      return editAnnotation(
        db,
        actor,
        w,
        p,
        uuid(parts[1]),
        await readMutation(request, annotationEdit, 65536),
      );
    if (parts[0] === "collections" && parts.length === 2 && method === "PATCH")
      return changeCollection(
        db,
        actor,
        w,
        p,
        uuid(parts[1]),
        await readMutation(request, collectionChangeInput),
      );
    if (parts[0] === "collections" && parts.length === 1) {
      if (method === "GET")
        return research(db, actor, w, p, false, (tx) =>
          tx.collection.findMany({
            where: { workspaceId: w, projectId: p },
            orderBy: { name: "asc" },
          }),
        );
      if (method === "POST") {
        const body = await readMutation(
          request,
          z.object({ name: z.string().trim().min(1).max(80) }).strict(),
        );
        return addCollection(db, actor, w, p, body.name);
      }
    }
    if (parts[0] === "discover" && parts.length === 1 && method === "GET") {
      await research(db, actor, w, p, false, async () => null);
      const query = (url.searchParams.get("q") ?? "").trim(),
        doi = url.searchParams.get("doi");
      if (!doi && (query.length < 2 || query.length > 200))
        throw new AppError("INVALID_INPUT");
      const discoveryPage = pageValue(url.searchParams.get("page"));
      if (discoveryPage > 50) throw new AppError("INVALID_INPUT");
      const results = await discover(db, query, discoveryPage, doi);
      const saved = await research(db, actor, w, p, false, (tx) =>
        tx.source.findMany({
          where: {
            workspaceId: w,
            projectId: p,
            doi: { in: results.items.flatMap((i) => (i.doi ? [i.doi] : [])) },
          },
          select: { id: true, doi: true },
        }),
      );
      return {
        ...results,
        hasMore: results.hasMore && discoveryPage < 50,
        limitReached: results.hasMore && discoveryPage === 50,
        items: results.items.map((item) => ({
          ...item,
          existingSourceId: saved.find((s) => s.doi === item.doi)?.id,
        })),
      };
    }
    if (parts[0] === "export" && parts.length === 1 && method === "GET") {
      const format = url.searchParams.get("format");
      if (!["bib", "ris"].includes(format ?? ""))
        throw new AppError("INVALID_INPUT");
      const parsedIds = url.searchParams.has("ids")
        ? z
            .array(z.uuid())
            .min(1)
            .max(100)
            .safeParse(url.searchParams.get("ids")!.split(","))
        : undefined;
      if (parsedIds && !parsedIds.success) throw new AppError("INVALID_INPUT");
      const ids = parsedIds?.success ? parsedIds.data : undefined;
      const sources = await research(db, actor, w, p, false, async (tx) => {
        const rows = await tx.source.findMany({
          where: {
            workspaceId: w,
            projectId: p,
            ...(ids ? { id: { in: ids } } : { archivedAt: null }),
          },
          orderBy: { title: "asc" },
        });
        if (ids && rows.length !== new Set(ids).size)
          throw new AppError("UNAVAILABLE", 404);
        return rows;
      });
      return new Response(format === "bib" ? bibtex(sources) : ris(sources), {
        headers: {
          "Content-Type":
            format === "bib"
              ? "application/x-bibtex; charset=utf-8"
              : "application/x-research-info-systems; charset=utf-8",
          "Content-Disposition": `attachment; filename="atlas-references.${format}"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    throw new AppError("UNAVAILABLE", 404);
  });
}
export { handle as GET, handle as POST, handle as PATCH, handle as HEAD };
