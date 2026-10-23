import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  costMicros,
  normalizeCommand,
  requestInputBound,
  runInput,
  tokenBound,
  type AIRequest,
} from '@atlas/ai';
import {
  withActor,
  type VerifiedActor,
} from '@/features/platform/server/database';
import { PlatformError, publicError } from '@/features/platform/server/errors';
import { aiConfig, embeddingConfig, generationProvider } from './config';
import { executeResearchTool } from './tools';
import { history, snapshot, updateRun } from './repository';
import { hashText, revalidateEvidence, resolveReferences } from './retrieval';

export async function prepareRun(actor: VerifiedActor, raw: unknown) {
  const input = runInput.parse(raw);
  const config = aiConfig();
  let text: string;
  try {
    text = normalizeCommand(input.text);
  } catch {
    throw new PlatformError(
      'VALIDATION_ERROR',
      'This command is not available.',
    );
  }
  await resolveReferences(actor, input.projectId, input.references);
  const scope = await withActor(actor, async (tx) => {
    const [row] = z
      .array(z.object({ organizationId: z.uuid(), workspaceId: z.uuid() }))
      .parse(
        await tx.$queryRaw`SELECT organization_id AS "organizationId",workspace_id AS "workspaceId" FROM projects WHERE id=${input.projectId}::uuid`,
      );
    if (!row) throw new PlatformError('NOT_FOUND', 'Resource unavailable.');
    return row;
  });
  const id = randomUUID(),
    conversationId = input.conversationId ?? randomUUID();
  const amount = costMicros(
    config.policy.contextTokens - config.policy.maxOutputTokens,
    config.policy.maxOutputTokens,
    config.policy.inputMicrosPerMillion,
    config.policy.outputMicrosPerMillion,
  );
  const payload = {
    ...input,
    id,
    conversationId,
    createConversation: !input.conversationId,
    provider: config.policy.provider,
    model: config.policy.model,
    hash: hashText(JSON.stringify(input)),
    amount,
    cap: config.cap,
  };
  const actual = await withActor(actor, async (tx) => {
    await tx.$queryRaw`SELECT atlas_private.ai_reconcile()`;
    const [row] = z
      .array(z.object({ id: z.uuid() }))
      .parse(
        await tx.$queryRaw`SELECT atlas_private.ai_begin(${JSON.stringify(payload)}::jsonb) AS id`,
      );
    if (!row)
      throw new PlatformError(
        'INTERNAL_ERROR',
        'Unable to reserve this request.',
      );
    return row.id;
  }).catch((error) => {
    if (publicError(error).code === 'RATE_LIMITED')
      throw new PlatformError(
        'RATE_LIMITED',
        'AI usage or concurrency limit reached. Try again when capacity is available.',
      );
    throw error;
  });
  return { input, text, config, scope, id: actual, isNew: id === actual };
}
export async function streamRun(
  actor: VerifiedActor,
  prepared: Awaited<ReturnType<typeof prepareRun>>,
  requestSignal: AbortSignal,
) {
  const { input, id, config } = prepared;
  // Replayed submission returns the persisted state; no second provider dispatch.
  if (!prepared.isNew)
    return Response.json(
      { data: await snapshot(actor, id) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  const abort = new AbortController();
  const signal = AbortSignal.any([
    abort.signal,
    requestSignal,
    AbortSignal.timeout(120000),
  ]);
  const encoder = new TextEncoder();
  let closed = false;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let dispatched = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      const emit = (type: string, data: unknown, version: number) => {
        if (!closed)
          controller.enqueue(
            encoder.encode(
              `id: ${version}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
      };
      const emitSnapshot = async (type: string) => {
        const state = await snapshot(actor, id);
        emit(type, state, state.version);
        return state;
      };
      try {
        await emitSnapshot('run.started');
        const previous = await history(
          actor,
          input.projectId,
          (await snapshot(actor, id)).conversationId,
        );
        const messages: AIRequest['messages'] = previous
          .filter((r) => r.id !== id && r.state === 'COMPLETED')
          .slice(-4)
          .flatMap((r) => [
            { role: 'user' as const, content: r.prompt.slice(0, 2000) },
            { role: 'assistant' as const, content: r.text.slice(0, 4000) },
          ]);
        emit('retrieval.started', { runId: id }, 1);
        let vector: number[] | undefined;
        const embedding = process.env.ATLAS_AI_EMBEDDING_MODEL
          ? embeddingConfig()
          : undefined;
        const embeddingModel = embedding?.indexKey;
        if (embedding) {
          signal.throwIfAborted();
          const estimate = Math.max(
            1,
            costMicros(tokenBound(prepared.text), 0, embedding.price, 0),
          );
          const uid = await withActor(actor, async (tx) => {
            const [r] = z
              .array(z.object({ id: z.uuid() }))
              .parse(
                await tx.$queryRaw`SELECT atlas_private.ai_reserve(${input.projectId}::uuid,${'query:' + id},'embedding',${estimate},${config.cap},NULL) AS id`,
              );
            return r?.id;
          });
          if (!uid) throw new Error('RESERVATION_FAILED');
          vector = await embedding.adapter.embedQuery(prepared.text, signal);
          await withActor(
            actor,
            (tx) =>
              tx.$queryRaw`SELECT atlas_private.ai_settle(${uid}::uuid,${estimate})::text`,
          );
        }
        const evidence = await executeResearchTool(
          actor,
          'research.retrieve',
          {
            projectId: input.projectId,
            query: prepared.text,
            references: input.references,
            ...(vector ? { vector, model: embeddingModel } : {}),
          },
          id,
          signal,
        );
        await revalidateEvidence(actor, input.projectId, evidence);
        emit(
          'retrieval.completed',
          {
            count: evidence.length,
            mode: vector ? 'hybrid' : 'keyword',
            fullText: evidence.filter((s) => s.kind === 'full-text').length,
          },
          1,
        );
        const request: AIRequest = {
          requestId: id,
          idempotencyKey: input.idempotencyKey,
          config: {
            provider: config.policy.provider,
            model: config.policy.model,
            maxOutputTokens: config.policy.maxOutputTokens,
          },
          messages: [...messages, { role: 'user', content: prepared.text }],
          context: {
            actorId: actor.id,
            projectId: input.projectId,
            organizationId: prepared.scope.organizationId,
            workspaceId: prepared.scope.workspaceId,
            permissionSnapshotId: id,
            sources: [],
            evidence,
          },
          tools: [],
          signal,
        };
        // The same conservative bound used by the adapter; reject before dispatch.
        if (
          requestInputBound(request.messages, evidence) +
            config.policy.maxOutputTokens >
          config.policy.contextTokens
        )
          throw new PlatformError(
            'VALIDATION_ERROR',
            'The selected context is too large. Attach fewer sources or start a new conversation.',
          );
        signal.throwIfAborted();
        if (!(await updateRun(actor, id, 'dispatch', { evidence })))
          throw new Error('CANCELLED');
        dispatched = true;
        let checking = false;
        heartbeat = setInterval(() => {
          if (checking) return;
          checking = true;
          void snapshot(actor, id)
            .then((state) => {
              if (state.state !== 'RUNNING') abort.abort();
            })
            .catch(() => abort.abort())
            .finally(() => {
              checking = false;
            });
        }, 1000);
        const provider = generationProvider(config);
        let complete = false;
        for await (const event of provider.stream(request)) {
          signal.throwIfAborted();
          await revalidateEvidence(actor, input.projectId, evidence);
          if (event.type === 'delta') {
            if (!(await updateRun(actor, id, 'delta', { text: event.text })))
              throw new Error('CANCELLED');
            const state = await snapshot(actor, id);
            emit(
              'response.delta',
              { text: event.text, provisional: true, runId: id },
              state.version,
            );
          } else if (event.type === 'error') throw new Error(event.code);
          else {
            if (!event.response.grounded) throw new Error('INVALID_OUTPUT');
            const { usage, grounded } = event.response;
            const actual = costMicros(
              usage.inputTokens,
              usage.outputTokens,
              config.policy.inputMicrosPerMillion,
              config.policy.outputMicrosPerMillion,
            );
            if (
              !(await updateRun(actor, id, 'complete', {
                ...grounded,
                ...usage,
                costMicros: actual,
              }))
            )
              throw new Error('CANCELLED');
            for (const citation of grounded.citations)
              emit(
                'citation.verified',
                citation,
                (await snapshot(actor, id)).version,
              );
            emit(
              'usage.updated',
              {
                costMicros: actual,
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
              },
              (await snapshot(actor, id)).version,
            );
            await emitSnapshot('run.completed');
            complete = true;
          }
        }
        if (!complete) throw new Error('INTERRUPTED');
      } catch (error) {
        const timedOut =
          signal.aborted &&
          z.object({ name: z.literal('TimeoutError') }).safeParse(signal.reason)
            .success;
        const cancelled = signal.aborted && !timedOut;
        const known =
          error instanceof Error &&
          [
            'RATE_LIMITED',
            'TIMEOUT',
            'INVALID_OUTPUT',
            'PROVIDER_UNAVAILABLE',
          ].includes(error.message)
            ? error.message
            : 'INTERRUPTED';
        await updateRun(
          actor,
          id,
          cancelled ? 'cancel' : dispatched ? 'uncertain' : 'fail',
          { error: cancelled ? 'CANCELLED' : timedOut ? 'TIMEOUT' : known },
        ).catch(() => {
          console.error(
            JSON.stringify({
              requestId: id,
              code: 'AI_RUN_SETTLEMENT_PENDING',
            }),
          );
        });
        try {
          await emitSnapshot(cancelled ? 'run.cancelled' : 'run.failed');
        } catch {
          emit(
            'run.failed',
            { error: 'ACCESS_CHANGED_OR_INTERRUPTED', runId: id },
            0,
          );
        }
      } finally {
        if (heartbeat) clearInterval(heartbeat);
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      closed = true;
      abort.abort();
    },
  });
  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'private, no-store',
      'X-Accel-Buffering': 'no',
      'X-Request-Id': id,
    },
  });
}
