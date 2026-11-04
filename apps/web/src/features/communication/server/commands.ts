import 'server-only';
import { z } from 'zod';
import {
  communicationCommand,
  communicationResult,
  normalizeMessageBody,
  type CommunicationCommand,
  type CommunicationCommandInput,
} from '@atlas/core';
import { Prisma } from '@atlas/database';
import {
  checkRuntime,
  runtimeDatabase,
  withActor,
  type VerifiedActor,
} from '@/features/platform/server/database';
import { PlatformError } from '@/features/platform/server/errors';
import { requestHash } from '@/features/library/server/library';

/** Server-normalized body; the SQL boundary bounds it again. */
function body(raw: string) {
  try {
    return normalizeMessageBody(raw);
  } catch {
    throw new PlatformError(
      'VALIDATION_ERROR',
      'Messages must be 1–4,000 characters of text with at most 20 mentions.',
    );
  }
}

async function mutate(
  tx: Prisma.TransactionClient,
  command: string,
  input: Record<string, unknown>,
  requestId: string,
) {
  const [row] = z
    .array(z.object({ result: z.unknown() }))
    .parse(
      await tx.$queryRaw`SELECT atlas_private.mutate(${command},${JSON.stringify(input)}::jsonb,${requestId}::uuid) AS result`,
    );
  return communicationResult.parse(row?.result);
}

/**
 * The idempotency hash covers the logical intent of a send: channel, thread,
 * normalized text, references and confirmed AI run. A retry with the same key
 * and intent returns the committed message; any difference is a conflict.
 */
export function sendHash(
  command: Extract<CommunicationCommand, { command: 'message.send' }>,
  normalized: string,
) {
  return requestHash({
    channelId: command.channelId,
    threadRootId: command.threadRootId ?? null,
    body: normalized,
    references: command.references,
    aiRunId: command.aiRunId ?? null,
  });
}

/**
 * Pushes committed, identifier-only events to Supabase Realtime. Runs in its
 * own transaction after the command committed; failure leaves events queued
 * and never affects the durable result (clients recover by cursor backfill).
 */
export async function dispatchOutbox(maximum = 100) {
  try {
    return await runtimeDatabase().$transaction(async (tx) => {
      await checkRuntime(tx);
      const [row] = z
        .array(z.object({ sent: z.number().int() }))
        .parse(
          await tx.$queryRaw`SELECT atlas_private.comm_dispatch(${maximum}::integer) AS sent`,
        );
      return row?.sent ?? 0;
    });
  } catch {
    // Category only: no topics, payloads or identities in logs.
    console.error(JSON.stringify({ code: 'REALTIME_DISPATCH_DEFERRED' }));
    return 0;
  }
}

/**
 * Bounded, independent retry for queued events: any authorized cursor read
 * may trigger one dispatch per server instance every `SWEEP_INTERVAL_MS`.
 * It complements the in-database schedule (pg_cron) and needs no worker
 * host. Backoff, expiry and superseded-epoch suppression live in SQL.
 */
export const SWEEP_INTERVAL_MS = 10_000;
let lastSweep = Number.NEGATIVE_INFINITY;
export async function sweepOutbox(now = Date.now()) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return null;
  lastSweep = now;
  return dispatchOutbox(100);
}
/** Test seam: restarts the per-instance throttle. */
export function resetSweepThrottle() {
  lastSweep = Number.NEGATIVE_INFINITY;
}

export async function executeCommunicationCommand(
  actor: VerifiedActor,
  raw: CommunicationCommandInput | unknown,
  requestId: string,
  options: { dispatch?: boolean } = {},
) {
  const command = communicationCommand.parse(raw);
  let input: Record<string, unknown> = { ...command };
  if (command.command === 'message.send') {
    const normalized = body(command.body);
    input = {
      ...command,
      body: normalized,
      requestHash: sendHash(command, normalized),
    };
  } else if (command.command === 'message.edit') {
    input = { ...command, body: body(command.body) };
  } else if (command.command === 'channel.create') {
    input = { ...command, requestHash: requestHash(command) };
  }
  const result = await withActor(actor, (tx) =>
    mutate(tx, command.command, input, requestId),
  );
  if (options.dispatch !== false) await dispatchOutbox();
  return result;
}
