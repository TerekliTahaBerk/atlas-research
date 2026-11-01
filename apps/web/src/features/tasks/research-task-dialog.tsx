'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { BookOpen, FileText, ListPlus, X } from 'lucide-react';
import type {
  MilestoneDto,
  ParticipantDto,
  ProjectDto,
  ReferenceDto,
} from '@atlas/core';
import { Btn, IconBtn } from '@/components/atlas/button';
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalTitle,
} from '@/components/atlas/overlay';
import { useToast } from '@/components/atlas/toast';
import {
  ApiError,
  artifactCommand,
  fetchMilestones,
  fetchParticipants,
} from '@/features/artifacts/client';
import { ARTIFACTS_CHANGED } from '@/features/atlas-ai/proposal-review';

export interface ResearchTaskSource {
  document: { id: string; artifactId: string; title: string };
  /** Papers this note cites that the actor can currently read. */
  papers: ReferenceDto[];
  /** Selected note text, used only to prefill an editable title. */
  selection: string;
}
export interface CreatedTask {
  id: string;
  number: number | undefined;
  title: string;
}

const prefill = (selection: string) => {
  const text = selection.replace(/\s+/g, ' ').trim();
  return text.length > 200 ? `${text.slice(0, 197)}…` : text;
};

/**
 * Note → task. One `task.create` command creates the task and its
 * TASK —RELATES_TO→ DOCUMENT link (plus TASK —REFERENCES→ PAPER for each
 * explicitly selected paper) in a single transaction, so there is no
 * partially linked task. A retry after an unconfirmed response reuses the
 * idempotency key and returns the same task.
 */
export function ResearchTaskDialog({
  open,
  onOpenChange,
  project,
  source,
  canInsertReference,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectDto;
  source: ResearchTaskSource | null;
  /** Whether the open editor can add a task reference to the note. */
  canInsertReference: boolean;
  onCreated: (task: CreatedTask, insertReference: boolean) => void;
}) {
  return (
    <Modal open={open && !!source} onOpenChange={onOpenChange}>
      {source ? (
        <ModalContent className="flex max-h-[calc(100vh-48px)] w-[min(520px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl">
          <TaskForm
            project={project}
            source={source}
            canInsertReference={canInsertReference}
            onClose={() => onOpenChange(false)}
            onCreated={onCreated}
          />
        </ModalContent>
      ) : null}
    </Modal>
  );
}

function TaskForm({
  project,
  source,
  canInsertReference,
  onClose,
  onCreated,
}: {
  project: ProjectDto;
  source: ResearchTaskSource;
  canInsertReference: boolean;
  onClose: () => void;
  onCreated: (task: CreatedTask, insertReference: boolean) => void;
}) {
  const flash = useToast();
  const ids = useId();
  const [title, setTitle] = useState(() => prefill(source.selection));
  const [description, setDescription] = useState(
    `From the research note “${source.document.title}”.`,
  );
  const [milestoneId, setMilestoneId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [papers, setPapers] = useState<string[]>([]);
  const [insertReference, setInsertReference] = useState(canInsertReference);
  const [meta, setMeta] = useState<{
    milestones: MilestoneDto[];
    people: ParticipantDto[];
  } | null>(null);
  const [status, setStatus] = useState<
    | { kind: 'idle' | 'busy' }
    | { kind: 'error'; message: string; retryable: boolean }
    | { kind: 'done'; task: CreatedTask }
  >({ kind: 'idle' });
  const attempt = useRef<{ intent: string; key: string } | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  useEffect(() => {
    let active = true;
    Promise.all([fetchMilestones(project.id), fetchParticipants(project.id)])
      .then(
        ([milestones, people]) =>
          active &&
          setMeta({
            milestones: milestones.filter((m) => m.status !== 'DONE'),
            people: people.filter((p) => p.assignable),
          }),
      )
      .catch(() => active && setMeta({ milestones: [], people: [] }));
    return () => {
      active = false;
    };
  }, [project.id]);

  const intent = JSON.stringify([
    title.trim(),
    description.trim(),
    milestoneId,
    assigneeId,
    [...papers].sort(),
  ]);
  async function submit() {
    if (!title.trim() || status.kind === 'busy') return;
    if (attempt.current?.intent !== intent)
      attempt.current = { intent, key: crypto.randomUUID() };
    const key = attempt.current.key;
    setStatus({ kind: 'busy' });
    try {
      const result = await artifactCommand({
        command: 'task.create',
        projectId: project.id,
        title: title.trim(),
        description: description.trim(),
        ...(milestoneId ? { milestoneId } : {}),
        ...(assigneeId ? { assigneeId } : {}),
        // The note always; papers only when explicitly selected.
        references: [source.document.artifactId, ...papers],
        idempotencyKey: key,
      });
      if (!alive.current) return;
      const task = {
        id: result.id,
        number: result.taskNumber,
        title: title.trim(),
      };
      window.dispatchEvent(
        new CustomEvent(ARTIFACTS_CHANGED, { detail: { tasks: true } }),
      );
      setStatus({ kind: 'done', task });
      flash(
        result.replayed
          ? 'This task already existed; nothing was duplicated'
          : `Created task${task.number ? ` #${task.number}` : ''}`,
        'done',
      );
      onCreated(task, insertReference && canInsertReference);
    } catch (e) {
      if (!alive.current) return;
      const code = e instanceof ApiError ? e.code : 'NETWORK';
      setStatus({
        kind: 'error',
        retryable: code === 'NETWORK' || code === 'INTERNAL_ERROR',
        message:
          code === 'NETWORK' || code === 'INTERNAL_ERROR'
            ? 'Creation could not be confirmed. Retrying is safe: it returns the same task instead of a duplicate.'
            : code === 'CONFLICT'
              ? 'A linked paper or the note was archived meanwhile. Nothing was created; review the links and try again.'
              : code === 'VALIDATION_ERROR'
                ? 'Check the title, milestone and assignee. Nothing was created.'
                : code === 'NOT_FOUND'
                  ? 'You can no longer create tasks in this project. Nothing was created.'
                  : e instanceof Error
                    ? e.message
                    : 'The task was not created.',
      });
    }
  }

  if (status.kind === 'done')
    return (
      <div className="p-5">
        <ModalTitle className="mb-1 text-ui font-medium">
          Created task{status.task.number ? ` #${status.task.number}` : ''}
        </ModalTitle>
        <ModalDescription className="mb-4 text-ctl text-tx2">
          “{status.task.title}” is linked to this note
          {papers.length
            ? ` and ${papers.length} cited ${papers.length === 1 ? 'paper' : 'papers'}`
            : ''}
          .
        </ModalDescription>
        <div className="flex justify-end gap-1.5">
          <Btn variant="ghost" size="lg" onClick={onClose}>
            Back to note
          </Btn>
          <Btn variant="primary" size="lg" asChild>
            <Link
              href={`/app/projects/${project.id}/tasks?task=${status.task.id}`}
            >
              Open task
            </Link>
          </Btn>
        </div>
      </div>
    );

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      aria-busy={status.kind === 'busy'}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-center gap-2 border-b border-bd2 px-4 py-3">
        <ModalTitle className="flex-1 text-ui font-medium">
          Create research task
        </ModalTitle>
        <IconBtn label="Close" size="base" onClick={onClose}>
          <X aria-hidden="true" className="size-[14px]" />
        </IconBtn>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3 text-ctl">
        <ModalDescription className="mb-3 text-tx2">
          The task is created only when you confirm, already linked to this
          note.
        </ModalDescription>
        <label
          className="mb-1 block text-[11.5px] text-tx3"
          htmlFor={`${ids}-title`}
        >
          Title
        </label>
        <input
          id={`${ids}-title`}
          required
          autoFocus
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Reproduce the experiment described in…"
          className="mb-3 h-8 w-full rounded-[7px] border border-bd bg-canvas px-2.5"
        />
        <label
          className="mb-1 block text-[11.5px] text-tx3"
          htmlFor={`${ids}-desc`}
        >
          Description (optional)
        </label>
        <textarea
          id={`${ids}-desc`}
          rows={3}
          maxLength={20000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mb-3 w-full resize-none rounded-md border border-bd bg-canvas px-2 py-1.5"
        />
        <div className="mb-3 grid grid-cols-2 gap-2 max-sm:grid-cols-1">
          <label className="text-[11.5px] text-tx3">
            Milestone (optional)
            <select
              value={milestoneId}
              disabled={!meta}
              onChange={(e) => setMilestoneId(e.target.value)}
              className="mt-1 h-8 w-full rounded-[7px] border border-bd bg-canvas px-2 text-ctl text-tx"
            >
              <option value="">No milestone</option>
              {meta?.milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11.5px] text-tx3">
            Assignee (optional)
            <select
              value={assigneeId}
              disabled={!meta}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="mt-1 h-8 w-full rounded-[7px] border border-bd bg-canvas px-2 text-ctl text-tx"
            >
              <option value="">Unassigned</option>
              {meta?.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="mb-3">
          <legend className="mb-1.5 text-[11.5px] text-tx3">Links</legend>
          <p className="mb-1.5 flex items-center gap-2">
            <FileText aria-hidden="true" className="size-3.5 text-tx3" />
            <span className="truncate">
              Relates to “{source.document.title}”
            </span>
          </p>
          {source.papers.length ? (
            <>
              <p className="mb-1 text-[11.5px] text-tx3">
                Also reference cited papers (only those you select):
              </p>
              {source.papers.map((p) => (
                <label
                  key={p.artifactId}
                  className="flex items-center gap-2 py-0.5"
                >
                  <input
                    type="checkbox"
                    checked={papers.includes(p.artifactId)}
                    onChange={(e) =>
                      setPapers((list) =>
                        e.target.checked
                          ? [...list, p.artifactId]
                          : list.filter((id) => id !== p.artifactId),
                      )
                    }
                  />
                  <BookOpen aria-hidden="true" className="size-3 text-tx3" />
                  <span className="truncate">
                    {p.detail ? `${p.detail} — ` : ''}
                    {p.title}
                  </span>
                </label>
              ))}
            </>
          ) : (
            <p className="text-[11.5px] text-tx3">
              This note cites no available papers.
            </p>
          )}
          {canInsertReference ? (
            <label className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={insertReference}
                onChange={(e) => setInsertReference(e.target.checked)}
              />
              Add a task reference at the end of this note (saved by autosave)
            </label>
          ) : null}
        </fieldset>
        {status.kind === 'error' ? (
          <p role="alert" className="text-danger">
            {status.message}
          </p>
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-1.5 border-t border-bd2 px-4 py-3">
        <Btn variant="ghost" size="lg" onClick={onClose}>
          Cancel
        </Btn>
        <Btn
          type="submit"
          variant="primary"
          size="lg"
          disabled={!title.trim() || status.kind === 'busy'}
        >
          <ListPlus aria-hidden="true" />
          {status.kind === 'busy'
            ? 'Creating…'
            : status.kind === 'error' && status.retryable
              ? 'Retry'
              : 'Create task'}
        </Btn>
      </div>
    </form>
  );
}
