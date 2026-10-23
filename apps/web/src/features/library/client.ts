'use client';
import { z } from 'zod';
import {
  annotationDto,
  libraryPageDto,
  projectPaperDto,
  searchResponse,
  sourceAccessDto,
  uploadIntentDto,
  type LibraryQuery,
  type ResearchCommandInput,
  type ScholarlySearchRequest,
} from '@atlas/core';
import { requestData } from '@/features/platform/client';

/** Error carrying the public API code so screens can pick accurate states. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function getJson<T>(
  url: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    ...(signal ? { signal } : {}),
  });
  const envelope = z
    .object({
      data: z.unknown().optional(),
      error: z.object({ message: z.string(), code: z.string() }).optional(),
      requestId: z.string(),
    })
    .parse(await response.json());
  if (!response.ok || envelope.error)
    throw new ApiError(
      `${envelope.error?.message ?? 'Request failed.'} (${envelope.requestId})`,
      envelope.error?.code ?? 'INTERNAL_ERROR',
      response.status,
    );
  return schema.parse(envelope.data);
}

function query(params: Record<string, unknown>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== '' && value !== false)
      search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function searchResearch(
  projectId: string,
  request: {
    [K in keyof ScholarlySearchRequest]?: ScholarlySearchRequest[K] | undefined;
  },
  signal?: AbortSignal,
) {
  return getJson(
    `/api/v1/projects/${projectId}/research${query(request)}`,
    searchResponse,
    signal,
  );
}
export function fetchLibrary(
  projectId: string,
  request: Partial<LibraryQuery>,
) {
  return getJson(
    `/api/v1/projects/${projectId}/papers${query(request)}`,
    libraryPageDto,
  );
}
export function fetchPaper(id: string) {
  return getJson(`/api/v1/papers/${id}`, projectPaperDto);
}
export function fetchAnnotations(sourceVersionId: string) {
  return getJson(
    `/api/v1/sources/${sourceVersionId}/annotations`,
    z.array(annotationDto),
  );
}
export function fetchSourceAccess(sourceVersionId: string) {
  return getJson(`/api/v1/sources/${sourceVersionId}/access`, sourceAccessDto);
}
const commandResult = z.object({
  id: z.uuid(),
  existing: z.boolean().optional(),
  replayed: z.boolean().optional(),
});
/** Resolves only after the server transaction has committed. */
export function runCommand(command: ResearchCommandInput) {
  return requestData('/api/v1/commands', commandResult, command);
}
export function exportHref(
  target: { paperId: string } | { projectId: string; collectionId?: string },
  format: 'bibtex' | 'ris',
) {
  return 'paperId' in target
    ? `/api/v1/papers/${target.paperId}/export${query({ format })}`
    : `/api/v1/projects/${target.projectId}/export${query({ format, collectionId: target.collectionId })}`;
}
export async function fetchExport(href: string) {
  const response = await fetch(href, { cache: 'no-store' });
  if (!response.ok) throw new Error('The citation export failed. Try again.');
  return response.text();
}

export type UploadPhase =
  | 'hashing'
  | 'requesting'
  | 'uploading'
  | 'verifying'
  | 'quarantined'
  | 'rejected';

/**
 * Hash locally, obtain a single-object grant, upload directly to private
 * storage, then let the server verify the stored object. Success means
 * QUARANTINED (awaiting validation), never readable.
 */
export async function uploadPdf(
  projectId: string,
  projectPaperId: string,
  file: File,
  onPhase: (phase: UploadPhase) => void,
) {
  onPhase('hashing');
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  onPhase('requesting');
  const intent = await requestData(
    `/api/v1/projects/${projectId}/uploads`,
    uploadIntentDto,
    {
      fileName: file.name,
      mediaType: 'application/pdf',
      byteSize: file.size,
      sha256,
      projectPaperId,
      idempotencyKey: crypto.randomUUID(),
    },
  );
  if (!intent.upload)
    throw new Error('This upload grant is no longer open. Start again.');
  onPhase('uploading');
  const put = await fetch(intent.upload.url, {
    method: 'PUT',
    headers: { 'content-type': 'application/pdf', 'x-upsert': 'false' },
    body: bytes,
  });
  if (!put.ok) throw new Error('The file could not be uploaded. Try again.');
  onPhase('verifying');
  const result = await requestData(
    `/api/v1/uploads/${intent.id}/finalize`,
    z.object({
      state: z.string(),
      failure: z.string().nullable().optional(),
    }),
    {},
  );
  onPhase(result.state === 'QUARANTINED' ? 'quarantined' : 'rejected');
  return result;
}
