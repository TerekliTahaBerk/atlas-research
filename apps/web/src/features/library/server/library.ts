import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@atlas/database';
import {
  annotationAnchor,
  annotationDto,
  collectionDto,
  libraryPageDto,
  normalizedPaper,
  projectPaperDto,
  readingStatus,
  researchCommand,
  sourceState,
  tagDto,
  toBibtex,
  toRis,
  type CitationEntry,
  type LibraryQuery,
  type NormalizedPaper,
  type ProjectPaperDto,
  type ResearchCommandInput,
} from '@atlas/core';
import {
  withActor,
  type VerifiedActor,
} from '@/features/platform/server/database';
import { PlatformError } from '@/features/platform/server/errors';

export const LIBRARY_PAGE = 50;

// ------------------------------------------------------------ authorization

/** Fails as NOT_FOUND unless the actor currently holds the capability. */
export async function requireProject(
  tx: Prisma.TransactionClient,
  projectId: string,
  capability: 'project.read' | 'project.write',
) {
  const [row] = z
    .array(z.object({ allowed: z.boolean() }))
    .parse(
      await tx.$queryRaw`SELECT atlas_private.can('project',${projectId}::uuid,${capability}) AS allowed`,
    );
  if (!row?.allowed)
    throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
}

// ----------------------------------------------------------------- cursors

/*
 * Library pages use signed offsets bound to the actor, project and exact
 * filter digest. Every page re-runs the RLS-protected query.
 */
function secret() {
  const key = process.env.ATLAS_CURSOR_SECRET;
  if (!key || key.length < 32)
    throw new PlatformError('INTERNAL_ERROR', 'Pagination is not configured.');
  return key;
}
const libraryCursor = z.object({
  o: z.number().int().min(0).max(100000),
  s: z.string().regex(/^[a-f0-9]{32}$/),
  a: z.uuid(),
});
/** Any validated filter object; `cursor` itself is excluded from the digest. */
type CursorFilters = { cursor?: string | undefined };
function scopeDigest(projectId: string, query: CursorFilters) {
  const filters = Object.entries(query)
    .filter(([key, value]) => key !== 'cursor' && value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return createHash('sha256')
    .update(JSON.stringify([projectId, filters]))
    .digest('hex')
    .slice(0, 32);
}
export function encodeLibraryCursor(
  actorId: string,
  projectId: string,
  query: CursorFilters,
  offset: number,
) {
  const body = Buffer.from(
    JSON.stringify({ o: offset, s: scopeDigest(projectId, query), a: actorId }),
  ).toString('base64url');
  return `${body}.${createHmac('sha256', secret()).update(body).digest('hex')}`;
}
export function decodeLibraryCursor(
  actorId: string,
  projectId: string,
  query: CursorFilters,
) {
  if (!query.cursor) return 0;
  const [body, signature] = query.cursor.split('.');
  const invalid = new PlatformError('VALIDATION_ERROR', 'Invalid cursor.');
  if (!body || !signature || !/^[a-f0-9]{64}$/.test(signature)) throw invalid;
  const expected = createHmac('sha256', secret()).update(body).digest();
  if (!timingSafeEqual(Buffer.from(signature, 'hex'), expected)) throw invalid;
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch {
    throw invalid;
  }
  const parsed = libraryCursor.safeParse(raw);
  if (
    !parsed.success ||
    parsed.data.a !== actorId ||
    parsed.data.s !== scopeDigest(projectId, query)
  )
    throw invalid;
  return parsed.data.o;
}

// --------------------------------------------------------------------- DTOs

const paperRow = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  artifactId: z.uuid(),
  version: z.number().int(),
  readingStatus,
  addedAt: z.string(),
  updatedAt: z.string(),
  addedById: z.uuid(),
  privateTitle: z.string().nullable(),
  metadata: z.unknown().nullable(),
  collectionIds: z.array(z.uuid()),
  tagIds: z.array(z.uuid()),
  sources: z.array(
    z.object({
      id: z.uuid(),
      ordinal: z.number().int(),
      state: sourceState,
      byteSize: z.coerce.number().int().nullable(),
      sha256: z.string().nullable(),
      fileName: z.string(),
      createdAt: z.string(),
      failure: z.string().nullable(),
    }),
  ),
});
function toDto(row: z.infer<typeof paperRow>): ProjectPaperDto {
  const paper = row.metadata ? normalizedPaper.parse(row.metadata) : null;
  return projectPaperDto.parse({
    ...row,
    origin: paper ? 'PROVIDER' : 'PRIVATE',
    title: paper?.title ?? row.privateTitle ?? '',
    paper,
    sources: row.sources.map((s) => ({
      ...s,
      sourceType: 'UPLOAD',
      rightsBasis: 'USER_UPLOAD',
      sha256: s.sha256?.trim() ?? null,
    })),
  });
}
const paperSelect = Prisma.sql`
 SELECT pp.id, pp.project_id AS "projectId", pp.artifact_id AS "artifactId", pp.version,
  pp.reading_status::text AS "readingStatus", pp.created_at::text AS "addedAt", pp.updated_at::text AS "updatedAt",
  pp.added_by_id AS "addedById", pp.private_title AS "privateTitle", pp.metadata,
  coalesce((SELECT array_agg(cm.collection_id ORDER BY cm.collection_id) FROM collection_memberships cm
   JOIN paper_collections c ON c.id=cm.collection_id AND c.archived_at IS NULL WHERE cm.project_paper_id=pp.id),ARRAY[]::uuid[]) AS "collectionIds",
  coalesce((SELECT array_agg(t.tag_id ORDER BY t.tag_id) FROM project_paper_tags t WHERE t.project_paper_id=pp.id),ARRAY[]::uuid[]) AS "tagIds",
  coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'ordinal',s.ordinal,'state',s.state,'byteSize',s.byte_size,'sha256',s.sha256,
   'fileName',s.file_name,'createdAt',s.created_at::text,'failure',s.failure) ORDER BY s.ordinal DESC) FROM source_versions s WHERE s.project_paper_id=pp.id),'[]'::jsonb) AS sources
 FROM project_papers pp`;

// -------------------------------------------------------------------- reads

export async function libraryPage(
  actor: VerifiedActor,
  projectId: string,
  query: LibraryQuery,
) {
  z.uuid().parse(projectId);
  const offset = decodeLibraryCursor(actor.id, projectId, query);
  return withActor(actor, async (tx) => {
    await requireProject(tx, projectId, 'project.read');
    const filters: Prisma.Sql[] = [
      Prisma.sql`pp.project_id=${projectId}::uuid`,
    ];
    if (query.status)
      filters.push(
        Prisma.sql`pp.reading_status=${query.status}::"ReadingStatus"`,
      );
    // Archived papers are shown only when explicitly requested.
    else filters.push(Prisma.sql`pp.archived_at IS NULL`);
    if (query.collectionId)
      filters.push(
        Prisma.sql`EXISTS(SELECT 1 FROM collection_memberships cm WHERE cm.project_paper_id=pp.id AND cm.collection_id=${query.collectionId}::uuid)`,
      );
    if (query.tagId)
      filters.push(
        Prisma.sql`EXISTS(SELECT 1 FROM project_paper_tags pt WHERE pt.project_paper_id=pp.id AND pt.tag_id=${query.tagId}::uuid)`,
      );
    if (query.q) {
      const like = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      filters.push(
        Prisma.sql`(coalesce(pp.private_title,pp.metadata->>'title') ILIKE ${like} OR coalesce(pp.metadata->>'doi','') ILIKE ${like}
          OR coalesce(pp.metadata->>'venue','') ILIKE ${like} OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(pp.metadata->'authors','[]'::jsonb)) a WHERE a->>'name' ILIKE ${like}))`,
      );
    }
    const order =
      query.sort === 'title'
        ? Prisma.sql`lower(coalesce(pp.private_title,pp.metadata->>'title')) ASC, pp.id`
        : query.sort === 'year'
          ? Prisma.sql`(pp.metadata->>'year')::int DESC NULLS LAST, pp.created_at DESC, pp.id`
          : query.sort === 'citations'
            ? Prisma.sql`(pp.metadata->>'citationCount')::int DESC NULLS LAST, pp.created_at DESC, pp.id`
            : Prisma.sql`pp.created_at DESC, pp.id`;
    const rows = z
      .array(paperRow)
      .parse(
        await tx.$queryRaw(
          Prisma.sql`${paperSelect} WHERE ${Prisma.join(filters, ' AND ')} ORDER BY ${order} LIMIT ${LIBRARY_PAGE + 1} OFFSET ${offset}`,
        ),
      );
    const collections = z.array(collectionDto).parse(
      await tx.$queryRaw`SELECT c.id,c.name,c.description,c.version,(SELECT count(*)::int FROM collection_memberships cm JOIN project_papers p ON p.id=cm.project_paper_id AND p.archived_at IS NULL WHERE cm.collection_id=c.id) AS "paperCount"
          FROM paper_collections c WHERE c.project_id=${projectId}::uuid AND c.archived_at IS NULL ORDER BY lower(c.name),c.id LIMIT 200`,
    );
    const tags = z
      .array(tagDto)
      .parse(
        await tx.$queryRaw`SELECT id,name,version FROM paper_tags WHERE project_id=${projectId}::uuid ORDER BY normalized_name,id LIMIT 500`,
      );
    const more = rows.length > LIBRARY_PAGE;
    return libraryPageDto.parse({
      items: rows.slice(0, LIBRARY_PAGE).map(toDto),
      nextCursor: more
        ? encodeLibraryCursor(actor.id, projectId, query, offset + LIBRARY_PAGE)
        : null,
      collections,
      tags,
    });
  });
}

export async function getProjectPaper(actor: VerifiedActor, id: string) {
  z.uuid().parse(id);
  return withActor(actor, async (tx) => {
    const [row] = z
      .array(paperRow)
      .parse(
        await tx.$queryRaw(Prisma.sql`${paperSelect} WHERE pp.id=${id}::uuid`),
      );
    if (!row) throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
    return toDto(row);
  });
}

/** Maps search candidates to existing active associations in one project. */
export async function savedCandidates(
  actor: VerifiedActor,
  projectId: string,
  papers: NormalizedPaper[],
) {
  if (!papers.length) return {};
  const dois = papers.map((p) => p.doi).filter((d): d is string => !!d);
  const openalex = papers
    .map((p) => p.openAlexId)
    .filter((d): d is string => !!d);
  const s2 = papers
    .map((p) => p.semanticScholarId)
    .filter((d): d is string => !!d);
  return withActor(actor, async (tx) => {
    await requireProject(tx, projectId, 'project.read');
    const rows = z
      .array(
        z.object({
          id: z.uuid(),
          doi: z.string().nullable(),
          provider: z.string().nullable(),
          externalId: z.string().nullable(),
        }),
      )
      .parse(
        await tx.$queryRaw`SELECT pp.id, rp.normalized_doi AS doi, i.provider, i.external_id AS "externalId"
          FROM project_papers pp JOIN research_papers rp ON rp.id=pp.paper_id
          LEFT JOIN paper_external_identifiers i ON i.paper_id=rp.id
          WHERE pp.project_id=${projectId}::uuid AND pp.archived_at IS NULL AND (
            rp.normalized_doi = ANY(${dois}::text[])
            OR (i.provider='openalex' AND i.external_id = ANY(${openalex}::text[]))
            OR (i.provider='semantic-scholar' AND i.external_id = ANY(${s2}::text[])))`,
      );
    const saved: Record<string, string> = {};
    for (const paper of papers) {
      const match = rows.find(
        (r) =>
          (paper.doi && r.doi === paper.doi) ||
          (paper.openAlexId &&
            r.provider === 'openalex' &&
            r.externalId === paper.openAlexId) ||
          (paper.semanticScholarId &&
            r.provider === 'semantic-scholar' &&
            r.externalId === paper.semanticScholarId),
      );
      if (match) saved[paper.candidateId] = match.id;
    }
    return saved;
  });
}

const annotationRow = z.object({
  id: z.uuid(),
  sourceVersionId: z.uuid(),
  projectPaperId: z.uuid(),
  authorId: z.uuid(),
  kind: z.string(),
  visibility: z.string(),
  body: z.string().nullable(),
  anchor: z.unknown(),
  anchorStatus: z.string(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  canWrite: z.boolean(),
});
export async function sourceAnnotations(
  actor: VerifiedActor,
  sourceVersionId: string,
) {
  z.uuid().parse(sourceVersionId);
  return withActor(actor, async (tx) => {
    const [source] = z
      .array(z.object({ projectId: z.uuid() }))
      .parse(
        await tx.$queryRaw`SELECT project_id AS "projectId" FROM source_versions WHERE id=${sourceVersionId}::uuid`,
      );
    if (!source) throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
    // RLS hides deleted annotations and other authors' private annotations.
    const rows = z.array(annotationRow).parse(
      await tx.$queryRaw`SELECT id, source_version_id AS "sourceVersionId", project_paper_id AS "projectPaperId", author_id AS "authorId",
          kind::text, visibility::text, body, anchor, anchor_status AS "anchorStatus", version, created_at::text AS "createdAt", updated_at::text AS "updatedAt",
          atlas_private.can('project',project_id,'project.write') AS "canWrite"
          FROM paper_annotations WHERE source_version_id=${sourceVersionId}::uuid ORDER BY (anchor->>'pageNumber')::int, created_at, id LIMIT 1000`,
    );
    return rows.map(({ canWrite, ...row }) =>
      annotationDto.parse({
        ...row,
        anchor: annotationAnchor.parse(row.anchor),
        editable: canWrite && row.authorId === actor.id,
      }),
    );
  });
}

// ------------------------------------------------------------------ export

function citationEntry(dto: ProjectPaperDto): CitationEntry {
  const paper = dto.paper;
  return {
    title: dto.title,
    authors: paper?.authors.map((a) => a.name) ?? [],
    year: paper?.year ?? null,
    venue: paper?.venue ?? null,
    doi: paper?.doi ?? null,
    url: paper?.doi
      ? `https://doi.org/${paper.doi}`
      : (paper?.landingPageUrl ?? null),
    publicationType: paper?.publicationType ?? null,
  };
}
export const exportFormat = z.enum(['bibtex', 'ris']);
export function renderExport(
  papers: ProjectPaperDto[],
  format: z.infer<typeof exportFormat>,
) {
  const entries = papers.map(citationEntry);
  return format === 'bibtex'
    ? {
        body: toBibtex(entries),
        type: 'application/x-bibtex',
        extension: 'bib',
      }
    : {
        body: toRis(entries),
        type: 'application/x-research-info-systems',
        extension: 'ris',
      };
}
export async function exportProject(
  actor: VerifiedActor,
  projectId: string,
  collectionId: string | undefined,
) {
  const items: ProjectPaperDto[] = [];
  let cursor: string | undefined;
  // Bounded export: at most 20 pages (1,000 papers).
  for (let page = 0; page < 20; page++) {
    const result = await libraryPage(actor, projectId, {
      sort: 'title',
      collectionId,
      cursor,
    });
    items.push(...result.items);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return items;
}

// --------------------------------------------------------------- commands

export function requestHash(command: Record<string, unknown>) {
  // The key identifies the attempt; the hash covers everything else.
  const rest = Object.fromEntries(
    Object.entries(command).filter(([key]) => key !== 'idempotencyKey'),
  );
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, canonical(v)]),
          )
        : value;
  return createHash('sha256')
    .update(JSON.stringify(canonical(rest)))
    .digest('hex');
}

export const researchMutationResult = z.object({
  id: z.uuid(),
  existing: z.boolean().optional(),
  replayed: z.boolean().optional(),
  state: z.string().optional(),
  sourceVersionId: z.uuid().optional(),
  expiresAt: z.string().optional(),
});

/** Runs one fixed SQL command for the verified actor. */
export async function runResearchSql(
  actor: VerifiedActor,
  command: string,
  input: Record<string, unknown>,
  requestId: string,
) {
  return withActor(actor, async (tx) => {
    const [row] = z
      .array(z.object({ result: z.unknown() }))
      .parse(
        await tx.$queryRaw`SELECT atlas_private.mutate(${command},${JSON.stringify(input)}::jsonb,${requestId}::uuid) AS result`,
      );
    return researchMutationResult.parse(row?.result);
  });
}

export interface PaperResolver {
  /** Re-fetches public metadata server-side; client metadata is never trusted. */
  resolve(
    provider: 'openalex' | 'semantic-scholar',
    externalId: string,
  ): Promise<NormalizedPaper>;
}

export async function executeResearchCommand(
  actor: VerifiedActor,
  raw: ResearchCommandInput,
  requestId: string,
  resolver: PaperResolver,
) {
  const command = researchCommand.parse(raw);
  const hash = requestHash(command);
  if (command.command === 'paper.save') {
    // Authorize before spending provider budget on the request.
    await withActor(actor, (tx) =>
      requireProject(tx, command.projectId, 'project.write'),
    );
    const paper = await resolver.resolve(command.provider, command.externalId);
    const identifiers = [
      paper.openAlexId && {
        provider: 'openalex',
        externalId: paper.openAlexId,
      },
      paper.semanticScholarId && {
        provider: 'semantic-scholar',
        externalId: paper.semanticScholarId,
      },
    ].filter(Boolean);
    return runResearchSql(
      actor,
      command.command,
      {
        projectId: command.projectId,
        idempotencyKey: command.idempotencyKey,
        requestHash: hash,
        paper: {
          doi: paper.doi,
          title: paper.title,
          identifiers,
          metadata: paper,
        },
      },
      requestId,
    );
  }
  const { command: name, ...fields } = command;
  return runResearchSql(
    actor,
    name,
    { ...fields, requestHash: hash },
    requestId,
  );
}
