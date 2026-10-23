import 'server-only';
import { z } from 'zod';
import { evidence, reference, runSnapshot } from '@atlas/ai';
import {
  withActor,
  type VerifiedActor,
} from '@/features/platform/server/database';
import { requireProject } from '@/features/library/server/library';
import { revalidateEvidence, resolveReferences } from './retrieval';
import { PlatformError } from '@/features/platform/server/errors';
export async function snapshot(
  actor: VerifiedActor,
  id: string,
  projectId?: string,
) {
  const result = await withActor(actor, async (tx) => {
    const [context] = z
      .array(
        z.object({
          projectId: z.uuid(),
          sources: z.array(evidence),
          references: z.array(reference),
        }),
      )
      .parse(
        await tx.$queryRaw`SELECT project_id AS "projectId", evidence_json AS sources, references_json AS references FROM ai_runs WHERE id=${id}::uuid`,
      );
    if (!context || (projectId && context.projectId !== projectId))
      throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
    const rows =
      await tx.$queryRaw`SELECT r.id,r.conversation_id AS "conversationId",r.state,r.answer AS text,r.citations,r.limitations,r.error,r.provider,r.model,r.input_tokens AS "inputTokens",r.output_tokens AS "outputTokens",u.charged_micros AS "costMicros",r.version FROM ai_runs r JOIN ai_usage u ON u.run_id=r.id WHERE r.id=${id}::uuid`;
    const [row] = z.array(runSnapshot).parse(rows);
    if (!row) throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
    return { row, context };
  });
  await resolveReferences(
    actor,
    result.context.projectId,
    result.context.references,
  );
  await revalidateEvidence(
    actor,
    result.context.projectId,
    result.context.sources,
  );
  return result.row;
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
          sources: z.array(evidence),
          references: z.array(reference),
        }),
      )
      .parse(
        await tx.$queryRaw`SELECT id,prompt,state,answer AS text,citations,limitations,error,evidence_json AS sources,references_json AS references FROM ai_runs WHERE conversation_id=${conversationId}::uuid ORDER BY created_at DESC,id DESC LIMIT 40`,
      )
      .reverse();
  });
  for (const row of rows) {
    await resolveReferences(actor, projectId, row.references);
    await revalidateEvidence(actor, projectId, row.sources);
  }
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
