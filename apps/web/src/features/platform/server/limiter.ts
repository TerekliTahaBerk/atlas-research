import 'server-only';
import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { runtimeDatabase, checkRuntime } from './database';
import { PlatformError } from './errors';
export async function rateLimit(
  operation: string,
  identity: string,
  maximum = 30,
  seconds = 60,
) {
  if (!(await takeRate(operation, identity, maximum, seconds)))
    throw new PlatformError(
      'RATE_LIMITED',
      'Too many requests. Try again later.',
    );
}
/** Consumes one unit and reports whether the bucket still had capacity. */
export async function takeRate(
  operation: string,
  identity: string,
  maximum: number,
  seconds: number,
) {
  const secret = process.env.ATLAS_RATE_SECRET;
  if (!secret || secret.length < 32)
    throw new PlatformError(
      'INTERNAL_ERROR',
      'Rate limiting is not configured.',
    );
  const key = createHmac('sha256', secret)
    .update(`${operation}:${identity}`)
    .digest('hex');
  const allowed = await runtimeDatabase().$transaction(async (tx) => {
    await checkRuntime(tx);
    const [result] = z
      .array(z.object({ allowed: z.boolean() }))
      .parse(
        await tx.$queryRaw`SELECT atlas_private.take_rate(${key},${maximum}::integer,${seconds}::integer) AS allowed`,
      );
    return result?.allowed === true;
  });
  return allowed;
}
