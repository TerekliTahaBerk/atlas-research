import { type ErrorCode, errorStatus } from '@atlas/core';
export class PlatformError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
  get status() {
    return errorStatus[this.code];
  }
}
export function publicError(error: unknown): PlatformError {
  if (error instanceof PlatformError) return error;
  // Prisma wraps PostgreSQL function exceptions. Recognize only known tokens;
  // no provider messages, constraint names, SQL or payloads reach clients/logs.
  const message = error instanceof Error ? error.message : '';
  for (const code of [
    'NOT_FOUND',
    'FORBIDDEN',
    'CONFLICT',
    'UNAUTHENTICATED',
    'VALIDATION_ERROR',
    'RATE_LIMITED',
  ] as const) {
    if (
      message.includes(` ${code}`) ||
      message.includes(`"${code}"`) ||
      message.includes('Message: `' + code + '`')
    )
      return new PlatformError(
        code,
        {
          NOT_FOUND: 'Resource unavailable.',
          FORBIDDEN: 'This action is not permitted.',
          CONFLICT:
            'The resource changed or this would remove its last owner. Refresh and try again.',
          UNAUTHENTICATED: 'Please sign in again.',
          VALIDATION_ERROR: 'Check the submitted fields.',
          RATE_LIMITED: 'Too many requests. Try again later.',
        }[code],
      );
  }
  return new PlatformError(
    'INTERNAL_ERROR',
    'Unable to complete the request. Try again with the request ID.',
  );
}
