import type { Database } from "../db/client";
import type { Identity } from "../auth/identity";
import { inProject } from "./access";
import { listProjects } from "./projects";
import { AppError } from "../errors";

export async function homeActivity(db: Database, actor: Identity) {
  const projects = await listProjects(db, actor);
  const result = [];
  // Bounded summaries; every project takes the same access lock as its detail.
  for (const project of projects.filter((p) => !p.deletedAt).slice(0, 50)) {
    try {
      result.push(
        await inProject(
          db,
          actor,
          project.workspaceId,
          project.id,
          false,
          async (tx) => {
            const where = {
              workspaceId: project.workspaceId,
              projectId: project.id,
            };
            const [
              sources,
              documents,
              tasks,
              recentDocuments,
              readings,
              assigned,
            ] = await Promise.all([
              tx.source.count({ where: { ...where, archivedAt: null } }),
              tx.document.count({ where: { ...where, archivedAt: null } }),
              tx.task.count({
                where: { ...where, archivedAt: null, status: { not: "done" } },
              }),
              tx.document.findMany({
                where: { ...where, archivedAt: null },
                select: { id: true, title: true, updatedAt: true },
                orderBy: { updatedAt: "desc" },
                take: 3,
              }),
              tx.readingState.findMany({
                where: { ...where, userId: actor.id },
                orderBy: { updatedAt: "desc" },
                take: 3,
              }),
              tx.task.findMany({
                where: {
                  ...where,
                  archivedAt: null,
                  assigneeId: actor.id,
                  status: { not: "done" },
                },
                select: {
                  id: true,
                  title: true,
                  status: true,
                  dueDate: true,
                  updatedAt: true,
                },
                orderBy: { updatedAt: "desc" },
                take: 3,
              }),
            ]);
            const readSources = await tx.source.findMany({
              where: {
                ...where,
                archivedAt: null,
                id: { in: readings.map((r) => r.sourceId) },
              },
              select: { id: true, title: true },
            });
            const base = `/w/${project.workspaceId}/p/${project.id}`;
            return {
              projectId: project.id,
              sources,
              documents,
              tasks,
              recent: [
                ...recentDocuments.map((d) => ({
                  id: d.id,
                  title: d.title,
                  kind: "document",
                  href: base + "/docs/" + d.id,
                  updatedAt: d.updatedAt,
                })),
                ...readings.flatMap((r) => {
                  const s = readSources.find((s) => s.id === r.sourceId);
                  return s
                    ? [
                        {
                          id: s.id,
                          title: s.title,
                          kind: `Reading · page ${r.page}`,
                          href:
                            base +
                            "/sources/" +
                            s.id +
                            (r.versionId
                              ? `/read?version=${r.versionId}&page=${r.page}`
                              : ""),
                          updatedAt: r.updatedAt,
                        },
                      ]
                    : [];
                }),
              ]
                .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
                .slice(0, 4),
              assigned: assigned.map((t) => ({
                ...t,
                href: base + "/tasks/" + t.id,
              })),
            };
          },
        ),
      );
    } catch (error) {
      if (!(error instanceof AppError && error.status === 404)) throw error;
    }
  }
  return { projects: result, limited: projects.length > 50 };
}
