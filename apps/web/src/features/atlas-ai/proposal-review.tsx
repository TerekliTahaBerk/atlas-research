'use client';
import { useState } from 'react';
import { Check, FilePlus2, ListPlus, X } from 'lucide-react';
import {
  blockTexts,
  type DocNode,
  type DocumentEditProposal,
  type TaskProposal,
} from '@atlas/core';
import { Btn } from '@/components/atlas/button';
import { useToast } from '@/components/atlas/toast';
import {
  ApiError,
  artifactCommand,
  proposeDocumentInsert,
  proposeTasks,
} from '@/features/artifacts/client';
import { useAtlas } from './atlas-provider';

/** Browser event that tells an open live screen to reload authoritative data. */
export const ARTIFACTS_CHANGED = 'atlas:artifacts-changed';
const changed = (detail: { documentId?: string; tasks?: boolean }) =>
  window.dispatchEvent(new CustomEvent(ARTIFACTS_CHANGED, { detail }));

/**
 * Explicit approval boundary for AI-derived changes. The preview shows the
 * exact server-derived proposal; Accept sends its hash with `approved:true`
 * and the server re-derives it and re-checks capability, schema, references
 * and the document revision. Discard writes nothing.
 */
export function ProposalActions({ runId }: { runId: string }) {
  const atlas = useAtlas();
  const flash = useToast();
  const projectId = atlas.projectId;
  const documentId = atlas.chips
    .map((c) => c.id.match(/^document:([0-9a-f-]{36})$/)?.[1])
    .find(Boolean);
  const [doc, setDoc] = useState<DocumentEditProposal | null>(null);
  const [plan, setPlan] = useState<TaskProposal | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  if (!projectId) return null;
  const fail = (e: unknown) =>
    setStatus(
      e instanceof ApiError && e.code === 'CONFLICT'
        ? 'The target changed since this proposal was prepared. Nothing was applied; refresh the proposal to review it again.'
        : e instanceof Error
          ? e.message
          : 'The proposal could not be applied.',
    );
  async function load(kind: 'doc' | 'tasks') {
    setBusy(true);
    setStatus('');
    try {
      if (kind === 'doc' && documentId)
        setDoc(await proposeDocumentInsert(runId, documentId));
      if (kind === 'tasks') {
        const next = await proposeTasks(runId, projectId!);
        setPlan(next);
        setSelected(next.tasks.map((_, i) => i));
        if (!next.tasks.length)
          setStatus('This answer has no list items to propose as tasks.');
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function acceptDoc() {
    if (!doc) return;
    setBusy(true);
    try {
      const result = await artifactCommand({
        command: 'ai.document-proposal.apply',
        id: doc.documentId,
        runId,
        expectedRevision: doc.expectedRevision,
        proposalHash: doc.proposalHash,
        clientRequestId: crypto.randomUUID(),
        approved: true,
      });
      setDoc(null);
      setStatus(`Accepted into the document as revision ${result.revision}.`);
      flash(
        `Accepted into the document as revision ${result.revision}`,
        'done',
      );
      changed({ documentId: doc.documentId });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function acceptTasks() {
    if (!plan || !selected.length) return;
    setBusy(true);
    try {
      const result = await artifactCommand({
        command: 'ai.task-proposal.apply',
        projectId: plan.projectId,
        runId,
        proposalHash: plan.proposalHash,
        selected,
        approved: true,
        idempotencyKey: crypto.randomUUID(),
      });
      setPlan(null);
      setStatus(`Created ${result.taskIds?.length ?? 0} tasks.`);
      flash(
        `Created ${result.taskIds?.length ?? 0} tasks from the approved proposal`,
        'done',
      );
      changed({ tasks: true });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-2 text-xs">
      {!doc && !plan ? (
        <div className="flex flex-wrap gap-1.5">
          {documentId ? (
            <Btn
              size="sm"
              variant="ai"
              disabled={busy}
              onClick={() => void load('doc')}
            >
              <FilePlus2 aria-hidden="true" />
              Propose document insert
            </Btn>
          ) : null}
          <Btn
            size="sm"
            variant="ai"
            disabled={busy}
            onClick={() => void load('tasks')}
          >
            <ListPlus aria-hidden="true" />
            Propose tasks
          </Btn>
        </div>
      ) : null}
      {doc ? (
        <section
          aria-label="Proposed document insert"
          className="mt-2 rounded-xl border border-aiib bg-card"
        >
          <div className="border-b border-bd2 px-3 py-2 font-medium text-tx">
            Proposed insert · appended after revision {doc.expectedRevision} ·
            not applied
          </div>
          <div className="max-h-[220px] overflow-auto px-3 py-2 font-read text-[13.5px] leading-[1.6] text-tx2">
            {blockTexts(
              { type: 'doc', content: doc.proposedContent as DocNode[] },
              (n) => (n.type === 'citation' ? '[source]' : ''),
            ).map((line, i) => (
              <p key={i} className="mb-1.5">
                {line}
              </p>
            ))}
          </div>
          {doc.sourceReferences.length ? (
            <p className="px-3 pb-2 text-tx3">
              Cites:{' '}
              {doc.sourceReferences
                .map((r) => r.detail ?? r.title ?? 'Unavailable reference')
                .join('; ')}
            </p>
          ) : null}
          <div className="flex gap-1.5 px-3 pb-3">
            <Btn
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => void acceptDoc()}
            >
              <Check aria-hidden="true" />
              Accept
            </Btn>
            <Btn size="sm" disabled={busy} onClick={() => setDoc(null)}>
              <X aria-hidden="true" />
              Discard
            </Btn>
            <Btn
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void load('doc')}
            >
              Refresh proposal
            </Btn>
          </div>
        </section>
      ) : null}
      {plan && plan.tasks.length ? (
        <section
          aria-label="Proposed tasks"
          className="mt-2 rounded-xl border border-aiib bg-card"
        >
          <div className="border-b border-bd2 px-3 py-2 font-medium text-tx">
            Proposed tasks · select which to create · not applied
          </div>
          <ul className="px-3 py-2">
            {plan.tasks.map((t, i) => (
              <li key={i} className="flex items-start gap-2 py-1">
                <input
                  id={`proposal-${runId}-${i}`}
                  type="checkbox"
                  checked={selected.includes(i)}
                  onChange={(e) =>
                    setSelected((s) =>
                      e.target.checked
                        ? [...s, i].sort((a, b) => a - b)
                        : s.filter((x) => x !== i),
                    )
                  }
                  className="mt-0.5"
                />
                <label htmlFor={`proposal-${runId}-${i}`} className="text-tx">
                  {t.title}
                  {t.description ? (
                    <span className="block text-tx3">{t.description}</span>
                  ) : null}
                  {t.references.length ? (
                    <span className="block text-tx3">
                      References:{' '}
                      {t.references
                        .map((r) => r.detail ?? r.title ?? 'Unavailable')
                        .join('; ')}
                    </span>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-1.5 px-3 pb-3">
            <Btn
              size="sm"
              variant="primary"
              disabled={busy || !selected.length}
              onClick={() => void acceptTasks()}
            >
              <Check aria-hidden="true" />
              Create {selected.length}{' '}
              {selected.length === 1 ? 'task' : 'tasks'}
            </Btn>
            <Btn size="sm" disabled={busy} onClick={() => setPlan(null)}>
              <X aria-hidden="true" />
              Discard
            </Btn>
          </div>
        </section>
      ) : null}
      {status ? (
        <p role="status" className="mt-1.5 text-tx2">
          {status}
        </p>
      ) : null}
    </div>
  );
}
