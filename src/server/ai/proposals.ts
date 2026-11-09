import { getEnv } from "../env";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "../db/client";
import type { Identity } from "../auth/identity";
import { inProject, requireRole, audit, type Tx } from "../domain/access";
import { AppError } from "../errors";
import { cleanDocument, type DocNode } from "../../lib/document-model";
import { citationViews } from "../collaboration/service";
import {
  contextData,
  validateEvidence,
  evidenceViews,
  unavailable,
  json,
} from "./service";
import type { GroundedAnswer } from "./provider";
export const proposalInput = z
  .object({
    requestId: z.uuid(),
    runId: z.uuid(),
    documentId: z.uuid(),
    revision: z.number().int().min(1),
  })
  .strict();
type Plan = { citationId: string; evidenceId: string }[];
async function editing(tx: Tx, w: string, p: string, id: string) {
  const d = await tx.document.findFirst({
    where: { id, workspaceId: w, projectId: p },
  });
  if (!d) unavailable();
  if (d.archivedAt) throw new AppError("ARCHIVED", 409);
  return d;
}
async function snapshot(
  tx: Tx,
  a: Identity,
  d: Awaited<ReturnType<typeof editing>>,
) {
  await tx.documentVersion.createMany({
    data: [
      {
        id: randomUUID(),
        workspaceId: d.workspaceId,
        projectId: d.projectId,
        documentId: d.id,
        revision: d.revision,
        title: d.title,
        body: json(d.body),
        createdBy: a.id,
      },
    ],
    skipDuplicates: true,
  });
  return tx.documentVersion.findUniqueOrThrow({
    where: { documentId_revision: { documentId: d.id, revision: d.revision } },
  });
}
export function createProposal(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  input: z.infer<typeof proposalInput>,
) {
  return inProject(db, a, w, p, false, async (tx, s) => {
    requireRole(s.projectRole, ["owner", "admin", "editor"]);
    if (s.project.archivedAt || s.workspace.archivedAt || s.project.deletedAt)
      throw new AppError("ARCHIVED", 409);
    const old = await tx.aiProposal.findFirst({
      where: {
        id: input.requestId,
        workspaceId: w,
        projectId: p,
        userId: a.id,
      },
    });
    if (old) {
      if (
        old.runId !== input.runId ||
        old.documentId !== input.documentId ||
        old.revision !== input.revision
      )
        throw new AppError("CONFLICT", 409);
      return { id: old.id };
    }
    const run = await tx.aiRun.findFirst({
      where: {
        id: input.runId,
        workspaceId: w,
        projectId: p,
        userId: a.id,
        state: "complete",
      },
    });
    if (!run) unavailable();
    const d = await editing(tx, w, p, input.documentId);
    if (d.revision !== input.revision)
      throw new AppError("REVISION_CONFLICT", 409);
    const data = await contextData(tx, a, w, p, run.contextId);
    await validateEvidence(tx, w, p, data);
    const answer = run.result as unknown as GroundedAnswer;
    const plan: Plan = [];
    const content: DocNode[] = [
      ...((d.body as unknown as DocNode).content ?? []),
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Research synthesis" }],
      },
    ];
    for (const seg of answer.segments) {
      const inline: DocNode[] = [{ type: "text", text: seg.text + " " }];
      for (const ref of seg.citations) {
        if (!data.evidence.some((e) => e.id === ref.evidenceId)) {
          const snapshot = (
            data.context.artifacts as unknown as {
              id: string;
              title: string;
              revision?: number;
              text: string;
              href: string;
            }[]
          ).find((a) => a.id === ref.evidenceId);
          if (!snapshot || !snapshot.text.includes(ref.quote))
            throw new AppError("AI_INVALID_EVIDENCE", 409);
          inline.push(
            {
              type: "text",
              text: `[${snapshot.title}${snapshot.revision ? ` · revision ${snapshot.revision}` : ""}: “${ref.quote}”]`,
              marks: [
                {
                  type: "link",
                  attrs: {
                    href: new URL(snapshot.href, getEnv().APP_ORIGIN).href,
                  },
                },
              ],
            },
            { type: "text", text: " " },
          );
          continue;
        }
        let cite = plan.find((c) => c.evidenceId === ref.evidenceId);
        if (!cite) {
          cite = { citationId: randomUUID(), evidenceId: ref.evidenceId };
          plan.push(cite);
        }
        inline.push(
          { type: "citation", attrs: { id: cite.citationId } },
          { type: "text", text: " " },
        );
      }
      content.push({ type: "paragraph", content: inline });
    }
    const after = cleanDocument({ type: "doc", content });
    await tx.aiProposal.create({
      data: {
        id: input.requestId,
        workspaceId: w,
        projectId: p,
        userId: a.id,
        runId: run.id,
        documentId: d.id,
        revision: d.revision,
        before: json(d.body),
        after: json(after),
        citationPlan: json(plan),
      },
    });
    return { id: input.requestId };
  });
}
export function getProposal(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  id: string,
) {
  return inProject(db, a, w, p, false, async (tx, s) => {
    const proposal = await tx.aiProposal.findFirst({
      where: { id, workspaceId: w, projectId: p, userId: a.id },
    });
    if (!proposal) unavailable();
    const run = await tx.aiRun.findFirst({
      where: {
        id: proposal.runId,
        workspaceId: w,
        projectId: p,
        userId: a.id,
        state: "complete",
      },
    });
    if (!run) unavailable();
    const data = await contextData(tx, a, w, p, run.contextId);
    await validateEvidence(tx, w, p, data);
    const d = await editing(tx, w, p, proposal.documentId);
    return {
      proposal,
      document: { id: d.id, title: d.title, revision: d.revision },
      evidence: await evidenceViews(tx, w, p, data.evidence),
      citations: await citationViews(tx, w, p, d.id),
      canEdit:
        ["owner", "admin", "editor"].includes(s.projectRole) &&
        !s.project.archivedAt &&
        !s.workspace.archivedAt,
    };
  });
}
export function applyProposal(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  id: string,
) {
  return inProject(db, a, w, p, true, async (tx, s) => {
    requireRole(s.projectRole, ["owner", "admin", "editor"]);
    if (s.project.archivedAt || s.workspace.archivedAt || s.project.deletedAt)
      throw new AppError("ARCHIVED", 409);
    const proposal = await tx.aiProposal.findFirst({
      where: { id, workspaceId: w, projectId: p, userId: a.id },
    });
    if (!proposal) unavailable();
    if (proposal.undoRevision) throw new AppError("CONFLICT", 409);
    if (proposal.appliedRevision)
      return {
        documentId: proposal.documentId,
        revision: proposal.appliedRevision,
      };
    const d = await editing(tx, w, p, proposal.documentId);
    if (d.revision !== proposal.revision)
      throw new AppError("REVISION_CONFLICT", 409);
    const run = await tx.aiRun.findFirst({
      where: { id: proposal.runId, userId: a.id, state: "complete" },
    });
    if (!run) unavailable();
    const data = await contextData(tx, a, w, p, run.contextId);
    await validateEvidence(tx, w, p, data);
    const plan = proposal.citationPlan as unknown as Plan;
    for (const item of plan) {
      const e = data.evidence.find((e) => e.id === item.evidenceId);
      if (!e) throw new AppError("AI_INVALID_EVIDENCE", 409);
      await tx.citation.create({
        data: {
          id: item.citationId,
          workspaceId: w,
          projectId: p,
          documentId: d.id,
          sourceId: e.sourceId,
          versionId: e.versionId,
          annotationId: null,
          pageId: e.pageId,
          page: e.page,
          start: e.start,
          end: e.end,
          quote: e.quote,
        },
      });
      await tx.artifactLink.createMany({
        data: [
          { workspaceId: w, projectId: p, fromId: d.id, toId: e.sourceId },
        ],
        skipDuplicates: true,
      });
    }
    const before = await snapshot(tx, a, d);
    const next = await tx.document.update({
      where: { id: d.id, revision: proposal.revision },
      data: { body: json(proposal.after), revision: { increment: 1 } },
    });
    await snapshot(tx, a, next);
    await tx.aiProposal.update({
      where: { id },
      data: { appliedRevision: next.revision, previousVersionId: before.id },
    });
    await audit(tx, a, w, p, "ai_proposal_applied", id);
    return { documentId: d.id, revision: next.revision };
  });
}
export function undoProposal(
  db: Database,
  a: Identity,
  w: string,
  p: string,
  id: string,
) {
  return inProject(db, a, w, p, true, async (tx, s) => {
    requireRole(s.projectRole, ["owner", "admin", "editor"]);
    if (s.project.archivedAt || s.workspace.archivedAt || s.project.deletedAt)
      throw new AppError("ARCHIVED", 409);
    const proposal = await tx.aiProposal.findFirst({
      where: { id, workspaceId: w, projectId: p, userId: a.id },
    });
    if (!proposal?.appliedRevision || !proposal.previousVersionId)
      unavailable();
    if (proposal.undoRevision)
      return {
        documentId: proposal.documentId,
        revision: proposal.undoRevision,
      };
    const d = await editing(tx, w, p, proposal.documentId);
    if (d.revision !== proposal.appliedRevision)
      throw new AppError("REVISION_CONFLICT", 409);
    const original = await tx.documentVersion.findFirst({
      where: { id: proposal.previousVersionId, documentId: d.id },
    });
    if (!original) unavailable();
    await snapshot(tx, a, d);
    const next = await tx.document.update({
      where: { id: d.id },
      data: {
        title: original.title,
        body: json(original.body),
        revision: { increment: 1 },
      },
    });
    await snapshot(tx, a, next);
    await tx.aiProposal.update({
      where: { id },
      data: { undoRevision: next.revision },
    });
    await audit(tx, a, w, p, "ai_proposal_undone", id);
    return { documentId: d.id, revision: next.revision };
  });
}
