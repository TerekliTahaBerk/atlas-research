import 'server-only';
import { z } from 'zod';
import {
  artifactCapabilities,
  documentDto,
  documentPageDto,
  documentListQuery,
  documentSummaryDto,
  plainText,
  renderDocument,
  validateDocumentContent,
  versionDto,
  versionPageDto,
  type DocNode,
  type DocumentExportFormat,
  type ReferenceDto,
} from '@atlas/core';
import { Prisma } from '@atlas/database';
import {
  withActor,
  type VerifiedActor,
} from '@/features/platform/server/database';
import { PlatformError } from '@/features/platform/server/errors';
import {
  decodeLibraryCursor,
  encodeLibraryCursor,
  requireProject,
} from '@/features/library/server/library';
import {
  participantNames,
  projectCapabilities,
  resolveArtifacts,
} from '@/features/artifacts/server/references';

export const DOCUMENT_PAGE = 50;
export const VERSION_PAGE = 30;
const unavailable = () =>
  new PlatformError('NOT_FOUND', 'Resource unavailable.');

const summaryRow = z.object({
  id: z.uuid(),
  artifactId: z.uuid(),
  projectId: z.uuid(),
  title: z.string(),
  kind: z.string(),
  revision: z.number().int(),
  version: z.number().int(),
  archived: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdById: z.uuid(),
  updatedById: z.uuid(),
});
const summarySelect = Prisma.sql`SELECT d.id, d.artifact_id AS "artifactId", d.project_id AS "projectId", d.title, d.kind,
 d.current_revision AS revision, d.version, d.archived_at IS NOT NULL AS archived, d.created_at::text AS "createdAt",
 d.updated_at::text AS "updatedAt", d.created_by_id AS "createdById", d.updated_by_id AS "updatedById" FROM documents d`;
async function summaries(
  tx: Prisma.TransactionClient,
  projectId: string,
  rows: z.infer<typeof summaryRow>[],
) {
  const names = await participantNames(
    tx,
    projectId,
    rows.flatMap((r) => [r.createdById, r.updatedById]),
  );
  const person = (id: string) => {
    const p = names.get(id);
    return p ? { id: p.id, name: p.name } : null;
  };
  return rows.map(({ createdById, updatedById, ...row }) =>
    documentSummaryDto.parse({
      ...row,
      createdBy: person(createdById),
      updatedBy: person(updatedById),
    }),
  );
}

export async function listDocuments(
  actor: VerifiedActor,
  projectId: string,
  raw: unknown,
) {
  z.uuid().parse(projectId);
  const query = documentListQuery.parse(raw);
  const offset = decodeLibraryCursor(actor.id, projectId, query);
  return withActor(actor, async (tx) => {
    await requireProject(tx, projectId, 'project.read');
    // RLS shows archived documents to writers only.
    const rows = z.array(summaryRow).parse(
      await tx.$queryRaw(
        Prisma.sql`${summarySelect} WHERE d.project_id=${projectId}::uuid AND (d.archived_at IS NOT NULL)=${query.archived === 'true'}
           ORDER BY d.updated_at DESC, d.id LIMIT ${DOCUMENT_PAGE + 1} OFFSET ${offset}`,
      ),
    );
    const more = rows.length > DOCUMENT_PAGE;
    return documentPageDto.parse({
      items: await summaries(tx, projectId, rows.slice(0, DOCUMENT_PAGE)),
      nextCursor: more
        ? encodeLibraryCursor(
            actor.id,
            projectId,
            query,
            offset + DOCUMENT_PAGE,
          )
        : null,
    });
  });
}

const currentRow = z.object({
  versionId: z.uuid(),
  contentHash: z.string(),
  content: z.unknown(),
  references: z.array(z.uuid()),
  people: z.array(z.uuid()),
});
/** Loads one readable document; the ID alone grants nothing. */
export async function loadDocument(
  tx: Prisma.TransactionClient,
  id: string,
  options: { archived?: boolean } = {},
) {
  const [row] = z
    .array(summaryRow)
    .parse(
      await tx.$queryRaw(Prisma.sql`${summarySelect} WHERE d.id=${id}::uuid`),
    );
  if (!row || (row.archived && !options.archived)) throw unavailable();
  await requireProject(tx, row.projectId, 'project.read');
  return row;
}

export async function getDocument(actor: VerifiedActor, id: string) {
  z.uuid().parse(id);
  return withActor(actor, async (tx) => {
    const row = await loadDocument(tx, id);
    const [current] = z.array(currentRow).parse(
      await tx.$queryRaw`SELECT v.id AS "versionId", v.content_hash AS "contentHash", v.content,
        v.reference_artifact_ids AS "references", v.mentioned_profile_ids AS people
        FROM documents d JOIN document_versions v ON v.id=d.current_version_id WHERE d.id=${id}::uuid`,
    );
    if (!current) throw unavailable();
    const [summary] = await summaries(tx, row.projectId, [row]);
    const people = await participantNames(tx, row.projectId, current.people);
    return documentDto.parse({
      ...summary,
      versionId: current.versionId,
      contentHash: current.contentHash.trim(),
      content: current.content,
      capabilities: artifactCapabilities(
        await projectCapabilities(tx, row.projectId),
      ),
      references: await resolveArtifacts(tx, row.projectId, current.references),
      people: [...people.values()].map((p) => ({ id: p.id, name: p.name })),
    });
  });
}

const versionRow = z.object({
  id: z.uuid(),
  revision: z.number().int(),
  authorId: z.uuid(),
  createdAt: z.string(),
  changeSummary: z.string().nullable(),
  source: z.string(),
  restoredFromRevision: z.number().int().nullable(),
});
const versionSelect = Prisma.sql`SELECT v.id, v.revision, v.author_id AS "authorId", v.created_at::text AS "createdAt",
 v.change_summary AS "changeSummary", v.source, v.restored_from_revision AS "restoredFromRevision" FROM document_versions v`;
/** History is re-authorized now; archived documents expose no versions. */
export async function listVersions(
  actor: VerifiedActor,
  id: string,
  cursor: string | undefined,
) {
  z.uuid().parse(id);
  const query = { cursor };
  const offset = decodeLibraryCursor(actor.id, id, query);
  return withActor(actor, async (tx) => {
    const doc = await loadDocument(tx, id);
    const rows = z
      .array(versionRow)
      .parse(
        await tx.$queryRaw(
          Prisma.sql`${versionSelect} WHERE v.document_id=${id}::uuid ORDER BY v.revision DESC LIMIT ${VERSION_PAGE + 1} OFFSET ${offset}`,
        ),
      );
    const names = await participantNames(
      tx,
      doc.projectId,
      rows.map((r) => r.authorId),
    );
    const more = rows.length > VERSION_PAGE;
    return versionPageDto.parse({
      items: rows.slice(0, VERSION_PAGE).map(({ authorId, ...r }) => ({
        ...r,
        author: names.get(authorId)
          ? { id: authorId, name: names.get(authorId)!.name }
          : null,
      })),
      nextCursor: more
        ? encodeLibraryCursor(actor.id, id, query, offset + VERSION_PAGE)
        : null,
    });
  });
}

export async function readVersion(
  tx: Prisma.TransactionClient,
  id: string,
  revision: number,
) {
  const doc = await loadDocument(tx, id);
  const [row] = z
    .array(
      versionRow.extend({
        content: z.unknown(),
        references: z.array(z.uuid()),
      }),
    )
    .parse(
      await tx.$queryRaw(
        Prisma.sql`SELECT v.id, v.revision, v.author_id AS "authorId", v.created_at::text AS "createdAt",
          v.change_summary AS "changeSummary", v.source, v.restored_from_revision AS "restoredFromRevision",
          v.content, v.reference_artifact_ids AS references
          FROM document_versions v WHERE v.document_id=${id}::uuid AND v.revision=${revision}`,
      ),
    );
  if (!row) throw unavailable();
  return { doc, row };
}
export async function getVersion(
  actor: VerifiedActor,
  id: string,
  revision: number,
) {
  z.uuid().parse(id);
  z.number().int().min(1).parse(revision);
  return withActor(actor, async (tx) => {
    const { doc, row } = await readVersion(tx, id, revision);
    const names = await participantNames(tx, doc.projectId, [row.authorId]);
    const { authorId, references, ...rest } = row;
    return versionDto.parse({
      ...rest,
      author: names.get(authorId)
        ? { id: authorId, name: names.get(authorId)!.name }
        : null,
      references: await resolveArtifacts(tx, doc.projectId, references),
    });
  });
}

// ------------------------------------------------------------------- export

/** Display text for a reference atom, re-authorized at export time. */
export function referenceLabel(
  references: ReferenceDto[],
  people: Map<string, { name: string }>,
) {
  const byEntity = new Map(
    references.filter((r) => r.id).map((r) => [r.id!, r]),
  );
  return (node: DocNode) => {
    const attrs = node.attrs ?? {};
    if (node.type === 'personMention') {
      const person = people.get(String(attrs.profileId));
      return person ? `@${person.name}` : '@[unavailable person]';
    }
    const key = String(
      attrs.projectPaperId ?? attrs.documentId ?? attrs.taskId ?? '',
    );
    const ref = byEntity.get(key);
    if (!ref || ref.state === 'UNAVAILABLE' || !ref.title)
      return '[unavailable reference]';
    if (node.type === 'citation') {
      const page = typeof attrs.page === 'number' ? `, p. ${attrs.page}` : '';
      return `[${ref.detail ?? ref.title}${page}]`;
    }
    return node.type === 'taskRef'
      ? `[${ref.detail} ${ref.title}]`
      : `[${ref.title}]`;
  };
}
export async function exportDocument(
  actor: VerifiedActor,
  id: string,
  format: DocumentExportFormat,
) {
  z.uuid().parse(id);
  return withActor(actor, async (tx) => {
    // Archived documents never export (loadDocument rejects them).
    const doc = await loadDocument(tx, id);
    const [current] = z.array(currentRow).parse(
      await tx.$queryRaw`SELECT v.id AS "versionId", v.content_hash AS "contentHash", v.content,
        v.reference_artifact_ids AS "references", v.mentioned_profile_ids AS people
        FROM documents d JOIN document_versions v ON v.id=d.current_version_id WHERE d.id=${id}::uuid`,
    );
    if (!current) throw unavailable();
    const valid = validateDocumentContent(current.content);
    if (!valid.ok)
      throw new PlatformError('CONFLICT', 'This revision cannot be exported.');
    const refs = await resolveArtifacts(tx, doc.projectId, current.references);
    const people = await participantNames(tx, doc.projectId, current.people);
    return {
      title: doc.title,
      body: renderDocument(
        doc.title,
        valid.content,
        format,
        referenceLabel(refs, people),
      ),
    };
  });
}

/** Validates editor JSON and derives the stored plain-text projection. */
export function checkedContent(content: unknown) {
  const result = validateDocumentContent(content);
  if (!result.ok) throw new PlatformError('VALIDATION_ERROR', result.reason);
  return { content: result.content, searchText: result.text };
}
export const searchTextOf = (content: unknown) => {
  const result = validateDocumentContent(content);
  return result.ok ? plainText(result.content) : '';
};
