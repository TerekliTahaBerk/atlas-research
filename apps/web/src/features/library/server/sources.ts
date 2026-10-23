import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@atlas/database';
import {
  sourceAccessDto,
  sourceState,
  uploadIntentDto,
  uploadIntentInput,
  uploadLimits,
  type UploadIntentInput,
} from '@atlas/core';
import {
  checkRuntime,
  runtimeDatabase,
  withActor,
  type VerifiedActor,
} from '@/features/platform/server/database';
import { PlatformError } from '@/features/platform/server/errors';
import { requireProject, runResearchSql } from './library';
import {
  DOWNLOAD_TTL_SECONDS,
  acceptedKey,
  inspectPdfBytes,
  quarantineKey,
  type SourceStorage,
} from './storage';

const intentRow = z.object({
  id: z.uuid(),
  sourceVersionId: z.uuid(),
  projectId: z.uuid(),
  expiresAt: z.string(),
  finalized: z.boolean(),
  state: sourceState,
  quarantineKey: z.string(),
  declaredSize: z.coerce.number().int(),
  declaredSha256: z.string(),
});
async function readIntent(actor: VerifiedActor, intentId: string) {
  z.uuid().parse(intentId);
  return withActor(actor, async (tx) => {
    // RLS: only the creating actor, while they can still read the project.
    const [row] = z.array(intentRow).parse(
      await tx.$queryRaw`SELECT i.id, i.source_version_id AS "sourceVersionId", i.project_id AS "projectId", i.expires_at::text AS "expiresAt",
          i.finalized_at IS NOT NULL AS finalized, s.state::text AS state, s.quarantine_key AS "quarantineKey",
          s.declared_size AS "declaredSize", s.declared_sha256 AS "declaredSha256"
          FROM upload_intents i JOIN source_versions s ON s.id=i.source_version_id WHERE i.id=${intentId}::uuid`,
    );
    if (!row) throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
    return row;
  });
}

export async function createUpload(
  actor: VerifiedActor,
  projectId: string,
  raw: UploadIntentInput,
  requestId: string,
  storage: SourceStorage,
) {
  const input = uploadIntentInput.parse(raw);
  await withActor(actor, async (tx) => {
    await requireProject(tx, projectId, 'project.write');
    const [paper] = z
      .array(z.object({ projectId: z.uuid() }))
      .parse(
        await tx.$queryRaw`SELECT project_id AS "projectId" FROM project_papers WHERE id=${input.projectPaperId}::uuid`,
      );
    // A paper from another project is indistinguishable from a missing one.
    if (paper?.projectId !== projectId)
      throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
  });
  const { idempotencyKey, ...rest } = input;
  const result = await runResearchSql(
    actor,
    'upload.create',
    {
      ...rest,
      idempotencyKey,
      requestHash: createHash('sha256')
        .update(JSON.stringify({ projectId, ...rest }))
        .digest('hex'),
      quarantineKey: quarantineKey(projectId),
    },
    requestId,
  );
  const intent = await readIntent(actor, result.id);
  const open =
    !intent.finalized &&
    intent.state === 'PENDING_UPLOAD' &&
    Date.parse(intent.expiresAt) > Date.now();
  return uploadIntentDto.parse({
    id: intent.id,
    sourceVersionId: intent.sourceVersionId,
    state: intent.state,
    expiresAt: new Date(intent.expiresAt).toISOString(),
    upload: open ? await storage.createUploadGrant(intent.quarantineKey) : null,
  });
}

/**
 * Verifies the stored object, not the client's claims: exact length, SHA-256
 * and PDF signature. A valid file is still only QUARANTINED until the
 * isolated scanner accepts it.
 */
export async function finalizeUpload(
  actor: VerifiedActor,
  intentId: string,
  requestId: string,
  storage: SourceStorage,
) {
  const intent = await readIntent(actor, intentId);
  if (intent.finalized)
    return {
      id: intent.id,
      sourceVersionId: intent.sourceVersionId,
      state: intent.state,
    };
  let outcome: 'QUARANTINED' | 'REJECTED' = 'QUARANTINED';
  let failure: string | null = null;
  let measured: { byteSize: number; sha256: string } | null = null;
  if (Date.parse(intent.expiresAt) <= Date.now()) {
    outcome = 'REJECTED';
    failure = 'Upload grant expired.';
  } else {
    const bytes = await storage.readQuarantined(
      intent.quarantineKey,
      uploadLimits.maxBytes,
    );
    if (!bytes)
      throw new PlatformError(
        'VALIDATION_ERROR',
        'The uploaded file was not found. Upload it before finishing.',
      );
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (
      bytes.length > uploadLimits.maxBytes ||
      bytes.length !== intent.declaredSize
    )
      failure = 'The uploaded size does not match the declared size.';
    else if (sha256 !== intent.declaredSha256)
      failure = 'The uploaded file does not match its checksum.';
    else failure = inspectPdfBytes(bytes);
    if (failure) outcome = 'REJECTED';
    else measured = { byteSize: bytes.length, sha256 };
  }
  const result = await runResearchSql(
    actor,
    'upload.finalize',
    { id: intent.id, outcome, failure, ...measured },
    requestId,
  );
  if (outcome === 'REJECTED')
    await storage.removeQuarantined(intent.quarantineKey);
  return {
    id: intent.id,
    sourceVersionId: intent.sourceVersionId,
    state: result.state ?? outcome,
    failure,
  };
}

export async function uploadStatus(actor: VerifiedActor, intentId: string) {
  const intent = await readIntent(actor, intentId);
  return {
    id: intent.id,
    sourceVersionId: intent.sourceVersionId,
    state: intent.state,
    expiresAt: new Date(intent.expiresAt).toISOString(),
  };
}

/** Re-authorizes on every call; each grant is valid for 60 seconds. */
export async function sourceAccess(
  actor: VerifiedActor,
  sourceVersionId: string,
  storage: SourceStorage,
) {
  z.uuid().parse(sourceVersionId);
  const source = await withActor(actor, async (tx) => {
    const [row] = z
      .array(
        z.object({
          state: sourceState,
          objectKey: z.string().nullable(),
          byteSize: z.coerce.number().int().nullable(),
          sha256: z.string().nullable(),
        }),
      )
      .parse(
        await tx.$queryRaw`SELECT state::text AS state, object_key AS "objectKey", byte_size AS "byteSize", sha256
          FROM source_versions WHERE id=${sourceVersionId}::uuid`,
      );
    return row;
  });
  if (!source) throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
  if (
    source.state !== 'READY' ||
    !source.objectKey ||
    !source.byteSize ||
    !source.sha256
  )
    throw new PlatformError(
      'CONFLICT',
      'This source has not passed validation and cannot be opened.',
    );
  const url = await storage.signDownload(
    source.objectKey,
    DOWNLOAD_TTL_SECONDS,
  );
  return sourceAccessDto.parse({
    sourceVersionId,
    url,
    expiresAt: new Date(Date.now() + DOWNLOAD_TTL_SECONDS * 1000).toISOString(),
    byteSize: source.byteSize,
    sha256: source.sha256.trim(),
  });
}

// ------------------------------------------------------- scanner boundary

/**
 * Isolated scanners authenticate with an HMAC over `timestamp.body`. They
 * receive short-lived read grants for quarantined objects and report
 * verdicts; they never receive database or storage credentials.
 */
export function verifyScannerRequest(
  headers: Headers,
  body: string,
  secret = process.env.ATLAS_SCANNER_SECRET,
  now = Date.now(),
) {
  const denied = new PlatformError('NOT_FOUND', 'Endpoint unavailable.');
  if (!secret || secret.length < 32) throw denied;
  const timestamp = headers.get('x-atlas-scanner-timestamp') ?? '';
  const signature = headers.get('x-atlas-scanner-signature') ?? '';
  if (!/^\d{10,13}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature))
    throw denied;
  if (Math.abs(now - Number(timestamp) * 1000) > 300_000) throw denied;
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest();
  if (!timingSafeEqual(Buffer.from(signature, 'hex'), expected)) throw denied;
}

/** Scanner calls have no user actor; RLS hides every private row. */
function system<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
  return runtimeDatabase().$transaction(async (tx) => {
    await checkRuntime(tx);
    return work(tx);
  });
}

export const scanClaimInput = z
  .object({
    max: z.number().int().min(1).max(10).default(1),
    leaseSeconds: z.number().int().min(30).max(900).default(300),
  })
  .strict();
export async function claimScanJobs(
  input: z.infer<typeof scanClaimInput>,
  storage: SourceStorage,
) {
  await cleanupScanObjects(storage);
  const jobs = await system(async (tx) =>
    z
      .array(
        z.object({
          jobId: z.uuid(),
          sourceVersionId: z.uuid(),
          quarantineKey: z.string(),
          sha256: z.string(),
          byteSize: z.coerce.number().int(),
          attempt: z.number().int(),
        }),
      )
      .parse(
        await tx.$queryRaw`SELECT job_id AS "jobId", source_version_id AS "sourceVersionId", quarantine_key AS "quarantineKey", sha256, byte_size AS "byteSize", attempt
          FROM atlas_private.claim_scan_jobs(${input.max}::integer, ${input.leaseSeconds}::integer)`,
      ),
  );
  return Promise.all(
    jobs.map(async ({ quarantineKey: key, ...job }) => ({
      ...job,
      sha256: job.sha256.trim(),
      downloadUrl: await storage.signQuarantineRead(key, 120),
    })),
  );
}

export const scanCompleteInput = z
  .object({
    jobId: z.uuid(),
    attempt: z.number().int().min(1).max(5),
    verdict: z.enum(['CLEAN', 'INFECTED', 'INVALID', 'ERROR']),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    scanner: z.string().regex(/^[A-Za-z0-9 ._:/()-]{1,120}$/),
  })
  .strict();
export async function completeScan(
  input: z.infer<typeof scanCompleteInput>,
  storage: SourceStorage,
) {
  const [job] = await system(async (tx) =>
    z
      .array(
        z.object({
          projectId: z.uuid(),
          sourceVersionId: z.uuid(),
          quarantineKey: z.string(),
          sha256: z.string(),
        }),
      )
      .parse(
        await tx.$queryRaw`SELECT project_id AS "projectId", source_version_id AS "sourceVersionId", quarantine_key AS "quarantineKey", sha256
          FROM atlas_private.scan_job_source(${input.jobId}::uuid, ${input.attempt}::integer)`,
      ),
  );
  if (!job)
    throw new PlatformError('CONFLICT', 'The scan lease is no longer active.');
  let key: string | null = null;
  if (input.verdict === 'CLEAN' && input.sha256 === job.sha256.trim()) {
    key = acceptedKey(job.projectId, job.sourceVersionId);
    // A committed reservation survives process failure and ambiguous commits.
    await system(
      async (tx) =>
        tx.$queryRaw`SELECT atlas_private.reserve_scan_copy(${input.jobId}::uuid, ${input.attempt}::integer, ${key})::text`,
    );
    await storage.accept(job.quarantineKey, key);
  }
  const [row] = await system(async (tx) =>
    z
      .array(z.object({ state: z.string() }))
      .parse(
        await tx.$queryRaw`SELECT atlas_private.complete_scan(${input.jobId}::uuid, ${input.attempt}::integer, ${input.verdict}, ${input.sha256}, ${input.scanner}, ${key}) AS state`,
      ),
  );
  if (row?.state === 'READY' || row?.state === 'REJECTED')
    await storage.removeQuarantined(job.quarantineKey);
  return { state: row?.state ?? 'UNKNOWN' };
}

/** Retried on every claim. Only aged, unreferenced copy reservations qualify. */
export async function cleanupScanObjects(storage: SourceStorage) {
  const candidates = await system(async (tx) =>
    z
      .array(z.object({ objectKey: z.string() }))
      .parse(
        await tx.$queryRaw`SELECT object_key AS "objectKey" FROM atlas_private.scan_cleanup_candidates()`,
      ),
  );
  for (const { objectKey } of candidates) {
    await storage.removeAccepted(objectKey);
    await system(
      async (tx) =>
        tx.$queryRaw`SELECT atlas_private.ack_scan_cleanup(${objectKey})::text`,
    );
  }
}
