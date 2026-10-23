import 'server-only';
import { z } from 'zod';
import {
  artifactCommand,
  artifactCommandResult,
  emptyDocument,
  plainText,
  validateDocumentContent,
  type ArtifactCommandInput,
  type DocNode,
} from '@atlas/core';
import { Prisma } from '@atlas/database';
import {
  withActor,
  type VerifiedActor,
} from '@/features/platform/server/database';
import { PlatformError } from '@/features/platform/server/errors';
import { requestHash } from '@/features/library/server/library';
import {
  checkedContent,
  loadDocument,
  readVersion,
} from '@/features/documents/server/documents';
import {
  documentProposal,
  tasksProposal,
} from '@/features/ai/server/proposals';

async function mutate(
  tx: Prisma.TransactionClient,
  command: string,
  input: Record<string, unknown>,
  requestId: string,
) {
  const [row] = z
    .array(z.object({ result: z.unknown() }))
    .parse(
      await tx.$queryRaw`SELECT atlas_private.mutate(${command},${JSON.stringify(input)}::jsonb,${requestId}::uuid) AS result`,
    );
  return artifactCommandResult.parse(row?.result);
}
async function currentContent(tx: Prisma.TransactionClient, id: string) {
  const [row] = z
    .array(z.object({ content: z.unknown(), revision: z.number().int() }))
    .parse(
      await tx.$queryRaw`SELECT v.content, v.revision FROM documents d JOIN document_versions v ON v.id=d.current_version_id WHERE d.id=${id}::uuid`,
    );
  if (!row) throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
  return row;
}
/** Plain text of stored content; stored history is already schema-valid. */
function storedText(content: unknown) {
  const valid = validateDocumentContent(content);
  return valid.ok ? plainText(valid.content) : '';
}

/**
 * Executes one Phase 04 command. Server code validates shape and schema;
 * the SQL boundary re-resolves scope, capability, state, references and
 * revision inside one transaction. AI applications re-derive the approved
 * proposal and fail unless it is byte-for-byte what the user previewed.
 */
export async function executeArtifactCommand(
  actor: VerifiedActor,
  raw: ArtifactCommandInput,
  requestId: string,
) {
  const command = artifactCommand.parse(raw);
  const hash = requestHash(command);
  return withActor(actor, async (tx) => {
    switch (command.command) {
      case 'document.create': {
        const { content, searchText } = checkedContent(
          command.content ?? emptyDocument,
        );
        return mutate(
          tx,
          command.command,
          { ...command, content, searchText, requestHash: hash },
          requestId,
        );
      }
      case 'document.save': {
        const { content, searchText } = checkedContent(command.content);
        return mutate(
          tx,
          command.command,
          { ...command, content, searchText },
          requestId,
        );
      }
      case 'document.restore-version': {
        const { row } = await readVersion(tx, command.id, command.revision);
        return mutate(
          tx,
          command.command,
          { ...command, searchText: storedText(row.content) },
          requestId,
        );
      }
      case 'document.duplicate': {
        await loadDocument(tx, command.id);
        const current = await currentContent(tx, command.id);
        return mutate(
          tx,
          command.command,
          {
            ...command,
            searchText: storedText(current.content),
            requestHash: hash,
          },
          requestId,
        );
      }
      case 'ai.document-proposal.apply': {
        const proposal = await documentProposal(tx, command.runId, command.id);
        if (proposal.proposalHash !== command.proposalHash)
          throw new PlatformError(
            'CONFLICT',
            'The proposal changed. Review it again.',
          );
        const current = await currentContent(tx, command.id);
        if (current.revision !== command.expectedRevision)
          throw new PlatformError(
            'CONFLICT',
            'The document changed since this proposal was made.',
          );
        const base = current.content as DocNode;
        const { content, searchText } = checkedContent({
          type: 'doc',
          content: [
            ...(base.content ?? []),
            ...(proposal.proposedContent as DocNode[]),
          ],
        });
        return mutate(
          tx,
          command.command,
          {
            id: command.id,
            runId: command.runId,
            expectedRevision: command.expectedRevision,
            clientRequestId: command.clientRequestId,
            content,
            searchText,
          },
          requestId,
        );
      }
      case 'ai.task-proposal.apply': {
        const proposal = await tasksProposal(
          tx,
          command.runId,
          command.projectId,
        );
        if (proposal.proposalHash !== command.proposalHash)
          throw new PlatformError(
            'CONFLICT',
            'The proposal changed. Review it again.',
          );
        const tasks = [...new Set(command.selected)].map((index) => {
          const task = proposal.tasks[index];
          if (!task)
            throw new PlatformError(
              'VALIDATION_ERROR',
              'Check the selected tasks.',
            );
          return {
            title: task.title,
            description: task.description,
            status: 'TODO',
            priority: task.priority,
            assigneeId: command.assigneeId ?? null,
            milestoneId: command.milestoneId ?? null,
            references: task.references
              .filter((r) => r.state === 'AVAILABLE')
              .map((r) => r.artifactId),
          };
        });
        return mutate(
          tx,
          command.command,
          {
            projectId: command.projectId,
            runId: command.runId,
            idempotencyKey: command.idempotencyKey,
            tasks,
            requestHash: hash,
          },
          requestId,
        );
      }
      default: {
        const { command: name, ...fields } = command;
        return mutate(tx, name, { ...fields, requestHash: hash }, requestId);
      }
    }
  });
}
