'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import {
  reference,
  runSnapshot,
  verifiedCitation,
  type RunSnapshot,
} from '@atlas/ai';
import { requestData } from '@/features/platform/client';
import type {
  AssistantMessage,
  AtlasMessage,
  ContextReference,
} from './contracts';
const conversation = z.object({
  id: z.uuid(),
  title: z.string(),
  version: z.number().int(),
  createdAt: z.string(),
  archived: z.boolean(),
});
export type ConversationItem = z.infer<typeof conversation>;
function assistant(id: string, query: string): AssistantMessage {
  return {
    id,
    role: 'assistant',
    phase: 'think',
    steps: ['Resolving authorized sources', 'Generating provisional response'],
    step: 0,
    startedAt: Date.now(),
    parts: [],
    revealed: Infinity,
    sources: [],
    query,
    live: true,
  };
}
export function useLiveConversation(
  enabled: boolean,
  projectId: string | undefined,
) {
  const [messages, setMessages] = useState<AtlasMessage[]>([]),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [items, setItems] = useState<ConversationItem[]>([]),
    [conversationId, setConversationId] = useState<string | undefined>(),
    [notice, setNotice] = useState(''),
    [service, setService] = useState({
      enabled: false,
      provider: '',
      model: '',
      fixture: false,
      message: '',
    }),
    [usage, setUsage] = useState(0),
    [indexing, setIndexing] = useState('');
  const active = useRef<AbortController | undefined>(undefined),
    runId = useRef<string | undefined>(undefined),
    sending = useRef(false),
    currentProject = useRef(projectId);
  useEffect(() => {
    currentProject.current = projectId;
  }, [projectId]);
  const refresh = useCallback(async () => {
    if (!enabled || !projectId) return;
    try {
      const [data, configuration, usageData, jobs] = await Promise.all([
        requestData(
          `/api/v1/ai/conversations?projectId=${projectId}`,
          z.array(conversation),
        ),
        requestData(
          `/api/v1/ai/configuration?projectId=${projectId}`,
          z.object({
            enabled: z.boolean(),
            provider: z.string(),
            model: z.string(),
            fixture: z.boolean(),
            message: z.string(),
          }),
        ),
        requestData(
          `/api/v1/ai/usage?projectId=${projectId}`,
          z.array(
            z.object({
              kind: z.string(),
              costMicros: z.number(),
              operations: z.number(),
            }),
          ),
        ),
        requestData(
          `/api/v1/ai/status?projectId=${projectId}`,
          z.array(z.object({ state: z.string() })),
        ),
      ]);
      if (currentProject.current === projectId) {
        setItems(data);
        setService(configuration);
        setUsage(usageData.reduce((n, r) => n + r.costMicros, 0));
        setIndexing(
          jobs.some((j) => ['QUEUED', 'RUNNING', 'RETRYABLE'].includes(j.state))
            ? 'Source indexing pending.'
            : jobs.some((j) => j.state === 'FAILED')
              ? 'Some source indexing failed. Requeue an eligible source to retry.'
              : '',
        );
      }
    } catch (error) {
      if (currentProject.current === projectId)
        setNotice(
          error instanceof Error ? error.message : 'Atlas AI is unavailable.',
        );
    }
  }, [enabled, projectId]);
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      setMessages([]);
      setItems([]);
      setNotice('');
      setIndexing('');
      setConversationId(undefined);
      setConsent(false);
      setBusy(false);
      sending.current = false;
      void refresh();
    }, 0);
    return () => {
      clearTimeout(timer);
      active.current?.abort();
    };
  }, [enabled, projectId, refresh]);
  const stop = useCallback(() => {
    active.current?.abort();
    if (runId.current)
      void requestData(
        `/api/v1/ai/runs/${runId.current}/cancel`,
        z.object({ cancelled: z.boolean() }),
        {},
      ).catch(() =>
        setNotice(
          'Cancellation could not be confirmed. Reopen the conversation to check its state.',
        ),
      );
  }, []);
  const patch = useCallback(
    (id: string, values: Partial<AssistantMessage>) =>
      setMessages((list) =>
        list.map((m) =>
          m.id === id && m.role === 'assistant' ? { ...m, ...values } : m,
        ),
      ),
    [],
  );
  const send = useCallback(
    async (text: string, chips: ContextReference[]) => {
      if (!enabled || sending.current) return false;
      if (!projectId) {
        setNotice('Open a project before asking Atlas.');
        return false;
      }
      if (!consent) {
        setNotice(
          'Approve sending the selected research context to the configured model provider.',
        );
        return false;
      }
      if (chips.some((c) => c.research?.kind === 'search-result')) {
        setNotice(
          'Save this search result to Library before attaching it to a research conversation.',
        );
        return false;
      }
      const parsed = reference
        .array()
        .max(12)
        .safeParse(chips.filter((c) => c.research).map((c) => c.research));
      if (!parsed.success) {
        setNotice(
          'Some research attachments are unavailable. Remove them and try again.',
        );
        return false;
      }
      const references = parsed.data;
      const id = crypto.randomUUID();
      const requestKey = crypto.randomUUID();
      const controller = new AbortController();
      active.current = controller;
      sending.current = true;
      runId.current = undefined;
      setBusy(true);
      setNotice('');
      setMessages((list) => [
        ...list,
        { id: `user:${id}`, role: 'user', text },
        assistant(id, text),
      ]);
      const apply = (state: RunSnapshot) => {
        runId.current = state.id;
        setConversationId(state.conversationId);
        patch(id, {
          runId: state.id,
          phase:
            state.state === 'COMPLETED'
              ? 'done'
              : state.state === 'RUNNING' || state.state === 'RESERVED'
                ? 'think'
                : 'error',
          parts: [{ type: 'text', text: state.text }],
          liveCitations: state.citations,
          limitations: state.limitations,
          error: state.error ?? undefined,
          stopped: state.state === 'CANCELLED',
        });
      };
      try {
        const response = await fetch('/api/v1/ai/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            ...(conversationId ? { conversationId } : {}),
            idempotencyKey: requestKey,
            text,
            references,
            consent: true,
          }),
          signal: controller.signal,
          cache: 'no-store',
        });
        if (
          !response.headers.get('content-type')?.startsWith('text/event-stream')
        ) {
          const envelope = z
            .object({
              data: runSnapshot.optional(),
              error: z.object({ message: z.string() }).optional(),
            })
            .parse(await response.json());
          if (!response.ok || !envelope.data)
            throw new Error(
              envelope.error?.message ?? 'Atlas AI is unavailable.',
            );
          apply(envelope.data);
          return true;
        }
        const reader = response.body?.getReader();
        if (!reader) throw new Error('The response stream is unavailable.');
        const decoder = new TextDecoder();
        let pending = '',
          textSoFar = '',
          terminal = false;
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          if (currentProject.current !== projectId) {
            await reader.cancel();
            break;
          }
          pending += decoder.decode(result.value, { stream: true });
          if (pending.length > 150000)
            throw new Error('The response exceeded its transport limit.');
          let boundary: number;
          while ((boundary = pending.indexOf('\n\n')) >= 0) {
            const frame = pending.slice(0, boundary);
            pending = pending.slice(boundary + 2);
            const kind = frame
              .split('\n')
              .find((l) => l.startsWith('event: '))
              ?.slice(7);
            const data = frame
              .split('\n')
              .filter((l) => l.startsWith('data: '))
              .map((l) => l.slice(6))
              .join('\n');
            if (!data) continue;
            const raw: unknown = JSON.parse(data);
            if (kind === 'run.started') {
              const state = runSnapshot.parse(raw);
              runId.current = state.id;
              setConversationId(state.conversationId);
              patch(id, { runId: state.id });
            } else if (kind === 'retrieval.completed') patch(id, { step: 1 });
            else if (kind === 'response.delta') {
              const delta = z
                .object({ text: z.string(), provisional: z.literal(true) })
                .parse(raw);
              textSoFar += delta.text;
              patch(id, {
                phase: 'stream',
                parts: [{ type: 'text', text: textSoFar }],
              });
            } else if (
              kind === 'run.completed' ||
              kind === 'run.failed' ||
              kind === 'run.cancelled'
            ) {
              const parsed = runSnapshot.safeParse(raw);
              if (parsed.success) apply(parsed.data);
              else
                throw new Error(
                  'Access changed or the generation was interrupted.',
                );
              terminal = true;
            }
          }
        }
        if (!terminal)
          throw new Error(
            'The stream was interrupted. Reopen this conversation to recover its saved state.',
          );
      } catch (error) {
        if (currentProject.current === projectId)
          patch(id, {
            phase: 'error',
            error: controller.signal.aborted
              ? 'Generation stopped. Provider completion may be uncertain.'
              : error instanceof Error
                ? error.message
                : 'Generation interrupted.',
          });
      } finally {
        if (currentProject.current === projectId) {
          setBusy(false);
          sending.current = false;
          void refresh();
        }
      }
      return true;
    },
    [enabled, projectId, consent, conversationId, patch, refresh],
  );
  const open = useCallback(
    async (id: string) => {
      if (busy || !projectId) return;
      try {
        const rows = await requestData(
          `/api/v1/ai/conversations/${id}?projectId=${projectId}`,
          z.array(
            z.object({
              id: z.uuid(),
              prompt: z.string(),
              text: z.string(),
              state: z.string(),
              citations: z.array(verifiedCitation),
              limitations: z.array(z.string()),
              error: z.string().nullable(),
            }),
          ),
        );
        if (currentProject.current !== projectId) return;
        setConversationId(id);
        setMessages(
          rows.flatMap((r) => [
            { id: `user:${r.id}`, role: 'user' as const, text: r.prompt },
            {
              ...assistant(r.id, r.prompt),
              runId: r.id,
              phase:
                r.state === 'COMPLETED'
                  ? ('done' as const)
                  : ('error' as const),
              parts: [{ type: 'text' as const, text: r.text }],
              liveCitations: r.citations,
              limitations: r.limitations,
              error:
                r.error ??
                (r.state === 'COMPLETED'
                  ? undefined
                  : 'Incomplete generation. Start a new attempt explicitly.'),
            },
          ]),
        );
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : 'Unable to reopen conversation.',
        );
      }
    },
    [busy, projectId],
  );
  const rename = useCallback(
    async (id: string, title: string, version: number) => {
      if (!projectId) return;
      try {
        await requestData(
          '/api/v1/ai/conversations',
          z.object({ id: z.uuid() }),
          { projectId, id, title, version, operation: 'rename' },
        );
        await refresh();
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : 'Unable to rename conversation.',
        );
      }
    },
    [projectId, refresh],
  );
  const archive = useCallback(
    async (
      id: string,
      version: number,
      operation: 'archive' | 'delete' = 'archive',
    ) => {
      if (!projectId) return;
      try {
        await requestData(
          '/api/v1/ai/conversations',
          z.object({ id: z.uuid() }),
          { projectId, id, version, operation },
        );
        setConversationId(undefined);
        setMessages([]);
        await refresh();
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : 'Unable to archive conversation.',
        );
      }
    },
    [projectId, refresh],
  );
  const queueSource = async (sourceVersionId: string) => {
    if (!consent) {
      setNotice('Approve provider processing before indexing this source.');
      return;
    }
    try {
      await requestData('/api/v1/ai/index', z.object({ id: z.uuid() }), {
        sourceVersionId,
        consent: true,
      });
      setNotice(
        'Source indexing queued. It remains pending until an isolated worker processes it.',
      );
      await refresh();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Source indexing unavailable.',
      );
    }
  };
  return {
    service,
    usage,
    indexing,
    queueSource,
    messages,
    busy,
    consent,
    setConsent,
    items,
    conversationId,
    notice,
    send,
    stop,
    open,
    rename,
    archive,
    clear: () => {
      if (!busy) {
        setMessages([]);
        setConversationId(undefined);
      }
    },
  };
}
