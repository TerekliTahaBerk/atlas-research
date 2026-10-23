import 'server-only';
import { z } from 'zod';
import {
  artifactSearchQuery,
  searchPageDto,
  searchTerms,
  SNIPPET_END,
  SNIPPET_START,
} from '@atlas/core';
import { Prisma } from '@atlas/database';
import {
  withActor,
  type VerifiedActor,
} from '@/features/platform/server/database';
import {
  decodeLibraryCursor,
  encodeLibraryCursor,
  requireProject,
} from '@/features/library/server/library';
import { hrefFor, paperDetail } from './references';

export const SEARCH_PAGE = 20;
const hitRow = z.object({
  artifactId: z.uuid(),
  id: z.uuid(),
  kind: z.enum(['PAPER', 'DOCUMENT', 'TASK']),
  title: z.string(),
  snippet: z.string().nullable(),
  metadata: z.unknown().nullable(),
  number: z.number().int().nullable(),
  updatedAt: z.string(),
});

/**
 * Project-scoped lexical search. Authorization happens in SQL (explicit
 * project filter + RLS on every table); archived rows are excluded, so no
 * private or revoked text reaches ranking, snippets or the response.
 * Snippets are bounded plain text; markers come from private-use characters
 * stripped from the source first.
 */
export async function searchArtifacts(
  actor: VerifiedActor,
  projectId: string,
  raw: unknown,
) {
  z.uuid().parse(projectId);
  const query = artifactSearchQuery.parse(raw);
  const offset = decodeLibraryCursor(actor.id, projectId, query);
  const terms = searchTerms(query.q);
  if (!terms) return searchPageDto.parse({ items: [], nextCursor: null });
  return withActor(actor, async (tx) => {
    await requireProject(tx, projectId, 'project.read');
    const options = `StartSel=${SNIPPET_START}, StopSel=${SNIPPET_END}, MaxWords=28, MinWords=10, MaxFragments=1, HighlightAll=false`;
    const clean = (column: Prisma.Sql) =>
      Prisma.sql`translate(left(${column},20000),${SNIPPET_START + SNIPPET_END},'')`;
    const want = (kind: string) => !query.kind || query.kind === kind;
    const parts: Prisma.Sql[] = [];
    if (want('DOCUMENT'))
      parts.push(Prisma.sql`SELECT d.artifact_id AS "artifactId", d.id, 'DOCUMENT' AS kind, d.title,
        ts_headline('simple',${clean(Prisma.sql`d.search_text`)},q.query,${options}) AS snippet, NULL::jsonb AS metadata, NULL::int AS number,
        d.updated_at AS at, ts_rank(d.search_document,q.query) AS rank
        FROM documents d, q WHERE d.project_id=${projectId}::uuid AND d.archived_at IS NULL AND d.search_document @@ q.query`);
    if (want('TASK'))
      parts.push(Prisma.sql`SELECT t.artifact_id AS "artifactId", t.id, 'TASK' AS kind, t.title,
        ts_headline('simple',${clean(Prisma.sql`t.description`)},q.query,${options}) AS snippet, NULL::jsonb AS metadata, t.task_number AS number,
        t.updated_at AS at, ts_rank(t.search_document,q.query) AS rank
        FROM tasks t, q WHERE t.project_id=${projectId}::uuid AND t.archived_at IS NULL AND t.search_document @@ q.query`);
    if (want('PAPER'))
      parts.push(Prisma.sql`SELECT pp.artifact_id AS "artifactId", pp.id, 'PAPER' AS kind, coalesce(pp.private_title,pp.metadata->>'title') AS title,
        ts_headline('simple',${clean(Prisma.sql`coalesce(pp.metadata->>'abstract','')`)},q.query,${options}) AS snippet, pp.metadata, NULL::int AS number,
        pp.updated_at AS at, ts_rank(setweight(to_tsvector('simple',coalesce(pp.private_title,pp.metadata->>'title','')),'A') ||
          setweight(to_tsvector('simple',left(coalesce(pp.metadata->>'abstract',''),20000)),'B'),q.query) AS rank
        FROM project_papers pp, q WHERE pp.project_id=${projectId}::uuid AND pp.archived_at IS NULL
        AND (setweight(to_tsvector('simple',coalesce(pp.private_title,pp.metadata->>'title','')),'A') ||
          setweight(to_tsvector('simple',left(coalesce(pp.metadata->>'abstract',''),20000)),'B')) @@ q.query`);
    const order =
      query.sort === 'recent'
        ? Prisma.sql`at DESC, "artifactId"`
        : Prisma.sql`rank DESC, at DESC, "artifactId"`;
    const rows = z.array(hitRow).parse(
      await tx.$queryRaw(
        Prisma.sql`WITH q AS (SELECT to_tsquery('simple',${terms}) AS query)
          SELECT "artifactId", id, kind, title, snippet, metadata, number, at::text AS "updatedAt" FROM (${Prisma.join(parts, ' UNION ALL ')}) hits
          ORDER BY ${order} LIMIT ${SEARCH_PAGE + 1} OFFSET ${offset}`,
      ),
    );
    const more = rows.length > SEARCH_PAGE;
    return searchPageDto.parse({
      items: rows.slice(0, SEARCH_PAGE).map((r) => ({
        artifactId: r.artifactId,
        id: r.id,
        kind: r.kind,
        title: r.title,
        snippet: (r.snippet ?? '').slice(0, 400),
        detail:
          r.kind === 'PAPER'
            ? paperDetail(r.metadata)
            : r.kind === 'TASK'
              ? `#${r.number}`
              : 'Document',
        href: hrefFor(projectId, r.kind, r.id),
        updatedAt: r.updatedAt,
      })),
      nextCursor: more
        ? encodeLibraryCursor(actor.id, projectId, query, offset + SEARCH_PAGE)
        : null,
    });
  });
}
