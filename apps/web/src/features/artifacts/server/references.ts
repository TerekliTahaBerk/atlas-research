import 'server-only';
import { z } from 'zod';
import { Prisma } from '@atlas/database';
import {
  normalizedPaper,
  type ArtifactKind,
  type ParticipantDto,
  type ReferenceDto,
} from '@atlas/core';

/*
 * Shared, RLS-protected projections for typed references. Every lookup runs
 * inside the caller's actor transaction and is bound to one project, so an
 * artifact ID from another project resolves to UNAVAILABLE with no title.
 */
const artifactRow = z.object({
  artifactId: z.uuid(),
  kind: z.enum(['PAPER', 'DOCUMENT', 'TASK']),
  id: z.uuid().nullable(),
  title: z.string().nullable(),
  archived: z.boolean(),
  metadata: z.unknown().nullable(),
  taskNumber: z.number().int().nullable(),
  documentKind: z.string().nullable(),
});
export const hrefFor = (projectId: string, kind: ArtifactKind, id: string) =>
  kind === 'PAPER'
    ? `/app/projects/${projectId}/library?paper=${id}`
    : kind === 'DOCUMENT'
      ? `/app/projects/${projectId}/documents?doc=${id}`
      : `/app/projects/${projectId}/tasks?task=${id}`;

/** Short bibliographic label: “Okafor et al., 2024”. */
export function paperDetail(metadata: unknown) {
  const paper = normalizedPaper.safeParse(metadata);
  if (!paper.success) return 'Private source';
  const authors = paper.data.authors;
  const first = authors[0]?.name.split(/\s+/).at(-1) ?? 'Unknown';
  const who =
    authors.length > 2
      ? `${first} et al.`
      : authors.length === 2
        ? `${first} & ${authors[1]!.name.split(/\s+/).at(-1)}`
        : first;
  return paper.data.year ? `${who}, ${paper.data.year}` : who;
}

export async function resolveArtifacts(
  tx: Prisma.TransactionClient,
  projectId: string,
  artifactIds: readonly string[],
): Promise<ReferenceDto[]> {
  const ids = [...new Set(artifactIds)].slice(0, 500);
  if (!ids.length) return [];
  const rows = z.array(artifactRow).parse(
    await tx.$queryRaw`SELECT a.id AS "artifactId", a.kind,
       coalesce(pp.id,d.id,t.id) AS id,
       coalesce(pp.private_title,pp.metadata->>'title',d.title,t.title) AS title,
       coalesce(pp.archived_at,d.archived_at,t.archived_at) IS NOT NULL AS archived,
       pp.metadata, t.task_number AS "taskNumber", d.kind AS "documentKind"
     FROM artifacts a
     LEFT JOIN project_papers pp ON pp.artifact_id=a.id AND pp.project_id=a.project_id
     LEFT JOIN documents d ON d.artifact_id=a.id AND d.project_id=a.project_id
     LEFT JOIN tasks t ON t.artifact_id=a.id AND t.project_id=a.project_id
     WHERE a.project_id=${projectId}::uuid AND a.id = ANY(${ids}::uuid[])`,
  );
  const found = new Map(rows.map((r) => [r.artifactId, r]));
  return ids.map((artifactId) => {
    const row = found.get(artifactId);
    // Missing, foreign or RLS-hidden rows are indistinguishable.
    if (!row || !row.id || row.title === null)
      return {
        artifactId,
        kind: row?.kind ?? 'PAPER',
        id: null,
        state: 'UNAVAILABLE',
        title: null,
        detail: null,
        href: null,
      };
    return {
      artifactId,
      kind: row.kind,
      id: row.id,
      state: row.archived ? 'ARCHIVED' : 'AVAILABLE',
      title: row.title,
      detail:
        row.kind === 'PAPER'
          ? paperDetail(row.metadata)
          : row.kind === 'TASK'
            ? `#${row.taskNumber}`
            : (row.documentKind ?? null),
      href: hrefFor(projectId, row.kind, row.id),
    };
  });
}

/** Display names for current participants only; others are omitted. */
export async function participantNames(
  tx: Prisma.TransactionClient,
  projectId: string,
  ids: readonly (string | null)[],
): Promise<Map<string, ParticipantDto>> {
  const wanted = [...new Set(ids.filter((v): v is string => !!v))];
  if (!wanted.length) return new Map();
  const rows = z
    .array(
      z.object({ id: z.uuid(), name: z.string(), assignable: z.boolean() }),
    )
    .parse(
      await tx.$queryRaw`SELECT id, display_name AS name, assignable FROM atlas_private.participant_names(${projectId}::uuid,${wanted}::uuid[])`,
    );
  return new Map(rows.map((r) => [r.id, r]));
}
export async function projectParticipants(
  tx: Prisma.TransactionClient,
  projectId: string,
): Promise<ParticipantDto[]> {
  return z
    .array(
      z.object({ id: z.uuid(), name: z.string(), assignable: z.boolean() }),
    )
    .parse(
      await tx.$queryRaw`SELECT id, display_name AS name, assignable FROM atlas_private.project_participants(${projectId}::uuid)`,
    );
}
export async function projectCapabilities(
  tx: Prisma.TransactionClient,
  projectId: string,
) {
  const [row] = z
    .array(z.object({ caps: z.array(z.string()) }))
    .parse(
      await tx.$queryRaw`SELECT atlas_private.capabilities('project',${projectId}::uuid) AS caps`,
    );
  return row?.caps ?? [];
}
