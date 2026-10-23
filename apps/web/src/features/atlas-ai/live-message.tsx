'use client';
import { useState } from 'react';
import Link from 'next/link';
import { verifiedCitation, type VerifiedCitation } from '@atlas/ai';
import { requestData } from '@/features/platform/client';
import { useAtlas } from './atlas-provider';
import type { AssistantMessage } from './contracts';
function Citation({
  citation,
  runId,
  index,
}: {
  citation: VerifiedCitation;
  runId: string;
  index: number;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState('');
  async function inspect() {
    try {
      await requestData('/api/v1/ai/citation', verifiedCitation, {
        runId,
        index,
      });
      setOpen(true);
      setError('');
    } catch {
      setError('This source is no longer available.');
      setOpen(false);
    }
  }
  return (
    <div className="mt-2 text-xs">
      <button
        className="rounded-md border border-bd bg-el px-2 py-1 text-actx"
        onClick={() => void inspect()}
      >
        [{index + 1}] {citation.title} ·{' '}
        {citation.page ? `p.${citation.page}` : citation.kind} · location
        verified
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {open ? (
        <div className="mt-2 rounded-lg border border-bd2 p-3">
          <blockquote className="whitespace-pre-wrap">
            {citation.quote}
          </blockquote>
          <p className="mt-1 text-tx3">
            Exact source location verified. Scientific claim support has not
            been evaluated.
          </p>
          <div className="mt-2 flex gap-3">
            <Link
              href={`/app/projects/${citation.projectId}/${citation.sourceVersionId ? 'reader' : 'library'}?paper=${citation.projectPaperId}${citation.sourceVersionId ? `&source=${citation.sourceVersionId}&page=${citation.page ?? 1}` : ''}`}
            >
              Open authorized source
            </Link>
            <button
              onClick={() =>
                void navigator.clipboard
                  .writeText(
                    `${citation.title}${citation.page ? `, p.${citation.page}` : ''}: “${citation.quote}”`,
                  )
                  .catch(() => setError('Unable to copy.'))
              }
            >
              Copy reference
            </button>
            <button onClick={() => setOpen(false)}>Close passage</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
export function LiveMessage({ message: m }: { message: AssistantMessage }) {
  const atlas = useAtlas();
  const [copyError, setCopyError] = useState('');
  const text = m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('');
  return (
    <article
      aria-label="Atlas research response"
      aria-busy={m.phase === 'think' || m.phase === 'stream'}
      className="border-b border-bd2 py-3 text-[13.5px] leading-relaxed text-tx"
    >
      {m.phase === 'think' ? (
        <p role="status" className="text-actx">
          {m.steps[m.step] ?? 'Working'}…
        </p>
      ) : null}
      {m.phase === 'stream' ? (
        <p className="text-xs text-warn">
          Provisional response · citations pending verification
        </p>
      ) : null}
      <div className="whitespace-pre-wrap">{text}</div>
      {m.phase === 'done' && m.runId
        ? m.liveCitations?.map((c, i) => (
            <Citation
              key={`${c.evidenceId}:${i}`}
              citation={c}
              runId={m.runId!}
              index={i}
            />
          ))
        : null}
      {m.limitations?.length ? (
        <ul className="mt-2 list-inside list-disc text-xs text-tx3">
          {m.limitations.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      ) : null}
      {m.phase === 'error' ? (
        <div role="alert" className="mt-2 rounded border border-danger/30 p-2">
          <p>{m.error ?? 'Generation was interrupted.'}</p>
          <button disabled={atlas.busy} onClick={() => atlas.retry(m.id)}>
            Start new attempt (may incur usage)
          </button>
        </div>
      ) : null}
      {m.phase === 'done' ? (
        <button
          className="mt-2 text-xs text-tx2"
          onClick={() =>
            void navigator.clipboard
              .writeText(text)
              .catch(() => setCopyError('Unable to copy.'))
          }
        >
          Copy draft
        </button>
      ) : null}
      {copyError ? <p role="alert">{copyError}</p> : null}
    </article>
  );
}
