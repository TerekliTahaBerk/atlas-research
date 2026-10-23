import 'server-only';
import { z } from 'zod';
import { documentExportFormat } from '@atlas/core';
import type { VerifiedActor } from '@/features/platform/server/database';
import { rateLimit } from '@/features/platform/server/limiter';
import {
  exportDocument,
  getDocument,
  getVersion,
  listDocuments,
  listVersions,
} from '@/features/documents/server/documents';
import {
  getTask,
  listTasks,
  milestones,
  participants,
} from '@/features/tasks/server/tasks';
import { artifactLinks, artifactOptions, projectGraph } from './links';
import { searchArtifacts } from './search';

const uuid = z.uuid();
const params = (url: URL) =>
  Object.fromEntries(
    [...url.searchParams.entries()].filter(([, value]) => value !== ''),
  );

/** Phase 04 authenticated reads. Returns undefined for unknown paths. */
export async function artifactGet(
  actor: VerifiedActor,
  path: string[],
  url: URL,
) {
  const [root, id, leaf, extra, more] = path;
  if (more !== undefined) return undefined;
  if (root === 'projects' && extra === undefined) {
    if (leaf === 'documents')
      return listDocuments(actor, uuid.parse(id), params(url));
    if (leaf === 'tasks') return listTasks(actor, uuid.parse(id), params(url));
    if (leaf === 'milestones') return milestones(actor, uuid.parse(id));
    if (leaf === 'participants') return participants(actor, uuid.parse(id));
    if (leaf === 'artifacts')
      return artifactOptions(actor, uuid.parse(id), params(url));
    if (leaf === 'graph') return projectGraph(actor, uuid.parse(id));
    if (leaf === 'search') {
      await rateLimit('search', actor.id, 60, 60);
      return searchArtifacts(actor, uuid.parse(id), params(url));
    }
  }
  if (root === 'documents') {
    if (leaf === undefined) return getDocument(actor, uuid.parse(id));
    if (leaf === 'versions' && extra === undefined)
      return listVersions(
        actor,
        uuid.parse(id),
        z
          .string()
          .max(1024)
          .optional()
          .parse(url.searchParams.get('cursor') || undefined),
      );
    if (leaf === 'versions')
      return getVersion(
        actor,
        uuid.parse(id),
        z.coerce.number().int().min(1).max(1000000).parse(extra),
      );
  }
  if (root === 'tasks' && leaf === undefined)
    return getTask(actor, uuid.parse(id));
  if (root === 'artifacts' && leaf === 'links' && extra === undefined)
    return artifactLinks(actor, uuid.parse(id));
  return undefined;
}

const types = {
  markdown: { type: 'text/markdown', extension: 'md' },
  text: { type: 'text/plain', extension: 'txt' },
  html: { type: 'text/html', extension: 'html' },
} as const;
/** Document exports are private attachments; HTML is sanitized by construction. */
export async function documentExportResponse(
  actor: VerifiedActor,
  path: string[],
  url: URL,
) {
  const [root, id, leaf, extra] = path;
  if (root !== 'documents' || leaf !== 'export' || extra !== undefined)
    return undefined;
  const format = documentExportFormat.parse(
    url.searchParams.get('format') ?? 'markdown',
  );
  const file = await exportDocument(actor, uuid.parse(id), format);
  const name =
    file.title
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9 _-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'atlas-document';
  return new Response(file.body, {
    headers: {
      'Content-Type': `${types[format].type}; charset=utf-8`,
      'Content-Disposition': `attachment; filename="${name}.${types[format].extension}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      // Even if opened directly, exported HTML cannot run script or load resources.
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
