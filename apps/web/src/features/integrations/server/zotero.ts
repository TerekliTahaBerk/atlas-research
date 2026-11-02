import 'server-only';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { zoteroThrottle } from './throttle';
import {
  fromZoteroItem,
  personDisplay,
  referenceTypeLabels,
  type ParsedRecord,
  importItem,
  type ImportLink,
  type ReferenceRecord,
} from '@atlas/core';
import {
  withActor,
  type VerifiedActor,
} from '@/features/platform/server/database';
import { PlatformError } from '@/features/platform/server/errors';
import { retryAfterSeconds } from '@/features/discovery/server/provider-http';
import { requireProject } from '@/features/library/server/library';
import {
  classify,
  summarize,
  recordHash,
} from '@/features/library/server/interchange';
import {
  integrationsConfigured,
  openCredential,
  sealCredential,
  signImportContext,
  verifyImportContext,
} from './credentials';

/*
 * A03 Zotero Web API v3 adapter — READ-ONLY, user-owned.
 *
 * - Authentication: a user-created, read-only Zotero API key (OAuth 1.0a
 *   would require an Atlas app registration with Zotero, which does not
 *   exist yet). Keys that grant any write access are refused.
 * - The key travels only in the `Zotero-API-Key` header, never in a URL,
 *   log, error or browser bundle; at rest it is AES-256-GCM encrypted and
 *   readable by its owner only (RLS). Project members never see it.
 * - Only GET requests to one configured host (`ATLAS_ZOTERO_BASE_URL`,
 *   default https://api.zotero.org); redirects are refused, bodies capped.
 * - Items become project-visible only when the user previews and confirms
 *   selected items through the ordinary `reference.import` command.
 * - No background polling; attachments are never downloaded.
 */
const PROVIDER = 'ZOTERO';
const API_VERSION = '3';
const baseUrl = () => {
  const value = process.env.ATLAS_ZOTERO_BASE_URL ?? 'https://api.zotero.org';
  const url = new URL(value);
  const loopback =
    process.env.NODE_ENV !== 'production' &&
    url.protocol === 'http:' &&
    ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (
    (!loopback && url.origin !== 'https://api.zotero.org') ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new PlatformError(
      'EXTERNAL_PROVIDER_ERROR',
      'Zotero is not configured.',
    );
  return url.origin;
};
export const zoteroKeyPattern = /^[A-Za-z0-9]{24}$/;
export const zoteroLibrary = z.string().regex(/^(users|groups)\/[0-9]{1,20}$/);

type ZoteroResponse = {
  data: unknown;
  totalResults: number | null;
  lastModifiedVersion: number | null;
};
const unavailable = (message = 'Zotero is unavailable. Try again later.') =>
  new PlatformError('EXTERNAL_PROVIDER_ERROR', message);
const wait = async (ms: number, signal?: AbortSignal) => {
  await delay(ms, undefined, { signal });
};
const limited = (seconds: number) =>
  new PlatformError(
    'RATE_LIMITED',
    `Zotero asked Atlas to wait ${seconds} seconds. Try again then.`,
    seconds,
  );

/** Shared lease + persistent cooldown. No sleeping through provider backoff. */
export async function zoteroGet(
  path: string,
  query: Record<string, string | undefined>,
  apiKey: string,
  options: {
    signal?: AbortSignal | undefined;
    sleep?: typeof wait | undefined;
    timeoutMs?: number | undefined;
  } = {},
): Promise<ZoteroResponse> {
  const base = baseUrl();
  const url = new URL(path, base);
  // Even an internal caller cannot turn a relative path into credential exfiltration.
  if (url.origin !== base || url.username || url.password)
    throw unavailable('Zotero is not configured.');
  for (const [k, v] of Object.entries(query))
    if (v !== undefined) url.searchParams.set(k, v);
  const sleep = options.sleep ?? wait;
  for (let attempt = 0; attempt < 3; attempt++) {
    options.signal?.throwIfAborted();
    const token = randomUUID();
    const remaining = await zoteroThrottle(token, null);
    if (remaining) throw limited(remaining);
    let cooldown = 0;
    let retry = false;
    const timeout = AbortSignal.timeout(
      Math.min(options.timeoutMs ?? 10_000, 10_000),
    );
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout;
    try {
      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            'Zotero-API-Key': apiKey,
            'Zotero-API-Version': API_VERSION,
            Accept: 'application/json',
          },
          redirect: 'error',
          cache: 'no-store',
          signal,
        });
      } catch {
        if (options.signal?.aborted)
          throw unavailable('Zotero request cancelled.');
        if (attempt === 2)
          throw unavailable('Zotero did not respond in time. Try again.');
        retry = true;
        continue;
      }
      const header = (name: string) => response.headers.get(name);
      cooldown = Math.min(
        2_147_483_647,
        Math.max(
          retryAfterSeconds(header('backoff')) ?? 0,
          retryAfterSeconds(header('retry-after')) ?? 0,
        ),
      );
      if (response.status === 429 || response.status === 503) {
        await response.body?.cancel();
        cooldown = Math.max(cooldown, 2 ** (attempt + 1));
        throw limited(cooldown);
      }
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401 || response.status === 403)
          throw new PlatformError(
            'FORBIDDEN',
            'Zotero rejected the key or its library access. Reconnect with a valid read-only key.',
          );
        if (response.status === 404)
          throw new PlatformError(
            'NOT_FOUND',
            'That Zotero library, collection or item is not available.',
          );
        if (response.status >= 500 && attempt < 2 && cooldown === 0) {
          retry = true;
          continue;
        }
        throw unavailable();
      }
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        if (Number(header('content-length') ?? 0) > 5_000_000) {
          await reader?.cancel();
          throw unavailable();
        }
        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 5_000_000) {
            await reader.cancel();
            throw unavailable();
          }
          chunks.push(value);
        }
        const data: unknown = JSON.parse(
          new TextDecoder().decode(Buffer.concat(chunks)),
        );
        const number = (name: string) => {
          const raw = header(name);
          const value = raw === null ? NaN : Number(raw);
          return Number.isSafeInteger(value) && value >= 0 ? value : null;
        };
        return {
          data,
          totalResults: number('total-results'),
          lastModifiedVersion: number('last-modified-version'),
        };
      } catch {
        throw unavailable(
          'Zotero returned an unreadable or oversized response.',
        );
      } finally {
        reader?.releaseLock();
      }
    } finally {
      // Fail closed if persistence fails. The lease also fences crashed requests.
      await zoteroThrottle(token, cooldown);
      if (retry) await sleep(400 * 2 ** attempt, options.signal);
    }
  }
  throw unavailable();
}

const permission = z
  .object({ library: z.boolean().optional(), write: z.boolean().optional() })
  .loose();
const keyInfo = z
  .object({
    userID: z.number().int().positive(),
    username: z.string().max(200).optional(),
    access: z
      .object({
        user: permission.optional(),
        groups: z.record(z.string(), permission).optional(),
      })
      .loose()
      .default({}),
  })
  .loose();
const groupRow = z
  .object({
    id: z.number().int().positive(),
    data: z.object({ name: z.string().max(300) }).loose(),
  })
  .loose();
const library = z.object({
  id: zoteroLibrary,
  name: z.string(),
  kind: z.enum(['user', 'group']),
});
export const zoteroAccess = z.object({ libraries: z.array(library).max(200) });
export type ZoteroLibrary = z.infer<typeof library>;

/** Validates a key: read access only, and the exact libraries it may read. */
export async function inspectKey(apiKey: string, signal?: AbortSignal) {
  if (!zoteroKeyPattern.test(apiKey))
    throw new PlatformError(
      'VALIDATION_ERROR',
      'Paste a 24-character Zotero API key.',
    );
  const info = keyInfo.safeParse(
    (await zoteroGet('/keys/current', {}, apiKey, { signal })).data,
  );
  if (!info.success)
    throw unavailable('Zotero returned an unexpected key description.');
  const { userID, username, access } = info.data;
  const grants = [access.user, ...Object.values(access.groups ?? {})];
  if (grants.some((g) => g?.write === true))
    throw new PlatformError(
      'VALIDATION_ERROR',
      'This key can modify your Zotero library. Create a key with read-only access; Atlas never writes to Zotero.',
    );
  const libraries: ZoteroLibrary[] = [];
  if (access.user?.library)
    libraries.push({ id: `users/${userID}`, name: 'My Library', kind: 'user' });
  const groups = access.groups ?? {};
  if (Object.keys(groups).length) {
    const listed = z.array(groupRow).safeParse(
      (
        await zoteroGet(`/users/${userID}/groups`, { limit: '100' }, apiKey, {
          signal,
        })
      ).data,
    );
    for (const group of listed.success ? listed.data : []) {
      const grant = groups[String(group.id)] ?? groups.all;
      if (grant?.library)
        libraries.push({
          id: `groups/${group.id}`,
          name: group.data.name,
          kind: 'group',
        });
    }
  }
  if (!libraries.length)
    throw new PlatformError(
      'VALIDATION_ERROR',
      'This key does not grant read access to any library.',
    );
  return { userId: String(userID), displayName: username ?? null, libraries };
}

const connectionRow = z.object({
  id: z.uuid(),
  externalUserId: z.string(),
  displayName: z.string().nullable(),
  access: z.unknown(),
  ciphertext: z.string().nullable(),
  createdAt: z.string(),
});
async function activeConnection(actor: VerifiedActor) {
  return withActor(actor, async (tx) => {
    // RLS: only the owner's own row is visible.
    const [row] = z.array(connectionRow).parse(
      await tx.$queryRaw`SELECT id, external_user_id AS "externalUserId", display_name AS "displayName", access,
        credential_ciphertext AS ciphertext, created_at::text AS "createdAt" FROM external_connections
        WHERE profile_id=${actor.id}::uuid AND provider=${PROVIDER} AND revoked_at IS NULL`,
    );
    return row ?? null;
  });
}
export const zoteroStatusDto = z.object({
  configured: z.boolean(),
  connection: z
    .object({
      id: z.uuid(),
      userId: z.string(),
      displayName: z.string().nullable(),
      libraries: z.array(library),
      connectedAt: z.string(),
    })
    .nullable(),
});
export async function zoteroStatus(actor: VerifiedActor) {
  if (!integrationsConfigured())
    return zoteroStatusDto.parse({ configured: false, connection: null });
  const row = await activeConnection(actor);
  return zoteroStatusDto.parse({
    configured: true,
    connection: row
      ? {
          id: row.id,
          userId: row.externalUserId,
          displayName: row.displayName,
          libraries: zoteroAccess.parse(row.access).libraries,
          connectedAt: row.createdAt,
        }
      : null,
  });
}

async function mutate(
  actor: VerifiedActor,
  command: string,
  input: Record<string, unknown>,
  requestId: string,
) {
  return withActor(actor, async (tx) => {
    await tx.$queryRaw`SELECT atlas_private.mutate(${command},${JSON.stringify(input)}::jsonb,${requestId}::uuid)`;
  });
}
export async function connectZotero(
  actor: VerifiedActor,
  raw: unknown,
  requestId: string,
  signal?: AbortSignal,
) {
  if (!integrationsConfigured())
    throw new PlatformError(
      'EXTERNAL_PROVIDER_ERROR',
      'External library connections are not configured on this server.',
    );
  const { apiKey } = z
    .object({ apiKey: z.string().trim().max(100) })
    .strict()
    .parse(raw);
  const key = await inspectKey(apiKey, signal);
  await mutate(
    actor,
    'zotero.connect',
    {
      externalUserId: key.userId,
      displayName: key.displayName,
      access: { libraries: key.libraries },
      ciphertext: sealCredential(apiKey, actor.id, PROVIDER),
    },
    requestId,
  );
  return zoteroStatus(actor);
}
/** Removes Atlas's copy of the key; the user revokes the key at Zotero. */
export async function disconnectZotero(
  actor: VerifiedActor,
  requestId: string,
) {
  const row = await activeConnection(actor);
  if (!row) throw new PlatformError('NOT_FOUND', 'No Zotero connection.');
  await mutate(actor, 'zotero.disconnect', { id: row.id }, requestId);
  return zoteroStatus(actor);
}

/** The caller's key and a library it was validated for — or nothing. */
async function credentialFor(actor: VerifiedActor, libraryId: string) {
  const lib = zoteroLibrary.parse(libraryId);
  const row = await activeConnection(actor);
  if (!row?.ciphertext)
    throw new PlatformError('NOT_FOUND', 'Connect Zotero first.');
  const allowed = zoteroAccess
    .parse(row.access)
    .libraries.some((l) => l.id === lib);
  if (!allowed)
    throw new PlatformError(
      'NOT_FOUND',
      'That Zotero library is not available.',
    );
  const apiKey = openCredential(row.ciphertext, actor.id, PROVIDER);
  if (!apiKey)
    throw new PlatformError(
      'FORBIDDEN',
      'The stored Zotero connection can no longer be used. Reconnect Zotero.',
    );
  return { apiKey, library: lib, connectionId: row.id };
}

const importContext = (
  actorId: string,
  projectId: string,
  connectionId: string,
  link: ImportLink,
  record: ReferenceRecord,
) =>
  JSON.stringify([
    actorId,
    projectId,
    connectionId,
    link.source,
    link.library,
    link.key,
    link.version,
    recordHash(record),
  ]);

/** Reject client-invented provenance/versions or altered preview metadata.
 * Current actor/project rights and active owner connection are still required.
 */
export async function verifyZoteroImports(
  actor: VerifiedActor,
  projectId: string,
  items: z.output<typeof importItem>[],
) {
  const row = await activeConnection(actor);
  if (!row?.ciphertext)
    throw new PlatformError('NOT_FOUND', 'Connect Zotero first.');
  const allowed = zoteroAccess.parse(row.access).libraries;
  for (const item of items) {
    const link = item.link;
    const proof = link?.proof?.split('.');
    if (
      !link ||
      item.atlasId ||
      !allowed.some((lib) => lib.id === link.library) ||
      proof?.length !== 2 ||
      proof[0] !== row.id ||
      !verifyImportContext(
        importContext(actor.id, projectId, row.id, link, item.record),
        proof[1] ?? '',
      )
    )
      throw new PlatformError(
        'CONFLICT',
        'The Zotero preview changed or is no longer available. Preview it again.',
      );
  }
}

const collectionRow = z
  .object({
    key: z.string().regex(/^[A-Z0-9]{8}$/),
    data: z
      .object({
        name: z.string().max(500),
        parentCollection: z.union([z.string(), z.literal(false)]).optional(),
      })
      .loose(),
    meta: z
      .object({ numItems: z.number().int().optional() })
      .loose()
      .optional(),
  })
  .loose();
export async function zoteroCollections(
  actor: VerifiedActor,
  libraryId: string,
  start = 0,
  signal?: AbortSignal,
) {
  const { apiKey, library: lib } = await credentialFor(actor, libraryId);
  const res = await zoteroGet(
    `/${lib}/collections`,
    { limit: '100', start: String(start), sort: 'title' },
    apiKey,
    { signal },
  );
  const rows = z.array(collectionRow).safeParse(res.data);
  if (!rows.success)
    throw unavailable('Zotero returned an unexpected collection list.');
  return {
    items: rows.data.map((c) => ({
      key: c.key,
      name: c.data.name,
      parent:
        typeof c.data.parentCollection === 'string'
          ? c.data.parentCollection
          : null,
      items: c.meta?.numItems ?? null,
    })),
    total: res.totalResults,
    nextStart:
      res.totalResults !== null && start + rows.data.length < res.totalResults
        ? start + rows.data.length
        : null,
  };
}

/** Lists top-level items (no attachments/notes) for browsing and selection. */
export async function zoteroItems(
  actor: VerifiedActor,
  input: {
    library: string;
    collection?: string | undefined;
    start?: number;
    since?: number | undefined;
  },
  signal?: AbortSignal,
) {
  const { apiKey, library: lib } = await credentialFor(actor, input.library);
  const collection = input.collection
    ? z
        .string()
        .regex(/^[A-Z0-9]{8}$/)
        .parse(input.collection)
    : null;
  const start = input.start ?? 0;
  const res = await zoteroGet(
    `/${lib}${collection ? `/collections/${collection}` : ''}/items/top`,
    {
      limit: '50',
      start: String(start),
      format: 'json',
      sort: 'dateModified',
      // Zotero negates the entire OR set (API::getSearchParamValues).
      itemType: '-attachment || note',
      includeTrashed: '0',
      // Incremental reads: only items modified after a known library version.
      ...(input.since !== undefined ? { since: String(input.since) } : {}),
    },
    apiKey,
    { signal },
  );
  const raw = Array.isArray(res.data) ? res.data : [];
  const items = raw.map((item, index) =>
    fromZoteroItem(item, lib, start + index),
  );
  return {
    items: items.map((p) => ({
      key: p.provenance.key,
      version: p.provenance.version,
      title: p.record?.title ?? null,
      type: p.record ? referenceTypeLabels[p.record.type] : null,
      creators: p.record?.authors.slice(0, 3).map(personDisplay) ?? [],
      year: p.record?.issued?.year ?? null,
      importable: !!p.record,
    })),
    total: res.totalResults,
    libraryVersion: res.lastModifiedVersion,
    nextStart:
      res.totalResults !== null && start + raw.length < res.totalResults
        ? start + raw.length
        : null,
  };
}

/**
 * Selected items → the same preview/dedupe pipeline as files. An item that
 * is no longer returned (deleted upstream or access revoked) is reported;
 * its Atlas paper, if any, is never removed.
 */
export async function previewZoteroImport(
  actor: VerifiedActor,
  projectId: string,
  raw: unknown,
  signal?: AbortSignal,
) {
  z.uuid().parse(projectId);
  const input = z
    .object({
      library: zoteroLibrary,
      itemKeys: z
        .array(z.string().regex(/^[A-Z0-9]{8}$/))
        .min(1)
        .max(50),
    })
    .strict()
    .parse(raw);
  await withActor(actor, (tx) =>
    requireProject(tx, projectId, 'project.write'),
  );
  const {
    apiKey,
    library: lib,
    connectionId,
  } = await credentialFor(actor, input.library);
  const keys = [...new Set(input.itemKeys)];
  const res = await zoteroGet(
    `/${lib}/items`,
    { itemKey: keys.join(','), format: 'json', limit: '50' },
    apiKey,
    { signal },
  );
  const parsed: ParsedRecord[] = (Array.isArray(res.data) ? res.data : []).map(
    (item, index) => fromZoteroItem(item, lib, index),
  );
  const returned = new Set(parsed.map((p) => p.provenance.key));
  const issues = keys
    .filter((k) => !returned.has(k))
    .map((k) => ({
      index: null,
      severity: 'warning' as const,
      message: `Item ${k} is no longer available in Zotero (deleted or access removed). Atlas papers are not changed.`,
    }));
  return withActor(actor, async (tx) => {
    await requireProject(tx, projectId, 'project.write');
    const classified = await classify(tx, projectId, parsed);
    for (const item of classified) {
      if (item.link && item.record)
        item.link.proof = `${connectionId}.${signImportContext(importContext(actor.id, projectId, connectionId, item.link, item.record))}`;
    }
    return summarize('ZOTERO', lib, classified, issues);
  });
}
