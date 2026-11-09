import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "../db/client";
import type { Identity } from "../auth/identity";
import { asIdentity } from "../db/transaction";
import { audit, inProject, requireRole, type Tx } from "../domain/access";
import { research } from "../research/library";
import { AppError } from "../errors";
import {
  cleanDocument,
  citationIds,
  documentMarkdown,
  emptyDocument,
  plainDocument,
  escapeMd,
  type DocNode,
} from "../../lib/document-model";
import type { ArtifactCard, CitationView } from "../../lib/collaboration-types";
import { Prisma } from "../../generated/prisma/client";
const json = (n: DocNode) => n as unknown as Prisma.InputJsonValue;
const title = z.string().trim().min(1).max(300);
const revision = z.number().int().min(1);
export const originInput = z
  .object({
    sourceId: z.uuid(),
    versionId: z.uuid().optional(),
    annotationId: z.uuid().optional(),
  })
  .strict();
export const createDocumentInput = z
  .object({ requestId: z.uuid(), title, origin: originInput.optional() })
  .strict();
export const saveDocumentInput = z
  .object({
    action: z.literal("save"),
    requestId: z.uuid(),
    revision,
    title,
    body: z.unknown(),
    checkpoint: z.boolean().default(false),
  })
  .strict();
export const restoreInput = z
  .object({
    action: z.literal("restore"),
    requestId: z.uuid(),
    revision,
    versionId: z.uuid(),
  })
  .strict();
export const archiveInput = z
  .object({ action: z.literal("archive"), revision, archived: z.boolean() })
  .strict();
const ids = z.array(z.uuid()).max(30).default([]);
export const taskInput = z
  .object({
    requestId: z.uuid(),
    title,
    description: z.string().max(20000).default(""),
    status: z
      .enum(["backlog", "in_progress", "in_review", "done"])
      .default("backlog"),
    priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
    assigneeId: z.string().min(1).max(200).nullable().default(null),
    dueDate: z.iso.date().nullable().default(null),
    links: ids,
  })
  .strict();
export const taskEditInput = taskInput
  .omit({ requestId: true, links: true })
  .extend({ revision })
  .strict();
export const taskChangeInput = z
  .object({
    action: z.literal("edit"),
    requestId: z.uuid(),
    revision,
    changes: z
      .object({
        title: title.optional(),
        description: z.string().max(20000).optional(),
        status: z
          .enum(["backlog", "in_progress", "in_review", "done"])
          .optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        assigneeId: z.string().min(1).max(200).nullable().optional(),
        dueDate: z.iso.date().nullable().optional(),
        links: ids.optional(),
        archived: z.boolean().optional(),
      })
      .strict()
      .refine((v) => Object.keys(v).length > 0),
  })
  .strict();
export const taskMoveInput = z
  .object({
    action: z.literal("move"),
    requestId: z.uuid(),
    revision,
    status: z.enum(["backlog", "in_progress", "in_review", "done"]),
    beforeId: z.uuid().nullable().default(null),
    afterId: z.uuid().optional(),
  })
  .strict();
export const taskListInput = z
  .object({
    q: z.string().trim().max(200).default(""),
    view: z.enum(["board", "list"]).default("board"),
    status: z
      .enum(["", "backlog", "in_progress", "in_review", "done"])
      .default(""),
    assignee: z.string().max(200).default(""),
    priority: z.enum(["", "low", "medium", "high", "urgent"]).default(""),
    due: z
      .enum(["", "today", "tomorrow", "overdue", "upcoming", "none"])
      .default(""),
    today: z.iso.date(),
    completed: z.boolean().default(true),
    archived: z.boolean().default(false),
    sort: z
      .enum(["position", "updated", "title", "due", "priority"])
      .default("position"),
    page: z.number().int().min(0).max(100000).default(0),
    columns: z
      .string()
      .regex(/^\d+,\d+,\d+,\d+$/)
      .default("0,0,0,0"),
  })
  .strict();
export const discussionInput = z
  .object({
    requestId: z.uuid(),
    title,
    body: z.string().trim().min(1).max(20000),
    links: ids,
    mentions: z.array(z.string().max(200)).max(20).default([]),
  })
  .strict();
export const messageInput = z
  .object({
    clientId: z.uuid(),
    body: z.string().trim().min(1).max(20000),
    links: ids,
    mentions: z.array(z.string().max(200)).max(20).default([]),
  })
  .strict();
export const messageEditInput = z
  .object({ body: z.string().trim().min(1).max(20000), revision })
  .strict();
const prefix = (w: string, p: string) => `/w/${w}/p/${p}`;
function unavailable(): never {
  throw new AppError("UNAVAILABLE", 404);
}
function conflict(): never {
  throw new AppError("REVISION_CONFLICT", 409);
}
async function documentRow(tx: Tx, w: string, p: string, id: string) {
  const d = await tx.document.findFirst({
    where: { id, workspaceId: w, projectId: p },
  });
  return d ?? unavailable();
}
async function artifact(
  tx: Tx,
  w: string,
  p: string,
  id: string,
  kind: string,
) {
  await tx.artifact.createMany({
    data: [{ id, workspaceId: w, projectId: p, kind }],
  });
}
export async function card(
  tx: Tx,
  w: string,
  p: string,
  id: string,
): Promise<ArtifactCard | null> {
  const a = await tx.artifact.findFirst({
    where: { id, workspaceId: w, projectId: p },
  });
  if (!a) return null;
  const base = prefix(w, p);
  let title = "",
    href = "",
    archived = false;
  if (a.kind === "source") {
    const s = await tx.source.findUnique({ where: { id } });
    if (!s) return null;
    title = s.title;
    href = base + "/sources/" + id;
    archived = !!s.archivedAt;
  }
  if (a.kind === "annotation") {
    const n = await tx.annotation.findUnique({ where: { id } });
    if (!n) return null;
    const s = await tx.source.findUnique({ where: { id: n.sourceId } });
    title = n.deletedAt
      ? "Removed PDF note"
      : `PDF note · ${s?.title ?? "Source"} · p. ${n.page}`;
    href =
      base +
      `/sources/${n.sourceId}/read?version=${n.versionId}&page=${n.page}&annotation=${id}`;
    archived = !!n.deletedAt || !!s?.archivedAt;
  }
  if (a.kind === "document") {
    const d = await tx.document.findUnique({ where: { id } });
    if (!d) return null;
    title = d.title;
    href = base + "/docs/" + id;
    archived = !!d.archivedAt;
  }
  if (a.kind === "task") {
    const t = await tx.task.findUnique({ where: { id } });
    if (!t) return null;
    title = t.title;
    href = base + "/tasks/" + id;
    archived = !!t.archivedAt;
  }
  if (a.kind === "discussion") {
    const d = await tx.discussion.findUnique({ where: { id } });
    if (!d) return null;
    title = d.title;
    href = base + "/discussions/" + id;
    archived = !!d.archivedAt;
  }
  return title ? { id, kind: a.kind, title, href, archived } : null;
}
async function link(
  tx: Tx,
  w: string,
  p: string,
  fromId: string,
  targetIds: string[],
) {
  for (const toId of new Set(targetIds)) {
    if (fromId === toId) continue;
    if (!(await card(tx, w, p, toId))) unavailable();
    await tx.artifactLink.createMany({
      data: [{ workspaceId: w, projectId: p, fromId, toId }],
      skipDuplicates: true,
    });
  }
}
async function linked(tx: Tx, w: string, p: string, id: string) {
  const ls = await tx.artifactLink.findMany({
    where: { workspaceId: w, projectId: p, OR: [{ fromId: id }, { toId: id }] },
    take: 100,
  });
  const rows = await Promise.all(
    [...new Set(ls.map((l) => (l.fromId === id ? l.toId : l.fromId)))].map(
      (i) => card(tx, w, p, i),
    ),
  );
  return rows.filter((c): c is ArtifactCard => !!c);
}
export function getLinks(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  id: string,
) {
  return research(db, a, w, p, false, async (tx) => {
    if (!(await card(tx, w, p, id))) unavailable();
    return linked(tx, w, p, id);
  });
}
async function createCitation(
  tx: Tx,
  w: string,
  p: string,
  documentId: string,
  input: z.infer<typeof originInput>,
) {
  const s = await tx.source.findFirst({
    where: { id: input.sourceId, workspaceId: w, projectId: p },
  });
  if (!s || s.archivedAt) unavailable();
  const annotation = input.annotationId
    ? await tx.annotation.findFirst({
        where: {
          id: input.annotationId,
          workspaceId: w,
          projectId: p,
          sourceId: s.id,
          deletedAt: null,
        },
      })
    : null;
  if (input.annotationId && !annotation) unavailable();
  const v = await tx.sourceVersion.findFirst({
    where: {
      workspaceId: w,
      projectId: p,
      sourceId: s.id,
      ...(annotation
        ? { id: annotation.versionId }
        : input.versionId
          ? { id: input.versionId }
          : {}),
    },
    orderBy: { ordinal: "desc" },
  });
  if (!v || (input.versionId && input.versionId !== v.id)) unavailable();
  const c = await tx.citation.create({
    data: {
      id: randomUUID(),
      workspaceId: w,
      projectId: p,
      documentId,
      sourceId: s.id,
      versionId: v.id,
      annotationId: annotation?.id ?? null,
      page: annotation?.page ?? null,
      quote: annotation?.quote ?? "",
    },
  });
  await link(tx, w, p, documentId, [
    s.id,
    ...(annotation ? [annotation.id] : []),
  ]);
  return { citation: c, annotation };
}
export async function citationViews(
  tx: Tx,
  w: string,
  p: string,
  documentId: string,
): Promise<CitationView[]> {
  const cs = await tx.citation.findMany({
    where: { workspaceId: w, projectId: p, documentId },
    orderBy: { createdAt: "asc" },
  });
  const sourceIds = [...new Set(cs.map((c) => c.sourceId))],
    ss = await tx.source.findMany({
      where: { id: { in: sourceIds }, workspaceId: w, projectId: p },
    }),
    ns = await tx.annotation.findMany({
      where: {
        id: { in: cs.flatMap((c) => (c.annotationId ? [c.annotationId] : [])) },
      },
    });
  return cs.map((c) => {
    const s = ss.find((s) => s.id === c.sourceId),
      n = ns.find((n) => n.id === c.annotationId);
    return {
      ...c,
      title: s?.title ?? "Unavailable source",
      authors: s?.authors ?? [],
      year: s?.year ?? null,
      venue: s?.venue ?? "",
      doi: s?.doi ?? null,
      url: s?.url ?? null,
      href:
        prefix(w, p) +
        `/sources/${c.sourceId}` +
        (c.page
          ? `/read?version=${c.versionId}&page=${c.page}` +
            (c.annotationId ? `&annotation=${c.annotationId}` : "")
          : ""),
      archived: !!s?.archivedAt || !!n?.deletedAt,
      unavailable: !s,
    };
  });
}
async function validateCitations(
  tx: Tx,
  w: string,
  p: string,
  d: string,
  body: DocNode,
) {
  const ids = citationIds(body);
  if (ids.length > 300) throw new AppError("INVALID_INPUT");
  if (
    ids.length !==
    (await tx.citation.count({
      where: { workspaceId: w, projectId: p, documentId: d, id: { in: ids } },
    }))
  )
    throw new AppError("INVALID_INPUT");
}
async function checkpoint(
  tx: Tx,
  a: Identity,
  d: Awaited<ReturnType<typeof documentRow>>,
) {
  await tx.documentVersion.createMany({
    data: [
      {
        id: randomUUID(),
        workspaceId: d.workspaceId,
        projectId: d.projectId,
        documentId: d.id,
        revision: d.revision,
        title: d.title,
        body: d.body as Prisma.InputJsonValue,
        createdBy: a.id,
      },
    ],
    skipDuplicates: true,
  });
}
export const documentListInput = z.object({
  archived: z.boolean().default(false),
  q: z.string().trim().max(200).default(""),
  sort: z.enum(["updated", "title"]).default("updated"),
  page: z.number().int().min(0).max(100000).default(0),
});
export function listDocuments(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  options: boolean | z.infer<typeof documentListInput> = false,
) {
  return research(db, a, w, p, false, async (tx, s) => {
    const filter =
      typeof options === "boolean"
        ? documentListInput.parse({ archived: options })
        : options;
    const pageSize = typeof options === "boolean" ? 200 : 30;
    const pattern = "%" + filter.q.replace(/[\\%_]/g, "\\$&") + "%";
    const matching = filter.q
      ? await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM app.documents d WHERE d."workspaceId"=${w}::uuid AND d."projectId"=${p}::uuid
      AND (d.title ILIKE ${pattern} OR (SELECT string_agg(t #>> '{}', ' ') FROM jsonb_path_query(d.body, '$.**.text') t) ILIKE ${pattern})
    `
      : null;
    const where = {
      workspaceId: w,
      projectId: p,
      archivedAt: filter.archived ? { not: null } : null,
      ...(matching ? { id: { in: matching.map((r) => r.id) } } : {}),
    };
    const [items, total] = await Promise.all([
      tx.document.findMany({
        where,
        orderBy:
          filter.sort === "title"
            ? [{ title: "asc" }, { id: "asc" }]
            : [{ updatedAt: "desc" }, { id: "asc" }],
        skip: filter.page * pageSize,
        take: pageSize,
        select: {
          id: true,
          title: true,
          body: true,
          revision: true,
          archivedAt: true,
          updatedAt: true,
        },
      }),
      tx.document.count({ where }),
    ]);
    return {
      items: items.map(({ body, ...d }) => ({
        ...d,
        preview: plainDocument(body as unknown as DocNode)
          .replace(/\s+/g, " ")
          .slice(0, 220),
      })),
      total,
      page: filter.page,
      pageSize,
      canEdit:
        ["owner", "admin", "editor"].includes(s.projectRole) &&
        !s.project.archivedAt &&
        !s.workspace.archivedAt,
      canManage:
        ["owner", "admin"].includes(s.projectRole) &&
        !s.project.archivedAt &&
        !s.workspace.archivedAt,
    };
  });
}
export function createDocument(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  input: z.infer<typeof createDocumentInput>,
) {
  return research(db, a, w, p, true, async (tx) => {
    const old = await tx.document.findFirst({
      where: {
        id: input.requestId,
        workspaceId: w,
        projectId: p,
        createdBy: a.id,
      },
    });
    if (old) return old;
    const id = input.requestId;
    await artifact(tx, w, p, id, "document");
    let d = await tx.document.create({
      data: {
        id,
        workspaceId: w,
        projectId: p,
        title: input.title,
        body: json(emptyDocument),
        createdBy: a.id,
      },
    });
    if (input.origin) {
      const { citation: c, annotation: n } = await createCitation(
        tx,
        w,
        p,
        id,
        input.origin,
      );
      const content: DocNode[] = [];
      if (n?.quote)
        content.push({
          type: "blockquote",
          content: [
            { type: "paragraph", content: [{ type: "text", text: n.quote }] },
          ],
        });
      if (n?.body)
        content.push({
          type: "paragraph",
          content: [{ type: "text", text: n.body }],
        });
      content.push(
        {
          type: "paragraph",
          content: [{ type: "citation", attrs: { id: c.id } }],
        },
        { type: "paragraph" },
      );
      d = await tx.document.update({
        where: { id },
        data: { body: json({ type: "doc", content }) },
      });
    }
    await checkpoint(tx, a, d);
    return d;
  });
}
export function getDocument(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  id: string,
) {
  return research(db, a, w, p, false, async (tx, s) => {
    const d = await documentRow(tx, w, p, id);
    return {
      document: d,
      citations: await citationViews(tx, w, p, id),
      versions: await tx.documentVersion.findMany({
        where: { documentId: id },
        select: {
          id: true,
          revision: true,
          title: true,
          createdAt: true,
          createdBy: true,
        },
        orderBy: { revision: "desc" },
        take: 100,
      }),
      links: await linked(tx, w, p, id),
      canEdit:
        ["owner", "admin", "editor"].includes(s.projectRole) &&
        !d.archivedAt &&
        !s.project.archivedAt &&
        !s.workspace.archivedAt,
      canManage: ["owner", "admin"].includes(s.projectRole),
    };
  });
}
export function addCitation(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  id: string,
  input: z.infer<typeof originInput>,
) {
  return research(db, a, w, p, true, async (tx) => {
    const d = await documentRow(tx, w, p, id);
    if (d.archivedAt) throw new AppError("ARCHIVED", 409);
    await createCitation(tx, w, p, id, input);
    return citationViews(tx, w, p, id);
  });
}
export function saveDocument(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  id: string,
  input: z.infer<typeof saveDocumentInput>,
) {
  let body: DocNode;
  try {
    body = cleanDocument(input.body);
  } catch {
    throw new AppError("INVALID_INPUT");
  }
  return research(db, a, w, p, true, async (tx) => {
    const d = await documentRow(tx, w, p, id);
    if (d.archivedAt) throw new AppError("ARCHIVED", 409);
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          title: input.title,
          body,
          revision: input.revision,
          checkpoint: input.checkpoint,
        }),
      )
      .digest("hex");
    const old = await tx.documentWrite.findUnique({
      where: {
        documentId_requestId: { documentId: id, requestId: input.requestId },
      },
    });
    if (old) {
      if (old.actorId !== a.id || old.hash !== hash)
        throw new AppError("CONFLICT", 409);
      return { revision: old.revision };
    }
    if (d.revision !== input.revision) conflict();
    await validateCitations(tx, w, p, id, body);
    if (input.checkpoint) await checkpoint(tx, a, d);
    const next = await tx.document.update({
      where: { id, revision: input.revision },
      data: {
        title: input.title,
        body: json(body),
        revision: { increment: 1 },
      },
    });
    const last = await tx.documentVersion.findFirst({
      where: { documentId: id },
      orderBy: { revision: "desc" },
    });
    if (
      input.checkpoint ||
      !last ||
      Date.now() - last.createdAt.getTime() >= 60000 ||
      last.createdBy !== a.id
    )
      await checkpoint(tx, a, next);
    await tx.documentWrite.createMany({
      data: [
        {
          id: randomUUID(),
          workspaceId: w,
          projectId: p,
          documentId: id,
          requestId: input.requestId,
          actorId: a.id,
          hash,
          revision: next.revision,
        },
      ],
    });
    return { revision: next.revision };
  });
}
export function getVersion(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  id: string,
  v: string,
) {
  return research(db, a, w, p, false, async (tx) => {
    await documentRow(tx, w, p, id);
    const version = await tx.documentVersion.findFirst({
      where: { id: v, documentId: id, workspaceId: w, projectId: p },
    });
    if (!version) unavailable();
    return { version, citations: await citationViews(tx, w, p, id) };
  });
}
export function restoreDocument(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  id: string,
  input: z.infer<typeof restoreInput>,
) {
  return research(db, a, w, p, true, async (tx) => {
    const d = await documentRow(tx, w, p, id);
    if (d.archivedAt) throw new AppError("ARCHIVED", 409);
    const hash = "restore:" + input.versionId + ":" + input.revision,
      old = await tx.documentWrite.findUnique({
        where: {
          documentId_requestId: { documentId: id, requestId: input.requestId },
        },
      });
    if (old) {
      if (old.actorId !== a.id || old.hash !== hash)
        throw new AppError("CONFLICT", 409);
      return { revision: old.revision };
    }
    if (d.revision !== input.revision) conflict();
    const v = await tx.documentVersion.findFirst({
      where: {
        id: input.versionId,
        documentId: id,
        workspaceId: w,
        projectId: p,
      },
    });
    if (!v) unavailable();
    await checkpoint(tx, a, d);
    const next = await tx.document.update({
      where: { id },
      data: {
        title: v.title,
        body: v.body as Prisma.InputJsonValue,
        revision: { increment: 1 },
      },
    });
    await checkpoint(tx, a, next);
    await tx.documentWrite.createMany({
      data: [
        {
          id: randomUUID(),
          workspaceId: w,
          projectId: p,
          documentId: id,
          requestId: input.requestId,
          actorId: a.id,
          hash,
          revision: next.revision,
        },
      ],
    });
    return { revision: next.revision };
  });
}
export function archiveArtifact(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  id: string,
  kind: "document" | "task",
  input: z.infer<typeof archiveInput>,
) {
  return research(db, a, w, p, true, async (tx, s) => {
    requireRole(s.projectRole, ["owner", "admin"]);
    const model = kind === "document" ? tx.document : tx.task;
    const row = await (kind === "document"
      ? tx.document.findFirst({ where: { id, workspaceId: w, projectId: p } })
      : tx.task.findFirst({ where: { id, workspaceId: w, projectId: p } }));
    if (!row) unavailable();
    if (row.revision !== input.revision) conflict();
    const data = {
      archivedAt: input.archived ? new Date() : null,
      revision: { increment: 1 },
    };
    void model;
    return kind === "document"
      ? tx.document.update({ where: { id }, data })
      : tx.task.update({ where: { id }, data });
  });
}
export function exportDocument(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  id: string,
) {
  return research(db, a, w, p, false, async (tx) => {
    const d = await documentRow(tx, w, p, id),
      body = d.body as unknown as DocNode,
      refs = await citationViews(tx, w, p, id),
      order = citationIds(body),
      selected = order.flatMap((id) => refs.find((c) => c.id === id) ?? []),
      numbers = new Map(order.map((id, i) => [id, i + 1]));
    const manifest = {
      format: "atlas-document-v1",
      documentId: id,
      revision: d.revision,
      references: selected.map((c, i) => ({
        number: i + 1,
        citationId: c.id,
        sourceId: c.sourceId,
        versionId: c.versionId,
        annotationId: c.annotationId,
        pageId: c.pageId,
        start: c.start,
        end: c.end,
        page: c.page,
        quote: c.quote,
        archived: c.archived,
      })),
    };
    const markdown =
      "# " +
      escapeMd(d.title) +
      "\n\n" +
      documentMarkdown(body, numbers) +
      "\n## References\n\n" +
      selected
        .map(
          (c, i) =>
            `[${i + 1}] ${escapeMd(c.authors.join("; "))} (${c.year ?? "n.d."}). ${escapeMd(c.title)}. ${escapeMd(c.venue)}.${c.doi ? " DOI: " + escapeMd(c.doi) : ""}${c.page ? " p. " + c.page : ""}${c.archived ? " [archived/removed target]" : ""}\n`,
        )
        .join("\n") +
      "\n## Reference manifest\n\n```json\n" +
      JSON.stringify(manifest, null, 2) +
      "\n```\n";
    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${
          d.title
            .normalize("NFKD")
            .replace(/[^a-zA-Z0-9 _-]/g, "")
            .trim()
            .replace(/\s+/g, "-")
            .slice(0, 90) || "atlas-document"
        }.md"; filename*=UTF-8''${encodeURIComponent(d.title.replace(/[\u0000-\u001f\u007f/\\]/g, "-").slice(0, 120) + ".md").replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16))}`,
        "X-Atlas-Revision": String(d.revision),
        "Cache-Control": "private, no-store",
      },
    });
  });
}
async function eligible(
  tx: Tx,
  w: string,
  p: string,
  u: string,
  editing = false,
) {
  const [r] = await tx.$queryRaw<
    { ok: boolean }[]
  >`SELECT app.eligible_member(${w}::uuid,${p}::uuid,${u},${editing}) AS ok`;
  return !!r?.ok;
}
async function notify(
  tx: Tx,
  w: string,
  p: string,
  targetId: string,
  recipientId: string,
  event: "assignment" | "reply" | "mention",
  eventId: string,
) {
  if (!(await eligible(tx, w, p, recipientId))) return;
  await tx.notification.createMany({
    data: [
      {
        id: randomUUID(),
        workspaceId: w,
        projectId: p,
        targetId,
        recipientId,
        event,
        eventId,
      },
    ],
    skipDuplicates: true,
  });
}
export function listTasks(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  options: boolean | z.infer<typeof taskListInput> = false,
) {
  return research(db, a, w, p, false, async (tx, s) => {
    const canEdit =
      ["owner", "admin", "editor"].includes(s.projectRole) &&
      !s.project.archivedAt &&
      !s.workspace.archivedAt;
    if (typeof options === "boolean")
      return {
        items: await tx.task.findMany({
          where: {
            workspaceId: w,
            projectId: p,
            archivedAt: options ? { not: null } : null,
          },
          orderBy: { updatedAt: "desc" },
          take: 300,
        }),
        canEdit,
        canManage: ["owner", "admin"].includes(s.projectRole),
      };
    const f = options,
      pattern = "%" + f.q.replace(/[\\%_]/g, (m) => "\\" + m) + "%",
      clauses = [
        Prisma.sql`"workspaceId"=${w}::uuid`,
        Prisma.sql`"projectId"=${p}::uuid`,
        f.archived
          ? Prisma.sql`"archivedAt" IS NOT NULL`
          : Prisma.sql`"archivedAt" IS NULL`,
      ];
    if (f.q)
      clauses.push(
        Prisma.sql`(title ILIKE ${pattern} OR description ILIKE ${pattern})`,
      );
    if (f.status) clauses.push(Prisma.sql`status=${f.status}`);
    if (f.assignee)
      clauses.push(
        f.assignee === "none"
          ? Prisma.sql`"assigneeId" IS NULL`
          : Prisma.sql`"assigneeId"=${f.assignee === "mine" ? a.id : f.assignee}`,
      );
    if (f.priority) clauses.push(Prisma.sql`priority=${f.priority}`);
    if (!f.completed) clauses.push(Prisma.sql`status<>'done'`);
    const after = (n: number) => {
      const [y, m, d] = f.today.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
    };
    if (f.due === "none") clauses.push(Prisma.sql`"dueDate" IS NULL`);
    else if (f.due) {
      clauses.push(Prisma.sql`status<>'done'`);
      if (f.due === "overdue") clauses.push(Prisma.sql`"dueDate"<${f.today}`);
      else if (f.due === "upcoming")
        clauses.push(
          Prisma.sql`"dueDate">=${f.today} AND "dueDate"<=${after(7)}`,
        );
      else
        clauses.push(
          Prisma.sql`"dueDate"=${f.due === "today" ? f.today : after(1)}`,
        );
    }
    const where = Prisma.join(clauses, " AND "),
      counts = Object.fromEntries(
        ["backlog", "in_progress", "in_review", "done"].map((k) => [k, 0]),
      );
    for (const row of await tx.$queryRaw<{ status: string; count: number }[]>(
      Prisma.sql`SELECT status,count(*)::int AS count FROM app.tasks WHERE ${where} GROUP BY status`,
    ))
      counts[row.status] = row.count;
    const order =
      f.sort === "priority"
        ? Prisma.sql`CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,position,id`
        : f.sort === "due"
          ? Prisma.sql`"dueDate" ASC NULLS LAST,position,id`
          : f.sort === "title"
            ? Prisma.sql`title,id`
            : f.sort === "updated"
              ? Prisma.sql`"updatedAt" DESC,id`
              : Prisma.sql`position,id`;
    const pages = f.columns.split(",").map((n) => Math.min(100000, Number(n))),
      pageSize = f.view === "board" ? 30 : 50;
    const groups =
      f.view === "board"
        ? await Promise.all(
            Object.keys(counts).map((status, i) =>
              tx.$queryRaw<{ id: string }[]>(
                Prisma.sql`SELECT id FROM app.tasks WHERE ${where} AND status=${status} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${pages[i] * pageSize}`,
              ),
            ),
          )
        : [
            await tx.$queryRaw<{ id: string }[]>(
              Prisma.sql`SELECT id FROM app.tasks WHERE ${where} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${f.page * pageSize}`,
            ),
          ];
    const taskIds = groups.flat().map((r) => r.id),
      rows = await tx.task.findMany({
        where: { workspaceId: w, projectId: p, id: { in: taskIds } },
      }),
      edges = await tx.artifactLink.findMany({
        where: {
          workspaceId: w,
          projectId: p,
          OR: [{ fromId: { in: taskIds } }, { toId: { in: taskIds } }],
        },
      }),
      others = [...new Set(edges.flatMap((e) => [e.fromId, e.toId]))],
      kinds = await tx.artifact.findMany({
        where: { workspaceId: w, projectId: p, id: { in: others } },
        select: { id: true, kind: true },
      });
    return {
      items: taskIds.flatMap((id) => {
        const t = rows.find((t) => t.id === id);
        if (!t) return [];
        const linked = [
          ...new Set(
            edges
              .filter((e) => e.fromId === id || e.toId === id)
              .map((e) => (e.fromId === id ? e.toId : e.fromId)),
          ),
        ];
        return [
          {
            ...t,
            linkCount: linked.length,
            linkKinds: [
              ...new Set(
                linked.flatMap(
                  (id) => kinds.find((k) => k.id === id)?.kind ?? [],
                ),
              ),
            ],
          },
        ];
      }),
      counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      pageSize,
      canEdit,
      canManage: canEdit && ["owner", "admin"].includes(s.projectRole),
    };
  });
}
async function taskPosition(
  tx: Tx,
  w: string,
  p: string,
  status: string,
  beforeId: string | null,
  exclude: string,
): Promise<number> {
  const where = {
    workspaceId: w,
    projectId: p,
    status,
    archivedAt: null,
    id: { not: exclude },
  };
  const anchor = beforeId
    ? await tx.task.findFirst({ where: { ...where, id: beforeId } })
    : null;
  if (beforeId && !anchor) unavailable();
  const previous = await tx.task.findFirst({
    where: {
      ...where,
      ...(anchor ? { position: { lt: anchor.position } } : {}),
    },
    orderBy: [{ position: "desc" }, { id: "desc" }],
  });
  if (!anchor) return (previous?.position ?? 0) + 1024;
  const lo = previous?.position ?? anchor.position - 2048,
    position = (lo + anchor.position) / 2;
  if (
    Number.isFinite(position) &&
    position > lo &&
    position < anchor.position &&
    anchor.position - lo > 0.000001
  )
    return position;
  // Rare fractional exhaustion: preserve relative order, timestamps and revisions while spacing the column.
  await tx.$executeRaw`WITH ordered AS (SELECT id,row_number() OVER(ORDER BY position,id)*1024 AS n FROM app.tasks WHERE "workspaceId"=${w}::uuid AND "projectId"=${p}::uuid AND status=${status} AND "archivedAt" IS NULL AND id<>${exclude}::uuid) UPDATE app.tasks t SET position=o.n FROM ordered o WHERE t.id=o.id`;
  return taskPosition(tx, w, p, status, beforeId, exclude);
}
async function taskAfter(
  tx: Tx,
  w: string,
  p: string,
  status: string,
  afterId: string,
  exclude: string,
) {
  const anchor = await tx.task.findFirst({
    where: {
      id: afterId,
      workspaceId: w,
      projectId: p,
      status,
      archivedAt: null,
    },
  });
  if (!anchor || anchor.id === exclude) unavailable();
  const next = await tx.task.findFirst({
    where: {
      workspaceId: w,
      projectId: p,
      status,
      archivedAt: null,
      id: { not: exclude },
      position: { gt: anchor.position },
    },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });
  return next?.id ?? null;
}
export function changeTask(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  id: string,
  input: z.infer<typeof taskChangeInput> | z.infer<typeof taskMoveInput>,
) {
  return research(db, a, w, p, true, async (tx, s) => {
    const t = await tx.task.findFirst({
      where: { id, workspaceId: w, projectId: p },
    });
    if (!t) unavailable();
    const hash = createHash("sha256")
        .update(JSON.stringify(input))
        .digest("hex"),
      old = await tx.taskWrite.findUnique({
        where: { taskId_requestId: { taskId: id, requestId: input.requestId } },
      });
    if (old) {
      if (old.actorId !== a.id || old.hash !== hash) conflict();
      return t;
    }
    if (t.revision !== input.revision) conflict();
    let data: Prisma.TaskUpdateInput = {};
    let links: string[] = [];
    if (input.action === "move") {
      if (t.archivedAt) throw new AppError("ARCHIVED", 409);
      data = {
        status: input.status,
        position: await taskPosition(
          tx,
          w,
          p,
          input.status,
          input.afterId
            ? await taskAfter(tx, w, p, input.status, input.afterId, id)
            : input.beforeId,
          id,
        ),
      };
    } else {
      const { archived, links: targets, ...fields } = input.changes;
      if (
        t.archivedAt &&
        !(archived === false && Object.keys(input.changes).length === 1)
      )
        throw new AppError("ARCHIVED", 409);
      if (archived !== undefined) {
        requireRole(s.projectRole, ["owner", "admin"]);
        data.archivedAt = archived ? new Date() : null;
      }
      if (
        fields.assigneeId &&
        !(await eligible(tx, w, p, fields.assigneeId, true))
      )
        throw new AppError("INVALID_INPUT");
      Object.assign(data, fields);
      links = targets ?? [];
      if (fields.status && fields.status !== t.status)
        data.position = await taskPosition(tx, w, p, fields.status, null, id);
    }
    await link(tx, w, p, id, links);
    const next = await tx.task.update({
      where: { id, revision: input.revision },
      data: { ...data, revision: { increment: 1 } },
    });
    if (next.assigneeId && next.assigneeId !== t.assigneeId)
      await notify(
        tx,
        w,
        p,
        id,
        next.assigneeId,
        "assignment",
        `task:${id}:${next.revision}`,
      );
    await tx.taskWrite.create({
      data: {
        taskId: id,
        requestId: input.requestId,
        workspaceId: w,
        projectId: p,
        actorId: a.id,
        hash,
        revision: next.revision,
      },
    });
    return next;
  });
}
export function createTask(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  input: z.infer<typeof taskInput>,
) {
  return research(db, a, w, p, true, async (tx) => {
    const old = await tx.task.findFirst({
      where: {
        id: input.requestId,
        workspaceId: w,
        projectId: p,
        createdBy: a.id,
      },
    });
    if (old) return old;
    if (input.assigneeId && !(await eligible(tx, w, p, input.assigneeId, true)))
      throw new AppError("INVALID_INPUT");
    const { requestId, links, ...data } = input;
    await artifact(tx, w, p, requestId, "task");
    const task = await tx.task.create({
      data: {
        id: requestId,
        workspaceId: w,
        projectId: p,
        createdBy: a.id,
        ...data,
        position: await taskPosition(tx, w, p, data.status, null, requestId),
      },
    });
    await link(tx, w, p, task.id, links);
    if (task.assigneeId)
      await notify(
        tx,
        w,
        p,
        task.id,
        task.assigneeId,
        "assignment",
        `task:${task.id}:1`,
      );
    return task;
  });
}
export function getTask(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  id: string,
) {
  return research(db, a, w, p, false, async (tx, s) => {
    const task = await tx.task.findFirst({
      where: { id, workspaceId: w, projectId: p },
    });
    if (!task) unavailable();
    return {
      task,
      links: await linked(tx, w, p, id),
      canEdit:
        ["owner", "admin", "editor"].includes(s.projectRole) &&
        !task.archivedAt &&
        !s.project.archivedAt &&
        !s.workspace.archivedAt,
      canManage: ["owner", "admin"].includes(s.projectRole),
    };
  });
}
export function editTask(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  id: string,
  input: z.infer<typeof taskEditInput>,
) {
  return research(db, a, w, p, true, async (tx) => {
    const t = await tx.task.findFirst({
      where: { id, workspaceId: w, projectId: p },
    });
    if (!t) unavailable();
    if (t.archivedAt) throw new AppError("ARCHIVED", 409);
    if (t.revision !== input.revision) conflict();
    if (input.assigneeId && !(await eligible(tx, w, p, input.assigneeId, true)))
      throw new AppError("INVALID_INPUT");
    const { revision: _, ...data } = input;
    void _;
    const next = await tx.task.update({
      where: { id },
      data: {
        ...data,
        ...(data.status !== t.status
          ? { position: await taskPosition(tx, w, p, data.status, null, id) }
          : {}),
        revision: { increment: 1 },
      },
    });
    if (next.assigneeId && next.assigneeId !== t.assigneeId)
      await notify(
        tx,
        w,
        p,
        id,
        next.assigneeId,
        "assignment",
        `task:${id}:${next.revision}`,
      );
    return next;
  });
}
export const discussionListInput = z
  .object({
    q: z.string().trim().max(200).default(""),
    page: z.number().int().min(0).max(100000).default(0),
    archived: z.boolean().default(false),
  })
  .strict();
export const discussionPageInput = z
  .object({ before: z.uuid().optional(), after: z.uuid().optional() })
  .refine((v) => !(v.before && v.after));
export const discussionEditInput = z
  .object({
    revision,
    title: title.optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.title !== undefined || v.archived !== undefined);
export function listDiscussions(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  options?: z.infer<typeof discussionListInput>,
) {
  return research(db, a, w, p, false, async (tx, s) => {
    const where = {
      workspaceId: w,
      projectId: p,
      archivedAt: options?.archived ? { not: null } : null,
      ...(options?.q
        ? { title: { contains: options.q, mode: "insensitive" as const } }
        : {}),
    };
    const [items, total] = await Promise.all([
      tx.discussion.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: options ? 30 : 200,
        skip: (options?.page ?? 0) * 30,
      }),
      tx.discussion.count({ where }),
    ]);
    return {
      items,
      total,
      pageSize: 30,
      canEdit:
        ["owner", "admin", "editor"].includes(s.projectRole) &&
        !s.project.archivedAt &&
        !s.workspace.archivedAt,
    };
  });
}
export function editDiscussion(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  id: string,
  input: z.infer<typeof discussionEditInput>,
) {
  return research(db, a, w, p, true, async (tx, s) => {
    const d = await tx.discussion.findFirst({
      where: { id, workspaceId: w, projectId: p },
    });
    if (!d) unavailable();
    if (d.revision !== input.revision) conflict();
    if (
      input.title !== undefined &&
      d.createdBy !== a.id &&
      !["owner", "admin"].includes(s.projectRole)
    )
      unavailable();
    if (input.archived !== undefined)
      requireRole(s.projectRole, ["owner", "admin"]);
    await audit(
      tx,
      a,
      w,
      p,
      input.archived === undefined
        ? "discussion_renamed"
        : "discussion_archived",
      id,
    );
    return tx.discussion.update({
      where: { id, revision: input.revision },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.archived !== undefined
          ? { archivedAt: input.archived ? new Date() : null }
          : {}),
        revision: { increment: 1 },
      },
    });
  });
}
async function send(
  tx: Tx,
  a: Identity,
  w: string,
  p: string,
  d: string,
  input: z.infer<typeof messageInput>,
) {
  const old = await tx.message.findUnique({
    where: {
      discussionId_authorId_clientId: {
        discussionId: d,
        authorId: a.id,
        clientId: input.clientId,
      },
    },
  });
  if (old) {
    if (
      old.body !== input.body ||
      JSON.stringify(old.artifactIds) !==
        JSON.stringify([...new Set(input.links)])
    )
      throw new AppError("CONFLICT", 409);
    return old;
  }
  const thread = await tx.discussion.findFirst({
    where: { id: d, workspaceId: w, projectId: p },
  });
  if (!thread) unavailable();
  if (thread.archivedAt) throw new AppError("ARCHIVED", 409);
  for (const id of input.mentions)
    if (!(await eligible(tx, w, p, id))) throw new AppError("INVALID_INPUT");
  await link(tx, w, p, d, input.links);
  const recipients = new Set([
    thread.createdBy,
    ...(
      await tx.message.findMany({
        where: { discussionId: d },
        select: { authorId: true },
        distinct: ["authorId"],
      })
    ).map((m) => m.authorId),
  ]);
  const message = await tx.message.create({
    data: {
      id: randomUUID(),
      workspaceId: w,
      projectId: p,
      discussionId: d,
      authorId: a.id,
      clientId: input.clientId,
      body: input.body,
      artifactIds: [...new Set(input.links)],
      mentions: [...new Set(input.mentions)],
    },
  });
  await tx.discussion.update({
    where: { id: d },
    data: { updatedAt: new Date() },
  });
  for (const recipient of new Set([...recipients, ...input.mentions]))
    if (recipient !== a.id)
      await notify(
        tx,
        w,
        p,
        d,
        recipient,
        input.mentions.includes(recipient) ? "mention" : "reply",
        `message:${message.id}`,
      );
  return message;
}
export function createDiscussion(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  input: z.infer<typeof discussionInput>,
) {
  return research(db, a, w, p, true, async (tx) => {
    const old = await tx.discussion.findFirst({
      where: {
        id: input.requestId,
        workspaceId: w,
        projectId: p,
        createdBy: a.id,
      },
    });
    if (old) return old;
    await artifact(tx, w, p, input.requestId, "discussion");
    const d = await tx.discussion.create({
      data: {
        id: input.requestId,
        workspaceId: w,
        projectId: p,
        title: input.title,
        createdBy: a.id,
      },
    });
    await send(tx, a, w, p, d.id, {
      clientId: input.requestId,
      body: input.body,
      links: input.links,
      mentions: input.mentions,
    });
    return d;
  });
}
export function getDiscussion(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  id: string,
  page?: z.infer<typeof discussionPageInput>,
) {
  return research(db, a, w, p, false, async (tx, s) => {
    const discussion = await tx.discussion.findFirst({
      where: { id, workspaceId: w, projectId: p },
    });
    if (!discussion) unavailable();
    const anchorId = page?.before ?? page?.after;
    const anchor = anchorId
      ? await tx.message.findFirst({
          where: {
            id: anchorId,
            discussionId: id,
            workspaceId: w,
            projectId: p,
          },
        })
      : null;
    if (anchorId && !anchor) unavailable();
    const newer = !!page?.after;
    const comparison = newer ? Prisma.sql`>` : Prisma.sql`<`,
      direction = page && !newer ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    const picked = page
      ? await tx.$queryRaw<{ id: string; orderStamp: string }[]>(
          Prisma.sql`SELECT id,to_char("createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "orderStamp" FROM app.messages WHERE "workspaceId"=${w}::uuid AND "projectId"=${p}::uuid AND "discussionId"=${id}::uuid ${anchor ? Prisma.sql`AND ("createdAt",id) ${comparison} (SELECT "createdAt",id FROM app.messages WHERE id=${anchor.id}::uuid AND "discussionId"=${id}::uuid)` : Prisma.empty} ORDER BY "createdAt" ${direction},id ${direction} LIMIT 51`,
        )
      : null;
    const rows = await tx.message.findMany({
      where: {
        workspaceId: w,
        projectId: p,
        discussionId: id,
        ...(picked ? { id: { in: picked.map((r) => r.id) } } : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      ...(!picked ? { take: 500 } : {}),
    });
    const messages = picked
      ? picked.flatMap((r) => {
          const m = rows.find((m) => m.id === r.id);
          return m ? [{ ...m, orderStamp: r.orderStamp }] : [];
        })
      : rows;
    const hasMore = !!page && messages.length > 50;
    if (page && hasMore) messages.pop();
    if (page && !newer) messages.reverse();
    const targets = [...new Set(messages.flatMap((m) => m.artifactIds))];
    const resolved = page
      ? await Promise.all(targets.map((target) => card(tx, w, p, target)))
      : [];
    const withCards = messages.map((m) => ({
      ...m,
      ...(page
        ? {
            links: resolved.filter(
              (c): c is NonNullable<typeof c> =>
                !!c && m.artifactIds.includes(c.id),
            ),
          }
        : {}),
    }));
    return {
      discussion,
      messages: withCards,
      total: await tx.message.count({
        where: { workspaceId: w, projectId: p, discussionId: id },
      }),
      hasMoreBefore: page ? !newer && hasMore : false,
      hasMoreAfter: page ? newer && hasMore : false,
      links: await linked(tx, w, p, id),
      canEdit:
        ["owner", "admin", "editor"].includes(s.projectRole) &&
        !discussion.archivedAt &&
        !s.project.archivedAt &&
        !s.workspace.archivedAt,
      canManage: ["owner", "admin"].includes(s.projectRole),
      canRename:
        !discussion.archivedAt &&
        (discussion.createdBy === a.id ||
          ["owner", "admin"].includes(s.projectRole)) &&
        ["owner", "admin", "editor"].includes(s.projectRole) &&
        !s.project.archivedAt &&
        !s.workspace.archivedAt,
    };
  });
}
export function sendMessage(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  id: string,
  input: z.infer<typeof messageInput>,
) {
  return research(db, a, w, p, true, (tx) => send(tx, a, w, p, id, input));
}
export function getMessage(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  d: string,
  id: string,
) {
  return research(db, a, w, p, false, async (tx) => {
    const m = await tx.message.findFirst({
      where: { id, workspaceId: w, projectId: p, discussionId: d },
    });
    if (!m) unavailable();
    return m;
  });
}
export function editMessage(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  d: string,
  id: string,
  input: z.infer<typeof messageEditInput>,
) {
  return research(db, a, w, p, true, async (tx, s) => {
    const m = await tx.message.findFirst({
      where: { id, discussionId: d, workspaceId: w, projectId: p },
    });
    if (
      !m ||
      (m.authorId !== a.id && !["owner", "admin"].includes(s.projectRole))
    )
      unavailable();
    const thread = await tx.discussion.findFirst({
      where: { id: d, workspaceId: w, projectId: p },
    });
    if (!thread || thread.archivedAt) throw new AppError("ARCHIVED", 409);
    if (m.revision !== input.revision) conflict();
    await audit(
      tx,
      a,
      w,
      p,
      m.authorId === a.id ? "message_edited" : "message_moderated",
      id,
    );
    return tx.message.update({
      where: { id },
      data: {
        body: input.body,
        revision: { increment: 1 },
        editedAt: new Date(),
      },
    });
  });
}
export function artifactOptions(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  query?: string,
  selected: string[] = [],
) {
  return research(db, a, w, p, false, async (tx) => {
    if (query !== undefined) {
      const like = "%" + query.replace(/[\\%_]/g, (m) => "\\" + m) + "%";
      const found = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM (
        SELECT id,"createdAt" FROM app.documents WHERE "workspaceId"=${w}::uuid AND "projectId"=${p}::uuid AND "archivedAt" IS NULL AND title ILIKE ${like}
        UNION ALL SELECT id,"createdAt" FROM app.sources WHERE "workspaceId"=${w}::uuid AND "projectId"=${p}::uuid AND "archivedAt" IS NULL AND title ILIKE ${like}
        UNION ALL SELECT id,"createdAt" FROM app.tasks WHERE "workspaceId"=${w}::uuid AND "projectId"=${p}::uuid AND "archivedAt" IS NULL AND title ILIKE ${like}
        UNION ALL SELECT id,"createdAt" FROM app.discussions WHERE "workspaceId"=${w}::uuid AND "projectId"=${p}::uuid AND "archivedAt" IS NULL AND title ILIKE ${like}
        UNION ALL SELECT n.id,n."createdAt" FROM app.annotations n JOIN app.sources s ON s.id=n."sourceId" WHERE n."workspaceId"=${w}::uuid AND n."projectId"=${p}::uuid AND n."deletedAt" IS NULL AND (n.body ILIKE ${like} OR n.quote ILIKE ${like} OR s.title ILIKE ${like})
      ) x ORDER BY "createdAt" DESC,id LIMIT 50`;
      const cards = await Promise.all(
        [...new Set([...selected, ...found.map((r) => r.id)])].map((id) =>
          card(tx, w, p, id),
        ),
      );
      return cards.filter((c): c is ArtifactCard => !!c);
    }
    const rows = await tx.artifact.findMany({
      where: { workspaceId: w, projectId: p },
      orderBy: { createdAt: "desc" },
      take: 150,
    });
    const cs = await Promise.all(rows.map((r) => card(tx, w, p, r.id)));
    return cs.filter((c): c is ArtifactCard => !!c && !c.archived);
  });
}
export async function inbox(db: Database, a: Identity) {
  const rows = await asIdentity(db, a, (tx) =>
    tx.notification.findMany({
      where: { recipientId: a.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  );
  const items = [];
  for (const n of rows) {
    let target: ArtifactCard | null = null;
    try {
      target = await inProject(db, a, n.workspaceId, n.projectId, false, (tx) =>
        card(tx, n.workspaceId, n.projectId, n.targetId),
      );
    } catch (e) {
      if (!(e instanceof AppError && e.code === "UNAVAILABLE")) throw e;
    }
    items.push({
      id: n.id,
      event: n.event,
      readAt: n.readAt,
      createdAt: n.createdAt,
      target,
    });
  }
  return items;
}
export function markNotification(
  db: Database,
  a: Identity,
  id: string,
  read: boolean,
) {
  return asIdentity(db, a, async (tx) => {
    const result = await tx.notification.updateMany({
      where: { id, recipientId: a.id },
      data: { readAt: read ? new Date() : null },
    });
    if (!result.count) unavailable();
    return { ok: true };
  });
}
