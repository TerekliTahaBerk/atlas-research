import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { runInput, verifiedCitation } from '@atlas/ai';
import {
  withActor,
  type VerifiedActor,
} from '@/features/platform/server/database';
import { PlatformError } from '@/features/platform/server/errors';
import { requireProject } from '@/features/library/server/library';
import { readJson } from '@/features/platform/server/http';
import {
  aiConfig,
  requireAIActivation,
  embeddingConfig,
  fixtureTransport,
} from './config';
import { resolveReferences } from './retrieval';
import { conversations, history, snapshot, updateRun } from './repository';
import { authorizeCitation } from './retrieval';

export async function aiGet(actor: VerifiedActor, path: string[], url: URL) {
  if (path[0] !== 'ai') return undefined;
  requireAIActivation();
  const projectId = z.uuid().parse(url.searchParams.get('projectId'));
  if (path[1] === 'conversations' && path.length === 2)
    return conversations(actor, projectId);
  if (path[1] === 'conversations' && path.length === 3)
    return history(actor, projectId, z.uuid().parse(path[2]));
  if (path[1] === 'runs' && path.length === 3) {
    const result = await snapshot(actor, z.uuid().parse(path[2]), projectId);
    await withActor(actor, (tx) =>
      requireProject(tx, projectId, 'project.read'),
    );
    return result;
  }
  if (path[1] === 'configuration' && path.length === 2) {
    await withActor(actor, (tx) =>
      requireProject(tx, projectId, 'project.read'),
    );
    try {
      const config = aiConfig();
      return {
        enabled: true,
        provider: config.policy.provider,
        model: config.policy.model,
        fixture: Boolean(config.transport),
        message: 'AI usage available.',
      };
    } catch (error) {
      return {
        enabled: false,
        provider: '',
        model: '',
        fixture: Boolean(fixtureTransport()),
        message:
          error instanceof PlatformError
            ? error.message
            : 'The model is unavailable.',
      };
    }
  }
  if (path[1] === 'usage' && path.length === 2)
    return withActor(actor, async (tx) => {
      await requireProject(tx, projectId, 'project.read');
      return z
        .array(
          z.object({
            kind: z.string(),
            costMicros: z.number(),
            operations: z.number(),
          }),
        )
        .parse(
          await tx.$queryRaw`SELECT kind,sum(charged_micros)::integer AS "costMicros",count(*)::integer AS operations FROM ai_usage WHERE project_id=${projectId}::uuid AND created_at>=date_trunc('month',now()) GROUP BY kind`,
        );
    });
  if (path[1] === 'status' && path.length === 2)
    return withActor(actor, async (tx) => {
      await requireProject(tx, projectId, 'project.read');
      return tx.$queryRaw`SELECT id,source_version_id AS "sourceVersionId",state,attempts,error FROM ai_processing_jobs WHERE project_id=${projectId}::uuid ORDER BY created_at DESC LIMIT 50`;
    });
  if (path[1] === 'mentions' && path.length === 2)
    return withActor(actor, async (tx) => {
      await requireProject(tx, projectId, 'project.read');
      const query = z
        .string()
        .max(120)
        .parse(url.searchParams.get('q') ?? '');
      const papers = z
        .array(z.object({ id: z.uuid(), title: z.string() }))
        .parse(
          await tx.$queryRaw`SELECT id,coalesce(private_title,metadata->>'title','Untitled') AS title FROM project_papers WHERE project_id=${projectId}::uuid AND archived_at IS NULL AND strpos(lower(coalesce(private_title,metadata->>'title','')),lower(${query}))>0 ORDER BY created_at DESC,id LIMIT 12`,
        );
      const sources = z
        .array(z.object({ id: z.uuid(), paperId: z.uuid(), title: z.string() }))
        .parse(
          await tx.$queryRaw`SELECT s.id,s.project_paper_id AS "paperId",s.file_name AS title FROM source_versions s JOIN project_papers p ON p.id=s.project_paper_id AND p.archived_at IS NULL WHERE s.project_id=${projectId}::uuid AND s.state='READY' AND strpos(lower(s.file_name),lower(${query}))>0 ORDER BY s.created_at DESC,s.id LIMIT 8`,
        );
      const notes = z
        .array(
          z.object({
            id: z.uuid(),
            paperId: z.uuid(),
            sourceId: z.uuid(),
            title: z.string(),
          }),
        )
        .parse(
          await tx.$queryRaw`SELECT id,project_paper_id AS "paperId",source_version_id AS "sourceId",left(coalesce(body,'Annotation'),100) AS title FROM paper_annotations WHERE project_id=${projectId}::uuid AND deleted_at IS NULL AND strpos(lower(coalesce(body,'')),lower(${query}))>0 ORDER BY created_at DESC,id LIMIT 8`,
        );
      return [
        {
          id: projectId,
          kind: 'project',
          title: 'Current project',
          sub: 'Project library',
          research: { kind: 'project', projectId },
        },
        ...papers.map((p) => ({
          id: p.id,
          kind: 'paper',
          title: p.title,
          sub: 'Saved paper',
          research: { kind: 'paper', projectId, projectPaperId: p.id },
        })),
        ...sources.map((s) => ({
          id: s.id,
          kind: 'paper',
          title: s.title,
          sub: 'Accepted source version',
          research: {
            kind: 'source-version',
            projectId,
            projectPaperId: s.paperId,
            sourceVersionId: s.id,
          },
        })),
        ...notes.map((n) => ({
          id: n.id,
          kind: 'selection',
          title: n.title,
          sub: 'Authorized annotation',
          research: {
            kind: 'annotation',
            projectId,
            projectPaperId: n.paperId,
            sourceVersionId: n.sourceId,
            annotationId: n.id,
          },
        })),
      ];
    });
  throw new PlatformError('NOT_FOUND', 'Endpoint unavailable.');
}
export async function aiPost(
  actor: VerifiedActor,
  path: string[],
  request: Request,
) {
  if (path[0] !== 'ai') return undefined;
  requireAIActivation();
  if (path[1] === 'runs' && path[3] === 'cancel' && path.length === 4) {
    await updateRun(actor, z.uuid().parse(path[2]), 'cancel');
    return { cancelled: true };
  }
  if (path[1] === 'conversations' && path.length === 2) {
    const input = z
      .object({
        projectId: z.uuid(),
        id: z.uuid().optional(),
        operation: z.enum(['create', 'rename', 'archive', 'delete']),
        title: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .default('Research conversation'),
        version: z.number().int().positive().default(1),
      })
      .strict()
      .parse(await readJson(request));
    const id = input.id ?? randomUUID();
    await withActor(
      actor,
      (tx) =>
        tx.$queryRaw`SELECT atlas_private.ai_conversation(${input.operation},${input.projectId}::uuid,${id}::uuid,${input.title},${input.version})`,
    );
    return { id };
  }
  if (path[1] === 'references' && path[2] === 'resolve' && path.length === 3) {
    const input = z
      .object({ projectId: z.uuid(), references: runInput.shape.references })
      .strict()
      .parse(await readJson(request));
    await resolveReferences(actor, input.projectId, input.references);
    return { resolved: true };
  }
  if (path[1] === 'index' && path.length === 2) {
    const input = z
      .object({ sourceVersionId: z.uuid(), consent: z.literal(true) })
      .strict()
      .parse(await readJson(request));
    const model = embeddingConfig().indexKey;
    return withActor(actor, async (tx) => {
      const [row] = z
        .array(z.object({ id: z.uuid() }))
        .parse(
          await tx.$queryRaw`SELECT atlas_private.ai_enqueue(${input.sourceVersionId}::uuid,'poppler-v1:1600:200',${model}) AS id`,
        );
      return row;
    });
  }
  if (path[1] === 'citation' && path.length === 2) {
    const input = z
      .object({ runId: z.uuid(), index: z.number().int().min(0).max(23) })
      .strict()
      .parse(await readJson(request));
    const state = await snapshot(actor, input.runId);
    const cite = verifiedCitation.parse(state.citations[input.index]);
    await authorizeCitation(actor, cite);
    return cite;
  }
  throw new PlatformError('NOT_FOUND', 'Endpoint unavailable.');
}
export { runInput };
