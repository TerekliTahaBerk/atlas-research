import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  evidence,
  tokenBound,
  type Evidence,
  type ResearchReference,
  validateVector,
} from '@atlas/ai';
import { Prisma } from '@atlas/database';
import {
  withActor,
  type VerifiedActor,
} from '@/features/platform/server/database';
import { requireProject } from '@/features/library/server/library';
import { PlatformError } from '@/features/platform/server/errors';

export const hashText = (text: string) =>
  createHash('sha256').update(text).digest('hex');
/** Resolves explicit attachments completely before an external embedding/generation call. */
export async function resolveReferences(
  actor: VerifiedActor,
  projectId: string,
  refs: readonly ResearchReference[],
) {
  return withActor(actor, async (tx) => {
    await requireProject(tx, projectId, 'project.read');
    for (const ref of refs) {
      if (ref.projectId !== projectId || ref.kind === 'search-result')
        throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
      if (ref.kind === 'project') continue;
      const papers = await tx.$queryRaw<
        unknown[]
      >`SELECT id FROM project_papers WHERE id=${ref.projectPaperId}::uuid AND project_id=${projectId}::uuid AND archived_at IS NULL`;
      if (!papers.length)
        throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
      if ('sourceVersionId' in ref) {
        const sources = await tx.$queryRaw<
          unknown[]
        >`SELECT id FROM source_versions WHERE id=${ref.sourceVersionId}::uuid AND project_paper_id=${ref.projectPaperId}::uuid AND project_id=${projectId}::uuid AND state='READY'`;
        if (!sources.length)
          throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
      }
      if (ref.kind === 'annotation') {
        const notes = await tx.$queryRaw<
          unknown[]
        >`SELECT id FROM paper_annotations WHERE id=${ref.annotationId}::uuid AND source_version_id=${ref.sourceVersionId}::uuid AND project_paper_id=${ref.projectPaperId}::uuid AND deleted_at IS NULL`;
        if (!notes.length)
          throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
      }
    }
  });
}
export async function retrieve(
  actor: VerifiedActor,
  projectId: string,
  query: string,
  refs: readonly ResearchReference[],
  vector?: number[],
  model?: string,
) {
  await resolveReferences(actor, projectId, refs);
  return withActor(actor, async (tx) => {
    await requireProject(tx, projectId, 'project.read');
    const paperIds = [
      ...new Set(
        refs.flatMap((r) => ('projectPaperId' in r ? [r.projectPaperId] : [])),
      ),
    ];
    await tx.$executeRaw`SET LOCAL statement_timeout = '5s'`;
    if (query.length > 6000 || tokenBound(query) > 24000)
      throw new PlatformError(
        'VALIDATION_ERROR',
        'The research query is too long.',
      );
    if (vector) validateVector(vector, 768);
    // Each explicit reference keeps its own paper/version/page predicate. A version
    // attached beside another paper must not accidentally suppress that paper.
    const scopes = refs.flatMap((r) => {
      if (r.kind === 'paper')
        return [Prisma.sql`c.project_paper_id=${r.projectPaperId}::uuid`];
      if (r.kind === 'source-version')
        return [Prisma.sql`c.source_version_id=${r.sourceVersionId}::uuid`];
      if (r.kind === 'selection')
        return [
          Prisma.sql`(c.source_version_id=${r.sourceVersionId}::uuid AND c.page=${r.pageNumber} AND strpos(c.text,${r.quote})>0)`,
        ];
      return [];
    });
    const allProject = !refs.length || refs.some((r) => r.kind === 'project');
    const referenceFilter = allProject
      ? Prisma.empty
      : scopes.length
        ? Prisma.sql`AND (${Prisma.join(scopes, ' OR ')})`
        : Prisma.sql`AND false`;
    const similarity =
      vector && model
        ? Prisma.sql`1-(c.embedding OPERATOR(extensions.<=>) ${JSON.stringify(vector)}::extensions.vector)`
        : Prisma.sql`0::double precision`;
    const modelFilter = model
      ? Prisma.sql`AND c.embedding_model=${model}`
      : Prisma.empty;
    const chunks = z.array(evidence).parse(
      await tx.$queryRaw(Prisma.sql`WITH eligible AS MATERIALIZED (
        SELECT c.*,coalesce(p.private_title,p.metadata->>'title','Source') AS title
        FROM source_chunks c JOIN source_versions s ON s.id=c.source_version_id AND s.project_id=c.project_id AND s.state='READY' AND s.sha256=c.source_sha256
        JOIN project_papers p ON p.id=c.project_paper_id AND p.project_id=c.project_id AND p.archived_at IS NULL
        JOIN ai_processing_jobs j ON j.source_version_id=c.source_version_id AND j.extraction_version=c.extraction_version AND j.embedding_model=c.embedding_model AND j.state='READY'
        WHERE c.project_id=${projectId}::uuid ${referenceFilter} ${modelFilter}
      ), scored AS (
        SELECT c.*,${similarity}*0.7+ts_rank_cd(c.search_document,plainto_tsquery('simple',${query}))*0.3 AS score FROM eligible c
        ${allProject && !vector ? Prisma.sql`WHERE c.search_document @@ plainto_tsquery('simple',${query})` : Prisma.empty}
      ), ranked AS (SELECT c.*,row_number() OVER(PARTITION BY project_paper_id ORDER BY score DESC,id) AS source_rank FROM scored c)
      SELECT id::text,project_id AS "projectId",project_paper_id AS "projectPaperId",source_version_id AS "sourceVersionId",page,start_offset AS "startOffset",text,source_sha256 AS checksum,'full-text' AS kind,title FROM ranked WHERE source_rank<=4 ORDER BY source_rank,score DESC,id LIMIT 24`),
    );
    const results: Evidence[] = [];
    let bytes = 0;
    const counts = new Map<string, number>();
    for (const chunk of chunks) {
      const n = counts.get(chunk.projectPaperId) ?? 0;
      const next = tokenBound(chunk.text);
      if (
        n >= 4 ||
        (!counts.has(chunk.projectPaperId) && counts.size >= 12) ||
        bytes + next > 20000
      )
        continue;
      counts.set(chunk.projectPaperId, n + 1);
      bytes += next;
      results.push(chunk);
    }
    // Bibliography/abstracts remain explicitly labeled and never receive pages.
    const papers = z
      .array(
        z.object({
          id: z.uuid(),
          title: z.string(),
          abstract: z.string().nullable(),
        }),
      )
      .parse(
        await tx.$queryRaw(
          Prisma.sql`SELECT id,coalesce(private_title,metadata->>'title','Untitled') AS title,metadata->>'abstract' AS abstract FROM project_papers WHERE project_id=${projectId}::uuid AND archived_at IS NULL ${paperIds.length ? Prisma.sql`AND id IN (${Prisma.join(paperIds.map((id) => Prisma.sql`${id}::uuid`))})` : Prisma.empty} ORDER BY created_at,id LIMIT 12`,
        ),
      );
    for (const paper of papers) {
      if (
        !allProject &&
        !refs.some((r) => r.kind === 'paper' && r.projectPaperId === paper.id)
      )
        continue;
      if (
        allProject &&
        !vector &&
        !`${paper.title} ${paper.abstract ?? ''}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        !results.some((c) => c.projectPaperId === paper.id)
      )
        continue;
      if (results.some((c) => c.projectPaperId === paper.id)) continue;
      const text = (paper.abstract ?? paper.title).slice(0, 4000);
      if (bytes + tokenBound(text) > 24000) break;
      bytes += tokenBound(text);
      results.push({
        id: `metadata:${paper.id}`,
        projectId,
        projectPaperId: paper.id,
        sourceVersionId: null,
        page: null,
        startOffset: 0,
        text,
        checksum: hashText(text),
        kind: paper.abstract ? 'abstract' : 'metadata',
        title: paper.title,
      });
    }
    for (const ref of refs) {
      if (ref.kind === 'annotation') {
        const [note] = z
          .array(z.object({ body: z.string().nullable(), anchor: z.unknown() }))
          .parse(
            await tx.$queryRaw`SELECT body,anchor FROM paper_annotations WHERE id=${ref.annotationId}::uuid AND deleted_at IS NULL`,
          );
        if (note?.body) {
          const text = note.body.slice(0, 4000);
          if (bytes + tokenBound(text) > 24000)
            throw new PlatformError(
              'VALIDATION_ERROR',
              'The attached research context is too large.',
            );
          bytes += tokenBound(text);
          results.push({
            id: `annotation:${ref.annotationId}`,
            projectId,
            projectPaperId: ref.projectPaperId,
            sourceVersionId: ref.sourceVersionId,
            page: null,
            startOffset: 0,
            text,
            checksum: hashText(text),
            kind: 'annotation',
            title: 'User annotation',
          });
        }
      }
      if (ref.kind === 'selection') {
        // User-submitted quotations are never evidence unless found in stored extraction.
        const matched = results.some(
          (c) =>
            c.sourceVersionId === ref.sourceVersionId &&
            c.page === ref.pageNumber &&
            c.text.includes(ref.quote),
        );
        if (!matched)
          throw new PlatformError(
            'CONFLICT',
            'The selected passage is not indexed or cannot be verified.',
          );
      }
    }
    return results.slice(0, 24);
  });
}
export async function revalidateEvidence(
  actor: VerifiedActor,
  projectId: string,
  sources: readonly Evidence[],
) {
  await resolveReferences(
    actor,
    projectId,
    sources.map((s) =>
      s.sourceVersionId
        ? {
            kind: 'source-version' as const,
            projectId,
            projectPaperId: s.projectPaperId,
            sourceVersionId: s.sourceVersionId,
          }
        : {
            kind: 'paper' as const,
            projectId,
            projectPaperId: s.projectPaperId,
          },
    ),
  );
  return withActor(actor, async (tx) => {
    for (const source of sources) {
      if (source.kind === 'annotation') {
        const rows = await tx.$queryRaw<
          unknown[]
        >`SELECT id FROM paper_annotations WHERE id=${source.id.replace('annotation:', '')}::uuid AND deleted_at IS NULL AND body=${source.text}`;
        if (!rows.length)
          throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
      } else if (source.kind === 'full-text') {
        const rows = await tx.$queryRaw<
          unknown[]
        >`SELECT id FROM source_chunks WHERE id=${source.id}::uuid AND project_id=${projectId}::uuid AND project_paper_id=${source.projectPaperId}::uuid AND source_version_id=${source.sourceVersionId}::uuid AND page=${source.page} AND start_offset=${source.startOffset} AND text=${source.text} AND source_sha256=${source.checksum}`;
        if (!rows.length)
          throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
      } else {
        const [row] = z
          .array(z.object({ text: z.string() }))
          .parse(
            await tx.$queryRaw`SELECT left(coalesce(metadata->>'abstract',private_title,metadata->>'title','Untitled'),4000) AS text FROM project_papers WHERE id=${source.projectPaperId}::uuid AND archived_at IS NULL`,
          );
        if (!row || hashText(row.text) !== source.checksum)
          throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
      }
    }
  });
}

export async function authorizeCitation(
  actor: VerifiedActor,
  cite: import('@atlas/ai').VerifiedCitation,
) {
  const source = await withActor(actor, async (tx) => {
    await requireProject(tx, cite.projectId, 'project.read');
    if (cite.kind === 'full-text') {
      const [row] = z
        .array(evidence)
        .parse(
          await tx.$queryRaw`SELECT c.id::text,c.project_id AS "projectId",c.project_paper_id AS "projectPaperId",c.source_version_id AS "sourceVersionId",c.page,c.start_offset AS "startOffset",c.text,c.source_sha256 AS checksum,'full-text' AS kind,${cite.title} AS title FROM source_chunks c WHERE c.id=${cite.evidenceId}::uuid`,
        );
      return row;
    }
    if (cite.kind === 'annotation') {
      const [row] = z
        .array(z.object({ text: z.string() }))
        .parse(
          await tx.$queryRaw`SELECT body AS text FROM paper_annotations WHERE id=${cite.evidenceId.replace('annotation:', '')}::uuid AND deleted_at IS NULL AND source_version_id=${cite.sourceVersionId}::uuid AND project_paper_id=${cite.projectPaperId}::uuid`,
        );
      return row
        ? { ...cite, id: cite.evidenceId, text: row.text, startOffset: 0 }
        : undefined;
    }
    const [row] = z
      .array(z.object({ text: z.string() }))
      .parse(
        await tx.$queryRaw`SELECT left(coalesce(metadata->>'abstract',private_title,metadata->>'title','Untitled'),4000) AS text FROM project_papers WHERE id=${cite.projectPaperId}::uuid AND project_id=${cite.projectId}::uuid AND archived_at IS NULL`,
      );
    return row
      ? { ...cite, id: cite.evidenceId, text: row.text, startOffset: 0 }
      : undefined;
  });
  if (
    !source ||
    source.projectId !== cite.projectId ||
    source.checksum !== cite.checksum ||
    source.projectPaperId !== cite.projectPaperId ||
    source.sourceVersionId !== cite.sourceVersionId ||
    source.page !== cite.page ||
    cite.startOffset < source.startOffset ||
    source.text.slice(
      cite.startOffset - source.startOffset,
      cite.endOffset - source.startOffset,
    ) !== cite.quote ||
    (source.kind !== 'full-text' && hashText(source.text) !== cite.checksum)
  )
    throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
  await revalidateEvidence(actor, cite.projectId, [source]);
  return cite;
}
