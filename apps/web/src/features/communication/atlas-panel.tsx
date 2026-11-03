'use client';
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Sparkles, X } from 'lucide-react';
import { z } from 'zod';
import { runSnapshot, type RunSnapshot } from '@atlas/ai';
import type { AtlasContextDto } from '@atlas/core';
import { Btn, IconBtn } from '@/components/atlas/button';
import { ProposalActions } from '@/features/atlas-ai/proposal-review';
import { fetchAtlasContext } from './client';
import { randomUUID } from './ids';

const intents = [
  {
    id: 'summarize',
    label: 'Summarize discussion',
    text: '/summarize this discussion',
  },
  {
    id: 'actions',
    label: 'Extract action items',
    text: 'List the concrete action items, owners and open questions in this discussion.',
  },
  {
    id: 'explain',
    label: 'Explain the shared paper',
    text: '/explain the paper being discussed',
  },
  {
    id: 'compare',
    label: 'Compare shared papers',
    text: '/compare the papers shared in this discussion',
  },
  {
    id: 'task',
    label: 'Draft a research task',
    text: 'Draft a research task from this discussion.',
  },
] as const;
const plain = (text: string) => text.replace(/\[\[[^\]]+\]\]/g, '').trim();

/**
 * Explicit, consented @Atlas over exactly one channel or thread. The panel
 * shows the server-derived context before anything is sent. Output is
 * labelled as generated analysis; posting it or creating notes/tasks needs a
 * separate confirmation. When AI is not activated (hosted development, paid
 * providers disabled) the unavailable state is shown — never a sample reply.
 */
export function AtlasPanel({
  projectId,
  channelId,
  channelName,
  threadRootId,
  canPost,
  onClose,
  onPost,
}: {
  projectId: string;
  channelId: string;
  channelName: string;
  threadRootId: string | null;
  canPost: boolean;
  onClose: () => void;
  onPost: (runId: string, body: string) => Promise<void>;
}) {
  const [context, setContext] = useState<AtlasContextDto | null>(null);
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  const [intent, setIntent] =
    useState<(typeof intents)[number]['id']>('summarize');
  const [text, setText] = useState('');
  const [run, setRun] = useState<RunSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    let alive = true;
    fetchAtlasContext(channelId, threadRootId ?? undefined)
      .then((c) => alive && setContext(c))
      .catch(
        (e: unknown) =>
          alive &&
          setError(e instanceof Error ? e.message : 'Context unavailable.'),
      );
    return () => {
      alive = false;
      abort.current?.abort();
    };
  }, [channelId, threadRootId]);
  const ask = async () => {
    if (!context?.ai.available || !consent) return;
    setBusy(true);
    setError('');
    setText('');
    setRun(null);
    setPosted(false);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetch('/api/v1/ai/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
        body: JSON.stringify({
          projectId,
          idempotencyKey: randomUUID(),
          text: intents.find((i) => i.id === intent)!.text,
          references: [],
          consent: true,
          discussion: {
            channelId,
            ...(threadRootId ? { threadRootId } : {}),
          },
        }),
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
        if (!envelope.data)
          throw new Error(
            envelope.error?.message ?? 'Atlas AI is unavailable.',
          );
        setRun(envelope.data);
        return;
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('The response stream is unavailable.');
      const decoder = new TextDecoder();
      let pending = '';
      let soFar = '';
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        pending += decoder.decode(chunk.value, { stream: true });
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
          if (kind === 'response.delta') {
            soFar += z.object({ text: z.string() }).parse(raw).text;
            setText(soFar);
          } else if (
            kind === 'run.completed' ||
            kind === 'run.failed' ||
            kind === 'run.cancelled'
          ) {
            const parsed = runSnapshot.safeParse(raw);
            if (!parsed.success)
              throw new Error(
                'Access changed or the generation was interrupted.',
              );
            setRun(parsed.data);
          }
        }
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Atlas could not answer.');
    } finally {
      setBusy(false);
    }
  };
  const completed = run?.state === 'COMPLETED';
  return (
    <section
      aria-label="Atlas for this conversation"
      className="flex min-h-0 w-[360px] shrink-0 flex-col border-l border-bd2 max-[1100px]:fixed max-[1100px]:inset-y-0 max-[1100px]:right-0 max-[1100px]:z-40 max-[1100px]:w-full max-[1100px]:max-w-[420px] max-[1100px]:bg-canvas"
    >
      <div className="flex h-12 items-center gap-2 border-b border-bd2 pr-2.5 pl-4">
        <Sparkles aria-hidden="true" className="size-[14px] text-actx" />
        <h2 className="font-semibold">Ask Atlas</h2>
        <span className="truncate text-xs text-tx3">
          #{channelName}
          {threadRootId ? ' · thread' : ''}
        </span>
        <span className="flex-1" />
        <IconBtn label="Close Atlas" size="base" onClick={onClose}>
          <X aria-hidden="true" className="size-[14px]" />
        </IconBtn>
      </div>
      <div className="flex-1 overflow-auto p-4 text-ctl">
        {!context && !error ? (
          <p className="text-tx3">Resolving authorized context…</p>
        ) : null}
        {context ? (
          <>
            <h3 className="mb-1 font-medium">Context Atlas would use</h3>
            <p className="mb-2 text-tx2">
              {context.messageIds.length} message
              {context.messageIds.length === 1 ? '' : 's'} from{' '}
              {threadRootId
                ? 'this thread only'
                : 'this channel’s main timeline'}
              {context.truncated ? ' (most recent, bounded)' : ''}
              {context.sources.length
                ? ` and ${context.sources.length} shared paper${context.sources.length === 1 ? '' : 's'}:`
                : '. No papers are shared here.'}
            </p>
            {context.sources.length ? (
              <ul className="mb-3 list-disc pl-5 text-tx2">
                {context.sources.map((s) => (
                  <li
                    key={s.artifactId}
                    className="font-serif tracking-[-0.02em]"
                  >
                    {s.title}
                  </li>
                ))}
              </ul>
            ) : null}
            {!context.ai.available ? (
              <div
                role="status"
                className="flex gap-2 rounded-lg border border-bd bg-el p-3 text-tx2"
              >
                <AlertCircle
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
                <span>
                  <span className="block font-medium text-tx">
                    Atlas AI is unavailable here
                  </span>
                  {context.ai.reason ?? 'AI processing is not activated.'} No
                  request was sent and nothing was generated.
                </span>
              </div>
            ) : (
              <>
                <fieldset className="mb-3">
                  <legend className="mb-1 font-medium">Request</legend>
                  {intents.map((i) => (
                    <label
                      key={i.id}
                      className="flex items-center gap-2 py-0.5"
                    >
                      <input
                        type="radio"
                        name="atlas-intent"
                        checked={intent === i.id}
                        onChange={() => setIntent(i.id)}
                      />
                      {i.label}
                    </label>
                  ))}
                </fieldset>
                <label className="mb-3 flex items-start gap-2 text-tx2">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5"
                  />
                  Send exactly this context to the configured AI provider.
                </label>
                <Btn
                  variant="ai"
                  disabled={!consent || busy}
                  onClick={() => void ask()}
                >
                  <Sparkles aria-hidden="true" />
                  {busy ? 'Generating…' : 'Ask Atlas'}
                </Btn>
              </>
            )}
          </>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 text-danger">
            {error}
          </p>
        ) : null}
        {text || run ? (
          <div className="mt-4 rounded-lg border border-aiib bg-acs/40 p-3">
            <p className="mb-1 text-[11px] font-medium text-actx">
              Generated analysis · not research evidence · verify against
              sources
            </p>
            <p className="whitespace-pre-wrap text-tx">
              {plain(run?.text ?? text)}
            </p>
            {run ? (
              <p className="mt-2 text-[11.5px] text-tx3">
                {run.citations.length} verified citation
                {run.citations.length === 1 ? '' : 's'}
                {run.limitations.length
                  ? ` · ${run.limitations.join(' ')}`
                  : ''}
                {run.error ? ` · ${run.error}` : ''}
              </p>
            ) : null}
          </div>
        ) : null}
        {completed && run ? (
          <div className="mt-3 flex flex-col gap-2">
            {canPost ? (
              <Btn
                variant="secondary"
                disabled={posted}
                onClick={async () => {
                  if (
                    !window.confirm(
                      `Post this generated analysis to #${channelName}? It will be labelled as Atlas output.`,
                    )
                  )
                    return;
                  try {
                    await onPost(run.id, plain(run.text));
                    setPosted(true);
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : 'Posting failed.',
                    );
                  }
                }}
              >
                {posted ? 'Posted to channel' : 'Post to channel…'}
              </Btn>
            ) : null}
            <ProposalActions runId={run.id} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
