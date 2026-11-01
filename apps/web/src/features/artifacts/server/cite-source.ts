import 'server-only';
import { z } from 'zod';
import {
  annotationAnchor,
  annotationCitable,
  appendBlocks,
  referenceNodes,
  sourceNoteBlocks,
  type ArtifactCommand,
  type DocNode,
  type SourceEvidence,
} from '@atlas/core';
import { Prisma } from '@atlas/database';
import type { VerifiedActor } from '@/features/platform/server/database';
import { PlatformError } from '@/features/platform/server/errors';
import { requireProject } from '@/features/library/server/library';
import {
  checkedContent,
  loadDocument,
} from '@/features/documents/server/documents';

type CiteSource = Extract<ArtifactCommand, { command: 'document.cite-source' }>;
const unavailable = () =>
  new PlatformError('NOT_FOUND', 'Resource unavailable.');

/**
 * Re-reads the cited evidence inside the actor's transaction. RLS hides
 * other projects, papers the actor cannot read and other people's private
 * annotations; all of them are indistinguishable from missing rows. Only
 * values read here reach the citation — never client-supplied labels,
 * quotes, pages or checksums.
 */
export async function sourceEvidence(
  tx: Prisma.TransactionClient,
  actor: VerifiedActor,
  command: Pick<
    CiteSource,
    | 'projectId'
    | 'projectPaperId'
    | 'sourceVersionId'
    | 'annotationId'
    | 'sharePrivateAnnotation'
  >,
): Promise<SourceEvidence> {
  const [paper] = z
    .array(z.object({ id: z.uuid(), archived: z.boolean() }))
    .parse(
      await tx.$queryRaw`SELECT id, archived_at IS NOT NULL AS archived FROM project_papers
        WHERE id=${command.projectPaperId}::uuid AND project_id=${command.projectId}::uuid`,
    );
  if (!paper) throw unavailable();
  if (paper.archived)
    throw new PlatformError(
      'CONFLICT',
      'This source is archived. Restore it before citing it again.',
    );
  if (command.annotationId && !command.sourceVersionId)
    throw new PlatformError(
      'VALIDATION_ERROR',
      'An annotation is cited together with its source version.',
    );
  let checksum: string | null = null;
  if (command.sourceVersionId) {
    const [version] = z.array(z.object({ sha256: z.string() })).parse(
      await tx.$queryRaw`SELECT sha256 FROM source_versions WHERE id=${command.sourceVersionId}::uuid
          AND project_paper_id=${paper.id}::uuid AND project_id=${command.projectId}::uuid AND state='READY'`,
    );
    if (!version) throw unavailable();
    checksum = version.sha256.trim();
  }
  let annotation: SourceEvidence['annotation'] = null;
  if (command.annotationId) {
    const [row] = z
      .array(
        z.object({
          id: z.uuid(),
          visibility: z.enum(['PROJECT', 'PRIVATE']),
          authorId: z.uuid(),
          anchor: z.unknown(),
        }),
      )
      .parse(
        await tx.$queryRaw`SELECT id, visibility, author_id AS "authorId", anchor FROM paper_annotations
          WHERE id=${command.annotationId}::uuid AND source_version_id=${command.sourceVersionId}::uuid
            AND project_paper_id=${paper.id}::uuid AND project_id=${command.projectId}::uuid AND deleted_at IS NULL`,
      );
    // Another person's private annotation is never visible here (RLS), and
    // the explicit check keeps that guarantee if a policy ever widens.
    if (!row || (row.visibility === 'PRIVATE' && row.authorId !== actor.id))
      throw unavailable();
    if (row.visibility === 'PRIVATE' && !command.sharePrivateAnnotation)
      throw new PlatformError(
        'CONFLICT',
        'This annotation is private. Confirm that its text may be copied into a note other project members can read.',
      );
    const anchor = annotationAnchor.parse(row.anchor);
    // Never truncate or silently downgrade: the caller chooses a version-level
    // reference explicitly instead.
    if (!annotationCitable(anchor.quote))
      throw new PlatformError(
        'VALIDATION_ERROR',
        'This highlight is too long to quote. Cite the source version instead.',
      );
    annotation = {
      id: row.id,
      page: anchor.pageNumber,
      quote: anchor.quote,
      startOffset: anchor.startOffset,
      endOffset: anchor.endOffset,
    };
  }
  return {
    projectPaperId: paper.id,
    sourceVersionId: command.sourceVersionId,
    sourceChecksum: checksum,
    annotation,
  };
}

const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : value;
const sameContent = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/**
 * A02 hardening: a version found by `clientRequestId` is acknowledged only
 * when it is provably this request — the same actor, an editor save made on
 * exactly `expectedRevision`, and content equal to that base revision plus
 * the blocks this request produces (same paper, version, annotation and
 * commentary). The location fields are taken from the stored, server-derived
 * citation, so a lost response can be retried even if the annotation was
 * deleted afterwards; consent for a still-private annotation is re-required.
 * Anything else is a different intent and must not be reported as success.
 */
async function replayMatches(
  tx: Prisma.TransactionClient,
  actor: VerifiedActor,
  command: CiteSource,
  documentId: string,
  replay: {
    revision: number;
    authorId: string;
    source: string;
    content: unknown;
  },
) {
  if (command.target.kind !== 'existing') return false;
  if (
    replay.authorId !== actor.id ||
    replay.source !== 'EDITOR' ||
    replay.revision !== command.target.expectedRevision + 1
  )
    return false;
  const [base] = z.array(z.object({ content: z.unknown() })).parse(
    await tx.$queryRaw`SELECT content FROM document_versions
        WHERE document_id=${documentId}::uuid AND revision=${command.target.expectedRevision}`,
  );
  if (!base) return false;
  const baseBlocks = (base.content as DocNode).content ?? [];
  const lone =
    baseBlocks.length === 1 &&
    baseBlocks[0]?.type === 'paragraph' &&
    !baseBlocks[0].content?.length;
  const appended = ((replay.content as DocNode).content ?? []).slice(
    lone ? 0 : baseBlocks.length,
  );
  const stored = referenceNodes({ type: 'doc', content: appended }).find(
    (n) => n.type === 'citation',
  )?.attrs;
  if (!stored) return false;
  const evidence: SourceEvidence = {
    projectPaperId: command.projectPaperId,
    sourceVersionId: command.sourceVersionId,
    sourceChecksum:
      typeof stored.sourceChecksum === 'string' ? stored.sourceChecksum : null,
    annotation: command.annotationId
      ? {
          id: command.annotationId,
          page: Number(stored.page),
          quote: typeof stored.quote === 'string' ? stored.quote : null,
          startOffset:
            typeof stored.startOffset === 'number' ? stored.startOffset : null,
          endOffset:
            typeof stored.endOffset === 'number' ? stored.endOffset : null,
        }
      : null,
  };
  if (
    !sameContent(
      appendBlocks(
        base.content as DocNode,
        sourceNoteBlocks(evidence, command.commentary),
      ),
      replay.content,
    )
  )
    return false;
  if (command.annotationId && !command.sharePrivateAnnotation) {
    const [note] = z
      .array(z.object({ visibility: z.string() }))
      .parse(
        await tx.$queryRaw`SELECT visibility FROM paper_annotations WHERE id=${command.annotationId}::uuid AND deleted_at IS NULL`,
      );
    if (note?.visibility === 'PRIVATE') return false;
  }
  return true;
}

/**
 * Builds the content for `document.cite-source`. The returned mutation is
 * an ordinary `document.save` or `document.create`, so the SQL boundary
 * re-checks write capability, revision, replay and every citation again.
 */
export async function citeSourceMutation(
  tx: Prisma.TransactionClient,
  actor: VerifiedActor,
  command: CiteSource,
  hash: string,
): Promise<
  | { kind: 'replayed'; result: Record<string, unknown> }
  | { kind: 'mutate'; name: string; input: Record<string, unknown> }
> {
  await requireProject(tx, command.projectId, 'project.write');
  if (command.target.kind === 'existing') {
    const target = command.target;
    const doc = await loadDocument(tx, target.documentId);
    if (doc.projectId !== command.projectId) throw unavailable();
    // A retried insert returns its committed revision; rebuilding it on top of
    // a newer revision would otherwise append the same evidence twice. The
    // stored revision must be proven to *be* this request (see replayMatches).
    const [replay] = z
      .array(
        z.object({
          id: z.uuid(),
          revision: z.number().int(),
          authorId: z.uuid(),
          source: z.string(),
          content: z.unknown(),
        }),
      )
      .parse(
        await tx.$queryRaw`SELECT id, revision, author_id AS "authorId", source, content FROM document_versions
          WHERE document_id=${doc.id}::uuid AND client_request_id=${command.clientRequestId}::uuid`,
      );
    if (replay) {
      if (!(await replayMatches(tx, actor, command, doc.id, replay)))
        throw new PlatformError(
          'CONFLICT',
          'This request ID was already used for a different change. Nothing was inserted.',
        );
      return {
        kind: 'replayed',
        result: {
          id: doc.id,
          revision: replay.revision,
          versionId: replay.id,
          replayed: true,
        },
      };
    }
    // Evidence first: an inaccessible source is NOT_FOUND whatever the revision.
    const evidence = await sourceEvidence(tx, actor, command);
    if (doc.revision !== target.expectedRevision)
      throw new PlatformError(
        'CONFLICT',
        'The note changed since you opened it. Review the latest revision and try again.',
      );
    const [current] = z.array(z.object({ content: z.unknown() })).parse(
      await tx.$queryRaw`SELECT v.content FROM documents d JOIN document_versions v ON v.id=d.current_version_id
          WHERE d.id=${doc.id}::uuid`,
    );
    if (!current) throw unavailable();
    const { content, searchText } = checkedContent(
      appendBlocks(
        current.content as DocNode,
        sourceNoteBlocks(evidence, command.commentary),
      ),
    );
    return {
      kind: 'mutate',
      name: 'document.save',
      input: {
        id: doc.id,
        expectedRevision: target.expectedRevision,
        clientRequestId: command.clientRequestId,
        content,
        searchText,
        changeSummary: 'Added a source reference',
      },
    };
  }
  const evidence = await sourceEvidence(tx, actor, command);
  const { content, searchText } = checkedContent({
    type: 'doc',
    content: sourceNoteBlocks(evidence, command.commentary),
  });
  return {
    kind: 'mutate',
    name: 'document.create',
    input: {
      projectId: command.projectId,
      title: command.target.title,
      kind: command.target.documentKind,
      content,
      searchText,
      // The new note and its citation commit together; a retry replays.
      idempotencyKey: command.clientRequestId,
      requestHash: hash,
    },
  };
}
