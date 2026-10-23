import 'server-only';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pageChunks, costMicros, tokenBound, validateVector } from '@atlas/ai';
import { withActor } from '@/features/platform/server/database';
import { PlatformError } from '@/features/platform/server/errors';
import { readBoundedText, respond } from '@/features/platform/server/http';
import {
  supabaseSourceStorage,
  type SourceStorage,
} from '@/features/library/server/storage';
import { aiBudget, embeddingConfig } from './config';
import { withAIWorker } from './worker-database';
import { hashText } from './retrieval';
const jobDto = z.object({
  jobId: z.uuid(),
  projectId: z.uuid(),
  actorId: z.uuid(),
  sourceVersionId: z.uuid(),
  projectPaperId: z.uuid(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteSize: z.number().int().min(8).max(26_214_400),
  objectKey: z.string(),
  extractionVersion: z.literal('poppler-v1:1600:200'),
  embeddingModel: z.string(),
});
async function jobInfo(id: string, attempt: number) {
  return withAIWorker(async (tx) => {
    const [row] = z
      .array(z.object({ job: z.unknown() }))
      .parse(
        await tx.$queryRaw`SELECT atlas_private.ai_job(${id}::uuid,${attempt}) AS job`,
      );
    const parsed = jobDto.safeParse(row?.job);
    if (!parsed.success)
      throw new PlatformError('NOT_FOUND', 'Processing lease unavailable.');
    return parsed.data;
  });
}
export function extractionAuth(headers: Headers, body: string, action: string) {
  const key = process.env.ATLAS_EXTRACTION_SECRET;
  const timestamp = headers.get('x-atlas-extraction-timestamp') ?? '';
  const signature = headers.get('x-atlas-extraction-signature') ?? '';
  if (
    !key ||
    key.length < 32 ||
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 60 ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    throw new PlatformError('FORBIDDEN', 'Invalid processing request.');
  const expected = createHmac('sha256', key)
    .update(`${action}.${timestamp}.${body}`)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')))
    throw new PlatformError('FORBIDDEN', 'Invalid processing request.');
}
export async function extractionResponse(
  path: string[],
  request: Request,
  storage?: SourceStorage,
) {
  return respond(async () => {
    aiBudget();
    const action = path.join('/');
    if (
      !['internal/extraction/claim', 'internal/extraction/complete'].includes(
        action,
      )
    )
      throw new PlatformError('NOT_FOUND', 'Endpoint unavailable.');
    // Stream-bounded before HMAC or JSON processing, including absent Content-Length.
    const body = await readBoundedText(
      request,
      action.endsWith('/claim') ? 1024 : 2_100_000,
    );
    extractionAuth(request.headers, body, action);
    const raw: unknown = JSON.parse(body);
    if (action.endsWith('/claim')) {
      z.object({}).strict().parse(raw);
      const claim = await withAIWorker(async (tx) => {
        const [r] = z
          .array(
            z.object({
              job: z
                .object({ jobId: z.uuid(), attempt: z.number().int() })
                .nullable(),
            }),
          )
          .parse(await tx.$queryRaw`SELECT atlas_private.ai_claim() AS job`);
        return r?.job;
      });
      if (!claim) return null;
      const job = await jobInfo(claim.jobId, claim.attempt);
      return {
        ...claim,
        sha256: job.sha256,
        byteSize: job.byteSize,
        downloadUrl: await (storage ?? supabaseSourceStorage()).signDownload(
          job.objectKey,
          60,
        ),
      };
    }
    const input = z
      .object({
        jobId: z.uuid(),
        attempt: z.number().int().min(1).max(3),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        pages: z
          .array(
            z
              .object({
                page: z.number().int().min(1).max(500),
                text: z.string().max(500000),
              })
              .strict(),
          )
          .min(1)
          .max(500),
        failed: z.boolean().default(false),
      })
      .strict()
      .parse(raw);
    const job = await jobInfo(input.jobId, input.attempt);
    const actor = { id: job.actorId, email: 'extraction-worker@atlas.invalid' };
    const fail = () =>
      withAIWorker(async (tx) => {
        await tx.$queryRaw`SELECT atlas_private.ai_job_fail(${input.jobId}::uuid,${input.attempt})::text`;
      });
    if (input.failed || input.sha256 !== job.sha256) {
      await fail();
      return { accepted: false };
    }
    await withAIWorker(
      (tx) =>
        tx.$queryRaw`SELECT atlas_private.ai_accept_extraction(${input.jobId}::uuid,${input.attempt})`,
    );
    try {
      const chunks = pageChunks(input.pages);
      if (
        !chunks.length ||
        chunks.length > 512 ||
        input.pages.reduce((n, p) => n + p.text.length, 0) > 500000
      )
        throw new Error('EXTRACTION_LIMIT');
      const embedding = embeddingConfig();
      if (job.embeddingModel !== embedding.indexKey)
        throw new Error('MODEL_CHANGED');
      const cap = aiBudget();
      const price = embedding.price;
      const charge = Math.max(
        1,
        costMicros(
          chunks.reduce((n, c) => n + tokenBound(c.text), 0),
          0,
          price,
          0,
        ),
      );
      const usageId = await withActor(actor, async (tx) => {
        const [r] = z
          .array(z.object({ id: z.uuid() }))
          .parse(
            await tx.$queryRaw`SELECT atlas_private.ai_reserve(${job.projectId}::uuid,${'index:' + input.jobId + ':' + input.attempt},'embedding',${charge},${cap},NULL) AS id`,
          );
        return r?.id;
      });
      const provider = embedding.adapter;
      const vectors: number[][] = [];
      const signal = AbortSignal.timeout(150000);
      for (let i = 0; i < chunks.length; i += 16) {
        await jobInfo(input.jobId, input.attempt);
        vectors.push(
          ...(await provider.embedDocuments(
            chunks.slice(i, i + 16).map((c) => c.text),
            signal,
          )),
        );
      }
      await jobInfo(input.jobId, input.attempt);
      const records = chunks.map((c, index) => ({
        ...c,
        id: randomUUID(),
        checksum: hashText(c.text),
        vector: JSON.stringify(validateVector(vectors[index], 768)),
      }));
      await withAIWorker(async (tx) => {
        await tx.$queryRaw`SELECT atlas_private.ai_index(${input.jobId}::uuid,${input.attempt},${JSON.stringify(records)}::jsonb)`;
      }, actor.id);
      if (usageId)
        await withActor(
          actor,
          (tx) =>
            tx.$queryRaw`SELECT atlas_private.ai_settle(${usageId}::uuid,${charge})::text`,
        );
      return { accepted: true, chunks: chunks.length };
    } catch {
      await fail();
      throw new PlatformError(
        'EXTERNAL_PROVIDER_ERROR',
        'Source indexing did not complete. The job remains recoverable.',
      );
    }
  });
}
