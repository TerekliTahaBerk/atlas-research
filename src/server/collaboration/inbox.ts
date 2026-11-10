import { z } from "zod";
import { Prisma } from "../../generated/prisma/client";
import type { Database } from "../db/client";
import type { Identity } from "../auth/identity";
import { asIdentity } from "../db/transaction";
import { inProject } from "../domain/access";
import { AppError } from "../errors";
import { card } from "./service";
export const inboxInput = z
  .object({
    status: z.enum(["all", "unread"]).default("unread"),
    event: z.enum(["all", "assignment", "reply", "mention"]).default("all"),
    before: z.uuid().optional(),
    snapshot: z.iso.datetime({ precision: 6 }).optional(),
    selected: z.uuid().optional(),
  })
  .strict();
export const pageReadInput = z
  .object({ ids: z.array(z.uuid()).min(1).max(30) })
  .strict();
export function inboxSummary(db: Database, a: Identity) {
  return asIdentity(db, a, async (tx) => ({
    unread: await tx.notification.count({
      where: { recipientId: a.id, readAt: null },
    }),
  }));
}
async function resolveNotification(
  db: Database,
  auth: Database,
  a: Identity,
  n: Prisma.NotificationGetPayload<object>,
) {
  const empty = {
    id: n.id,
    event: n.event,
    readAt: n.readAt,
    createdAt: n.createdAt,
    target: null,
    sender: null,
    projectName: null,
    excerpt: null,
    links: [],
  };
  try {
    return await inProject(
      db,
      a,
      n.workspaceId,
      n.projectId,
      false,
      async (tx, s) => {
        const target = await card(tx, n.workspaceId, n.projectId, n.targetId);
        if (!target) return empty;
        const legacyMessage = n.eventId.startsWith("message:")
          ? z.uuid().safeParse(n.eventId.slice(8))
          : null;
        const messageId =
          n.messageId ?? (legacyMessage?.success ? legacyMessage.data : null);
        const message = messageId
          ? await tx.message.findFirst({
              where: {
                id: messageId,
                workspaceId: n.workspaceId,
                projectId: n.projectId,
                discussionId: n.targetId,
              },
            })
          : null;
        const actorId = n.actorId ?? message?.authorId;
        const sender = actorId
          ? await auth.user.findUnique({
              where: { id: actorId },
              select: { name: true },
            })
          : null;
        const links = message
          ? await Promise.all(
              message.artifactIds.map((id) =>
                card(tx, n.workspaceId, n.projectId, id),
              ),
            )
          : [];
        return {
          ...empty,
          target: {
            ...target,
            href: message
              ? target.href + "?message=" + message.id
              : target.href,
          },
          sender: sender?.name ?? null,
          projectName: s.project.name,
          excerpt: message?.body.slice(0, 280) ?? null,
          links: links.filter((c): c is NonNullable<typeof c> => !!c),
        };
      },
    );
  } catch (e) {
    if (e instanceof AppError && [401, 403, 404].includes(e.status))
      return empty;
    throw e;
  }
}
export async function inboxPage(
  db: Database,
  auth: Database,
  a: Identity,
  f: z.infer<typeof inboxInput>,
) {
  const result = await asIdentity(db, a, async (tx) => {
    const [stamp] = await tx.$queryRaw<
      { stamp: string }[]
    >`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS stamp`;
    const snapshot = f.snapshot ?? stamp.stamp;
    const anchor = f.before
      ? await tx.notification.findFirst({
          where: { id: f.before, recipientId: a.id },
          select: { id: true },
        })
      : null;
    if (f.before && !anchor) throw new AppError("UNAVAILABLE", 404);
    const event =
      f.event !== "all" ? Prisma.sql`AND event=${f.event}` : Prisma.empty;
    const status =
      f.status === "unread" ? Prisma.sql`AND "readAt" IS NULL` : Prisma.empty;
    const own = Prisma.sql`"recipientId"=${a.id} ${event}`;
    const rows = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM app.notifications WHERE ${own} ${status} AND "createdAt"<=${snapshot}::timestamptz ${anchor ? Prisma.sql`AND ("createdAt",id)<(SELECT "createdAt",id FROM app.notifications WHERE id=${anchor.id}::uuid AND "recipientId"=${a.id})` : Prisma.empty} ORDER BY "createdAt" DESC,id DESC LIMIT 31`,
    );
    const hasNext = rows.length > 30;
    const ids = rows.slice(0, 30).map((r) => r.id);
    const notifications = await tx.notification.findMany({
      where: { id: { in: ids }, recipientId: a.id },
    });
    const selected = f.selected
      ? await tx.notification.findFirst({
          where: { id: f.selected, recipientId: a.id },
        })
      : null;
    const [counts] = await tx.$queryRaw<{ total: number; newCount: number }[]>(
      Prisma.sql`SELECT count(*) FILTER(WHERE "createdAt"<=${snapshot}::timestamptz)::int AS total,count(*) FILTER(WHERE "createdAt">${snapshot}::timestamptz)::int AS "newCount" FROM app.notifications WHERE ${own} ${status}`,
    );
    return {
      snapshot,
      total: counts.total,
      newCount: counts.newCount,
      notifications: ids.flatMap(
        (id) => notifications.find((n) => n.id === id) ?? [],
      ),
      selected,
      next: hasNext ? ids.at(-1) : null,
    };
  });
  const items = await Promise.all(
    result.notifications.map((n) => resolveNotification(db, auth, a, n)),
  );
  const selected = result.selected
    ? (items.find((i) => i.id === result.selected!.id) ??
      (await resolveNotification(db, auth, a, result.selected)))
    : null;
  return {
    items,
    selected,
    snapshot: result.snapshot,
    total: result.total,
    newCount: result.newCount,
    next: result.next,
  };
}
export function markPageRead(db: Database, a: Identity, ids: string[]) {
  return asIdentity(db, a, async (tx) => ({
    marked: (
      await tx.notification.updateMany({
        where: { id: { in: ids }, recipientId: a.id, readAt: null },
        data: { readAt: new Date() },
      })
    ).count,
  }));
}
