import 'server-only';
import { z } from 'zod';
import { evidence, reference } from '@atlas/ai';
import {
  withActor,
  type VerifiedActor,
} from '@/features/platform/server/database';
import { requireProject } from '@/features/library/server/library';
import { PlatformError } from '@/features/platform/server/errors';
import { retrieve, revalidateEvidence } from './retrieval';
const inputSchema = z
  .object({
    projectId: z.uuid(),
    query: z.string().min(1).max(6000),
    references: z.array(reference).max(12),
    vector: z.array(z.number().finite()).length(768).optional(),
    model: z.string().max(160).optional(),
  })
  .strict();
export const researchTools = {
  'research.retrieve': {
    name: 'research.retrieve',
    description:
      'Read permitted project passages, metadata and attached annotations.',
    inputSchema,
    outputSchema: z.array(evidence).max(24),
    requiredCapability: 'project.read' as const,
    maxDurationMs: 10000,
    maxResultBytes: 100000,
    sideEffect: 'none' as const,
  },
};
/** Trusted orchestration chooses tools. There is no model-to-SQL or write dispatch. */
export async function executeResearchTool(
  actor: VerifiedActor,
  name: string,
  raw: unknown,
  requestId: string,
  signal?: AbortSignal,
) {
  if (name !== 'research.retrieve')
    throw new PlatformError('FORBIDDEN', 'This AI action is not available.');
  const tool = researchTools[name];
  const input = tool.inputSchema.parse(raw);
  signal?.throwIfAborted();
  await withActor(actor, (tx) =>
    requireProject(tx, input.projectId, tool.requiredCapability),
  );
  const timeout = AbortSignal.timeout(tool.maxDurationMs);
  const result = await retrieve(
    actor,
    input.projectId,
    input.query,
    input.references,
    input.vector,
    input.model,
  );
  signal?.throwIfAborted();
  timeout.throwIfAborted();
  const output = tool.outputSchema.parse(result);
  if (
    new TextEncoder().encode(JSON.stringify(output)).length >
    tool.maxResultBytes
  )
    throw new PlatformError(
      'CONFLICT',
      'The retrieved context exceeds the research limit.',
    );
  await revalidateEvidence(actor, input.projectId, output);
  signal?.throwIfAborted();
  timeout.throwIfAborted();
  await withActor(
    actor,
    (tx) =>
      tx.$queryRaw`SELECT atlas_private.ai_tool_audit(${input.projectId}::uuid,${requestId}::uuid)`,
  );
  return output;
}
