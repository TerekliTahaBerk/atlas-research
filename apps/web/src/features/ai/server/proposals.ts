import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { verifiedCitation, type VerifiedCitation } from '@atlas/ai';
import {
  documentEditProposal,
  proposalRequest,
  taskProposal,
  type DocNode,
  type DocumentEditProposal,
  type ReferenceDto,
  type TaskProposal,
} from '@atlas/core';
import { Prisma } from '@atlas/database';
import {
  withActor,
  type VerifiedActor,
} from '@/features/platform/server/database';
import { PlatformError } from '@/features/platform/server/errors';
import { requireProject } from '@/features/library/server/library';
import { loadDocument } from '@/features/documents/server/documents';
import { resolveArtifacts } from '@/features/artifacts/server/references';

/*
 * AI action proposals. A proposal is derived deterministically on the server
 * from the actor's own completed, still-authorized run (RLS rechecks its
 * evidence). Nothing is written here: applying requires an explicit approval
 * command that re-derives the proposal, compares its hash and then passes the
 * ordinary capability, schema, reference and revision checks.
 */
const runRow = z.object({
  projectId: z.uuid(),
  state: z.string(),
  text: z.string(),
  citations: z.array(verifiedCitation),
});
async function completedRun(
  tx: Prisma.TransactionClient,
  runId: string,
  projectId: string,
) {
  const [run] = z
    .array(runRow)
    .parse(
      await tx.$queryRaw`SELECT project_id AS "projectId", state, answer AS text, citations FROM ai_runs WHERE id=${runId}::uuid AND project_id=${projectId}::uuid`,
    );
  if (!run || run.state !== 'COMPLETED')
    throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
  return run;
}
const clean = (text: string) =>
  text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
const stripMarkdown = (text: string) =>
  clean(text)
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Converts a verified citation into a schema-valid citation node. */
export function citationNode(c: VerifiedCitation): DocNode {
  const located =
    c.kind === 'full-text' &&
    c.sourceVersionId &&
    c.page &&
    c.quote.length >= 8;
  return {
    type: 'citation',
    attrs: located
      ? {
          projectPaperId: c.projectPaperId,
          sourceVersionId: c.sourceVersionId,
          annotationId: null,
          chunkId: c.evidenceId,
          page: c.page,
          quote: c.quote.slice(0, 2000),
          startOffset: null,
          endOffset: null,
          sourceChecksum: /^[a-f0-9]{64}$/.test(c.checksum) ? c.checksum : null,
          label: null,
        }
      : {
          projectPaperId: c.projectPaperId,
          sourceVersionId: null,
          annotationId: null,
          chunkId: null,
          page: null,
          quote: null,
          startOffset: null,
          endOffset: null,
          sourceChecksum: null,
          label: null,
        },
  };
}
function inlineContent(text: string, citations: VerifiedCitation[]): DocNode[] {
  const out: DocNode[] = [];
  for (const part of clean(text).split(/(\[\d+\])/)) {
    const marker = part.match(/^\[(\d+)\]$/);
    const citation = marker ? citations[Number(marker[1]) - 1] : undefined;
    if (citation) out.push(citationNode(citation));
    else if (part)
      out.push({
        type: 'text',
        text: part.replace(/\*\*/g, '').slice(0, 4000),
      });
  }
  return out;
}
/** Paragraphs, headings and bullet lists from the stored answer text. */
export function answerBlocks(
  text: string,
  citations: VerifiedCitation[],
): DocNode[] {
  const blocks: DocNode[] = [];
  for (const chunk of text.split(/\n{2,}/).slice(0, 120)) {
    const lines = chunk.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    if (lines.every((l) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(l))) {
      blocks.push({
        type: 'bulletList',
        content: lines.slice(0, 50).map((l) => ({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: inlineContent(
                l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ''),
                citations,
              ),
            },
          ],
        })),
      });
      continue;
    }
    const heading =
      lines.length === 1 ? lines[0]!.match(/^(#{1,3})\s+(.+)$/) : null;
    if (heading)
      blocks.push({
        type: 'heading',
        attrs: { level: Math.max(2, heading[1]!.length) },
        content: inlineContent(heading[2]!, citations),
      });
    else
      blocks.push({
        type: 'paragraph',
        content: inlineContent(lines.join(' '), citations),
      });
  }
  return blocks.filter((b) => b.type !== 'paragraph' || b.content?.length);
}
/** One proposed task per list item in the answer. */
export function answerTasks(text: string, citations: VerifiedCitation[]) {
  return text
    .split('\n')
    .map((line) => line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/)?.[1])
    .filter((item): item is string => !!item)
    .slice(0, 20)
    .map((item) => {
      const papers = [...item.matchAll(/\[(\d+)\]/g)]
        .map((m) => citations[Number(m[1]) - 1]?.projectPaperId)
        .filter((p): p is string => !!p);
      const plain = stripMarkdown(
        item.replace(/\[(\d+)\]|\[unverified source\]/g, ''),
      );
      const split = plain.match(/^(.{3,200}?)(?:\s+[—–-]\s+|:\s+)(.+)$/);
      return {
        title: (split?.[1] ?? plain).slice(0, 200),
        description: (split?.[2] ?? '').slice(0, 2000),
        papers: [...new Set(papers)],
      };
    })
    .filter((t) => t.title.length > 0);
}
export const proposalHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function paperReferences(
  tx: Prisma.TransactionClient,
  projectId: string,
  projectPaperIds: string[],
) {
  if (!projectPaperIds.length) return new Map<string, ReferenceDto>();
  const rows = z
    .array(z.object({ id: z.uuid(), artifactId: z.uuid() }))
    .parse(
      await tx.$queryRaw`SELECT id, artifact_id AS "artifactId" FROM project_papers WHERE project_id=${projectId}::uuid AND id=ANY(${projectPaperIds}::uuid[])`,
    );
  const refs = await resolveArtifacts(
    tx,
    projectId,
    rows.map((r) => r.artifactId),
  );
  return new Map(refs.filter((r) => r.id).map((r) => [r.id!, r]));
}

export async function documentProposal(
  tx: Prisma.TransactionClient,
  runId: string,
  documentId: string,
) {
  const doc = await loadDocument(tx, documentId);
  const run = await completedRun(tx, runId, doc.projectId);
  const blocks = answerBlocks(run.text, run.citations);
  if (!blocks.length)
    throw new PlatformError(
      'CONFLICT',
      'This answer has no content to insert.',
    );
  const refs = await paperReferences(
    tx,
    doc.projectId,
    run.citations.map((c) => c.projectPaperId),
  );
  return documentEditProposal.parse({
    type: 'document.insert',
    runId,
    documentId,
    expectedRevision: doc.revision,
    proposedContent: blocks,
    sourceReferences: [...refs.values()],
    proposalHash: proposalHash({
      type: 'document.insert',
      runId,
      documentId,
      blocks,
    }),
  });
}
export async function tasksProposal(
  tx: Prisma.TransactionClient,
  runId: string,
  projectId: string,
) {
  await requireProject(tx, projectId, 'project.read');
  const run = await completedRun(tx, runId, projectId);
  const items = answerTasks(run.text, run.citations);
  const refs = await paperReferences(
    tx,
    projectId,
    items.flatMap((t) => t.papers),
  );
  const tasks = items.map((t) => ({
    title: t.title,
    description: t.description,
    status: 'TODO' as const,
    priority: 'NONE' as const,
    references: t.papers
      .map((p) => refs.get(p))
      .filter((r): r is ReferenceDto => !!r),
  }));
  return taskProposal.parse({
    type: 'task.create',
    runId,
    projectId,
    tasks,
    proposalHash: proposalHash({
      type: 'task.create',
      runId,
      projectId,
      tasks: tasks.map((t) => ({
        title: t.title,
        description: t.description,
        refs: t.references.map((r) => r.artifactId),
      })),
    }),
  });
}

/** POST ai/proposals: read-only preview of exactly what approval would apply. */
export async function buildProposal(actor: VerifiedActor, raw: unknown) {
  const input = proposalRequest.parse(raw);
  return withActor<DocumentEditProposal | TaskProposal>(actor, (tx) =>
    input.type === 'document.insert'
      ? documentProposal(tx, input.runId, input.documentId)
      : tasksProposal(tx, input.runId, input.projectId),
  );
}
