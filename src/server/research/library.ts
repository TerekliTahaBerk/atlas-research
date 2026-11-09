import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import type { Database } from "../db/client";
import type { Identity } from "../auth/identity";
import { inProject, requireRole, type Tx } from "../domain/access";
import { AppError } from "../errors";
import { cleanMetadata } from "./metadata";
export function research<T>(
  db: Database,
  actor: Identity,
  w: string,
  p: string,
  write: boolean,
  fn: (tx: Tx, scope: { projectRole: string }) => Promise<T>,
) {
  return inProject(db, actor, w, p, write, async (tx, scope) => {
    if (write) {
      requireRole(scope.projectRole, ["owner", "admin", "editor"]);
      if (
        scope.project.archivedAt ||
        scope.project.deletedAt ||
        scope.workspace.archivedAt
      )
        throw new AppError("ARCHIVED", 409);
    }
    return fn(tx, scope);
  });
}
const jobSelect = {
  versionId: true,
  state: true,
  error: true,
  attempts: true,
  createdAt: true,
} as const;
export async function sourceRow(tx: Tx, w: string, p: string, id: string) {
  const source = await tx.source.findFirst({
    where: { id, workspaceId: w, projectId: p },
  });
  if (!source) throw new AppError("UNAVAILABLE", 404);
  return source;
}
export function listLibrary(
  db: Database,
  actor: Identity,
  w: string,
  p: string,
  query: string,
  page: number,
  filters: { collection?: string; tag?: string; status?: string } = {},
) {
  return research(db, actor, w, p, false, async (tx, scope) => {
    const found = query
      ? await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM app.sources WHERE "workspaceId"=${w}::uuid AND "projectId"=${p}::uuid AND (to_tsvector('simple',"searchText")@@plainto_tsquery('simple',${query}) OR "searchText" ILIKE ${"%" + query.replace(/[\\%_]/g, (m) => "\\" + m) + "%"})`
      : null;
    const and: Prisma.SourceWhereInput[] = [];
    if (found) and.push({ id: { in: found.map((v) => v.id) } });
    if (filters.collection) {
      const links = await tx.sourceCollection.findMany({
        where: {
          workspaceId: w,
          projectId: p,
          collectionId: filters.collection,
        },
        select: { sourceId: true },
      });
      and.push({ id: { in: links.map((v) => v.sourceId) } });
    }
    if (filters.tag) and.push({ tags: { has: filters.tag } });
    if (filters.status) {
      const readings = await tx.readingState.findMany({
        where: {
          workspaceId: w,
          projectId: p,
          userId: actor.id,
          ...(filters.status === "unread"
            ? { status: { not: "unread" } }
            : { status: filters.status }),
        },
        select: { sourceId: true },
      });
      and.push({
        id:
          filters.status === "unread"
            ? { notIn: readings.map((v) => v.sourceId) }
            : { in: readings.map((v) => v.sourceId) },
      });
    }
    const items = await tx.source.findMany({
      where: { workspaceId: w, projectId: p, archivedAt: null, AND: and },
      orderBy: { updatedAt: "desc" },
      skip: page * 30,
      take: 31,
    });
    const ids = items.slice(0, 30).map((s) => s.id);
    return {
      items: items.slice(0, 30),
      hasMore: items.length > 30,
      versions: await tx.sourceVersion.findMany({
        where: { sourceId: { in: ids } },
        orderBy: { ordinal: "desc" },
      }),
      readings: await tx.readingState.findMany({
        where: { sourceId: { in: ids }, userId: actor.id },
      }),
      collections: await tx.collection.findMany({
        where: { workspaceId: w, projectId: p },
        orderBy: { name: "asc" },
      }),
      links: await tx.sourceCollection.findMany({
        where: { workspaceId: w, projectId: p },
      }),
      tags: [
        ...new Set(
          (
            await tx.source.findMany({
              where: { workspaceId: w, projectId: p },
              select: { tags: true },
            })
          ).flatMap((s) => s.tags),
        ),
      ].sort(),
      role: scope.projectRole,
      canEdit: ["owner", "admin", "editor"].includes(scope.projectRole),
      storageAvailable: !!process.env.FILE_STORAGE_PATH,
    };
  });
}
export function addSource(
  db: Database,
  actor: Identity,
  w: string,
  p: string,
  raw: unknown,
) {
  const input = cleanMetadata(raw);
  return research(db, actor, w, p, true, async (tx) => {
    const choices: Prisma.SourceWhereInput[] = [];
    if (input.doi) choices.push({ doi: input.doi });
    if (input.url) choices.push({ url: input.url });
    const existing = choices.length
      ? await tx.source.findFirst({
          where: { workspaceId: w, projectId: p, OR: choices },
        })
      : null;
    if (existing) return { source: existing, duplicate: true };
    const id = randomUUID();
    await tx.artifact.createMany({
      data: [{ id, workspaceId: w, projectId: p, kind: "source" }],
    });
    const { provider, ...metadata } = input;
    const source = await tx.source.create({
      data: {
        id,
        workspaceId: w,
        projectId: p,
        ...metadata,
        tags: [],
        createdBy: actor.id,
        provenance: {
          method: "user-confirmed",
          provider,
          importedAt: new Date().toISOString(),
        },
      },
    });
    await tx.sourceVersion.createMany({
      data: [
        {
          id: randomUUID(),
          workspaceId: w,
          projectId: p,
          sourceId: id,
          ordinal: 1,
          metadata: metadata as Prisma.InputJsonValue,
        },
      ],
    });
    return { source, duplicate: false };
  });
}
export function getSource(
  db: Database,
  actor: Identity,
  w: string,
  p: string,
  id: string,
) {
  return research(db, actor, w, p, false, async (tx, scope) => {
    const source = await sourceRow(tx, w, p, id),
      versions = await tx.sourceVersion.findMany({
        where: { workspaceId: w, projectId: p, sourceId: id },
        orderBy: { ordinal: "desc" },
      });
    return {
      source,
      versions,
      files: await tx.fileObject.findMany({
        where: {
          id: { in: versions.flatMap((v) => (v.fileId ? [v.fileId] : [])) },
        },
      }),
      annotations: await tx.annotation.findMany({
        where: { sourceId: id, deletedAt: null },
        orderBy: [{ page: "asc" }, { createdAt: "asc" }],
      }),
      reading: await tx.readingState.findUnique({
        where: { sourceId_userId: { sourceId: id, userId: actor.id } },
      }),
      collections: await tx.collection.findMany({
        where: { workspaceId: w, projectId: p },
        orderBy: { name: "asc" },
      }),
      collectionIds: (
        await tx.sourceCollection.findMany({ where: { sourceId: id } })
      ).map((v) => v.collectionId),
      role: scope.projectRole,
      canEdit:
        ["owner", "admin", "editor"].includes(scope.projectRole) &&
        !source.archivedAt,
      storageAvailable: !!process.env.FILE_STORAGE_PATH,
      jobs: await tx.fileJob.findMany({
        where: { versionId: { in: versions.map((v) => v.id) } },
        select: jobSelect,
        orderBy: { createdAt: "desc" },
      }),
    };
  });
}
export const editSourceInput = z
  .object({
    action: z.literal("metadata"),
    metadata: z.unknown(),
    tags: z.array(z.string().trim().min(1).max(40)).max(30),
    collectionIds: z.array(z.uuid()).max(50),
    revision: z.number().int().min(1),
  })
  .strict();
export function editSource(
  db: Database,
  actor: Identity,
  w: string,
  p: string,
  id: string,
  raw: z.infer<typeof editSourceInput>,
) {
  const input = cleanMetadata(raw.metadata);
  return research(db, actor, w, p, true, async (tx) => {
    const source = await sourceRow(tx, w, p, id);
    if (source.revision !== raw.revision)
      throw new AppError("REVISION_CONFLICT", 409);
    const { provider: _, ...metadata } = input;
    void _;
    const duplicate = await tx.source.findFirst({
      where: {
        workspaceId: w,
        projectId: p,
        id: { not: id },
        OR: [
          ...(input.doi ? [{ doi: input.doi }] : []),
          ...(input.url ? [{ url: input.url }] : []),
        ],
      },
    });
    if (duplicate) throw new AppError("DUPLICATE_SOURCE", 409);
    const tags = [...new Set(raw.tags.map((t) => t.toLowerCase()))];
    await tx.sourceCollection.deleteMany({
      where: { workspaceId: w, projectId: p, sourceId: id },
    });
    if (raw.collectionIds.length)
      await tx.sourceCollection.createMany({
        data: [...new Set(raw.collectionIds)].map((collectionId) => ({
          workspaceId: w,
          projectId: p,
          sourceId: id,
          collectionId,
        })),
      });
    return tx.source.update({
      where: { id },
      data: { ...metadata, tags, revision: { increment: 1 } },
    });
  });
}
export const readingInput = z
  .object({
    action: z.literal("reading"),
    versionId: z.uuid().nullable(),
    status: z.enum(["unread", "reading", "done"]),
    page: z.number().int().min(1).max(500),
    zoom: z.number().min(0.5).max(2.5),
    position: z.number().min(0).max(1),
  })
  .strict();
export function saveReading(
  db: Database,
  actor: Identity,
  w: string,
  p: string,
  id: string,
  input: z.infer<typeof readingInput>,
) {
  return research(db, actor, w, p, false, async (tx) => {
    await sourceRow(tx, w, p, id);
    if (input.versionId) {
      const version = await tx.sourceVersion.findFirst({
        where: {
          id: input.versionId,
          workspaceId: w,
          projectId: p,
          sourceId: id,
        },
      });
      if (!version || (version.pageCount && input.page > version.pageCount))
        throw new AppError("INVALID_INPUT");
    }
    const { action: _, ...data } = input;
    void _;
    return tx.readingState.upsert({
      where: { sourceId_userId: { sourceId: id, userId: actor.id } },
      create: {
        workspaceId: w,
        projectId: p,
        sourceId: id,
        userId: actor.id,
        ...data,
      },
      update: data,
    });
  });
}
export function addCollection(
  db: Database,
  actor: Identity,
  w: string,
  p: string,
  name: string,
) {
  return research(db, actor, w, p, true, async (tx) =>
    tx.collection.upsert({
      where: {
        projectId_normalizedName: {
          projectId: p,
          normalizedName: name.trim().toLowerCase(),
        },
      },
      create: {
        id: randomUUID(),
        workspaceId: w,
        projectId: p,
        name: name.trim(),
        normalizedName: name.trim().toLowerCase(),
      },
      update: {},
    }),
  );
}
export const annotationInput = z
  .object({
    kind: z.enum(["highlight", "note"]),
    page: z.number().int().min(1).max(500),
    quote: z.string().max(6000).default(""),
    body: z.string().trim().max(10000).default(""),
    rects: z
      .array(z.array(z.number().min(0).max(1)).length(4))
      .max(100)
      .default([]),
    color: z.enum(["yellow", "blue", "green"]).default("yellow"),
  })
  .strict()
  .refine((v) =>
    v.kind === "note" ? !!v.body : !!v.quote && v.rects.length > 0,
  );
export function addAnnotation(
  db: Database,
  actor: Identity,
  w: string,
  p: string,
  sourceId: string,
  versionId: string,
  input: z.infer<typeof annotationInput>,
) {
  return research(db, actor, w, p, true, async (tx) => {
    const version = await tx.sourceVersion.findFirst({
      where: { id: versionId, workspaceId: w, projectId: p, sourceId },
    });
    if (
      !version?.fileId ||
      (version.pageCount && input.page > version.pageCount)
    )
      throw new AppError("UNAVAILABLE", 404);
    const id = randomUUID();
    await tx.artifact.createMany({
      data: [{ id, workspaceId: w, projectId: p, kind: "annotation" }],
    });
    return tx.annotation.create({
      data: {
        id,
        workspaceId: w,
        projectId: p,
        sourceId,
        versionId,
        authorId: actor.id,
        ...input,
        rects: input.rects as Prisma.InputJsonValue,
      },
    });
  });
}
export const annotationEdit = z
  .object({
    body: z.string().trim().max(10000).optional(),
    color: z.enum(["yellow", "blue", "green"]).optional(),
    deleted: z.boolean().optional(),
    revision: z.number().int().min(1),
  })
  .strict();
export function editAnnotation(
  db: Database,
  actor: Identity,
  w: string,
  p: string,
  id: string,
  input: z.infer<typeof annotationEdit>,
) {
  return research(db, actor, w, p, true, async (tx, scope) => {
    const note = await tx.annotation.findFirst({
      where: { id, workspaceId: w, projectId: p },
    });
    if (
      !note ||
      (note.authorId !== actor.id &&
        !["owner", "admin"].includes(scope.projectRole))
    )
      throw new AppError("UNAVAILABLE", 404);
    if (note.revision !== input.revision)
      throw new AppError("REVISION_CONFLICT", 409);
    return tx.annotation.update({
      where: { id },
      data: {
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.color ? { color: input.color } : {}),
        ...(input.deleted !== undefined
          ? { deletedAt: input.deleted ? new Date() : null }
          : {}),
        revision: { increment: 1 },
      },
    });
  });
}
export async function enqueueFile(
  tx: Tx,
  actor: Identity,
  w: string,
  p: string,
  versionId: string,
) {
  const id = randomUUID();
  await tx.fileJob.createMany({
    data: [
      {
        id,
        workspaceId: w,
        projectId: p,
        versionId,
        actorId: actor.id,
        sessionId: actor.sessionId,
      },
    ],
  });
  return id;
}
export function retryFile(
  db: Database,
  actor: Identity,
  w: string,
  p: string,
  s: string,
  v: string,
) {
  return research(db, actor, w, p, true, async (tx) => {
    const version = await tx.sourceVersion.findFirst({
      where: { id: v, sourceId: s, workspaceId: w, projectId: p },
    });
    if (!version?.fileId) throw new AppError("UNAVAILABLE", 404);
    const job = await tx.fileJob.findFirst({
      where: { versionId: v },
      select: jobSelect,
      orderBy: { createdAt: "desc" },
    });
    if (job && ["pending", "running"].includes(job.state))
      return { queued: true };
    await tx.sourceVersion.update({
      where: { id: v },
      data: { extractionStatus: "queued" },
    });
    await enqueueFile(tx, actor, w, p, v);
    return { queued: true };
  });
}
