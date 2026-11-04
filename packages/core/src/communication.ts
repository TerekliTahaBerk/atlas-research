import { z } from 'zod';
import { referenceDto } from './artifacts';

/*
 * A04 research communication contracts. Message bodies are bounded plain
 * text; mentions are stable `<@profile-id>` tokens and research objects are
 * typed references to the existing artifact registry. Nothing here is HTML.
 */

const id = z.uuid();
export const CHANNEL_NAME = /^[a-z0-9][a-z0-9_-]{0,79}$/;
export const MESSAGE_LIMIT = 4000;
export const MESSAGE_MENTION_LIMIT = 20;
export const MESSAGE_REFERENCE_LIMIT = 10;
export const MESSAGE_PAGE = 50;
export const CHANGE_PAGE = 200;

export const reactionKeys = [
  'thumbs_up',
  'heart',
  'tada',
  'eyes',
  'check',
  'thinking',
  'pray',
  'fire',
] as const;
export const reactionKey = z.enum(reactionKeys);
export type ReactionKey = z.infer<typeof reactionKey>;
/** Fixed glyphs and accessible names; stored values are only the keys. */
export const reactionGlyphs: Record<
  ReactionKey,
  { glyph: string; label: string }
> = {
  thumbs_up: { glyph: '👍', label: 'Thumbs up' },
  heart: { glyph: '❤️', label: 'Heart' },
  tada: { glyph: '🎉', label: 'Celebrate' },
  eyes: { glyph: '👀', label: 'Looking' },
  check: { glyph: '✅', label: 'Done' },
  thinking: { glyph: '🤔', label: 'Thinking' },
  pray: { glyph: '🙏', label: 'Thanks' },
  fire: { glyph: '🔥', label: 'Fire' },
};

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const mentionPattern = new RegExp(`<@(${UUID})>`, 'g');
export const mentionToken = (profileId: string) => `<@${profileId}>`;
// Disallowed control characters (tab and newline are permitted).
const controls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** Mention IDs exactly as the server parses them. */
export function mentionIds(body: string) {
  return [...new Set([...body.matchAll(mentionPattern)].map((m) => m[1]!))];
}
/** Visible length: each mention token counts as one character. */
export const visibleLength = (body: string) =>
  body.replace(mentionPattern, '@').length;

/** Server-side normalization; throws on unrepresentable input. */
export function normalizeMessageBody(raw: string) {
  const body = raw.replace(/\r\n?/g, '\n').trim();
  if (!body || controls.test(body)) throw new Error('INVALID_BODY');
  if (visibleLength(body) > MESSAGE_LIMIT || body.length > 8000)
    throw new Error('INVALID_BODY');
  if (mentionIds(body).length > MESSAGE_MENTION_LIMIT)
    throw new Error('INVALID_BODY');
  return body;
}

export type BodySegment =
  | { type: 'text'; text: string }
  | { type: 'mention'; profileId: string }
  | { type: 'link'; href: string; text: string };
const linkPattern = /\bhttps?:\/\/[^\s<>"'`]+/gi;
/** Safe http(s) URL or null; credentials and other schemes are refused. */
export function safeHref(candidate: string) {
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}
/**
 * Splits a stored body into renderable segments. The renderer creates text
 * nodes and anchors only; nothing is ever interpreted as markup.
 */
export function parseMessageBody(body: string): BodySegment[] {
  const out: BodySegment[] = [];
  const pushText = (text: string) => {
    if (!text) return;
    let last = 0;
    for (const match of text.matchAll(linkPattern)) {
      let raw = match[0];
      // Trailing sentence punctuation is not part of a link.
      while (/[.,;:!?)\]]$/.test(raw)) raw = raw.slice(0, -1);
      const start = match.index;
      const href = safeHref(raw);
      if (!href) continue;
      if (start > last)
        out.push({ type: 'text', text: text.slice(last, start) });
      out.push({ type: 'link', href, text: raw });
      last = start + raw.length;
    }
    if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  };
  let cursor = 0;
  for (const match of body.matchAll(mentionPattern)) {
    pushText(body.slice(cursor, match.index));
    out.push({ type: 'mention', profileId: match[1]! });
    cursor = match.index + match[0].length;
  }
  pushText(body.slice(cursor));
  return out;
}

// ------------------------------------------------------------------ commands
export const messageReferenceInput = z
  .object({
    artifactId: id,
    sourceVersionId: id.optional(),
    annotationId: id.optional(),
    page: z.number().int().min(1).max(100000).optional(),
  })
  .strict();
export type MessageReferenceInput = z.infer<typeof messageReferenceInput>;
const channelName = z.string().regex(CHANNEL_NAME);
const description = z
  .string()
  .max(500)
  .refine((v) => !/[\u0000-\u001F\u007F]/.test(v), 'Single line only.');
const body = z.string().min(1).max(8000);

export const communicationCommand = z.discriminatedUnion('command', [
  z
    .object({
      command: z.literal('channel.create'),
      projectId: id,
      name: channelName,
      description: description.default(''),
      visibility: z.enum(['PROJECT', 'RESTRICTED']).default('PROJECT'),
      isDefault: z.boolean().default(false),
      idempotencyKey: id,
    })
    .strict(),
  z
    .object({
      command: z.literal('channel.update'),
      id,
      expectedVersion: z.number().int().min(1),
      name: channelName.optional(),
      description: description.optional(),
    })
    .strict(),
  z
    .object({
      command: z.enum(['channel.archive', 'channel.restore']),
      id,
      expectedVersion: z.number().int().min(1),
    })
    .strict(),
  z.object({ command: z.enum(['channel.join', 'channel.leave']), id }).strict(),
  z
    .object({
      command: z.literal('channel.member.add'),
      id,
      profileId: id,
      role: z.enum(['MANAGER', 'MEMBER']).default('MEMBER'),
    })
    .strict(),
  z
    .object({ command: z.literal('channel.member.remove'), id, profileId: id })
    .strict(),
  z
    .object({
      command: z.literal('channel.read'),
      id,
      seq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    })
    .strict(),
  z
    .object({
      command: z.literal('channel.preferences'),
      id,
      notify: z.enum(['ALL', 'MENTIONS', 'NONE']),
    })
    .strict(),
  z
    .object({
      command: z.literal('message.send'),
      channelId: id,
      threadRootId: id.optional(),
      body,
      references: z
        .array(messageReferenceInput)
        .max(MESSAGE_REFERENCE_LIMIT)
        .default([]),
      /** Explicitly confirmed Atlas output from the actor's own run. */
      aiRunId: id.optional(),
      idempotencyKey: id,
    })
    .strict(),
  z
    .object({
      command: z.literal('message.edit'),
      id,
      expectedVersion: z.number().int().min(1),
      body,
    })
    .strict(),
  z
    .object({
      command: z.literal('message.delete'),
      id,
      expectedVersion: z.number().int().min(1),
    })
    .strict(),
  z
    .object({
      command: z.literal('reaction.set'),
      messageId: id,
      emoji: reactionKey,
      active: z.boolean(),
    })
    .strict(),
  z
    .object({
      command: z.literal('notification.read'),
      ids: z.array(id).min(1).max(100),
    })
    .strict(),
  z
    .object({
      command: z.literal('notification.read-all'),
      before: z.iso.datetime({ offset: true }).optional(),
    })
    .strict(),
]);
export type CommunicationCommand = z.infer<typeof communicationCommand>;
export type CommunicationCommandInput = z.input<typeof communicationCommand>;
export const communicationCommandNames = communicationCommand.options.flatMap(
  (option) => {
    const value = option.shape.command;
    return 'options' in value ? [...value.options] : [value.value];
  },
);
export const communicationResult = z.object({
  id,
  seq: z.number().int().optional(),
  changeSeq: z.number().int().optional(),
  version: z.number().int().optional(),
  replayed: z.boolean().optional(),
  changed: z.boolean().optional(),
  updated: z.number().int().optional(),
});
export type CommunicationResult = z.infer<typeof communicationResult>;

// ---------------------------------------------------------------------- DTOs
export const channelCapability = z.enum([
  'channel.read',
  'channel.post',
  'channel.manage',
]);
export const channelDto = z.object({
  id,
  projectId: id,
  name: z.string(),
  description: z.string(),
  visibility: z.enum(['PROJECT', 'RESTRICTED']),
  isDefault: z.boolean(),
  archived: z.boolean(),
  version: z.number().int(),
  lastSeq: z.number().int(),
  joined: z.boolean(),
  notify: z.enum(['ALL', 'MENTIONS', 'NONE']).nullable(),
  unread: z.number().int(),
  mentions: z.number().int(),
  capabilities: z.array(channelCapability),
});
export type ChannelDto = z.infer<typeof channelDto>;
export const channelListDto = z.object({
  items: z.array(channelDto),
  canCreate: z.boolean(),
});
export type ChannelListDto = z.infer<typeof channelListDto>;
export const personRef = z.object({ id, name: z.string().nullable() });
export const channelMemberDto = z.object({
  id,
  name: z.string().nullable(),
  role: z.enum(['MANAGER', 'MEMBER']),
  /** False when the person no longer has live project access. */
  active: z.boolean(),
});
export const channelDetailDto = z.object({
  channel: channelDto,
  members: z.array(channelMemberDto),
  /** Private Realtime topic for the current membership epoch. */
  topic: z.string(),
  changeSeq: z.number().int(),
});
export type ChannelDetailDto = z.infer<typeof channelDetailDto>;

export const messageReferenceDto = referenceDto.extend({
  /** Exact source identity of a citation, re-authorized per viewer. */
  citation: z
    .object({
      sourceVersionId: id,
      page: z.number().int().nullable(),
      annotationId: id.nullable(),
      /** Quote only when the annotation is visible to this viewer now. */
      quote: z.string().nullable(),
      state: z.enum(['AVAILABLE', 'UNAVAILABLE']),
    })
    .nullable(),
});
export type MessageReferenceDto = z.infer<typeof messageReferenceDto>;
export const messageDto = z.object({
  id,
  channelId: id,
  projectId: id,
  seq: z.number().int(),
  changeSeq: z.number().int(),
  threadRootId: id.nullable(),
  kind: z.enum(['USER', 'ATLAS']),
  author: personRef,
  body: z.string(),
  mentions: z.array(personRef),
  references: z.array(messageReferenceDto),
  reactions: z.array(
    z.object({
      emoji: reactionKey,
      count: z.number().int(),
      mine: z.boolean(),
    }),
  ),
  replyCount: z.number().int(),
  lastReplyAt: z.string().nullable(),
  version: z.number().int(),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
  deleted: z.boolean(),
  aiRunId: id.nullable(),
  /** Present only on the viewer's own messages (pending-send reconciliation). */
  clientKey: id.nullable(),
});
export type MessageDto = z.infer<typeof messageDto>;
export const messagePageDto = z.object({
  items: z.array(messageDto),
  /** Older page cursor (a sequence number), or null at the beginning. */
  before: z.number().int().nullable(),
  changeSeq: z.number().int(),
});
export type MessagePageDto = z.infer<typeof messagePageDto>;
export const messageChangesDto = z.object({
  items: z.array(messageDto),
  changeSeq: z.number().int(),
  more: z.boolean(),
});
export type MessageChangesDto = z.infer<typeof messageChangesDto>;
export const threadDto = z.object({
  root: messageDto,
  replies: z.array(messageDto),
  more: z.boolean(),
});
export type ThreadDto = z.infer<typeof threadDto>;
export const mentionCandidateDto = z.object({ id, name: z.string() });

export const notificationKind = z.enum([
  'MENTION',
  'THREAD_REPLY',
  'ARTIFACT_SHARED',
  'TASK_ASSIGNED',
  'CHANNEL_ADDED',
  'CHANNEL_REMOVED',
]);
export const notificationDto = z.object({
  id,
  kind: notificationKind,
  projectId: id,
  actor: personRef.nullable(),
  /** False when the target is no longer visible to the recipient. */
  available: z.boolean(),
  title: z.string(),
  snippet: z.string().nullable(),
  href: z.string().nullable(),
  createdAt: z.string(),
  read: z.boolean(),
});
export type NotificationDto = z.infer<typeof notificationDto>;
export const notificationPageDto = z.object({
  items: z.array(notificationDto),
  nextCursor: z.string().nullable(),
  unread: z.number().int(),
  topic: z.string(),
});
export type NotificationPageDto = z.infer<typeof notificationPageDto>;

/** Exact authorized context an explicit @Atlas request would use. */
export const atlasContextDto = z.object({
  channelId: id,
  threadRootId: id.nullable(),
  messageIds: z.array(id),
  sources: z.array(
    z.object({ artifactId: id, projectPaperId: id, title: z.string() }),
  ),
  truncated: z.boolean(),
  ai: z.object({ available: z.boolean(), reason: z.string().nullable() }),
});
export type AtlasContextDto = z.infer<typeof atlasContextDto>;

/** Identifier-only Realtime payloads; clients always refetch content. */
export const realtimeEvent = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('message.created'),
    payload: z.object({
      channelId: id,
      id,
      seq: z.number().int(),
      changeSeq: z.number().int(),
      threadRootId: id.nullable(),
    }),
  }),
  z.object({
    event: z.literal('message.changed'),
    payload: z.object({
      channelId: id,
      id,
      version: z.number().int(),
      changeSeq: z.number().int(),
    }),
  }),
  z.object({
    event: z.literal('channel.changed'),
    payload: z.object({ channelId: id, version: z.number().int() }),
  }),
  z.object({
    event: z.literal('topic.rotated'),
    payload: z.object({ channelId: id }),
  }),
  z.object({
    event: z.literal('notification.created'),
    payload: z.object({ id }),
  }),
  z.object({
    event: z.literal('notification.read'),
    payload: z.object({ count: z.number().int() }),
  }),
]);
export type RealtimeEvent = z.infer<typeof realtimeEvent>;
