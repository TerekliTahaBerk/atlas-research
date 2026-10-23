import 'server-only';
import { z } from 'zod';
import {
  artifactOptionsDto,
  graphDto,
  linkDto,
  linksDto,
  type ArtifactKind,
} from '@atlas/core';
import { Prisma } from '@atlas/database';
import {
  withActor,
  type VerifiedActor,
} from '@/features/platform/server/database';
import { PlatformError } from '@/features/platform/server/errors';
import { requireProject } from '@/features/library/server/library';
import {
  hrefFor,
  paperDetail,
  projectParticipants,
  resolveArtifacts,
} from './references';

const linkRow = z.object({
  id: z.uuid(),
  relationship: z.string(),
  origin: z.string(),
  outgoing: z.boolean(),
  other: z.uuid(),
  createdAt: z.string(),
});
/** Both directions in one indexed query; endpoints resolved in one batch. */
export async function linksFor(
  tx: Prisma.TransactionClient,
  projectId: string,
  artifactId: string,
) {
  const rows = z.array(linkRow).parse(
    await tx.$queryRaw`SELECT id, relationship, origin, source_artifact_id=${artifactId}::uuid AS outgoing,
       CASE WHEN source_artifact_id=${artifactId}::uuid THEN target_artifact_id ELSE source_artifact_id END AS other,
       created_at::text AS "createdAt"
     FROM research_artifact_links WHERE project_id=${projectId}::uuid AND archived_at IS NULL
      AND (source_artifact_id=${artifactId}::uuid OR target_artifact_id=${artifactId}::uuid)
     ORDER BY created_at, id LIMIT 200`,
  );
  const others = await resolveArtifacts(
    tx,
    projectId,
    rows.map((r) => r.other),
  );
  const byId = new Map(others.map((o) => [o.artifactId, o]));
  return rows.map((r) =>
    linkDto.parse({
      id: r.id,
      relationship: r.relationship,
      origin: r.origin,
      direction: r.outgoing ? 'outgoing' : 'incoming',
      other: byId.get(r.other),
      createdAt: r.createdAt,
    }),
  );
}

export async function artifactLinks(actor: VerifiedActor, artifactId: string) {
  z.uuid().parse(artifactId);
  return withActor(actor, async (tx) => {
    const [row] = z
      .array(z.object({ projectId: z.uuid() }))
      .parse(
        await tx.$queryRaw`SELECT project_id AS "projectId" FROM artifacts WHERE id=${artifactId}::uuid`,
      );
    if (!row) throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
    await requireProject(tx, row.projectId, 'project.read');
    const [artifact] = await resolveArtifacts(tx, row.projectId, [artifactId]);
    if (!artifact || artifact.state === 'UNAVAILABLE')
      throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
    return linksDto.parse({
      artifact,
      links: await linksFor(tx, row.projectId, artifactId),
    });
  });
}

const optionRow = z.object({
  artifactId: z.uuid(),
  id: z.uuid(),
  kind: z.enum(['PAPER', 'DOCUMENT', 'TASK']),
  title: z.string(),
  metadata: z.unknown().nullable(),
  number: z.number().int().nullable(),
});
/**
 * Mention/citation picker: active, readable artifacts of one project only.
 * Titles of other projects' artifacts can never appear.
 */
export async function artifactOptions(
  actor: VerifiedActor,
  projectId: string,
  raw: unknown,
) {
  z.uuid().parse(projectId);
  const input = z
    .object({
      q: z.string().trim().max(120).default(''),
      kind: z.enum(['PAPER', 'DOCUMENT', 'TASK', 'PERSON']).optional(),
      exclude: z.uuid().optional(),
    })
    .strict()
    .parse(raw);
  return withActor(actor, async (tx) => {
    await requireProject(tx, projectId, 'project.read');
    const like = `%${input.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const per = input.kind ? 20 : 6;
    const want = (kind: ArtifactKind) => !input.kind || input.kind === kind;
    const parts: Prisma.Sql[] = [];
    if (want('PAPER'))
      parts.push(Prisma.sql`(SELECT pp.artifact_id AS "artifactId", pp.id, 'PAPER' AS kind, coalesce(pp.private_title,pp.metadata->>'title') AS title,
        pp.metadata, NULL::int AS number FROM project_papers pp WHERE pp.project_id=${projectId}::uuid AND pp.archived_at IS NULL
        AND coalesce(pp.private_title,pp.metadata->>'title') ILIKE ${like} ORDER BY pp.created_at DESC, pp.id LIMIT ${per})`);
    if (want('DOCUMENT'))
      parts.push(Prisma.sql`(SELECT d.artifact_id AS "artifactId", d.id, 'DOCUMENT' AS kind, d.title, NULL::jsonb AS metadata, NULL::int AS number FROM documents d
        WHERE d.project_id=${projectId}::uuid AND d.archived_at IS NULL AND d.title ILIKE ${like}
        AND d.id IS DISTINCT FROM ${input.exclude ?? null}::uuid ORDER BY d.updated_at DESC, d.id LIMIT ${per})`);
    if (want('TASK'))
      parts.push(Prisma.sql`(SELECT t.artifact_id AS "artifactId", t.id, 'TASK' AS kind, t.title, NULL::jsonb AS metadata, t.task_number AS number FROM tasks t
        WHERE t.project_id=${projectId}::uuid AND t.archived_at IS NULL AND (t.title ILIKE ${like} OR t.task_number::text=${input.q.replace(/^#/, '')})
        ORDER BY t.updated_at DESC, t.id LIMIT ${per})`);
    const rows = parts.length
      ? z
          .array(optionRow)
          .parse(await tx.$queryRaw(Prisma.join(parts, ' UNION ALL ')))
      : [];
    const people =
      !input.kind || input.kind === 'PERSON'
        ? (await projectParticipants(tx, projectId))
            .filter((p) => p.name.toLowerCase().includes(input.q.toLowerCase()))
            .slice(0, per)
        : [];
    return artifactOptionsDto.parse({
      items: rows.map((r) => ({
        artifactId: r.artifactId,
        id: r.id,
        kind: r.kind,
        title: r.title,
        detail:
          r.kind === 'PAPER'
            ? paperDetail(r.metadata)
            : r.kind === 'TASK'
              ? `#${r.number}`
              : null,
      })),
      people,
    });
  });
}

// ------------------------------------------------------------------- graph

export const GRAPH_NODES = 300;
/** Bounded authorized projection; no graph database or traversal engine. */
export async function projectGraph(actor: VerifiedActor, projectId: string) {
  z.uuid().parse(projectId);
  return withActor(actor, async (tx) => {
    await requireProject(tx, projectId, 'project.read');
    const nodes = z
      .array(
        z.object({
          artifactId: z.uuid(),
          id: z.uuid(),
          kind: z.enum(['PAPER', 'DOCUMENT', 'TASK']),
          title: z.string(),
        }),
      )
      .parse(
        await tx.$queryRaw`SELECT * FROM (
          SELECT pp.artifact_id AS "artifactId", pp.id, 'PAPER' AS kind, coalesce(pp.private_title,pp.metadata->>'title') AS title, pp.updated_at AS at
           FROM project_papers pp WHERE pp.project_id=${projectId}::uuid AND pp.archived_at IS NULL
          UNION ALL SELECT d.artifact_id, d.id, 'DOCUMENT', d.title, d.updated_at FROM documents d WHERE d.project_id=${projectId}::uuid AND d.archived_at IS NULL
          UNION ALL SELECT t.artifact_id, t.id, 'TASK', '#'||t.task_number||' '||t.title, t.updated_at FROM tasks t WHERE t.project_id=${projectId}::uuid AND t.archived_at IS NULL
         ) n ORDER BY at DESC, "artifactId" LIMIT ${GRAPH_NODES + 1}`,
      );
    const kept = nodes.slice(0, GRAPH_NODES);
    const ids = kept.map((n) => n.artifactId);
    const edges = z
      .array(
        z.object({
          id: z.uuid(),
          source: z.uuid(),
          target: z.uuid(),
          relationship: z.string(),
        }),
      )
      .parse(
        await tx.$queryRaw`SELECT DISTINCT ON (source_artifact_id,target_artifact_id,relationship) id, source_artifact_id AS source,
          target_artifact_id AS target, relationship FROM research_artifact_links
          WHERE project_id=${projectId}::uuid AND archived_at IS NULL AND source_artifact_id=ANY(${ids}::uuid[]) AND target_artifact_id=ANY(${ids}::uuid[])
          ORDER BY source_artifact_id,target_artifact_id,relationship,created_at LIMIT 1000`,
      );
    return graphDto.parse({
      nodes: kept.map((n) => ({
        ...n,
        href: hrefFor(projectId, n.kind, n.id),
      })),
      edges,
      truncated: nodes.length > GRAPH_NODES,
    });
  });
}
