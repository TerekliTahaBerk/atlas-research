import { z } from "zod";
import { Prisma } from "../../generated/prisma/client";
import type { Database } from "../db/client";
import type { Identity } from "../auth/identity";
import { asIdentity } from "../db/transaction";
import { inProject, projectLock, type Tx } from "./access";
import { AppError } from "../errors";
import { calendarAfter } from "../../lib/task-model";
export const dashboardInput = z
  .object({
    page: z.coerce.number().int().min(0).max(100000).default(0),
    q: z.string().trim().max(100).default(""),
    workspace: z.union([z.uuid(), z.literal("all")]).default("all"),
    kind: z.enum(["all", "personal", "shared"]).default("all"),
    sort: z.enum(["updated", "name"]).default("updated"),
    status: z.enum(["active", "archived"]).default("active"),
    today: z.iso.date(),
  })
  .strict();
export const visitInput = z
  .object({
    workspaceId: z.uuid(),
    projectId: z.uuid(),
    artifactId: z.uuid(),
    kind: z.enum(["source", "document"]),
    versionId: z.uuid().nullable().default(null),
  })
  .strict();
const priority = Prisma.sql`CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`;
const base = (w: string, p: string) => `/w/${w}/p/${p}`;
export function visitWork(
  db: Database,
  a: Identity,
  input: z.infer<typeof visitInput>,
) {
  return inProject(
    db,
    a,
    input.workspaceId,
    input.projectId,
    false,
    async (tx, s) => {
      if (s.project.archivedAt || s.project.deletedAt || s.workspace.archivedAt)
        throw new AppError("ARCHIVED", 409);
      const where = {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        id: input.artifactId,
        archivedAt: null,
      };
      const target =
        input.kind === "document"
          ? await tx.document.findFirst({ where })
          : await tx.source.findFirst({ where });
      if (!target) throw new AppError("UNAVAILABLE", 404);
      if (
        input.versionId &&
        (input.kind !== "source" ||
          !(await tx.sourceVersion.findFirst({
            where: {
              id: input.versionId,
              sourceId: input.artifactId,
              workspaceId: input.workspaceId,
              projectId: input.projectId,
              fileId: { not: null },
            },
          })))
      )
        throw new AppError("INVALID_INPUT");
      await tx.workVisit.upsert({
        where: {
          actorId_artifactId: { actorId: a.id, artifactId: input.artifactId },
        },
        create: { ...input, actorId: a.id },
        update: {
          kind: input.kind,
          versionId: input.versionId,
          openedAt: new Date(),
        },
      });
      return { recorded: true };
    },
  );
}
async function counts(tx: Tx, w: string, p: string) {
  const where = { workspaceId: w, projectId: p, archivedAt: null };
  const [sources, documents, tasks, discussions] = await Promise.all([
    tx.source.count({ where }),
    tx.document.count({ where }),
    tx.task.count({ where: { ...where, status: { not: "done" } } }),
    tx.discussion.count({ where }),
  ]);
  return { sources, documents, tasks, discussions };
}
async function taskCards(tx: Tx, ids: string[], a: Identity) {
  const rows = await tx.task.findMany({
    where: { id: { in: ids }, archivedAt: null, status: { not: "done" } },
  });
  return ids.flatMap((id) => {
    const t = rows.find((t) => t.id === id);
    return t
      ? [
          {
            id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            dueDate: t.dueDate,
            projectId: t.projectId,
            workspaceId: t.workspaceId,
            assignedToYou: t.assigneeId === a.id,
            href: base(t.workspaceId, t.projectId) + "/tasks/" + id,
          },
        ]
      : [];
  });
}
export function homeDashboard(
  db: Database,
  a: Identity,
  f: z.infer<typeof dashboardInput>,
) {
  return asIdentity(db, a, async (tx) => {
    const scopeWhere = {
      archivedAt: null,
      deletedAt: null,
      workspace: {
        archivedAt: null,
        ...(f.kind !== "all" ? { kind: f.kind } : {}),
      },
      ...(f.workspace !== "all" ? { workspaceId: f.workspace } : {}),
    };
    const where = {
      ...(f.status === "active"
        ? scopeWhere
        : {
            workspace: { ...(f.kind !== "all" ? { kind: f.kind } : {}) },
            ...(f.workspace !== "all" ? { workspaceId: f.workspace } : {}),
            OR: [
              { archivedAt: { not: null } },
              { deletedAt: { not: null } },
              { workspace: { archivedAt: { not: null } } },
            ],
          }),
      ...(f.q ? { name: { contains: f.q, mode: "insensitive" as const } } : {}),
    };
    const order =
      f.sort === "name"
        ? [{ name: "asc" as const }, { id: "asc" as const }]
        : [{ updatedAt: "desc" as const }, { id: "desc" as const }];
    const projects = await tx.project.findMany({
      where,
      select: { id: true, workspaceId: true },
      orderBy: order,
    });
    const accessible = await tx.project.findMany({
      where: scopeWhere,
      select: { id: true },
    });
    const ids = accessible.map((p) => p.id),
      page = projects.slice(f.page * 12, f.page * 12 + 12);
    const recent = await tx.$queryRaw<
      {
        artifactId: string;
        workspaceId: string;
        projectId: string;
        kind: "source" | "document";
        versionId: string | null;
        openedAt: Date;
      }[]
    >(
      Prisma.sql`SELECT v.* FROM app.work_visits v LEFT JOIN app.sources s ON s.id=v."artifactId" AND s."archivedAt" IS NULL LEFT JOIN app.documents d ON d.id=v."artifactId" AND d."archivedAt" IS NULL WHERE v."actorId"=${a.id} AND v."projectId"=ANY(${ids}::uuid[]) AND ((v.kind='source' AND s.id IS NOT NULL) OR (v.kind='document' AND d.id IS NOT NULL)) ORDER BY v."openedAt" DESC,v."artifactId" LIMIT 8`,
    );
    const [assignedIds, dueIds] = await Promise.all([
      tx.$queryRaw<{ id: string; workspaceId: string; projectId: string }[]>(
        Prisma.sql`SELECT id,"workspaceId","projectId" FROM app.tasks WHERE "projectId"=ANY(${ids}::uuid[]) AND "assigneeId"=${a.id} AND "archivedAt" IS NULL AND status<>'done' ORDER BY ${priority},"dueDate" ASC NULLS LAST,id LIMIT 8`,
      ),
      tx.$queryRaw<{ id: string; workspaceId: string; projectId: string }[]>(
        Prisma.sql`SELECT id,"workspaceId","projectId" FROM app.tasks WHERE "projectId"=ANY(${ids}::uuid[]) AND "assigneeId"=${a.id} AND "archivedAt" IS NULL AND status<>'done' AND "dueDate">=${f.today} AND "dueDate"<=${calendarAfter(f.today, 7)} ORDER BY "dueDate",${priority},id LIMIT 8`,
      ),
    ]);
    const selected = new Map(
      [
        ...page,
        ...[...recent, ...assignedIds, ...dueIds].map((p) => ({
          workspaceId: p.workspaceId,
          id: p.projectId,
        })),
      ].map((p) => [p.id, p]),
    );
    const scopes = new Map<string, Awaited<ReturnType<typeof projectLock>>>();
    for (const project of [...selected.values()].sort(
      (a, b) =>
        a.workspaceId.localeCompare(b.workspaceId) || a.id.localeCompare(b.id),
    )) {
      const s = await projectLock(tx, a, project.workspaceId, project.id);
      scopes.set(project.id, s);
    }
    const cards = [];
    for (const project of page) {
      const s = scopes.get(project.id);
      if (s)
        cards.push({
          ...s.project,
          workspaceName: s.workspace.name,
          workspaceArchivedAt: s.workspace.archivedAt,
          role: s.projectRole,
          counts: await counts(tx, s.project.workspaceId, s.project.id),
        });
    }
    const opened = [];
    for (const v of recent) {
      const s = scopes.get(v.projectId);
      if (
        !s ||
        s.project.archivedAt ||
        s.project.deletedAt ||
        s.workspace.archivedAt
      )
        continue;
      const target =
        v.kind === "document"
          ? await tx.document.findFirst({
              where: {
                id: v.artifactId,
                projectId: v.projectId,
                archivedAt: null,
              },
            })
          : await tx.source.findFirst({
              where: {
                id: v.artifactId,
                projectId: v.projectId,
                archivedAt: null,
              },
            });
      if (!target) continue;
      const version = v.versionId
        ? await tx.sourceVersion.findFirst({
            where: {
              id: v.versionId,
              sourceId: v.artifactId,
              projectId: v.projectId,
              fileId: { not: null },
            },
          })
        : null;
      const position = version
        ? await tx.readingPosition.findUnique({
            where: {
              versionId_userId: { versionId: version.id, userId: a.id },
            },
          })
        : null;
      opened.push({
        id: target.id,
        title: target.title,
        kind: v.kind,
        openedAt: v.openedAt,
        updatedAt: target.updatedAt,
        projectId: v.projectId,
        projectName: s.project.name,
        page: position?.page ?? null,
        version: version?.ordinal ?? null,
        href:
          base(v.workspaceId, v.projectId) +
          (v.kind === "document" ? "/docs/" : "/sources/") +
          target.id +
          (version ? `/read?version=${version.id}` : ""),
      });
    }
    const tasksWhere = {
      projectId: { in: ids },
      archivedAt: null,
      assigneeId: a.id,
      status: { not: "done" },
    };
    const [assignedTotal, dueTotal, overdueTotal] = await Promise.all([
      tx.task.count({ where: tasksWhere }),
      tx.task.count({
        where: {
          ...tasksWhere,
          dueDate: { gte: f.today, lte: calendarAfter(f.today, 7) },
        },
      }),
      tx.task.count({ where: { ...tasksWhere, dueDate: { lt: f.today } } }),
    ]);
    const withProject = async (
      rows: { id: string; projectId: string }[],
      dueOnly = false,
    ) =>
      (
        await taskCards(
          tx,
          rows
            .filter((t) => {
              const s = scopes.get(t.projectId);
              return (
                s &&
                !s.project.archivedAt &&
                !s.project.deletedAt &&
                !s.workspace.archivedAt
              );
            })
            .map((t) => t.id),
          a,
        )
      )
        .filter(
          (t) =>
            t.assignedToYou &&
            (!dueOnly ||
              (!!t.dueDate &&
                t.dueDate >= f.today &&
                t.dueDate <= calendarAfter(f.today, 7))),
        )
        .map((t) => ({
          ...t,
          projectName: scopes.get(t.projectId)!.project.name,
        }));
    return {
      projects: cards,
      projectTotal: await tx.project.count({ where }),
      pageSize: 12,
      recent: opened,
      assigned: await withProject(assignedIds),
      dueSoon: await withProject(dueIds, true),
      assignedTotal,
      dueTotal,
      overdueTotal,
    };
  });
}
export function projectOverview(
  db: Database,
  a: Identity,
  w: string,
  p: string,
) {
  return inProject(db, a, w, p, false, async (tx, s) => {
    const where = { workspaceId: w, projectId: p, archivedAt: null };
    const [
      totals,
      documents,
      sourceIds,
      taskIds,
      discussions,
      recentSources,
      recentTasks,
    ] = await Promise.all([
      counts(tx, w, p),
      tx.document.findMany({
        where,
        select: { id: true, title: true, revision: true, updatedAt: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 8,
      }),
      tx.$queryRaw<
        { id: string; references: number }[]
      >`SELECT s.id,(SELECT count(DISTINCT c."documentId")::int FROM app.citations c JOIN app.documents d ON d.id=c."documentId" AND d."archivedAt" IS NULL WHERE c."sourceId"=s.id) AS "references" FROM app.sources s WHERE s."workspaceId"=${w}::uuid AND s."projectId"=${p}::uuid AND s."archivedAt" IS NULL ORDER BY "references" DESC,s."updatedAt" DESC,s.id LIMIT 6`,
      tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM app.tasks WHERE "workspaceId"=${w}::uuid AND "projectId"=${p}::uuid AND "archivedAt" IS NULL AND status<>'done' ORDER BY ${priority},"dueDate" ASC NULLS LAST,id LIMIT 6`,
      ),
      tx.discussion.findMany({
        where,
        select: { id: true, title: true, updatedAt: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 8,
      }),
      tx.source.findMany({
        where,
        select: { id: true, title: true, updatedAt: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 8,
      }),
      tx.task.findMany({
        where,
        select: { id: true, title: true, updatedAt: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 8,
      }),
    ]);
    const sources = await tx.source.findMany({
      where: { ...where, id: { in: sourceIds.map((s) => s.id) } },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        year: true,
        authors: true,
      },
    });
    const path = base(w, p);
    const activity = [
      ...documents.map((d) => ({
        ...d,
        kind: "Document updated",
        href: path + "/docs/" + d.id,
      })),
      ...recentSources.map((d) => ({
        ...d,
        kind: "Source updated",
        href: path + "/sources/" + d.id,
      })),
      ...recentTasks.map((d) => ({
        ...d,
        kind: "Task updated",
        href: path + "/tasks/" + d.id,
      })),
      ...discussions.map((d) => ({
        ...d,
        kind: "Discussion updated",
        href: path + "/discussions/" + d.id,
      })),
    ]
      .sort(
        (a, b) =>
          b.updatedAt.getTime() - a.updatedAt.getTime() ||
          a.id.localeCompare(b.id),
      )
      .slice(0, 8);
    return {
      project: s.project,
      workspace: {
        id: s.workspace.id,
        name: s.workspace.name,
        kind: s.workspace.kind,
        archivedAt: s.workspace.archivedAt,
      },
      role: s.projectRole,
      canEdit:
        ["owner", "admin", "editor"].includes(s.projectRole) &&
        !s.project.archivedAt &&
        !s.project.deletedAt &&
        !s.workspace.archivedAt,
      canManage: ["owner", "admin"].includes(s.projectRole),
      hasContent:
        (await tx.artifact.count({
          where: {
            workspaceId: w,
            projectId: p,
            kind: { in: ["source", "document", "task", "discussion"] },
          },
        })) > 0,
      counts: totals,
      documents: documents
        .slice(0, 6)
        .map((d) => ({ ...d, href: path + "/docs/" + d.id })),
      sources: sourceIds.flatMap((row) => {
        const source = sources.find((s) => s.id === row.id);
        return source
          ? [
              {
                ...source,
                references: row.references,
                href: path + "/sources/" + row.id,
              },
            ]
          : [];
      }),
      tasks: await taskCards(
        tx,
        taskIds.map((t) => t.id),
        a,
      ),
      discussions: discussions
        .slice(0, 6)
        .map((d) => ({ ...d, href: path + "/discussions/" + d.id })),
      activity,
    };
  });
}
