import { z } from "zod";
import { Prisma } from "../../generated/prisma/client";
import type { Database } from "../db/client";
import type { Identity } from "../auth/identity";
import { asIdentity } from "../db/transaction";
import { inProject, workspaceLock } from "./access";
import { AppError } from "../errors";
import { card } from "../collaboration/service";
import { workLocation, workLabel } from "../../lib/work-navigation";
export const tabInput = z
  .object({ hrefs: z.array(z.string().max(1200)).max(40) })
  .strict();
export async function resolveWorkTabs(
  db: Database,
  a: Identity,
  hrefs: string[],
) {
  return Promise.all(
    hrefs.map(async (href) => {
      const location = workLocation(href);
      if (!location) return null;
      try {
        if (location.p && location.w)
          return await inProject(
            db,
            a,
            location.w,
            location.p,
            false,
            async (tx, s) => {
              if (location.id) {
                const target = await card(
                  tx,
                  location.w!,
                  location.p!,
                  location.id,
                );
                if (!target || target.kind !== location.kind) return null;
                return {
                  ...location,
                  title: target.title,
                  projectName: s.project.name,
                  archived: target.archived,
                };
              }
              return {
                ...location,
                title:
                  location.kind === "overview"
                    ? s.project.name
                    : workLabel(location.kind),
                projectName: s.project.name,
                archived: !!s.project.archivedAt,
              };
            },
          );
        if (location.w)
          return await asIdentity(db, a, async (tx) => {
            const s = await workspaceLock(tx, a, location.w!);
            return {
              ...location,
              title: s.workspace.name,
              projectName: null,
              archived: !!s.workspace.archivedAt,
            };
          });
        return {
          ...location,
          title: workLabel(location.kind),
          projectName: null,
          archived: false,
        };
      } catch (e) {
        if (e instanceof AppError && [401, 403, 404].includes(e.status))
          return null;
        throw e;
      }
    }),
  );
}
export const searchInput = z
  .object({
    q: z.string().trim().min(2).max(120),
    page: z.coerce.number().int().min(0).max(10000).default(0),
    kind: z
      .enum([
        "all",
        "project",
        "source",
        "document",
        "task",
        "discussion",
        "annotation",
      ])
      .default("all"),
  })
  .strict();
export async function searchWork(
  db: Database,
  a: Identity,
  f: z.infer<typeof searchInput>,
) {
  const query = "%" + f.q.replace(/[\\%_]/g, "\\$&") + "%";
  const data = await asIdentity(db, a, async (tx) => {
    const union = Prisma.sql`SELECT 'project' AS kind,p.id,p."workspaceId",p.id AS "projectId",p."updatedAt" FROM app.projects p JOIN app.workspaces w ON w.id=p."workspaceId" WHERE p."deletedAt" IS NULL AND p."archivedAt" IS NULL AND w."archivedAt" IS NULL AND p.name ILIKE ${query}
  UNION ALL SELECT 'source',s.id,s."workspaceId",s."projectId",s."updatedAt" FROM app.sources s JOIN app.projects p ON p.id=s."projectId" JOIN app.workspaces w ON w.id=s."workspaceId" WHERE s."archivedAt" IS NULL AND p."deletedAt" IS NULL AND p."archivedAt" IS NULL AND w."archivedAt" IS NULL AND (s.title ILIKE ${query} OR s.doi ILIKE ${query} OR array_to_string(s.authors,',') ILIKE ${query})
  UNION ALL SELECT 'document',d.id,d."workspaceId",d."projectId",d."updatedAt" FROM app.documents d JOIN app.projects p ON p.id=d."projectId" JOIN app.workspaces w ON w.id=d."workspaceId" WHERE d."archivedAt" IS NULL AND p."deletedAt" IS NULL AND p."archivedAt" IS NULL AND w."archivedAt" IS NULL AND d.title ILIKE ${query}
  UNION ALL SELECT 'task',t.id,t."workspaceId",t."projectId",t."updatedAt" FROM app.tasks t JOIN app.projects p ON p.id=t."projectId" JOIN app.workspaces w ON w.id=t."workspaceId" WHERE t."archivedAt" IS NULL AND p."deletedAt" IS NULL AND p."archivedAt" IS NULL AND w."archivedAt" IS NULL AND t.title ILIKE ${query}
  UNION ALL SELECT 'discussion',d.id,d."workspaceId",d."projectId",d."updatedAt" FROM app.discussions d JOIN app.projects p ON p.id=d."projectId" JOIN app.workspaces w ON w.id=d."workspaceId" WHERE d."archivedAt" IS NULL AND p."deletedAt" IS NULL AND p."archivedAt" IS NULL AND w."archivedAt" IS NULL AND d.title ILIKE ${query}
  UNION ALL SELECT 'annotation',n.id,n."workspaceId",n."projectId",n."updatedAt" FROM app.annotations n JOIN app.sources s ON s.id=n."sourceId" JOIN app.projects p ON p.id=n."projectId" JOIN app.workspaces w ON w.id=n."workspaceId" WHERE n."deletedAt" IS NULL AND s."archivedAt" IS NULL AND p."deletedAt" IS NULL AND p."archivedAt" IS NULL AND w."archivedAt" IS NULL AND (n.body ILIKE ${query} OR n.quote ILIKE ${query})`;
    const filter =
      f.kind === "all" ? Prisma.empty : Prisma.sql`WHERE kind=${f.kind}`;
    const [rows, count] = await Promise.all([
      tx.$queryRaw<
        { id: string; workspaceId: string; projectId: string; kind: string }[]
      >(
        Prisma.sql`SELECT * FROM (${union}) q ${filter} ORDER BY "updatedAt" DESC,id,kind LIMIT 25 OFFSET ${f.page * 25}`,
      ),
      tx.$queryRaw<{ total: number }[]>(
        Prisma.sql`SELECT count(*)::int AS total FROM (${union}) q ${filter}`,
      ),
    ]);
    return { rows, total: count[0].total };
  });
  const items = await Promise.all(
    data.rows.map(async (row) => {
      try {
        return await inProject(
          db,
          a,
          row.workspaceId,
          row.projectId,
          false,
          async (tx, s) => {
            if (
              s.project.archivedAt ||
              s.project.deletedAt ||
              s.workspace.archivedAt
            )
              return null;
            if (row.kind === "project")
              return {
                id: row.id,
                kind: row.kind,
                title: s.project.name,
                projectName: s.project.name,
                workspaceName: s.workspace.name,
                href: `/w/${row.workspaceId}/p/${row.projectId}`,
              };
            const target = await card(
              tx,
              row.workspaceId,
              row.projectId,
              row.id,
            );
            if (!target || target.archived) return null;
            return {
              ...target,
              projectName: s.project.name,
              workspaceName: s.workspace.name,
            };
          },
        );
      } catch (e) {
        if (e instanceof AppError && [401, 403, 404].includes(e.status))
          return null;
        throw e;
      }
    }),
  );
  return {
    items: items.filter((r): r is NonNullable<typeof r> => !!r),
    total: data.total,
    page: f.page,
    pageSize: 25,
  };
}
