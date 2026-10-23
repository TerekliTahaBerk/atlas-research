import 'server-only';
import { z } from 'zod';
import { evidence, reference, runSnapshot } from '@atlas/ai';
import {
  withActor,
  type VerifiedActor,
} from '@/features/platform/server/database';
import { requireProject } from '@/features/library/server/library';
import { PlatformError } from '@/features/platform/server/errors';
export async function snapshot(
  actor: VerifiedActor,
  id: string,
  projectId?: string,
) {
  return withActor(actor, async (tx) => {
    const [row] = z
      .array(runSnapshot)
      .parse(
        await tx.$queryRaw`SELECT r.id,r.conversation_id AS "conversationId",r.state,r.answer AS text,r.citations,r.limitations,r.error,r.provider,r.model,r.input_tokens AS "inputTokens",r.output_tokens AS "outputTokens",u.charged_micros AS "costMicros",r.version FROM ai_runs r JOIN ai_usage u ON u.run_id=r.id WHERE r.id=${id}::uuid AND (${projectId ?? null}::uuid IS NULL OR r.project_id=${projectId ?? null}::uuid)`,
      );
    if (!row) throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
    return row;
  });
}
export async function updateRun(
  actor: VerifiedActor,
  id: string,
  operation: string,
  payload: unknown = {},
) {
  return withActor(actor, async (tx) => {
    const [row] = z
      .array(z.object({ allowed: z.boolean() }))
      .parse(
        await tx.$queryRaw`SELECT atlas_private.ai_update(${id}::uuid,${operation},${JSON.stringify(payload)}::jsonb) AS allowed`,
      );
    return row?.allowed === true;
  });
}
const historicalContext = z.object({
  evidence: z.array(evidence).max(120),
  references: z.array(reference).max(60),
});
export async function modelHistory(
  actor: VerifiedActor,
  projectId: string,
  conversationId: string,
) {
  return withActor(actor, async (tx) =>
    z
      .array(
        z.object({
          id: z.uuid(),
          prompt: z.string(),
          text: z.string(),
          sources: z.array(evidence).max(24),
          references: z.array(reference).max(12),
          context: historicalContext,
        }),
      )
      .parse(
        await tx.$queryRaw`SELECT id,prompt,answer AS text,evidence_json AS sources,references_json AS references,context_json AS context FROM ai_runs WHERE project_id=${projectId}::uuid AND conversation_id=${conversationId}::uuid AND state='COMPLETED' ORDER BY created_at DESC,id DESC LIMIT 4`,
      )
      .reverse(),
  );
}
export async function bindHistory(
  actor: VerifiedActor,
  id: string,
  rows: Awaited<ReturnType<typeof modelHistory>>,
) {
  const unique = <T>(items: T[]) => [
    ...new Map(items.map((item) => [JSON.stringify(item), item])).values(),
  ];
  const context = historicalContext.safeParse({
    evidence: unique(
      rows.flatMap((row) => [...row.sources, ...row.context.evidence]),
    ),
    references: unique(
      rows.flatMap((row) => [...row.references, ...row.context.references]),
    ),
  });
  if (!context.success)
    throw new PlatformError(
      'VALIDATION_ERROR',
      'This conversation context is too large. Start a new conversation.',
    );
  await withActor(actor, async (tx) => {
    const [row] = z
      .array(z.object({ allowed: z.boolean() }))
      .parse(
        await tx.$queryRaw`SELECT atlas_private.ai_bind_context(${id}::uuid,${JSON.stringify(context.data)}::jsonb) AS allowed`,
      );
    if (!row?.allowed)
      throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
  });
}
/** Minimal live RLS projection; every batch and idle heartbeat gets a fresh transaction. */
export async function streamState(
  actor: VerifiedActor,
  id: string,
  update?: { operation: 'delta' | 'dispatch'; payload: unknown },
) {
  return withActor(actor, async (tx) => {
    if (update) {
      const [updated] = z
        .array(z.object({ allowed: z.boolean() }))
        .parse(
          await tx.$queryRaw`SELECT atlas_private.ai_update(${id}::uuid,${update.operation},${JSON.stringify(update.payload)}::jsonb) AS allowed`,
        );
      if (!updated?.allowed)
        throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
    }
    // The ai_runs policy revalidates every reference/evidence item under caller RLS.
    const [row] = z
      .array(
        z.object({ state: runSnapshot.shape.state, version: z.number().int() }),
      )
      .parse(
        await tx.$queryRaw`SELECT state,version FROM ai_runs WHERE id=${id}::uuid`,
      );
    if (!row || row.state !== 'RUNNING')
      throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
    return row;
  });
}
export const conversationDto = z.object({
  id: z.uuid(),
  title: z.string(),
  version: z.number().int(),
  createdAt: z.string(),
  archived: z.boolean(),
});
export async function conversations(actor: VerifiedActor, projectId: string) {
  return withActor(actor, async (tx) => {
    await requireProject(tx, projectId, 'project.read');
    await tx.$queryRaw`SELECT atlas_private.ai_reconcile()`;
    const days = z.coerce
      .number()
      .int()
      .min(1)
      .max(365)
      .parse(process.env.ATLAS_AI_RETENTION_DAYS ?? '30');
    await tx.$queryRaw`SELECT atlas_private.ai_retention(${days})`;
    return z
      .array(conversationDto)
      .parse(
        await tx.$queryRaw`SELECT id,title,version,created_at::text AS "createdAt",archived_at IS NOT NULL AS archived FROM ai_conversations WHERE project_id=${projectId}::uuid AND archived_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 50`,
      );
  });
}
export async function history(
  actor: VerifiedActor,
  projectId: string,
  conversationId: string,
) {
  const rows = await withActor(actor, async (tx) => {
    await requireProject(tx, projectId, 'project.read');
    const exists = await tx.$queryRaw<
      unknown[]
    >`SELECT id FROM ai_conversations WHERE id=${conversationId}::uuid AND project_id=${projectId}::uuid`;
    if (!exists.length)
      throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
    return z
      .array(
        z.object({
          id: z.uuid(),
          prompt: z.string(),
          state: z.string(),
          text: z.string(),
          citations: runSnapshot.shape.citations,
          limitations: z.array(z.string()),
          error: z.string().nullable(),
        }),
      )
      .parse(
        await tx.$queryRaw`SELECT id,prompt,state,answer AS text,citations,limitations,error FROM ai_runs WHERE conversation_id=${conversationId}::uuid ORDER BY created_at DESC,id DESC LIMIT 40`,
      )
      .reverse();
  });
  return rows.map((row) => ({
    id: row.id,
    prompt: row.prompt,
    state: row.state,
    text: row.text,
    citations: row.citations,
    limitations: row.limitations,
    error: row.error,
  }));
}
