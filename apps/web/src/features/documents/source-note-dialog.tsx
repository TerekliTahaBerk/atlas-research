'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FilePlus2, FileText, Lock, Quote, X } from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import {
  annotationCitable,
  citationPrecision,
  citationPrecisionLabels,
  type ArtifactOption,
  type CitationPrecision,
  type ProjectDto,
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
  fetchDocument,
  fetchOptions,
} from '@/features/artifacts/client';
import { ARTIFACTS_CHANGED } from '@/features/atlas-ai/proposal-review';

/** Evidence the reader can offer; the server re-reads every field. */
export interface SourceNoteEvidence {
  paper: { id: string; title: string };
  /** The accepted version on screen, if any. */
  version: { id: string; ordinal: number } | null;
  annotation: {
    id: string;
    page: number;
    quote: string | null;
    body: string | null;
    visibility: 'PROJECT' | 'PRIVATE';
  } | null;
  /** Current page, shown only to explain what is (not) recorded. */
  page: number | null;
  /** The highlight was created for this action from a text selection. */
  createdHighlight?: boolean;
}
type Destination =
  | { kind: 'new'; title: string }
  | { kind: 'existing'; option: ArtifactOption; revision: number | null };
type Status =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'error'; message: string; retryable: boolean }
  | {
      kind: 'done';
      documentId: string;
      title: string;
      revision: number | undefined;
      replayed: boolean;
    };

const precisionOf = (e: SourceNoteEvidence, useAnnotation: boolean) =>
  citationPrecision({
    projectPaperId: e.paper.id,
    sourceVersionId: e.version?.id ?? null,
    sourceChecksum: null,
    annotation:
      useAnnotation && e.annotation
        ? {
            id: e.annotation.id,
            page: e.annotation.page,
            quote: e.annotation.quote,
            startOffset: null,
            endOffset: null,
          }
        : null,
  });

/**
 * Explicit confirmation boundary for Reader → research note. Nothing is
 * written until “Add to note”; a new note is created only then, in the same
 * transaction as its citation. Retrying after an unconfirmed response reuses
 * the request ID, so the server returns the committed revision instead of
 * inserting the reference twice. Open editors are never written to: an
 * open, dirty editor of the same note sees a revision conflict and keeps
 * its local draft.
 */
export function SourceNoteDialog({
  open,
  onOpenChange,
  project,
  evidence,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectDto;
  evidence: SourceNoteEvidence | null;
}) {
  return (
    <Modal open={open && !!evidence} onOpenChange={onOpenChange}>
      {evidence ? (
        <ModalContent className="flex max-h-[calc(100vh-48px)] w-[min(520px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl">
          <SourceNoteForm
            key={`${evidence.paper.id}:${evidence.version?.id ?? ''}:${evidence.annotation?.id ?? ''}`}
            project={project}
            evidence={evidence}
            onClose={() => onOpenChange(false)}
          />
        </ModalContent>
      ) : null}
    </Modal>
  );
}

function SourceNoteForm({
  project,
  evidence,
  onClose,
}: {
  project: ProjectDto;
  evidence: SourceNoteEvidence;
  onClose: () => void;
}) {
  const router = useRouter();
  const flash = useToast();
  const ids = useId();
  const quotable =
    !!evidence.annotation &&
    !!evidence.version &&
    annotationCitable(evidence.annotation.quote);
  const [useAnnotation, setUseAnnotation] = useState(quotable);
  const precision: CitationPrecision = precisionOf(evidence, useAnnotation);
  const [destination, setDestination] = useState<Destination>({
    kind: 'new',
    title: `Notes — ${evidence.paper.title}`.slice(0, 200),
  });
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<ArtifactOption[] | null>(null);
  const [commentary, setCommentary] = useState(evidence.annotation?.body ?? '');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  // One request ID per confirmed intent: a retry of the same intent replays,
  // any edit (or a refreshed revision) starts a new attempt.
  const intent = JSON.stringify([
    destination.kind === 'new'
      ? ['new', destination.title.trim()]
      : ['existing', destination.option.id, destination.revision],
    useAnnotation,
    commentary.trim(),
    consent,
  ]);
  const attempt = useRef<{ intent: string; id: string } | null>(null);
  const alive = useRef(true);
  // Re-armed on every mount: StrictMode and remounts run cleanup first.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      fetchOptions(project.id, query, 'DOCUMENT')
        .then((r) => active && setOptions(r.items))
        .catch(() => active && setOptions([]));
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [project.id, query]);

  async function pick(option: ArtifactOption) {
    setDestination({ kind: 'existing', option, revision: null });
    setStatus({ kind: 'idle' });
    try {
      const doc = await fetchDocument(option.id);
      if (!alive.current) return;
      if (!doc.capabilities.includes('document.edit')) {
        setStatus({
          kind: 'error',
          message: 'You can read this note but not edit it.',
          retryable: false,
        });
        return;
      }
      setDestination({ kind: 'existing', option, revision: doc.revision });
    } catch (e) {
      if (!alive.current) return;
      setStatus({
        kind: 'error',
        message:
          e instanceof ApiError && e.code === 'NOT_FOUND'
            ? 'That note is no longer available.'
            : 'The note could not be loaded. Try again.',
        retryable: false,
      });
    }
  }

  const privateQuote =
    useAnnotation && evidence.annotation?.visibility === 'PRIVATE';
  const ready =
    status.kind !== 'busy' &&
    (destination.kind === 'new'
      ? destination.title.trim().length > 0
      : destination.revision !== null) &&
    (!privateQuote || consent);

  async function submit() {
    if (!ready) return;
    if (attempt.current?.intent !== intent)
      attempt.current = { intent, id: crypto.randomUUID() };
    const requestId = attempt.current.id;
    setStatus({ kind: 'busy' });
    const title =
      destination.kind === 'new'
        ? destination.title.trim()
        : destination.option.title;
    try {
      const result = await artifactCommand({
        command: 'document.cite-source',
        projectId: project.id,
        projectPaperId: evidence.paper.id,
        sourceVersionId: evidence.version?.id ?? null,
        annotationId: useAnnotation ? (evidence.annotation?.id ?? null) : null,
        target:
          destination.kind === 'new'
            ? { kind: 'new', title }
            : {
                kind: 'existing',
                documentId: destination.option.id,
                expectedRevision: destination.revision!,
              },
        commentary: commentary.trim(),
        sharePrivateAnnotation: privateQuote && consent,
        clientRequestId: requestId,
      });
      if (!alive.current) return;
      window.dispatchEvent(
        new CustomEvent(ARTIFACTS_CHANGED, {
          detail: { documentId: result.id },
        }),
      );
      setStatus({
        kind: 'done',
        documentId: result.id,
        title,
        revision: result.revision,
        replayed: !!result.replayed,
      });
      flash(`Added to “${title}”`, 'done');
    } catch (e) {
      if (!alive.current) return;
      const code = e instanceof ApiError ? e.code : 'NETWORK';
      if (code === 'CONFLICT' && destination.kind === 'existing') {
        // Re-read the latest revision; the user confirms again explicitly.
        const latest = await fetchDocument(destination.option.id).catch(
          () => null,
        );
        if (!alive.current) return;
        if (latest)
          setDestination({ ...destination, revision: latest.revision });
      }
      setStatus({
        kind: 'error',
        retryable: code === 'NETWORK' || code === 'INTERNAL_ERROR',
        message:
          code === 'NETWORK' || code === 'INTERNAL_ERROR'
            ? 'The insert could not be confirmed. Retrying is safe: the reference is never added twice.'
            : code === 'CONFLICT' && destination.kind === 'existing'
              ? 'The note changed since you chose it. Nothing was inserted; confirm again to add the reference to the latest revision.'
              : code === 'NOT_FOUND'
                ? 'This source, annotation or note is no longer available to you. Nothing was inserted.'
                : e instanceof Error
                  ? e.message
                  : 'The reference was not added.',
      });
    }
  }

  if (status.kind === 'done')
    return (
      <div className="p-5">
        <ModalTitle className="mb-1 text-ui font-medium">
          Added to “{status.title}”
        </ModalTitle>
        <ModalDescription className="mb-4 text-ctl text-tx2">
          {status.replayed
            ? 'This reference had already been added; nothing was duplicated.'
            : `Saved as revision ${status.revision ?? '—'}. Earlier revisions stay in version history.`}
        </ModalDescription>
        <div className="flex justify-end gap-1.5">
          <Btn variant="ghost" size="lg" onClick={onClose}>
            Keep reading
          </Btn>
          <Btn
            variant="primary"
            size="lg"
            onClick={() => {
              onClose();
              router.push(
                `/app/projects/${project.id}/documents?doc=${status.documentId}`,
              );
            }}
          >
            Open note
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
          Add to research note
        </ModalTitle>
        <IconBtn label="Close" size="base" onClick={onClose}>
          <X aria-hidden="true" className="size-[14px]" />
        </IconBtn>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3 text-ctl">
        <ModalDescription className="mb-3 text-tx2">
          Atlas inserts a citation built from the stored source. Nothing is
          written until you confirm.
        </ModalDescription>
        <fieldset className="mb-3.5">
          <legend className="mb-1.5 text-[11.5px] text-tx3">Evidence</legend>
          <div className="rounded-lg border border-bd2 bg-card p-2.5">
            <p className="mb-1 font-serif tracking-[-0.02em] text-[15px] leading-[1.25]">
              {evidence.paper.title}
            </p>
            {evidence.annotation?.quote && useAnnotation ? (
              <p className="mb-1 font-read leading-normal text-tx2 italic">
                “{evidence.annotation.quote.slice(0, 400)}
                {evidence.annotation.quote.length > 400 ? '…' : ''}”
              </p>
            ) : null}
            <p className="text-[11.5px] text-tx3" id={`${ids}-precision`}>
              {citationPrecisionLabels[precision]}
              {precision === 'quote' || precision === 'page'
                ? ` · p. ${evidence.annotation?.page}`
                : ''}
              {evidence.version ? ` · v${evidence.version.ordinal}` : ''}
            </p>
          </div>
          {evidence.annotation && evidence.version ? (
            <div className="mt-2 flex flex-col gap-1">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${ids}-precision`}
                  checked={useAnnotation}
                  disabled={!quotable}
                  onChange={() => setUseAnnotation(true)}
                />
                {evidence.annotation.quote
                  ? `Quote the highlight on p. ${evidence.annotation.page}`
                  : `Reference the note on p. ${evidence.annotation.page}`}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${ids}-precision`}
                  checked={!useAnnotation}
                  onChange={() => setUseAnnotation(false)}
                />
                Cite version v{evidence.version.ordinal} without a page
              </label>
              {!quotable ? (
                <p className="text-[11.5px] text-tx3">
                  This highlight is too long to quote in a citation.
                </p>
              ) : null}
            </div>
          ) : !evidence.annotation && evidence.page && evidence.version ? (
            <p className="mt-1.5 text-[11.5px] text-tx3">
              Page {evidence.page} is not recorded: only highlights and page
              notes pin a verified page. Add one first to cite this page.
            </p>
          ) : null}
          {evidence.createdHighlight ? (
            <p className="mt-2 text-[11.5px] text-tx3" role="note">
              The highlight was saved in the reader. Cancelling keeps it; you
              can delete it from the notes panel.
            </p>
          ) : null}
          {privateQuote ? (
            <label className="mt-2 flex items-start gap-2 rounded-md border border-warn/40 bg-warns px-2.5 py-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                <Lock aria-hidden="true" className="mr-1 inline size-3" />
                This annotation is private. Copy its text into a note other
                project members can read?
              </span>
            </label>
          ) : null}
        </fieldset>

        <fieldset className="mb-3.5">
          <legend className="mb-1.5 text-[11.5px] text-tx3">Destination</legend>
          <label
            className={cn(
              'mb-1.5 flex items-center gap-2 rounded-md border px-2.5 py-2',
              destination.kind === 'new'
                ? 'border-aiib bg-acs/40'
                : 'border-bd2',
            )}
          >
            <input
              type="radio"
              name={`${ids}-dest`}
              checked={destination.kind === 'new'}
              onChange={() =>
                setDestination({
                  kind: 'new',
                  title: `Notes — ${evidence.paper.title}`.slice(0, 200),
                })
              }
            />
            <FilePlus2 aria-hidden="true" className="size-3.5 text-tx3" />
            New research note
          </label>
          {destination.kind === 'new' ? (
            <div className="mb-2 pl-6">
              <label className="sr-only" htmlFor={`${ids}-title`}>
                New note title
              </label>
              <input
                id={`${ids}-title`}
                value={destination.title}
                maxLength={200}
                onChange={(e) =>
                  setDestination({ kind: 'new', title: e.target.value })
                }
                className="h-8 w-full rounded-[7px] border border-bd bg-canvas px-2.5"
              />
            </div>
          ) : null}
          <label className="sr-only" htmlFor={`${ids}-search`}>
            Search existing notes
          </label>
          <input
            id={`${ids}-search`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Or search existing notes…"
            className="h-8 w-full rounded-[7px] border border-bd px-2.5"
          />
          <ul
            aria-label="Existing notes"
            className="mt-1 max-h-[160px] overflow-auto"
          >
            {options === null ? (
              <li className="px-2 py-1.5 text-tx3" role="status">
                Loading notes…
              </li>
            ) : !options.length ? (
              <li className="px-2 py-1.5 text-tx3">No matching notes.</li>
            ) : (
              options.map((o) => {
                const selected =
                  destination.kind === 'existing' &&
                  destination.option.id === o.id;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => void pick(o)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-hov',
                        selected && 'bg-hov font-medium',
                      )}
                    >
                      <FileText
                        aria-hidden="true"
                        className="size-3 shrink-0 text-tx3"
                      />
                      <span className="truncate">{o.title}</span>
                      {selected && destination.revision !== null ? (
                        <span className="ml-auto text-[11px] text-tx3">
                          revision {destination.revision}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </fieldset>

        <label
          className="mb-1 block text-[11.5px] text-tx3"
          htmlFor={`${ids}-note`}
        >
          Your commentary (optional, added as a separate paragraph)
        </label>
        <textarea
          id={`${ids}-note`}
          rows={3}
          maxLength={4000}
          value={commentary}
          onChange={(e) => setCommentary(e.target.value)}
          className="w-full resize-none rounded-md border border-bd bg-canvas px-2 py-1.5"
        />
        {status.kind === 'error' ? (
          <p role="alert" className="mt-2 text-danger">
            {status.message}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5 border-t border-bd2 px-4 py-3">
        <Quote aria-hidden="true" className="size-3.5 text-tx3" />
        <span className="flex-1 truncate text-[11.5px] text-tx3">
          Appended at the end of the note
        </span>
        <Btn variant="ghost" size="lg" onClick={onClose}>
          Cancel
        </Btn>
        <Btn type="submit" variant="primary" size="lg" disabled={!ready}>
          {status.kind === 'busy'
            ? 'Adding…'
            : status.kind === 'error' && status.retryable
              ? 'Retry'
              : 'Add to note'}
        </Btn>
      </div>
    </form>
  );
}
