'use client';
import { useState } from 'react';
import { useAtlas } from './atlas-provider';
export function LiveControls() {
  const atlas = useAtlas();
  const [title, setTitle] = useState('');
  if (!atlas.live) return null;
  const engine = atlas.engine;
  const selected = engine.items.find((i) => i.id === engine.conversationId);
  return (
    <div className="flex flex-col gap-2 border-b border-bd2 px-3 py-2 text-xs text-tx2">
      {engine.service.fixture ? (
        <p className="text-warn">
          Isolated AI test fixture · no real model inference
        </p>
      ) : null}
      <p role="status">
        {engine.service.message}
        {engine.service.model
          ? ` · ${engine.service.provider} / ${engine.service.model}`
          : ''}
      </p>
      <p>
        Recorded usage this month: ${(engine.usage / 1_000_000).toFixed(4)} USD
        (estimates may include uncertain requests).
      </p>
      {engine.indexing ? <p role="status">{engine.indexing}</p> : null}
      {atlas.chips
        .flatMap((c) =>
          c.research?.kind === 'source-version' ? [c.research] : [],
        )
        .map((ref) => (
          <button
            key={ref.sourceVersionId}
            disabled={engine.busy || !engine.consent}
            onClick={() => void engine.queueSource(ref.sourceVersionId)}
          >
            Index attached source for AI
          </button>
        ))}
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={engine.consent}
          onChange={(e) => engine.setConsent(e.target.checked)}
          disabled={engine.busy}
        />
        <span>
          Allow the configured AI provider to process this conversation and
          authorized research context. Provider retention policies apply.
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Research conversations"
          className="min-w-0 max-w-full rounded border border-bd bg-el p-1"
          value={engine.conversationId ?? ''}
          disabled={engine.busy}
          onChange={(e) =>
            e.target.value ? void engine.open(e.target.value) : engine.clear()
          }
        >
          <option value="">New research conversation</option>
          {engine.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <button type="button" onClick={engine.clear} disabled={engine.busy}>
          New
        </button>
      </div>
      {selected ? (
        <div className="flex flex-wrap gap-2">
          <input
            aria-label="Conversation title"
            className="min-w-0 rounded border border-bd bg-el p-1"
            placeholder={selected.title}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
          />
          <button
            disabled={engine.busy || !title.trim()}
            onClick={() => {
              void engine.rename(selected.id, title, selected.version);
              setTitle('');
            }}
          >
            Rename
          </button>
          <button
            disabled={engine.busy}
            onClick={() => void engine.archive(selected.id, selected.version)}
          >
            Archive
          </button>
          <button
            disabled={engine.busy}
            onClick={() => {
              if (
                window.confirm(
                  'Delete this conversation and its research text? Usage records will remain.',
                )
              )
                void engine.archive(selected.id, selected.version, 'delete');
            }}
          >
            Delete conversation
          </button>
        </div>
      ) : null}
      {engine.notice ? <p role="status">{engine.notice}</p> : null}
    </div>
  );
}
