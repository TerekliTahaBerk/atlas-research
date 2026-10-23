'use client';
import { z } from 'zod';
import {
  artifactCommandResult,
  artifactOptionsDto,
  documentDto,
  documentEditProposal,
  documentPageDto,
  graphDto,
  linksDto,
  searchPageDto,
  taskDetailDto,
  taskPageDto,
  taskProposal,
  versionDto,
  versionPageDto,
  type ArtifactCommandInput,
  type ArtifactKind,
  type ArtifactSearchQuery,
  type TaskListQuery,
} from '@atlas/core';
import { ApiError } from '@/features/library/client';

/** Error codes include NETWORK for requests that never reached the server. */
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

/** Resolves only after the server transaction committed. */
export const artifactCommand = (command: ArtifactCommandInput) =>
  call('/api/v1/commands', artifactCommandResult, command);
export const fetchDocuments = (
  projectId: string,
  archived = false,
  cursor?: string,
) =>
  call(
    `/api/v1/projects/${projectId}/documents${qs({ archived, cursor })}`,
    documentPageDto,
  );
export const fetchDocument = (id: string) =>
  call(`/api/v1/documents/${id}`, documentDto);
export const fetchVersions = (id: string, cursor?: string) =>
  call(`/api/v1/documents/${id}/versions${qs({ cursor })}`, versionPageDto);
export const fetchVersion = (id: string, revision: number) =>
  call(`/api/v1/documents/${id}/versions/${revision}`, versionDto);
export const documentExportHref = (
  id: string,
  format: 'markdown' | 'text' | 'html',
) => `/api/v1/documents/${id}/export${qs({ format })}`;
export const fetchTasks = (
  projectId: string,
  query: { [K in keyof TaskListQuery]?: TaskListQuery[K] | undefined } = {},
) => call(`/api/v1/projects/${projectId}/tasks${qs(query)}`, taskPageDto);
export const fetchTask = (id: string) =>
  call(`/api/v1/tasks/${id}`, taskDetailDto);
export const fetchLinks = (artifactId: string) =>
  call(`/api/v1/artifacts/${artifactId}/links`, linksDto);
export const fetchOptions = (
  projectId: string,
  q: string,
  kind?: ArtifactKind | 'PERSON',
  exclude?: string,
) =>
  call(
    `/api/v1/projects/${projectId}/artifacts${qs({ q, kind, exclude })}`,
    artifactOptionsDto,
  );
export const searchProject = (
  projectId: string,
  query: Partial<ArtifactSearchQuery>,
) => call(`/api/v1/projects/${projectId}/search${qs(query)}`, searchPageDto);
export const fetchGraph = (projectId: string) =>
  call(`/api/v1/projects/${projectId}/graph`, graphDto);
export const proposeDocumentInsert = (runId: string, documentId: string) =>
  call('/api/v1/ai/proposals', documentEditProposal, {
    type: 'document.insert',
    runId,
    documentId,
  });
export const proposeTasks = (runId: string, projectId: string) =>
  call('/api/v1/ai/proposals', taskProposal, {
    type: 'task.create',
    runId,
    projectId,
  });
export { ApiError };
