import { z } from 'zod';
import { documentContent } from './documents';

/*
 * Phase 04 contracts: documents, tasks, milestones, typed artifact links,
 * search and AI action proposals. The SQL command boundary independently
 * re-checks every rule expressed here.
 */
const id = z.uuid();
const version = z.number().int().positive();
const title = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), 'No control characters.');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const artifactKinds = ['PAPER', 'DOCUMENT', 'TASK'] as const;
export const artifactKind = z.enum(artifactKinds);
export type ArtifactKind = z.infer<typeof artifactKind>;

export const documentKinds = [
  'RESEARCH_NOTE',
  'GENERAL_DOCUMENT',
  'LITERATURE_REVIEW',
  'EXPERIMENT_NOTE',
] as const;
export const documentKind = z.enum(documentKinds);
export type DocumentKind = z.infer<typeof documentKind>;
export const documentKindLabels: Record<DocumentKind, string> = {
  RESEARCH_NOTE: 'Research note',
  GENERAL_DOCUMENT: 'Document',
  LITERATURE_REVIEW: 'Literature review',
  EXPERIMENT_NOTE: 'Experiment note',
};

export const taskStatuses = [
  'TODO',
  'IN_PROGRESS',
  'IN_REVIEW',
  'DONE',
  'CANCELLED',
] as const;
export const taskStatus = z.enum(taskStatuses);
export type TaskStatusValue = z.infer<typeof taskStatus>;
export const taskStatusLabels: Record<TaskStatusValue, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'In review',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
};
export const taskPriorities = [
  'NONE',
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT',
] as const;
export const taskPriority = z.enum(taskPriorities);
export type TaskPriorityValue = z.infer<typeof taskPriority>;
export const taskPriorityLabels: Record<TaskPriorityValue, string> = {
  NONE: 'No priority',
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};
/** Mirrors `atlas_private.task_transition_allowed`; the database decides. */
export const taskTransitions: Record<
  TaskStatusValue,
  readonly TaskStatusValue[]
> = {
  TODO: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['TODO', 'IN_REVIEW', 'DONE', 'CANCELLED'],
  IN_REVIEW: ['IN_PROGRESS', 'DONE', 'CANCELLED'],
  DONE: ['IN_PROGRESS'],
  CANCELLED: ['TODO'],
};
export const canTransition = (from: TaskStatusValue, to: TaskStatusValue) =>
  taskTransitions[from].includes(to);
export const milestoneStatuses = ['PLANNED', 'ACTIVE', 'DONE'] as const;
export const milestoneStatus = z.enum(milestoneStatuses);

export const linkRelationships = [
  'CITES',
  'REFERENCES',
  'TRACKS',
  'RELATES_TO',
  'DEPENDS_ON',
  'RELATED_TO',
] as const;
export const linkRelationship = z.enum(linkRelationships);
export type LinkRelationship = z.infer<typeof linkRelationship>;
/** Allowed (source kind, relationship, target kind) triples. */
export const linkMatrix: readonly [
  ArtifactKind,
  LinkRelationship,
  ArtifactKind,
][] = [
  ['DOCUMENT', 'CITES', 'PAPER'],
  ['DOCUMENT', 'REFERENCES', 'DOCUMENT'],
  ['DOCUMENT', 'TRACKS', 'TASK'],
  ['TASK', 'REFERENCES', 'PAPER'],
  ['TASK', 'RELATES_TO', 'DOCUMENT'],
  ['TASK', 'DEPENDS_ON', 'TASK'],
  ['PAPER', 'RELATED_TO', 'PAPER'],
];
export const linkAllowed = (
  s: ArtifactKind,
  r: LinkRelationship,
  t: ArtifactKind,
) => linkMatrix.some(([a, b, c]) => a === s && b === r && c === t);
export const relationshipLabels: Record<LinkRelationship, [string, string]> = {
  CITES: ['Cites', 'Cited by'],
  REFERENCES: ['References', 'Referenced by'],
  TRACKS: ['Tracks', 'Tracked in'],
  RELATES_TO: ['Relates to', 'Related task'],
  DEPENDS_ON: ['Depends on', 'Blocks'],
  RELATED_TO: ['Related to', 'Related to'],
};

/*
 * Capability matrix (docs/tasks/ASSIGNMENT_AND_ROLES.md). Derived from the
 * existing project capabilities; no parallel role system exists.
 */
export const artifactCapabilityNames = [
  'document.read',
  'document.create',
  'document.edit',
  'document.version.read',
  'document.version.restore',
  'document.archive',
  'document.export',
  'task.read',
  'task.create',
  'task.edit',
  'task.assign',
  'task.status.update',
  'task.archive',
  'milestone.manage',
  'artifact.link.create',
  'artifact.link.remove',
  'artifact.search',
] as const;
export type ArtifactCapability = (typeof artifactCapabilityNames)[number];
const readCaps: ArtifactCapability[] = [
  'document.read',
  'document.version.read',
  'document.export',
  'task.read',
  'artifact.search',
];
export function artifactCapabilities(
  projectCapabilities: readonly string[],
): ArtifactCapability[] {
  const caps: ArtifactCapability[] = [];
  if (projectCapabilities.includes('project.read')) caps.push(...readCaps);
  if (projectCapabilities.includes('project.write'))
    caps.push(...artifactCapabilityNames.filter((c) => !readCaps.includes(c)));
  return caps;
}

// ------------------------------------------------------------------- DTOs

export const personDto = z.object({ id, name: z.string() });
export type PersonDto = z.infer<typeof personDto>;
export const participantDto = z.object({
  id,
  name: z.string(),
  assignable: z.boolean(),
});
export type ParticipantDto = z.infer<typeof participantDto>;
export const referenceState = z.enum(['AVAILABLE', 'ARCHIVED', 'UNAVAILABLE']);
/** An authorized view of an artifact; unavailable targets carry no title. */
export const referenceDto = z.object({
  artifactId: id,
  kind: artifactKind,
  id: id.nullable(),
  state: referenceState,
  title: z.string().nullable(),
  /** Short secondary label: author/year, “#12”, document kind. */
  detail: z.string().nullable(),
  href: z.string().nullable(),
});
export type ReferenceDto = z.infer<typeof referenceDto>;
export const documentSummaryDto = z.object({
  id,
  artifactId: id,
  projectId: id,
  title: z.string(),
  kind: documentKind,
  revision: z.number().int().min(1),
  version,
  archived: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: personDto.nullable(),
  updatedBy: personDto.nullable(),
});
export type DocumentSummaryDto = z.infer<typeof documentSummaryDto>;
export const documentDto = documentSummaryDto.extend({
  versionId: id,
  contentHash: z.string(),
  content: z.unknown(),
  capabilities: z.array(z.string()),
  /** Typed references in the current content, re-authorized now. */
  references: z.array(referenceDto),
  people: z.array(personDto),
});
export type DocumentDto = z.infer<typeof documentDto>;
export const documentPageDto = z.object({
  items: z.array(documentSummaryDto),
  nextCursor: z.string().nullable(),
});
export type DocumentPage = z.infer<typeof documentPageDto>;
export const versionSource = z.enum([
  'CREATE',
  'EDITOR',
  'RESTORE',
  'DUPLICATE',
  'AI_PROPOSAL',
]);
export const versionSummaryDto = z.object({
  id,
  revision: z.number().int(),
  author: personDto.nullable(),
  createdAt: z.string(),
  changeSummary: z.string().nullable(),
  source: versionSource,
  restoredFromRevision: z.number().int().nullable(),
});
export type VersionSummaryDto = z.infer<typeof versionSummaryDto>;
export const versionPageDto = z.object({
  items: z.array(versionSummaryDto),
  nextCursor: z.string().nullable(),
});
export const versionDto = versionSummaryDto.extend({
  content: z.unknown(),
  references: z.array(referenceDto),
});
export type VersionDto = z.infer<typeof versionDto>;

export const milestoneDto = z.object({
  id,
  title: z.string(),
  description: z.string().nullable(),
  targetDate: z.string().nullable(),
  status: milestoneStatus,
  version,
  openTasks: z.number().int(),
  doneTasks: z.number().int(),
});
export type MilestoneDto = z.infer<typeof milestoneDto>;
export const assigneeDto = z.object({
  id,
  /** Hidden once the person is no longer an eligible participant. */
  name: z.string().nullable(),
  state: z.enum(['ACTIVE', 'REVOKED']),
});
export const taskDto = z.object({
  id,
  artifactId: id,
  projectId: id,
  number: z.number().int(),
  title: z.string(),
  description: z.string(),
  status: taskStatus,
  priority: taskPriority,
  assignee: assigneeDto.nullable(),
  milestoneId: id.nullable(),
  dueDate: z.string().nullable(),
  version,
  archived: z.boolean(),
  createdBy: personDto.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
  linkedPapers: z.number().int(),
  linkedDocuments: z.number().int(),
});
export type TaskDto = z.infer<typeof taskDto>;
export const taskPageDto = z.object({
  items: z.array(taskDto),
  nextCursor: z.string().nullable(),
  milestones: z.array(milestoneDto),
  participants: z.array(participantDto),
  capabilities: z.array(z.string()),
});
export type TaskPage = z.infer<typeof taskPageDto>;
export const linkDto = z.object({
  id,
  relationship: linkRelationship,
  origin: z.enum(['MANUAL', 'CONTENT']),
  direction: z.enum(['outgoing', 'incoming']),
  other: referenceDto,
  createdAt: z.string(),
});
export type LinkDto = z.infer<typeof linkDto>;
export const linksDto = z.object({
  artifact: referenceDto,
  links: z.array(linkDto),
});
export type LinksDto = z.infer<typeof linksDto>;
export const taskDetailDto = z.object({
  task: taskDto,
  links: z.array(linkDto),
});
export type TaskDetailDto = z.infer<typeof taskDetailDto>;

export const artifactOptionDto = z.object({
  artifactId: id,
  id,
  kind: artifactKind,
  title: z.string(),
  detail: z.string().nullable(),
});
export type ArtifactOption = z.infer<typeof artifactOptionDto>;
export const artifactOptionsDto = z.object({
  items: z.array(artifactOptionDto),
  people: z.array(participantDto),
});

/** Private-use markers delimit highlighted terms in plain-text snippets. */
export const SNIPPET_START = '';
export const SNIPPET_END = '';
export const searchHitDto = z.object({
  artifactId: id,
  id,
  kind: artifactKind,
  title: z.string(),
  snippet: z.string().max(400),
  detail: z.string().nullable(),
  href: z.string(),
  updatedAt: z.string(),
});
export type SearchHit = z.infer<typeof searchHitDto>;
export const searchPageDto = z.object({
  items: z.array(searchHitDto),
  nextCursor: z.string().nullable(),
});
export type SearchPage = z.infer<typeof searchPageDto>;
export const artifactSearchQuery = z
  .object({
    q: z.string().trim().min(1).max(200),
    kind: artifactKind.optional(),
    sort: z.enum(['relevance', 'recent']).default('relevance'),
    cursor: z.string().max(1024).optional(),
  })
  .strict();
export type ArtifactSearchQuery = z.infer<typeof artifactSearchQuery>;
/**
 * Builds a prefix tsquery from letters/digits only. The result is passed as a
 * bound parameter; no user text reaches SQL syntax.
 */
export function searchTerms(query: string) {
  const words =
    query
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words)]
    .slice(0, 8)
    .map((w) => `${w.slice(0, 40)}:*`)
    .join(' & ');
}

export const graphDto = z.object({
  nodes: z.array(
    z.object({
      artifactId: id,
      id,
      kind: artifactKind,
      title: z.string(),
      href: z.string(),
    }),
  ),
  edges: z.array(
    z.object({ id, source: id, target: id, relationship: linkRelationship }),
  ),
  truncated: z.boolean(),
});
export type GraphDto = z.infer<typeof graphDto>;

export const documentListQuery = z
  .object({
    archived: z.enum(['true', 'false']).default('false'),
    cursor: z.string().max(1024).optional(),
  })
  .strict();
export const taskListQuery = z
  .object({
    archived: z.enum(['true', 'false']).default('false'),
    status: taskStatus.optional(),
    assignee: z.union([id, z.literal('me'), z.literal('none')]).optional(),
    milestone: id.optional(),
    priority: taskPriority.optional(),
    q: z.string().trim().max(200).optional(),
    sort: z.enum(['number', 'priority', 'due', 'updated']).default('number'),
    cursor: z.string().max(1024).optional(),
  })
  .strict();
export type TaskListQuery = z.infer<typeof taskListQuery>;

// --------------------------------------------------------------- commands

const changeSummary = z.string().trim().max(200).optional();
export const taskFields = {
  title: title(200),
  description: z.string().max(20000),
  priority: taskPriority,
  assigneeId: id.nullable(),
  milestoneId: id.nullable(),
  dueDate: date.nullable(),
};
export const artifactCommand = z.discriminatedUnion('command', [
  z
    .object({
      command: z.literal('document.create'),
      projectId: id,
      title: title(200),
      kind: documentKind.default('RESEARCH_NOTE'),
      content: documentContent.optional(),
      idempotencyKey: id,
    })
    .strict(),
  z
    .object({
      command: z.literal('document.save'),
      id,
      expectedRevision: z.number().int().min(1),
      clientRequestId: id,
      content: documentContent,
      changeSummary,
    })
    .strict(),
  z
    .object({
      command: z.literal('document.rename'),
      id,
      expectedVersion: version,
      title: title(200),
    })
    .strict(),
  z
    .object({
      command: z.literal('document.restore-version'),
      id,
      expectedRevision: z.number().int().min(1),
      revision: z.number().int().min(1),
      clientRequestId: id,
    })
    .strict(),
  z
    .object({
      command: z.literal('document.duplicate'),
      id,
      title: title(200).optional(),
      idempotencyKey: id,
    })
    .strict(),
  z
    .object({
      command: z.literal('document.archive'),
      id,
      expectedVersion: version,
    })
    .strict(),
  z
    .object({
      command: z.literal('document.restore'),
      id,
      expectedVersion: version,
    })
    .strict(),
  z
    .object({
      command: z.literal('milestone.create'),
      projectId: id,
      title: title(120),
      description: z.string().trim().max(1000).optional(),
      targetDate: date.nullable().optional(),
      idempotencyKey: id,
    })
    .strict(),
  z
    .object({
      command: z.literal('milestone.update'),
      id,
      expectedVersion: version,
      title: title(120),
      description: z.string().trim().max(1000).optional(),
      targetDate: date.nullable(),
      status: milestoneStatus,
    })
    .strict(),
  z
    .object({
      command: z.literal('milestone.archive'),
      id,
      expectedVersion: version,
    })
    .strict(),
  z
    .object({
      command: z.literal('task.create'),
      projectId: id,
      title: taskFields.title,
      description: taskFields.description.default(''),
      status: z.enum(['TODO', 'IN_PROGRESS']).default('TODO'),
      priority: taskPriority.default('NONE'),
      assigneeId: id.nullable().optional(),
      milestoneId: id.nullable().optional(),
      dueDate: date.nullable().optional(),
      /** Papers or documents the task references, as artifact IDs. */
      references: z.array(id).max(20).default([]),
      idempotencyKey: id,
    })
    .strict(),
  z
    .object({
      command: z.literal('task.update'),
      id,
      expectedVersion: version,
      title: taskFields.title.optional(),
      description: taskFields.description.optional(),
      priority: taskFields.priority.optional(),
      assigneeId: taskFields.assigneeId.optional(),
      milestoneId: taskFields.milestoneId.optional(),
      dueDate: taskFields.dueDate.optional(),
    })
    .strict(),
  z
    .object({
      command: z.literal('task.assign'),
      id,
      expectedVersion: version,
      assigneeId: id.nullable(),
    })
    .strict(),
  z
    .object({
      command: z.literal('task.transition'),
      id,
      expectedVersion: version,
      status: taskStatus,
    })
    .strict(),
  z
    .object({
      command: z.literal('task.archive'),
      id,
      expectedVersion: version,
    })
    .strict(),
  z
    .object({
      command: z.literal('task.restore'),
      id,
      expectedVersion: version,
    })
    .strict(),
  z
    .object({
      command: z.literal('artifact.link.create'),
      projectId: id,
      sourceArtifactId: id,
      targetArtifactId: id,
      relationship: linkRelationship,
      idempotencyKey: id,
    })
    .strict(),
  z.object({ command: z.literal('artifact.link.remove'), id }).strict(),
  z
    .object({
      command: z.literal('ai.document-proposal.apply'),
      id,
      runId: id,
      expectedRevision: z.number().int().min(1),
      proposalHash: z.string().regex(/^[a-f0-9]{64}$/),
      clientRequestId: id,
      /** Explicit user approval of the exact previewed proposal. */
      approved: z.literal(true),
    })
    .strict(),
  z
    .object({
      command: z.literal('ai.task-proposal.apply'),
      projectId: id,
      runId: id,
      proposalHash: z.string().regex(/^[a-f0-9]{64}$/),
      /** Indexes of the proposed tasks the user selected. */
      selected: z.array(z.number().int().min(0).max(19)).min(1).max(20),
      assigneeId: id.nullable().optional(),
      milestoneId: id.nullable().optional(),
      approved: z.literal(true),
      idempotencyKey: id,
    })
    .strict(),
]);
export type ArtifactCommand = z.infer<typeof artifactCommand>;
export type ArtifactCommandInput = z.input<typeof artifactCommand>;
export const artifactCommandNames = artifactCommand.options.map(
  (option) => option.shape.command.value,
);
export const artifactCommandResult = z.object({
  id,
  revision: z.number().int().optional(),
  versionId: id.optional(),
  taskNumber: z.number().int().optional(),
  taskIds: z.array(id).optional(),
  existing: z.boolean().optional(),
  replayed: z.boolean().optional(),
  unchanged: z.boolean().optional(),
});
export type ArtifactCommandResult = z.infer<typeof artifactCommandResult>;

// ------------------------------------------------------------ AI proposals

/** Typed proposal built server-side from a completed, authorized AI run. */
export const documentEditProposal = z.object({
  type: z.literal('document.insert'),
  runId: id,
  documentId: id,
  expectedRevision: z.number().int().min(1),
  /** Blocks appended at the end of the current revision. */
  proposedContent: z.array(z.unknown()).max(200),
  sourceReferences: z.array(referenceDto),
  proposalHash: z.string(),
});
export type DocumentEditProposal = z.infer<typeof documentEditProposal>;
export const taskProposalItem = z.object({
  title: z.string(),
  description: z.string(),
  status: z.literal('TODO'),
  priority: taskPriority,
  references: z.array(referenceDto),
});
export const taskProposal = z.object({
  type: z.literal('task.create'),
  runId: id,
  projectId: id,
  tasks: z.array(taskProposalItem).max(20),
  proposalHash: z.string(),
});
export type TaskProposal = z.infer<typeof taskProposal>;
export const proposalRequest = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('document.insert'), runId: id, documentId: id })
    .strict(),
  z
    .object({ type: z.literal('task.create'), runId: id, projectId: id })
    .strict(),
]);
