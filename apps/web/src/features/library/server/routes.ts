import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { libraryQuery, searchRequest, uploadIntentInput } from '@atlas/core';
import type { VerifiedActor } from '@/features/platform/server/database';
import { PlatformError, publicError } from '@/features/platform/server/errors';
import { readJson } from '@/features/platform/server/http';
import { rateLimit } from '@/features/platform/server/limiter';
import { researchSearch } from '@/features/discovery/server/service';
import {
  exportFormat,
  exportProject,
  getProjectPaper,
  libraryPage,
  renderExport,
  sourceAnnotations,
} from './library';
import {
  claimScanJobs,
  completeScan,
  createUpload,
  finalizeUpload,
  scanClaimInput,
  scanCompleteInput,
  sourceAccess,
  uploadStatus,
  verifyScannerRequest,
} from './sources';
import { supabaseSourceStorage } from './storage';

const uuid = z.uuid();
const params = (url: URL) =>
  Object.fromEntries(
    [...url.searchParams.entries()].filter(([, value]) => value !== ''),
  );

/** Authenticated research reads. Returns undefined for unknown paths. */
export async function researchGet(
  actor: VerifiedActor,
  path: string[],
  url: URL,
  signal: AbortSignal,
) {
  const [root, id, leaf, extra] = path;
  if (extra !== undefined) return undefined;
  if (root === 'projects' && leaf === 'research')
    return researchSearch(
      actor,
      uuid.parse(id),
      searchRequest.parse(params(url)),
      signal,
    );
  if (root === 'projects' && leaf === 'papers')
    return libraryPage(actor, uuid.parse(id), libraryQuery.parse(params(url)));
  if (root === 'papers' && leaf === undefined)
    return getProjectPaper(actor, uuid.parse(id));
  if (root === 'sources' && leaf === 'annotations')
    return sourceAnnotations(actor, uuid.parse(id));
  if (root === 'sources' && leaf === 'access') {
    await rateLimit('source-access', actor.id, 60, 60);
    return sourceAccess(actor, uuid.parse(id), supabaseSourceStorage());
  }
  if (root === 'uploads' && leaf === 'status')
    return uploadStatus(actor, uuid.parse(id));
  return undefined;
}

/** Authenticated research writes other than the shared command endpoint. */
export async function researchPost(
  actor: VerifiedActor,
  path: string[],
  request: Request,
  requestId: string,
) {
  const [root, id, leaf, extra] = path;
  if (extra !== undefined) return undefined;
  if (root === 'projects' && leaf === 'uploads') {
    await rateLimit('upload', actor.id, 30, 3600);
    return createUpload(
      actor,
      uuid.parse(id),
      uploadIntentInput.parse(await readJson(request)),
      requestId,
      supabaseSourceStorage(),
    );
  }
  if (root === 'uploads' && leaf === 'finalize')
    return finalizeUpload(
      actor,
      uuid.parse(id),
      requestId,
      supabaseSourceStorage(),
    );
  return undefined;
}

/**
 * Citation downloads are files, not JSON envelopes; failures keep the
 * standard envelope. Private and never cached.
 */
export async function exportResponse(
  actor: VerifiedActor,
  path: string[],
  url: URL,
): Promise<Response | undefined> {
  const [root, id, leaf, extra] = path;
  if (extra !== undefined || leaf !== 'export') return undefined;
  if (root !== 'papers' && root !== 'projects') return undefined;
  const format = exportFormat.parse(url.searchParams.get('format') ?? 'bibtex');
  const papers =
    root === 'papers'
      ? [await getProjectPaper(actor, uuid.parse(id))]
      : await exportProject(
          actor,
          uuid.parse(id),
          uuid
            .optional()
            .parse(url.searchParams.get('collectionId') || undefined),
        );
  const file = renderExport(papers, format);
  const name = root === 'papers' ? 'atlas-reference' : 'atlas-references';
  return new Response(file.body, {
    headers: {
      'Content-Type': `${file.type}; charset=utf-8`,
      'Content-Disposition': `attachment; filename="${name}.${file.extension}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Server-to-server scanner endpoints; no browser session is accepted. */
export async function scannerResponse(path: string[], request: Request) {
  const requestId = randomUUID();
  const headers = { 'Cache-Control': 'no-store', 'X-Request-Id': requestId };
  try {
    const route = path.join('/');
    if (
      route !== 'internal/scanner/claim' &&
      route !== 'internal/scanner/complete'
    )
      throw new PlatformError('NOT_FOUND', 'Endpoint unavailable.');
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > 4096)
      throw new PlatformError('VALIDATION_ERROR', 'Request is too large.');
    const body = (await request.text()).slice(0, 4097);
    if (body.length > 4096)
      throw new PlatformError('VALIDATION_ERROR', 'Request is too large.');
    verifyScannerRequest(request.headers, body);
    const json: unknown = JSON.parse(body || '{}');
    const storage = supabaseSourceStorage();
    const data =
      route === 'internal/scanner/claim'
        ? await claimScanJobs(scanClaimInput.parse(json), storage)
        : await completeScan(scanCompleteInput.parse(json), storage);
    return Response.json({ data, requestId }, { headers });
  } catch (error) {
    const failure =
      error instanceof z.ZodError || error instanceof SyntaxError
        ? new PlatformError('VALIDATION_ERROR', 'Check the submitted fields.')
        : publicError(error);
    if (failure.code === 'INTERNAL_ERROR')
      console.error(JSON.stringify({ requestId, code: failure.code }));
    return Response.json(
      { error: { code: failure.code, message: failure.message }, requestId },
      { status: failure.status, headers },
    );
  }
}
