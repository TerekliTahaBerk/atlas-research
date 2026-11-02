import 'server-only';
import { z } from 'zod';
import type { VerifiedActor } from '@/features/platform/server/database';
import { readJson } from '@/features/platform/server/http';
import { rateLimit } from '@/features/platform/server/limiter';
import {
  connectZotero,
  disconnectZotero,
  previewZoteroImport,
  zoteroCollections,
  zoteroItems,
  zoteroStatus,
} from './zotero';

const start = z.coerce.number().int().min(0).max(100000).default(0);

/** GET integrations/zotero[/collections|/items]. Undefined for other paths. */
export async function integrationsGet(
  actor: VerifiedActor,
  path: string[],
  url: URL,
  signal: AbortSignal,
) {
  if (path[0] !== 'integrations' || path[1] !== 'zotero' || path.length > 3)
    return undefined;
  if (path.length === 2) return zoteroStatus(actor);
  await rateLimit('zotero-read', actor.id, 60, 60);
  const library = z.string().parse(url.searchParams.get('library') ?? '');
  if (path[2] === 'collections')
    return zoteroCollections(
      actor,
      library,
      start.parse(url.searchParams.get('start') ?? 0),
      signal,
    );
  if (path[2] === 'items')
    return zoteroItems(
      actor,
      {
        library,
        collection: url.searchParams.get('collection') || undefined,
        start: start.parse(url.searchParams.get('start') ?? 0),
        since: url.searchParams.get('since')
          ? z.coerce.number().int().min(0).parse(url.searchParams.get('since'))
          : undefined,
      },
      signal,
    );
  return undefined;
}

/** POST integrations/zotero/(connect|disconnect), projects/:id/imports/zotero. */
export async function integrationsPost(
  actor: VerifiedActor,
  path: string[],
  request: Request,
  requestId: string,
) {
  if (path[0] === 'integrations' && path[1] === 'zotero' && path.length === 3) {
    if (path[2] === 'connect') {
      await rateLimit('zotero-connect', actor.id, 10, 3600);
      return connectZotero(
        actor,
        await readJson(request),
        requestId,
        request.signal,
      );
    }
    if (path[2] === 'disconnect') return disconnectZotero(actor, requestId);
  }
  if (
    path[0] === 'projects' &&
    path[2] === 'imports' &&
    path[3] === 'zotero' &&
    path.length === 4
  ) {
    await rateLimit('import-preview', actor.id, 30, 60);
    return previewZoteroImport(
      actor,
      z.uuid().parse(path[1]),
      await readJson(request),
      request.signal,
    );
  }
  return undefined;
}
