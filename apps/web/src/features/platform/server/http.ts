import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PlatformError, publicError } from './errors';
export function checkOrigin(request: Request) {
  const origin = process.env.ATLAS_ORIGIN;
  if (
    !origin ||
    request.headers.get('origin') !== origin ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    throw new PlatformError('FORBIDDEN', 'Request origin is not permitted.');
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new PlatformError('VALIDATION_ERROR', 'JSON content is required.');
}
export async function readBoundedText(request: Request, maximum = 32768) {
  if (Number(request.headers.get('content-length') ?? 0) > maximum)
    throw new PlatformError('VALIDATION_ERROR', 'Request is too large.');
  const reader = request.body?.getReader();
  if (!reader)
    throw new PlatformError('VALIDATION_ERROR', 'JSON content is required.');
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maximum) {
      await reader.cancel();
      throw new PlatformError('VALIDATION_ERROR', 'Request is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
export async function readJson(request: Request, maximum = 32768) {
  const body = await readBoundedText(request, maximum);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new PlatformError('VALIDATION_ERROR', 'Invalid JSON.');
  }
}
export async function respond(work: (requestId: string) => Promise<unknown>) {
  const requestId = randomUUID();
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Request-Id': requestId,
  };
  try {
    return Response.json(
      { data: await work(requestId), requestId },
      { headers },
    );
  } catch (error) {
    const failure =
      error instanceof z.ZodError
        ? new PlatformError('VALIDATION_ERROR', 'Check the submitted fields.')
        : publicError(error);
    if (failure.code === 'INTERNAL_ERROR')
      console.error(JSON.stringify({ requestId, code: failure.code }));
    return Response.json(
      { error: { code: failure.code, message: failure.message }, requestId },
      {
        status: failure.status,
        headers: {
          ...headers,
          ...(failure.code === 'RATE_LIMITED' ? { 'Retry-After': '900' } : {}),
        },
      },
    );
  }
}
