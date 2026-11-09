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
  fn: (
    tx: Tx,
    scope: {
      projectRole: string;
      project: { archivedAt: Date | null; deletedAt: Date | null };
      workspace: { archivedAt: Date | null };
    },
  ) => Promise<T>,
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
  filters: {
    collection?: string;
    tag?: string;
    status?: string;
    sort?: string;
    pdf?: string;
    year?: number;
    archived?: boolean;
  } = {},
) {
  return research(db, actor, w, p, false, async (tx, scope) => {
    const where: Prisma.SourceWhereInput = {
      workspaceId: w,
      projectId: p,
      archivedAt: filters.archived ? { not: null } : null,
    };
    const and: Prisma.SourceWhereInput[] = [];
    if (query) {
      const found = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM app.sources WHERE "workspaceId"=${w}::uuid AND "projectId"=${p}::uuid AND (to_tsvector('simple',"searchText")@@plainto_tsquery('simple',${query}) OR "searchText" ILIKE ${"%" + query.replace(/[\\%_]/g, (m) => "\\" + m) + "%"})`;
      and.push({ id: { in: found.map((v) => v.id) } });
    }
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
    if (filters.year) and.push({ year: filters.year });
    if (filters.pdf) {
      const versions = await tx.sourceVersion.findMany({
        where: { workspaceId: w, projectId: p, fileId: { not: null } },
        select: { sourceId: true },
      });
      and.push({
        id:
          filters.pdf === "yes"
            ? { in: versions.map((v) => v.sourceId) }
            : { notIn: versions.map((v) => v.sourceId) },
      });
    }
    if (filters.status) {
      const readings = await tx.readingState.findMany({
        where: {
          workspaceId: w,
          projectId: p,
          userId: actor.id,
          status:
            filters.status === "unread" ? { not: "unread" } : filters.status,
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
    where.AND = and;
    const [total, items, all, collections, links, personal] = await Promise.all(
      [
        tx.source.count({ where }),
        tx.source.findMany({
          where,
          orderBy:
            filters.sort === "title"
              ? [{ title: "asc" }, { id: "asc" }]
              : filters.sort === "year"
                ? [
                    { year: { sort: "desc", nulls: "last" } },
                    { title: "asc" },
                    { id: "asc" },
                  ]
                : filters.sort === "edited"
                  ? [{ updatedAt: "desc" }, { id: "asc" }]
                  : [{ createdAt: "desc" }, { id: "asc" }],
          skip: page * 30,
          take: 30,
        }),
        tx.source.findMany({
          where: { workspaceId: w, projectId: p },
          select: { id: true, tags: true, year: true, archivedAt: true },
        }),
        tx.collection.findMany({
          where: { workspaceId: w, projectId: p },
          orderBy: { name: "asc" },
        }),
        tx.sourceCollection.findMany({
          where: { workspaceId: w, projectId: p },
        }),
        tx.readingState.findMany({
          where: { workspaceId: w, projectId: p, userId: actor.id },
          select: { sourceId: true, status: true },
        }),
      ],
    );
    const active = all.filter((s) => !s.archivedAt),
      activeIds = new Set(active.map((s) => s.id));
    const counts = {
      all: active.length,
      archived: all.length - active.length,
      unread: active.length,
      reading: 0,
      done: 0,
    };
    for (const r of personal)
      if (
        activeIds.has(r.sourceId) &&
        (r.status === "reading" || r.status === "done")
      ) {
        counts[r.status]++;
        counts.unread--;
      }
    const ids = items.map((s) => s.id);
    return {
      items,
      total,
      hasMore: (page + 1) * 30 < total,
      counts,
      versions: await tx.sourceVersion.findMany({
        where: { workspaceId: w, projectId: p, sourceId: { in: ids } },
        orderBy: { ordinal: "desc" },
      }),
      readings: await tx.readingState.findMany({
        where: { sourceId: { in: ids }, userId: actor.id },
      }),
      collections: collections.map((c) => ({
        ...c,
        count: links.filter(
          (l) => l.collectionId === c.id && activeIds.has(l.sourceId),
        ).length,
      })),
      links: links.filter((l) => ids.includes(l.sourceId)),
      tags: [...new Set(active.flatMap((s) => s.tags))].sort(),
      years: [...new Set(active.flatMap((s) => (s.year ? [s.year] : [])))].sort(
        (a, b) => b - a,
      ),
      role: scope.projectRole,
      canEdit:
        ["owner", "admin", "editor"].includes(scope.projectRole) &&
        !scope.project.archivedAt &&
        !scope.project.deletedAt &&
        !scope.workspace.archivedAt,
      storageAvailable: !!process.env.FILE_STORAGE_PATH,
    };
  });
}
export const normalizeLabel = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ");
export const normalizeTag = (value: string) =>
  normalizeLabel(value)
    .replace(/^#+\s*/, "")
    .toLocaleLowerCase("en-US");
const tagInput = z
  .string()
  .transform(normalizeTag)
  .pipe(z.string().min(1).max(40));
const sourceIds = z.array(z.uuid()).min(1).max(100);
export const libraryBulkInput = z.discriminatedUnion("action", [
  z
    .object({
      action: z.enum(["collection-add", "collection-remove"]),
      ids: sourceIds,
      collectionId: z.uuid(),
    })
    .strict(),
  z
    .object({
      action: z.enum(["tag-add", "tag-remove"]),
      ids: sourceIds,
      tag: tagInput,
    })
    .strict(),
  z
    .object({
      action: z.literal("reading"),
      ids: sourceIds,
      status: z.enum(["unread", "reading", "done"]),
    })
    .strict(),
  z.object({ action: z.enum(["archive", "restore"]), ids: sourceIds }).strict(),
]);
// One project lock and transaction: mixed-project IDs or any failed check roll back the entire selection.
export function updateLibrarySources(
  db: Database,
  actor: Identity,
  w: string,
  p: string,
  input: z.infer<typeof libraryBulkInput>,
) {
  return inProject(
    db,
    actor,
    w,
    p,
    input.action !== "reading",
    async (tx, scope) => {
      if (
        scope.project.archivedAt ||
        scope.project.deletedAt ||
        scope.workspace.archivedAt
      )
        throw new AppError("ARCHIVED", 409);
      if (input.action !== "reading")
        requireRole(
          scope.projectRole,
          input.action === "archive" || input.action === "restore"
            ? ["owner", "admin"]
            : ["owner", "admin", "editor"],
        );
      const ids = [...new Set(input.ids)];
      const sources = await tx.source.findMany({
        where: {
          workspaceId: w,
          projectId: p,
          id: { in: ids },
          ...(input.action === "restore" ? {} : { archivedAt: null }),
        },
      });
      if (sources.length !== ids.length) throw new AppError("UNAVAILABLE", 404);
      const changed: string[] = [];
      if (input.action === "reading") {
        for (const sourceId of ids)
          await tx.readingState.upsert({
            where: { sourceId_userId: { sourceId, userId: actor.id } },
            create: {
              workspaceId: w,
              projectId: p,
              sourceId,
              userId: actor.id,
              status: input.status,
            },
            update: { status: input.status },
          });
      } else if (
        input.action === "collection-add" ||
        input.action === "collection-remove"
      ) {
        const c = await tx.collection.findFirst({
          where: { id: input.collectionId, workspaceId: w, projectId: p },
        });
        if (!c) throw new AppError("UNAVAILABLE", 404);
        const links = await tx.sourceCollection.findMany({
          where: { workspaceId: w, projectId: p, sourceId: { in: ids } },
        });
        for (const id of ids) {
          const has = links.some(
            (l) => l.sourceId === id && l.collectionId === c.id,
          );
          if (input.action === "collection-add" && !has) {
            if (links.filter((l) => l.sourceId === id).length >= 50)
              throw new AppError("LIBRARY_LIMIT", 409);
            await tx.sourceCollection.create({
              data: {
                workspaceId: w,
                projectId: p,
                sourceId: id,
                collectionId: c.id,
              },
            });
            changed.push(id);
          } else if (input.action === "collection-remove" && has) {
            await tx.sourceCollection.deleteMany({
              where: {
                sourceId: id,
                collectionId: c.id,
                workspaceId: w,
                projectId: p,
              },
            });
            changed.push(id);
          }
        }
      } else if (input.action === "tag-add" || input.action === "tag-remove") {
        for (const s of sources) {
          const tags = [...new Set(s.tags.map(normalizeTag))];
          const next =
            input.action === "tag-add"
              ? [...new Set([...tags, input.tag])]
              : tags.filter((t) => t !== input.tag);
          if (next.length > 30) throw new AppError("LIBRARY_LIMIT", 409);
          if (JSON.stringify(next) !== JSON.stringify(s.tags))
            await tx.source.update({
              where: { id: s.id },
              data: { tags: next, revision: { increment: 1 } },
            });
        }
      } else {
        for (const s of sources)
          if ((input.action === "archive") !== !!s.archivedAt)
            await tx.source.update({
              where: { id: s.id },
              data: {
                archivedAt: input.action === "archive" ? new Date() : null,
                revision: { increment: 1 },
              },
            });
      }
      if (changed.length)
        await tx.source.updateMany({
          where: { id: { in: changed }, workspaceId: w, projectId: p },
          data: { revision: { increment: 1 } },
        });
      return { count: ids.length };
    },
  );
}
export const collectionChangeInput = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("rename"),
      name: z
        .string()
        .transform(normalizeLabel)
        .pipe(z.string().min(1).max(80)),
      expectedName: z.string(),
    })
    .strict(),
  z.object({ action: z.literal("remove"), expectedName: z.string() }).strict(),
]);
export function changeCollection(
  db: Database,
  actor: Identity,
  w: string,
  p: string,
  id: string,
  input: z.infer<typeof collectionChangeInput>,
) {
  return research(db, actor, w, p, true, async (tx) => {
    const c = await tx.collection.findFirst({
      where: { id, workspaceId: w, projectId: p },
    });
    if (!c) throw new AppError("UNAVAILABLE", 404);
    if (c.name !== input.expectedName)
      throw new AppError("REVISION_CONFLICT", 409);
    if (input.action === "rename") {
      const normalizedName = input.name.toLocaleLowerCase("en-US");
      if (
        await tx.collection.findFirst({
          where: { projectId: p, normalizedName, id: { not: id } },
        })
      )
        throw new AppError("COLLECTION_EXISTS", 409);
      return tx.collection.update({
        where: { id },
        data: { name: input.name, normalizedName },
      });
    }
    const links = await tx.sourceCollection.findMany({
      where: { workspaceId: w, projectId: p, collectionId: id },
    });
    await tx.sourceCollection.deleteMany({
      where: { workspaceId: w, projectId: p, collectionId: id },
    });
    await tx.source.updateMany({
      where: {
        workspaceId: w,
        projectId: p,
        id: { in: links.map((l) => l.sourceId) },
      },
      data: { revision: { increment: 1 } },
    });
    await tx.collection.delete({ where: { id } });
    return { removed: true };
  });
}
export const bulkSourcesInput = z
  .object({
    ids: z.array(z.uuid()).min(1).max(100),
    collectionId: z.uuid(),
  })
  .strict();
export function collectSources(
  db: Database,
  actor: Identity,
  w: string,
  p: string,
  raw: z.infer<typeof bulkSourcesInput>,
) {
  return updateLibrarySources(db, actor, w, p, {
    action: "collection-add",
    ...raw,
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
        !source.archivedAt &&
        !scope.project.archivedAt &&
        !scope.project.deletedAt &&
        !scope.workspace.archivedAt,
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
    if (source.archivedAt) throw new AppError("ARCHIVED", 409);
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
    const tags = [...new Set(raw.tags.map(normalizeTag))];
    if (tags.some((t) => !t || t.length > 40))
      throw new AppError("INVALID_INPUT");
    if (
      (await tx.collection.count({
        where: {
          workspaceId: w,
          projectId: p,
          id: { in: [...new Set(raw.collectionIds)] },
        },
      })) !== new Set(raw.collectionIds).size
    )
      throw new AppError("UNAVAILABLE", 404);
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
          normalizedName: normalizeLabel(name).toLocaleLowerCase("en-US"),
        },
      },
      create: {
        id: randomUUID(),
        workspaceId: w,
        projectId: p,
        name: normalizeLabel(name),
        normalizedName: normalizeLabel(name).toLocaleLowerCase("en-US"),
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
