'use client';
import { z } from 'zod';
import {
  atlasContextDto,
  channelDetailDto,
  channelListDto,
  communicationResult,
  mentionCandidateDto,
  messageChangesDto,
  messageDto,
  messagePageDto,
  notificationPageDto,
  threadDto,
  type CommunicationCommandInput,
} from '@atlas/core';
import { ApiError } from '@/features/library/client';

/**
 * `NETWORK` means the response was lost: the request may already have
 * committed. Callers retry with the same idempotency key, never a new one.
 */
async function call<T>(
  url: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: 'no-store',
      ...(body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });
  } catch {
    throw new ApiError('You appear to be offline.', 'NETWORK', 0);
  }
  let envelope;
  try {
    envelope = z
      .object({
        data: z.unknown().optional(),
        error: z.object({ message: z.string(), code: z.string() }).optional(),
        requestId: z.string(),
      })
      .parse(await response.json());
  } catch {
    throw new ApiError(
      'The server response was not readable.',
      response.status >= 500 || response.status === 0
        ? 'NETWORK'
        : 'INTERNAL_ERROR',
      response.status,
    );
  }
  if (!response.ok || envelope.error)
    throw new ApiError(
      `${envelope.error?.message ?? 'Request failed.'} (${envelope.requestId})`,
      envelope.error?.code ?? 'INTERNAL_ERROR',
      response.status,
    );
  return schema.parse(envelope.data);
}
const qs = (params: Record<string, unknown>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== '') search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const communicate = (command: CommunicationCommandInput) =>
  call('/api/v1/commands', communicationResult, command);
export const fetchChannels = (projectId: string) =>
  call(`/api/v1/projects/${projectId}/channels`, channelListDto);
export const fetchChannel = (channelId: string) =>
  call(`/api/v1/channels/${channelId}`, channelDetailDto);
export const fetchMessages = (channelId: string, before?: number) =>
  call(
    `/api/v1/channels/${channelId}/messages${qs({ before })}`,
    messagePageDto,
  );
export const fetchChanges = (channelId: string, since: number) =>
  call(
    `/api/v1/channels/${channelId}/messages${qs({ since })}`,
    messageChangesDto,
  );
export const fetchMessage = (id: string) =>
  call(`/api/v1/messages/${id}`, messageDto);
export const fetchThread = (id: string) =>
  call(`/api/v1/messages/${id}/thread`, threadDto);
export const fetchPeople = (channelId: string, q: string) =>
  call(
    `/api/v1/channels/${channelId}/people${qs({ q })}`,
    z.array(mentionCandidateDto),
  );
export const fetchAtlasContext = (channelId: string, thread?: string) =>
  call(`/api/v1/channels/${channelId}/atlas${qs({ thread })}`, atlasContextDto);
export const fetchNotifications = (cursor?: string, unread = false) =>
  call(
    `/api/v1/notifications${qs({ cursor, unread: unread || undefined })}`,
    notificationPageDto,
  );
export const fetchUnread = () =>
  call(
    '/api/v1/notifications/unread',
    z.object({ unread: z.number().int(), topic: z.string() }),
  );
export { ApiError };
