'use client';
import { z } from 'zod';
import { mutationResult, type PlatformCommand } from '@atlas/core';
export async function requestData<T>(
  url: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  const envelope = z
    .object({
      data: z.unknown().optional(),
      error: z.object({ message: z.string(), code: z.string() }).optional(),
      requestId: z.string(),
    })
    .parse(await response.json());
  if (!response.ok || envelope.error)
    throw new Error(
      `${envelope.error?.message ?? 'Request failed.'} (${envelope.requestId})`,
    );
  return schema.parse(envelope.data);
}
export function mutate(command: PlatformCommand) {
  return requestData('/api/v1/commands', mutationResult, command);
}
