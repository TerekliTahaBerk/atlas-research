import 'server-only';
import { z } from 'zod';
import {
  artifactCapabilities,
  milestoneDto,
  taskDetailDto,
  taskDto,
  taskListQuery,
  taskPageDto,
  type ParticipantDto,
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
  projectParticipants,
} from '@/features/artifacts/server/references';
import { linksFor } from '@/features/artifacts/server/links';

/** Bounded board load: one page holds every column for typical projects. */
export const TASK_PAGE = 300;

const taskRow = z.object({
  id: z.uuid(),
  artifactId: z.uuid(),
  projectId: z.uuid(),
  number: z.number().int(),
  title: z.string(),
  description: z.string(),
  status: z.string(),
  priority: z.string(),
  assigneeId: z.uuid().nullable(),
  milestoneId: z.uuid().nullable(),
  dueDate: z.string().nullable(),
  version: z.number().int(),
  archived: z.boolean(),
  createdById: z.uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
  linkedPapers: z.number().int(),
  linkedDocuments: z.number().int(),
});
// Link counts come from the indexed source/target columns in one pass (no N+1).
const taskSelect = Prisma.sql`SELECT t.id, t.artifact_id AS "artifactId", t.project_id AS "projectId", t.task_number AS number,
 t.title, t.description, t.status, t.priority, t.assignee_id AS "assigneeId", t.milestone_id AS "milestoneId",
 t.due_date::text AS "dueDate", t.version, t.archived_at IS NOT NULL AS archived, t.created_by_id AS "createdById",
 t.created_at::text AS "createdAt", t.updated_at::text AS "updatedAt", t.completed_at::text AS "completedAt",
 (SELECT count(*)::int FROM research_artifact_links l WHERE l.archived_at IS NULL AND l.project_id=t.project_id AND
   ((l.source_artifact_id=t.artifact_id AND l.target_kind='PAPER') OR (l.target_artifact_id=t.artifact_id AND l.source_kind='PAPER'))) AS "linkedPapers",
 (SELECT count(*)::int FROM research_artifact_links l WHERE l.archived_at IS NULL AND l.project_id=t.project_id AND
   ((l.source_artifact_id=t.artifact_id AND l.target_kind='DOCUMENT') OR (l.target_artifact_id=t.artifact_id AND l.source_kind='DOCUMENT'))) AS "linkedDocuments"
 FROM tasks t`;

function toTasks(
  rows: z.infer<typeof taskRow>[],
  names: Map<string, ParticipantDto>,
) {
  return rows.map(({ assigneeId, createdById, ...row }) => {
    const assignee = assigneeId ? names.get(assigneeId) : undefined;
    const creator = names.get(createdById);
    return taskDto.parse({
      ...row,
      // Revocation policy: a stored assignee who lost access stays recorded
      // but is shown without identity and cannot be newly assigned.
      assignee: assigneeId
        ? assignee
          ? { id: assigneeId, name: assignee.name, state: 'ACTIVE' }
          : { id: assigneeId, name: null, state: 'REVOKED' }
        : null,
      createdBy: creator ? { id: creator.id, name: creator.name } : null,
    });
  });
}

export async function listTasks(
  actor: VerifiedActor,
  projectId: string,
  raw: unknown,
) {
  z.uuid().parse(projectId);
  const query = taskListQuery.parse(raw);
  const offset = decodeLibraryCursor(actor.id, projectId, query);
  return withActor(actor, async (tx) => {
    await requireProject(tx, projectId, 'project.read');
    const filters: Prisma.Sql[] = [
      Prisma.sql`t.project_id=${projectId}::uuid`,
      Prisma.sql`(t.archived_at IS NOT NULL)=${query.archived === 'true'}`,
    ];
    if (query.status) filters.push(Prisma.sql`t.status=${query.status}`);
    if (query.priority) filters.push(Prisma.sql`t.priority=${query.priority}`);
    if (query.milestone)
      filters.push(Prisma.sql`t.milestone_id=${query.milestone}::uuid`);
    if (query.assignee === 'none')
      filters.push(Prisma.sql`t.assignee_id IS NULL`);
    else if (query.assignee)
      filters.push(
        Prisma.sql`t.assignee_id=${query.assignee === 'me' ? actor.id : query.assignee}::uuid`,
      );
    if (query.q) {
      const like = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      filters.push(
        Prisma.sql`(t.title ILIKE ${like} OR t.task_number::text=${query.q.replace(/^#/, '')})`,
      );
    }
    const order =
      query.sort === 'priority'
        ? Prisma.sql`array_position(ARRAY['URGENT','HIGH','MEDIUM','LOW','NONE']::varchar[],t.priority), t.task_number`
        : query.sort === 'due'
          ? Prisma.sql`t.due_date ASC NULLS LAST, t.task_number`
          : query.sort === 'updated'
            ? Prisma.sql`t.updated_at DESC, t.id`
            : Prisma.sql`t.task_number`;
    const rows = z
      .array(taskRow)
      .parse(
        await tx.$queryRaw(
          Prisma.sql`${taskSelect} WHERE ${Prisma.join(filters, ' AND ')} ORDER BY ${order} LIMIT ${TASK_PAGE + 1} OFFSET ${offset}`,
        ),
      );
    const participants = await projectParticipants(tx, projectId);
    const names = new Map(participants.map((p) => [p.id, p]));
    const milestones = await listMilestones(tx, projectId);
    const more = rows.length > TASK_PAGE;
    return taskPageDto.parse({
      items: toTasks(rows.slice(0, TASK_PAGE), names),
      nextCursor: more
        ? encodeLibraryCursor(actor.id, projectId, query, offset + TASK_PAGE)
        : null,
      milestones,
      participants,
      capabilities: artifactCapabilities(
        await projectCapabilities(tx, projectId),
      ),
    });
  });
}

export async function listMilestones(
  tx: Prisma.TransactionClient,
  projectId: string,
) {
  return z.array(milestoneDto).parse(
    await tx.$queryRaw`SELECT m.id, m.title, m.description, m.target_date::text AS "targetDate", m.status, m.version,
      (SELECT count(*)::int FROM tasks t WHERE t.milestone_id=m.id AND t.archived_at IS NULL AND t.status NOT IN ('DONE','CANCELLED')) AS "openTasks",
      (SELECT count(*)::int FROM tasks t WHERE t.milestone_id=m.id AND t.archived_at IS NULL AND t.status='DONE') AS "doneTasks"
      FROM task_milestones m WHERE m.project_id=${projectId}::uuid AND m.archived_at IS NULL
      ORDER BY m.target_date ASC NULLS LAST, lower(m.title), m.id LIMIT 200`,
  );
}
export async function milestones(actor: VerifiedActor, projectId: string) {
  z.uuid().parse(projectId);
  return withActor(actor, async (tx) => {
    await requireProject(tx, projectId, 'project.read');
    return listMilestones(tx, projectId);
  });
}

export async function getTask(actor: VerifiedActor, id: string) {
  z.uuid().parse(id);
  return withActor(actor, async (tx) => {
    const [row] = z
      .array(taskRow)
      .parse(
        await tx.$queryRaw(Prisma.sql`${taskSelect} WHERE t.id=${id}::uuid`),
      );
    if (!row) throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
    await requireProject(tx, row.projectId, 'project.read');
    const names = await participantNames(tx, row.projectId, [
      row.assigneeId,
      row.createdById,
    ]);
    const [task] = toTasks([row], names);
    return taskDetailDto.parse({
      task,
      links: await linksFor(tx, row.projectId, row.artifactId),
    });
  });
}

export async function participants(actor: VerifiedActor, projectId: string) {
  z.uuid().parse(projectId);
  return withActor(actor, async (tx) => {
    await requireProject(tx, projectId, 'project.read');
    return projectParticipants(tx, projectId);
  });
}
