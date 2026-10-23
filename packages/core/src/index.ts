import { z } from 'zod';
export const resourceId = z.uuid();
export const pageQuery = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const createProjectInput = z
  .object({
    workspaceId: resourceId,
    name: z.string().trim().min(1).max(120),
    visibility: z.enum(['private', 'workspace']).default('private'),
  })
  .strict();
export type CreateProjectInput = z.infer<typeof createProjectInput>;
export const errorCodes = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'EXTERNAL_PROVIDER_ERROR',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof errorCodes)[number];
export type ApiResult<T> =
  | { data: T; requestId: string }
  | { error: { code: ErrorCode; message: string }; requestId: string };
export const errorStatus: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  EXTERNAL_PROVIDER_ERROR: 502,
  INTERNAL_ERROR: 500,
};
// Pass a public-safe message only; never forward provider or database exceptions.
export function apiError(
  code: ErrorCode,
  publicMessage: string,
  requestId: string,
): ApiResult<never> {
  return { error: { code, message: publicMessage }, requestId };
}
export type TenantScope = Readonly<{
  actorId: string;
  organizationId: string;
  workspaceId: string;
  projectId?: string;
}>;
export * from './platform';
export * from './research';
export * from './citation';
