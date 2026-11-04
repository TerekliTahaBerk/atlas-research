import 'server-only';
import { z } from 'zod';
import {
  CHANGE_PAGE,
  MESSAGE_PAGE,
  channelDetailDto,
  channelDto,
  channelListDto,
  mentionCandidateDto,
  mentionIds,
  messageChangesDto,
  messageDto,
  messagePageDto,
  reactionKey,
  threadDto,
  type MessageDto,
} from '@atlas/core';
import { Prisma } from '@atlas/database';
import {
  withActor,
  type VerifiedActor,
} from '@/features/platform/server/database';
import { PlatformError } from '@/features/platform/server/errors';
import { requireProject } from '@/features/library/server/library';
import {
  participantNames,
  projectCapabilities,
  projectParticipants,
  resolveArtifacts,
} from '@/features/artifacts/server/references';

/*
 * Every read runs inside the actor's transaction under RLS: a channel the
 * actor cannot read, or a message in one, is indistinguishable from a
 * missing one. Message content is hydrated per viewer, so shared research
 * cards, mention names and annotation quotes are re-authorized on each read.
 */
const big = z.coerce.number().int();
const channelRow = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  name: z.string(),
  description: z.string(),
  visibility: z.enum(['PROJECT', 'RESTRICTED']),
  isDefault: z.boolean(),
  archived: z.boolean(),
  version: z.number().int(),
  lastSeq: big,
  changeSeq: big,
  epoch: z.uuid(),
  joined: z.boolean(),
  notify: z.enum(['ALL', 'MENTIONS', 'NONE']).nullable(),
  unread: z.number().int(),
  mentions: z.number().int(),
  capabilities: z.array(z.string()),
});
const channelSelect = (actorId: string) => Prisma.sql`
 SELECT c.id, c.project_id AS "projectId", c.name, c.description, c.visibility, c.is_default AS "isDefault",
  c.archived_at IS NOT NULL AS archived, c.version, c.last_seq::text AS "lastSeq", c.change_seq::text AS "changeSeq", c.epoch,
  cm.profile_id IS NOT NULL AS joined, cm.notify,
  CASE WHEN cm.profile_id IS NULL THEN 0 ELSE (SELECT count(*)::int FROM channel_messages x WHERE x.channel_id=c.id
   AND x.thread_root_id IS NULL AND x.seq>cm.last_read_seq AND x.author_id<>${actorId}::uuid AND x.deleted_at IS NULL) END AS unread,
  (SELECT count(*)::int FROM notifications n WHERE n.recipient_id=${actorId}::uuid AND n.channel_id=c.id AND n.read_at IS NULL) AS mentions,
  atlas_private.channel_capabilities(c.id) AS capabilities
 FROM channels c LEFT JOIN channel_members cm ON cm.channel_id=c.id AND cm.profile_id=${actorId}::uuid`;
const toChannel = (row: z.infer<typeof channelRow>) =>
  channelDto.parse({
    ...row,
    capabilities: row.capabilities.filter((c) => c.startsWith('channel.')),
  });

export async function listChannels(actor: VerifiedActor, projectId: string) {
  z.uuid().parse(projectId);
  return withActor(actor, async (tx) => {
    await requireProject(tx, projectId, 'project.read');
    const rows = z
      .array(channelRow)
      .parse(
        await tx.$queryRaw(
          Prisma.sql`${channelSelect(actor.id)} WHERE c.project_id=${projectId}::uuid ORDER BY c.archived_at IS NOT NULL, c.is_default DESC, c.name LIMIT 300`,
        ),
      );
    const caps = await projectCapabilities(tx, projectId);
    // Owners only (the SQL function answers [] for everyone else).
    const recoverable = caps.includes('project.update')
      ? z
          .array(
            z.object({
              id: z.uuid(),
              name: z.string(),
              eligible: z.array(z.uuid()),
            }),
          )
          .parse(
            (
              z
                .array(z.object({ r: z.unknown() }))
                .parse(
                  await tx.$queryRaw`SELECT atlas_private.channel_recovery(${projectId}::uuid) AS r`,
                )[0] ?? { r: [] }
            ).r,
          )
      : [];
    const names = await participantNames(
      tx,
      projectId,
      recoverable.flatMap((c) => c.eligible),
    );
    return channelListDto.parse({
      items: rows.map(toChannel),
      canCreate: caps.includes('project.write'),
      recoverable: recoverable.map((c) => ({
        id: c.id,
        name: c.name,
        eligible: c.eligible.map((id) => ({
          id,
          name: names.get(id)?.name ?? null,
        })),
      })),
    });
  });
}

async function loadChannel(
  tx: Prisma.TransactionClient,
  actor: VerifiedActor,
  channelId: string,
) {
  const [row] = z
    .array(channelRow)
    .parse(
      await tx.$queryRaw(
        Prisma.sql`${channelSelect(actor.id)} WHERE c.id=${channelId}::uuid`,
      ),
    );
  if (!row) throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
  return row;
}

export const channelTopic = (channelId: string, epoch: string) =>
  `atlas:channel:${channelId}:${epoch}`;
export const userTopic = (profileId: string) => `atlas:user:${profileId}`;

export async function getChannel(actor: VerifiedActor, channelId: string) {
  z.uuid().parse(channelId);
  return withActor(actor, async (tx) => {
    const row = await loadChannel(tx, actor, channelId);
    const members = z
      .array(
        z.object({
          id: z.uuid(),
          role: z.enum(['MANAGER', 'MEMBER']),
        }),
      )
      .parse(
        await tx.$queryRaw`SELECT profile_id AS id, role FROM channel_members WHERE channel_id=${channelId}::uuid ORDER BY role, created_at LIMIT 500`,
      );
    const names = await participantNames(
      tx,
      row.projectId,
      members.map((m) => m.id),
    );
    return channelDetailDto.parse({
      channel: toChannel(row),
      members: members.map((m) => ({
        id: m.id,
        role: m.role,
        name: names.get(m.id)?.name ?? null,
        active: names.has(m.id),
      })),
      topic: channelTopic(row.id, row.epoch),
      changeSeq: row.changeSeq,
    });
  });
}

// ------------------------------------------------------------ hydration
const messageRow = z.object({
  id: z.uuid(),
  channelId: z.uuid(),
  projectId: z.uuid(),
  seq: big,
  changeSeq: big,
  threadRootId: z.uuid().nullable(),
  kind: z.enum(['USER', 'ATLAS']),
  authorId: z.uuid(),
  body: z.string(),
  clientKey: z.uuid(),
  aiRunId: z.uuid().nullable(),
  version: z.number().int(),
  replyCount: z.number().int(),
  lastReplyAt: z.string().nullable(),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
  deleted: z.boolean(),
});
type MessageRow = z.infer<typeof messageRow>;
const messageSelect = Prisma.sql`SELECT m.id, m.channel_id AS "channelId", m.project_id AS "projectId",
 m.seq::text AS seq, m.change_seq::text AS "changeSeq", m.thread_root_id AS "threadRootId", m.kind, m.author_id AS "authorId",
 m.body, m.client_key AS "clientKey", m.ai_run_id AS "aiRunId", m.version, m.reply_count AS "replyCount",
 m.last_reply_at::text AS "lastReplyAt", m.created_at::text AS "createdAt", m.edited_at::text AS "editedAt",
 m.deleted_at IS NOT NULL AS deleted FROM channel_messages m`;

export async function hydrate(
  tx: Prisma.TransactionClient,
  actor: VerifiedActor,
  projectId: string,
  rows: MessageRow[],
): Promise<MessageDto[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [mentions, reactions, refs] = await Promise.all([
    z
      .array(z.object({ messageId: z.uuid(), profileId: z.uuid() }))
      .parse(
        await tx.$queryRaw`SELECT message_id AS "messageId", profile_id AS "profileId" FROM message_mentions WHERE message_id = ANY(${ids}::uuid[])`,
      ),
    z
      .array(
        z.object({
          messageId: z.uuid(),
          emoji: reactionKey,
          count: z.number().int(),
          mine: z.boolean(),
        }),
      )
      .parse(
        await tx.$queryRaw`SELECT message_id AS "messageId", emoji, count(*)::int AS count, bool_or(profile_id=${actor.id}::uuid) AS mine
         FROM message_reactions WHERE message_id = ANY(${ids}::uuid[]) GROUP BY message_id, emoji ORDER BY min(created_at)`,
      ),
    z
      .array(
        z.object({
          messageId: z.uuid(),
          ordinal: z.number().int(),
          artifactId: z.uuid(),
          sourceVersionId: z.uuid().nullable(),
          annotationId: z.uuid().nullable(),
          page: z.number().int().nullable(),
          sourceVisible: z.boolean(),
          quote: z.string().nullable(),
          annotationVisible: z.boolean(),
        }),
      )
      .parse(
        // Joined rows are filtered by the viewer's own RLS: private
        // annotations of other people and unreadable versions stay hidden.
        await tx.$queryRaw`SELECT r.message_id AS "messageId", r.ordinal, r.artifact_id AS "artifactId",
          r.source_version_id AS "sourceVersionId", r.annotation_id AS "annotationId", r.page,
          sv.id IS NOT NULL AS "sourceVisible", left(a.anchor->>'quote',2000) AS quote, a.id IS NOT NULL AS "annotationVisible"
         FROM message_references r
         LEFT JOIN source_versions sv ON sv.id=r.source_version_id AND sv.state='READY'
         LEFT JOIN paper_annotations a ON a.id=r.annotation_id AND a.deleted_at IS NULL
         WHERE r.message_id = ANY(${ids}::uuid[]) ORDER BY r.message_id, r.ordinal`,
      ),
  ]);
  const people = await participantNames(tx, projectId, [
    ...rows.map((r) => r.authorId),
    ...mentions.map((m) => m.profileId),
  ]);
  const resolved = new Map(
    (
      await resolveArtifacts(
        tx,
        projectId,
        refs.map((r) => r.artifactId),
      )
    ).map((r) => [r.artifactId, r]),
  );
  return rows.map((row) => {
    const own = row.authorId === actor.id;
    return messageDto.parse({
      id: row.id,
      channelId: row.channelId,
      projectId: row.projectId,
      seq: row.seq,
      changeSeq: row.changeSeq,
      threadRootId: row.threadRootId,
      kind: row.kind,
      author: {
        id: row.authorId,
        name: people.get(row.authorId)?.name ?? null,
      },
      body: row.deleted ? '' : row.body,
      mentions: row.deleted
        ? []
        : mentionIds(row.body).map((id) => ({
            id,
            name: mentions.some(
              (m) => m.messageId === row.id && m.profileId === id,
            )
              ? (people.get(id)?.name ?? null)
              : null,
          })),
      references: refs
        .filter((r) => r.messageId === row.id)
        .map((r) => {
          const base = resolved.get(r.artifactId);
          const available = !!base && base.state !== 'UNAVAILABLE';
          return {
            artifactId: r.artifactId,
            kind: base?.kind ?? 'PAPER',
            id: available ? base.id : null,
            state: base?.state ?? 'UNAVAILABLE',
            title: available ? base.title : null,
            detail: available ? base.detail : null,
            href:
              available && base.href && r.sourceVersionId && r.sourceVisible
                ? `/app/projects/${projectId}/reader?paper=${base.id}&source=${r.sourceVersionId}${r.page ? `&page=${r.page}` : ''}${r.annotationId && r.annotationVisible ? `&annotation=${r.annotationId}` : ''}`
                : available
                  ? base.href
                  : null,
            citation: r.sourceVersionId
              ? {
                  sourceVersionId: r.sourceVersionId,
                  page: available ? r.page : null,
                  annotationId: r.annotationId,
                  quote:
                    available && r.annotationVisible && r.sourceVisible
                      ? r.quote
                      : null,
                  state:
                    available &&
                    r.sourceVisible &&
                    (!r.annotationId || r.annotationVisible)
                      ? 'AVAILABLE'
                      : 'UNAVAILABLE',
                }
              : null,
          };
        }),
      reactions: reactions
        .filter((r) => r.messageId === row.id)
        .map(({ emoji, count, mine }) => ({ emoji, count, mine })),
      replyCount: row.replyCount,
      lastReplyAt: row.lastReplyAt,
      version: row.version,
      createdAt: row.createdAt,
      editedAt: row.editedAt,
      deleted: row.deleted,
      aiRunId: row.aiRunId,
      clientKey: own ? row.clientKey : null,
    });
  });
}

const pageQuery = z
  .object({
    before: z.coerce.number().int().min(1).optional(),
    since: z.coerce.number().int().min(0).optional(),
  })
  .strict();

/**
 * Every row changed after a change cursor — including thread replies, edits,
 * tombstones and reaction changes — in commit order, for reconnect backfill.
 */
export async function messageChanges(
  actor: VerifiedActor,
  channelId: string,
  since: number,
) {
  z.uuid().parse(channelId);
  z.number().int().min(0).parse(since);
  return withActor(actor, async (tx) => {
    const channel = await loadChannel(tx, actor, channelId);
    const rows = z
      .array(messageRow)
      .parse(
        await tx.$queryRaw(
          Prisma.sql`${messageSelect} WHERE m.channel_id=${channelId}::uuid AND m.change_seq>${since}::bigint ORDER BY m.change_seq LIMIT ${CHANGE_PAGE + 1}`,
        ),
      );
    const page = rows.slice(0, CHANGE_PAGE);
    const more = rows.length > CHANGE_PAGE;
    return messageChangesDto.parse({
      items: await hydrate(tx, actor, channel.projectId, page),
      // The cursor advances only over rows actually returned.
      changeSeq: more ? page.at(-1)!.changeSeq : channel.changeSeq,
      more,
      topic: channelTopic(channel.id, channel.epoch),
    });
  });
}

/** Top-level timeline page, newest first, returned oldest→newest. */
export async function messagePage(
  actor: VerifiedActor,
  channelId: string,
  before?: number,
) {
  z.uuid().parse(channelId);
  z.number().int().min(1).optional().parse(before);
  return withActor(actor, async (tx) => {
    const channel = await loadChannel(tx, actor, channelId);
    const rows = z.array(messageRow).parse(
      await tx.$queryRaw(
        Prisma.sql`${messageSelect} WHERE m.channel_id=${channelId}::uuid AND m.thread_root_id IS NULL
            ${before ? Prisma.sql`AND m.seq<${before}::bigint` : Prisma.empty}
            ORDER BY m.seq DESC LIMIT ${MESSAGE_PAGE + 1}`,
      ),
    );
    const page = rows.slice(0, MESSAGE_PAGE).reverse();
    return messagePageDto.parse({
      items: await hydrate(tx, actor, channel.projectId, page),
      before: rows.length > MESSAGE_PAGE ? page[0]!.seq : null,
      changeSeq: channel.changeSeq,
    });
  });
}

/** HTTP entry point: `?since=` backfills changes, otherwise a timeline page. */
export async function listMessages(
  actor: VerifiedActor,
  channelId: string,
  raw: unknown,
) {
  const query = pageQuery.parse(raw);
  return query.since !== undefined
    ? messageChanges(actor, channelId, query.since)
    : messagePage(actor, channelId, query.before);
}

export async function getThread(actor: VerifiedActor, messageId: string) {
  z.uuid().parse(messageId);
  return withActor(actor, async (tx) => {
    const [root] = z
      .array(messageRow)
      .parse(
        await tx.$queryRaw(
          Prisma.sql`${messageSelect} WHERE m.id=${messageId}::uuid`,
        ),
      );
    if (!root || root.threadRootId)
      throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
    const replies = z
      .array(messageRow)
      .parse(
        await tx.$queryRaw(
          Prisma.sql`${messageSelect} WHERE m.thread_root_id=${messageId}::uuid ORDER BY m.seq LIMIT 501`,
        ),
      );
    const all = await hydrate(tx, actor, root.projectId, [
      root,
      ...replies.slice(0, 500),
    ]);
    return threadDto.parse({
      root: all[0],
      replies: all.slice(1),
      more: replies.length > 500,
    });
  });
}

export async function getMessage(actor: VerifiedActor, messageId: string) {
  z.uuid().parse(messageId);
  return withActor(actor, async (tx) => {
    const [row] = z
      .array(messageRow)
      .parse(
        await tx.$queryRaw(
          Prisma.sql`${messageSelect} WHERE m.id=${messageId}::uuid`,
        ),
      );
    if (!row) throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
    const [message] = await hydrate(tx, actor, row.projectId, [row]);
    if (!message) throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
    return message;
  });
}

/** People who can read this channel now; never other projects' users. */
export async function mentionCandidates(
  actor: VerifiedActor,
  channelId: string,
  q: string,
) {
  z.uuid().parse(channelId);
  const query = z.string().trim().max(80).parse(q).toLowerCase();
  return withActor(actor, async (tx) => {
    const channel = await loadChannel(tx, actor, channelId);
    const people = await projectParticipants(tx, channel.projectId);
    const allowed =
      channel.visibility === 'RESTRICTED'
        ? new Set(
            z
              .array(z.object({ id: z.uuid() }))
              .parse(
                await tx.$queryRaw`SELECT profile_id AS id FROM channel_members WHERE channel_id=${channelId}::uuid`,
              )
              .map((r) => r.id),
          )
        : null;
    return z.array(mentionCandidateDto).parse(
      people
        .filter((p) => !allowed || allowed.has(p.id))
        .filter((p) => !query || p.name.toLowerCase().includes(query))
        .slice(0, 20)
        .map((p) => ({ id: p.id, name: p.name })),
    );
  });
}
