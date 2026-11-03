import 'server-only';
import { z } from 'zod';
import {
  notificationDto,
  notificationPageDto,
  parseMessageBody,
  type NotificationDto,
} from '@atlas/core';
import {
  withActor,
  type VerifiedActor,
} from '@/features/platform/server/database';
import { PlatformError } from '@/features/platform/server/errors';
import { participantNames } from '@/features/artifacts/server/references';
import { userTopic } from './reads';

/*
 * Notification rows hold no content. Every inbox read joins the target under
 * the recipient's live RLS: a revoked channel, deleted message or inaccessible
 * task renders as an unavailable item with no title, snippet or link.
 */
const PAGE = 30;
const row = z.object({
  id: z.uuid(),
  kind: z.enum([
    'MENTION',
    'THREAD_REPLY',
    'ARTIFACT_SHARED',
    'TASK_ASSIGNED',
    'CHANNEL_ADDED',
    'CHANNEL_REMOVED',
  ]),
  projectId: z.uuid(),
  actorId: z.uuid().nullable(),
  channelId: z.uuid().nullable(),
  messageId: z.uuid().nullable(),
  createdAt: z.string(),
  sortKey: z.string(),
  read: z.boolean(),
  channelName: z.string().nullable(),
  messageVisible: z.boolean(),
  messageDeleted: z.boolean(),
  body: z.string().nullable(),
  threadRootId: z.uuid().nullable(),
  taskId: z.uuid().nullable(),
  taskTitle: z.string().nullable(),
  taskNumber: z.number().int().nullable(),
});
const cursor = z.object({ t: z.string().max(40), i: z.uuid() });
const encode = (sortKey: string, id: string) =>
  Buffer.from(JSON.stringify({ t: sortKey, i: id })).toString('base64url');
function decode(value: string | undefined) {
  if (!value) return null;
  try {
    return cursor.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString()) as unknown,
    );
  } catch {
    throw new PlatformError('VALIDATION_ERROR', 'Invalid cursor.');
  }
}

function snippet(body: string, names: Map<string, { name: string }>) {
  const text = parseMessageBody(body)
    .map((s) =>
      s.type === 'mention'
        ? `@${names.get(s.profileId)?.name ?? 'former member'}`
        : s.text,
    )
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 140 ? `${text.slice(0, 139)}…` : text;
}

async function unreadCount(
  tx: Parameters<Parameters<typeof withActor>[1]>[0],
  actorId: string,
) {
  const [r] = z
    .array(z.object({ n: z.number().int() }))
    .parse(
      await tx.$queryRaw`SELECT count(*)::int AS n FROM notifications WHERE recipient_id=${actorId}::uuid AND read_at IS NULL`,
    );
  return r?.n ?? 0;
}

export async function notificationUnread(actor: VerifiedActor) {
  return withActor(actor, async (tx) => ({
    unread: await unreadCount(tx, actor.id),
    topic: userTopic(actor.id),
  }));
}

export async function listNotifications(
  actor: VerifiedActor,
  rawCursor: string | undefined,
  unreadOnly = false,
) {
  const after = decode(rawCursor);
  return withActor(actor, async (tx) => {
    const rows = z.array(row).parse(
      await tx.$queryRaw`SELECT n.id, n.kind, n.project_id AS "projectId", n.actor_id AS "actorId", n.channel_id AS "channelId",
          n.message_id AS "messageId", n.created_at::text AS "createdAt", to_char(n.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS') AS "sortKey",
          n.read_at IS NOT NULL AS read, c.name AS "channelName",
          m.id IS NOT NULL AS "messageVisible", coalesce(m.deleted_at IS NOT NULL,false) AS "messageDeleted", m.body, m.thread_root_id AS "threadRootId",
          t.id AS "taskId", t.title AS "taskTitle", t.task_number AS "taskNumber"
         FROM notifications n
         LEFT JOIN channels c ON c.id=n.channel_id
         LEFT JOIN channel_messages m ON m.id=n.message_id
         LEFT JOIN tasks t ON t.id=n.task_id AND t.archived_at IS NULL
         WHERE n.recipient_id=${actor.id}::uuid
          AND (${unreadOnly}::boolean = false OR n.read_at IS NULL)
          AND (${after?.t ?? null}::timestamp IS NULL OR (n.created_at AT TIME ZONE 'UTC', n.id) < (${after?.t ?? null}::timestamp, ${after?.i ?? null}::uuid))
         ORDER BY n.created_at DESC, n.id DESC LIMIT ${PAGE + 1}`,
    );
    const page = rows.slice(0, PAGE);
    // Names only of people who are current participants of that project.
    const byProject = new Map<string, Set<string>>();
    for (const r of page) {
      const ids = byProject.get(r.projectId) ?? new Set<string>();
      if (r.actorId) ids.add(r.actorId);
      for (const s of parseMessageBody(r.body ?? ''))
        if (s.type === 'mention') ids.add(s.profileId);
      byProject.set(r.projectId, ids);
    }
    const names = new Map<string, Map<string, { name: string }>>();
    for (const [projectId, ids] of byProject)
      names.set(projectId, await participantNames(tx, projectId, [...ids]));
    const items: NotificationDto[] = page.map((r) => {
      const people = names.get(r.projectId) ?? new Map();
      const who = r.actorId ? (people.get(r.actorId)?.name ?? null) : null;
      const base = {
        id: r.id,
        kind: r.kind,
        projectId: r.projectId,
        createdAt: r.createdAt,
        read: r.read,
      };
      const unavailable = (title: string) =>
        notificationDto.parse({
          ...base,
          actor: null,
          available: false,
          title,
          snippet: null,
          href: null,
        });
      const actorRef = r.actorId ? { id: r.actorId, name: who } : null;
      const channelHref = (extra = '') =>
        `/app/projects/${r.projectId}/channels?channel=${r.channelId}${extra}`;
      switch (r.kind) {
        case 'MENTION':
        case 'THREAD_REPLY':
        case 'ARTIFACT_SHARED': {
          if (!r.messageVisible || !r.channelName)
            return unavailable('This message is no longer available to you');
          const verb =
            r.kind === 'MENTION'
              ? 'mentioned you'
              : r.kind === 'THREAD_REPLY'
                ? 'replied in a thread'
                : 'shared research with you';
          return notificationDto.parse({
            ...base,
            actor: actorRef,
            available: true,
            title: `${who ?? 'A former member'} ${verb} in #${r.channelName}`,
            snippet: r.messageDeleted
              ? 'Message deleted'
              : snippet(r.body ?? '', people),
            href: channelHref(
              `&message=${r.messageId}${r.threadRootId ? `&thread=${r.threadRootId}` : ''}`,
            ),
          });
        }
        case 'TASK_ASSIGNED':
          if (!r.taskId || !r.taskTitle)
            return unavailable('This task is no longer available to you');
          return notificationDto.parse({
            ...base,
            actor: actorRef,
            available: true,
            title: `${who ?? 'A former member'} assigned you #${r.taskNumber}`,
            snippet: r.taskTitle,
            href: `/app/projects/${r.projectId}/tasks?task=${r.taskId}`,
          });
        case 'CHANNEL_ADDED':
          if (!r.channelName)
            return unavailable('This channel is no longer available to you');
          return notificationDto.parse({
            ...base,
            actor: actorRef,
            available: true,
            title: `${who ?? 'A former member'} added you to #${r.channelName}`,
            snippet: null,
            href: channelHref(),
          });
        case 'CHANNEL_REMOVED':
          // The channel name is not revealed after removal.
          return unavailable('You were removed from a restricted channel');
      }
    });
    const last = page.at(-1);
    return notificationPageDto.parse({
      items,
      nextCursor:
        rows.length > PAGE && last ? encode(last.sortKey, last.id) : null,
      unread: await unreadCount(tx, actor.id),
      topic: userTopic(actor.id),
    });
  });
}
