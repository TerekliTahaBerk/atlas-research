'use client';
import { z } from 'zod';
import {
  importPreview,
  referenceImportResult,
  type InterchangeFormat,
  type ReferenceImportCommand,
} from '@atlas/core';
import { ApiError } from './client';

/** NETWORK means the response was not confirmed; the request may have committed. */
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
      'INTERNAL_ERROR',
      response.status,
    );
  }
  if (!response.ok || envelope.error)
    throw new ApiError(
      envelope.error?.message ?? 'Request failed.',
      envelope.error?.code ?? 'INTERNAL_ERROR',
      response.status,
    );
  return schema.parse(envelope.data);
}

export const previewFile = (
  projectId: string,
  format: InterchangeFormat,
  content: string,
) =>
  call(`/api/v1/projects/${projectId}/imports/preview`, importPreview, {
    format,
    content,
  });
export const previewZotero = (
  projectId: string,
  library: string,
  itemKeys: string[],
) =>
  call(`/api/v1/projects/${projectId}/imports/zotero`, importPreview, {
    library,
    itemKeys,
  });
export const importBatch = (command: ReferenceImportCommand) =>
  call('/api/v1/commands', referenceImportResult, command);

const library = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['user', 'group']),
});
export const zoteroStatusSchema = z.object({
  configured: z.boolean(),
  connection: z
    .object({
      id: z.uuid(),
      userId: z.string(),
      displayName: z.string().nullable(),
      libraries: z.array(library),
      connectedAt: z.string(),
    })
    .nullable(),
});
export type ZoteroStatus = z.infer<typeof zoteroStatusSchema>;
export const fetchZoteroStatus = () =>
  call('/api/v1/integrations/zotero', zoteroStatusSchema);
export const connectZotero = (apiKey: string) =>
  call('/api/v1/integrations/zotero/connect', zoteroStatusSchema, { apiKey });
export const disconnectZotero = () =>
  call('/api/v1/integrations/zotero/disconnect', zoteroStatusSchema, {});
const page = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().nullable(),
    nextStart: z.number().nullable(),
  });
export const fetchZoteroCollections = (libraryId: string) =>
  call(
    `/api/v1/integrations/zotero/collections?library=${encodeURIComponent(libraryId)}`,
    page(
      z.object({
        key: z.string(),
        name: z.string(),
        parent: z.string().nullable(),
        items: z.number().nullable(),
      }),
    ),
  );
export const zoteroItemSchema = z.object({
  key: z.string().nullable(),
  version: z.number().nullable(),
  title: z.string().nullable(),
  type: z.string().nullable(),
  creators: z.array(z.string()),
  year: z.number().nullable(),
  importable: z.boolean(),
});
export type ZoteroListItem = z.infer<typeof zoteroItemSchema>;
export const fetchZoteroItems = (
  libraryId: string,
  collection: string | null,
  start: number,
) =>
  call(
    `/api/v1/integrations/zotero/items?${new URLSearchParams({
      library: libraryId,
      start: String(start),
      ...(collection ? { collection } : {}),
    }).toString()}`,
    page(zoteroItemSchema).extend({ libraryVersion: z.number().nullable() }),
  );
