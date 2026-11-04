import 'server-only';
import { z } from 'zod';
import type { VerifiedActor } from '@/features/platform/server/database';
import { rateLimit } from '@/features/platform/server/limiter';
import {
  getChannel,
  getMessage,
  getThread,
  listChannels,
  listMessages,
  mentionCandidates,
} from './reads';
import { listNotifications, notificationUnread } from './notifications';
import { atlasContext } from './atlas';

const uuid = z.uuid();
const params = (url: URL) =>
  Object.fromEntries(
    [...url.searchParams.entries()].filter(([, value]) => value !== ''),
  );

/** A04 authenticated reads. Returns undefined for paths it does not own. */
export async function communicationGet(
  actor: VerifiedActor,
  path: string[],
  url: URL,
) {
  const [root, id, leaf, extra] = path;
  if (extra !== undefined) return undefined;
  if (root === 'projects' && leaf === 'channels')
    return listChannels(actor, uuid.parse(id));
  if (root === 'channels' && id !== undefined) {
    if (leaf === undefined) return getChannel(actor, uuid.parse(id));
    if (leaf === 'messages')
      return listMessages(actor, uuid.parse(id), params(url));
    if (leaf === 'people')
      return mentionCandidates(
        actor,
        uuid.parse(id),
        url.searchParams.get('q') ?? '',
      );
    if (leaf === 'atlas') {
      await rateLimit('atlas-context', actor.id, 30, 60);
      const thread = url.searchParams.get('thread');
      return atlasContext(actor, {
        channelId: uuid.parse(id),
        ...(thread ? { threadRootId: uuid.parse(thread) } : {}),
      });
    }
  }
  if (root === 'messages' && id !== undefined) {
    if (leaf === undefined) return getMessage(actor, uuid.parse(id));
    if (leaf === 'thread') return getThread(actor, uuid.parse(id));
  }
  if (root === 'notifications') {
    if (id === undefined)
      return listNotifications(
        actor,
        z
          .string()
          .max(400)
          .optional()
          .parse(url.searchParams.get('cursor') || undefined),
        url.searchParams.get('unread') === 'true',
      );
    if (id === 'unread' && leaf === undefined) return notificationUnread(actor);
  }
  return undefined;
}

/** Separate buckets so reading/reacting cannot starve sending, and vice versa. */
export function communicationBucket(command: string): [string, number] {
  if (command.startsWith('message.')) return ['message', 60];
  if (command === 'reaction.set') return ['reaction', 120];
  if (command === 'channel.read' || command.startsWith('notification.'))
    return ['read-state', 240];
  return ['write', 30];
}
