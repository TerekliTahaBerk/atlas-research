'use client';
import { useEffect, useState } from 'react';
import { FileClock, FileSearch, RotateCcw, X } from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import {
  blockTexts,
  diffBlocks,
  validateDocumentContent,
  type DocNode,
  type ReferenceDto,
  type VersionDto,
  type VersionSummaryDto,
} from '@atlas/core';
import {
  Modal,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalTitle,
} from '@/components/atlas/overlay';
import { fetchVersion, fetchVersions } from '@/features/artifacts/client';

const sourceLabels: Record<VersionSummaryDto['source'], string> = {
  CREATE: 'Created',
  EDITOR: 'Edited',
  RESTORE: 'Restored',
  DUPLICATE: 'Duplicated',
  AI_PROPOSAL: 'Accepted Atlas proposal',
};
const when = (value: string) =>
  new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
/** Re-authorized labels: unavailable references never show stored labels. */
function texts(version: VersionDto | null) {
  if (!version) return [];
  const valid = validateDocumentContent(version.content);
  if (!valid.ok)
    return [
      'This revision uses an unsupported format and is shown without content.',
    ];
  const refs = new Map(
    version.references.filter((r) => r.id).map((r) => [r.id!, r]),
  );
  const label = (node: DocNode) => {
    const a = node.attrs ?? {};
    if (node.type === 'personMention') return '@person';
    const r: ReferenceDto | undefined = refs.get(
      String(a.projectPaperId ?? a.documentId ?? a.taskId ?? ''),
    );
    if (!r || r.state === 'UNAVAILABLE' || !r.title)
      return '[unavailable reference]';
    return `[${r.detail ?? r.title}${typeof a.page === 'number' ? `, p. ${a.page}` : ''}]`;
  };
  return blockTexts(valid.content, label).filter((t) => t.trim());
}

/**
 * Live version history in the approved compact modal layout. Every list and
 * preview request is re-authorized; restore always creates a new revision.
 */
export function LiveVersionHistoryDialog({
  open,
  onOpenChange,
  documentId,
  title,
  currentRevision,
  canRestore,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  title: string;
  currentRevision: number;
  canRestore: boolean;
  onRestore: (revision: number) => Promise<void>;
}) {
  const [items, setItems] = useState<VersionSummaryDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [preview, setPreview] = useState<{
    version: VersionDto;
    current: VersionDto;
  } | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    fetchVersions(documentId)
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setSelected(page.items[1]?.revision ?? page.items[0]?.revision ?? null);
      })
      .catch(
        (e: unknown) =>
          active &&
          setError(e instanceof Error ? e.message : 'History is unavailable.'),
      );
    return () => {
      active = false;
    };
  }, [documentId, open, currentRevision]);
  useEffect(() => {
    if (!open || selected === null) return;
    let active = true;
    Promise.all([
      fetchVersion(documentId, selected),
      fetchVersion(documentId, currentRevision),
    ])
      .then(([version, current]) => active && setPreview({ version, current }))
      .catch(
        (e: unknown) =>
          active &&
          setError(
            e instanceof Error ? e.message : 'This revision is unavailable.',
          ),
      );
    return () => {
      active = false;
    };
  }, [currentRevision, documentId, open, selected]);
  const shown =
    preview && preview.version.revision === selected ? preview : null;
  const lines = shown
    ? shown.version.revision === currentRevision
      ? texts(shown.version).map((text) => ({ op: 'same' as const, text }))
      : diffBlocks(texts(shown.version), texts(shown.current))
    : [];
  const isCurrent = selected === currentRevision;
  const disabled = isCurrent || !canRestore || busy || selected === null;
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        setConfirm(false);
        onOpenChange(next);
      }}
    >
      <ModalContent className="flex h-[min(600px,calc(100vh-48px))] w-[min(920px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl">
        <div className="flex items-start px-5 pt-[18px] pb-3.5">
          <div className="flex-1">
            <ModalTitle className="text-base font-semibold">
              Version history
            </ModalTitle>
            <ModalDescription className="mt-0.5 text-ctl text-tx2">
              Immutable revisions of “{title}”. Restoring creates a new
              revision.
            </ModalDescription>
          </div>
          <ModalClose
            aria-label="Close"
            className="grid size-7 place-items-center rounded-md text-tx2 hover:bg-hov hover:text-tx"
          >
            <X aria-hidden="true" className="size-4" />
          </ModalClose>
        </div>
        <div className="flex min-h-0 flex-1 gap-3 px-4 pb-4 max-sm:flex-col">
          <div className="flex w-[290px] shrink-0 flex-col overflow-hidden rounded-xl border border-bd2 bg-canvas max-sm:max-h-[42%] max-sm:w-full">
            {error ? (
              <p role="alert" className="p-3 text-ctl text-danger">
                {error}
              </p>
            ) : !items.length ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-5 text-center">
                <FileClock aria-hidden="true" className="size-6 text-tx3" />
                <span className="font-medium">Loading revisions…</span>
              </div>
            ) : (
              <div
                role="listbox"
                aria-label="Versions"
                className="flex-1 overflow-auto p-2"
              >
                {items.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    role="option"
                    aria-selected={v.revision === selected}
                    onClick={() => {
                      setSelected(v.revision);
                      setConfirm(false);
                    }}
                    className={cn(
                      'flex w-full gap-2.5 rounded-[7px] p-2 text-left hover:bg-hov',
                      v.revision === selected && 'bg-hov',
                    )}
                  >
                    <span className="flex flex-col items-center pt-[5px]">
                      <span
                        className={cn(
                          'size-2 rounded-full border-[1.5px]',
                          v.revision === currentRevision
                            ? 'border-ac'
                            : 'border-tx3',
                          v.revision === selected && 'bg-tx3',
                        )}
                      />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-ctl font-medium">
                        Revision {v.revision}
                        {v.revision === currentRevision ? ' · current' : ''}
                      </span>
                      <span className="truncate text-[11.5px] text-tx3">
                        {v.changeSummary ?? sourceLabels[v.source]}
                      </span>
                      <span className="text-[11.5px] text-tx3">
                        {v.author?.name ?? 'Former participant'} ·{' '}
                        {when(v.createdAt)}
                      </span>
                    </span>
                  </button>
                ))}
                {cursor ? (
                  <button
                    type="button"
                    className="mt-1 w-full rounded-md p-2 text-ctl text-tx2 hover:bg-hov"
                    onClick={() =>
                      void fetchVersions(documentId, cursor).then((page) => {
                        setItems((prev) => [...prev, ...page.items]);
                        setCursor(page.nextCursor);
                      })
                    }
                  >
                    Load older revisions
                  </button>
                ) : null}
              </div>
            )}
            <div className="border-t border-bd2 p-2.5">
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (!confirm) {
                    setConfirm(true);
                    return;
                  }
                  setConfirm(false);
                  setBusy(true);
                  void onRestore(selected!).finally(() => setBusy(false));
                }}
                className={cn(
                  'flex h-[34px] w-full items-center justify-center gap-[7px] rounded-lg text-ctl font-medium',
                  disabled
                    ? 'bg-el text-tx3'
                    : confirm
                      ? 'border border-danger bg-dangers text-danger'
                      : 'bg-acb text-white hover:bg-acbh',
                )}
              >
                <RotateCcw aria-hidden="true" className="size-[13px]" />
                {isCurrent
                  ? 'Current version'
                  : !canRestore
                    ? 'View only'
                    : confirm
                      ? 'Confirm restore'
                      : 'Restore this version'}
              </button>
              {confirm && !disabled ? (
                <p
                  role="alert"
                  className="mt-2 text-[11.5px] leading-[1.45] text-warn"
                >
                  Restoring creates revision {currentRevision + 1} with this
                  content. Every existing revision stays in history. Click again
                  to confirm.
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-bd2 bg-canvas">
            {!shown ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-tx2">
                <FileSearch aria-hidden="true" className="size-7 text-tx3" />
                Select a version to preview
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b border-bd2 px-3.5 py-2.5 text-ctl">
                  <span className="font-medium">
                    Revision {shown.version.revision}
                  </span>
                  <span className="text-tx3">
                    {shown.version.author?.name ?? 'Former participant'} ·{' '}
                    {when(shown.version.createdAt)}
                  </span>
                  <span className="flex-1" />
                  {isCurrent ? null : (
                    <span className="flex items-center gap-[5px] text-[11.5px] text-tx2">
                      Compared with current:
                      <span className="size-2 rounded-[2px] border border-actx bg-acs" />
                      Added
                      <span className="ml-1.5 size-2 rounded-[2px] border border-danger bg-dangers" />
                      Removed
                    </span>
                  )}
                </div>
                <div
                  className="flex-1 overflow-auto px-7 py-[22px]"
                  aria-label={`Revision ${shown.version.revision} preview`}
                >
                  <div className="mb-3 font-serif text-[26px] font-medium">
                    {title}
                  </div>
                  {lines.map((line, i) => (
                    <p
                      key={i}
                      className={cn(
                        'mb-2 rounded-[2px] font-read text-[14.5px] leading-[1.75]',
                        line.op === 'added' && 'bg-acs text-actx',
                        line.op === 'removed' &&
                          'bg-dangers text-danger line-through',
                        line.op === 'same' && 'text-tx2',
                      )}
                    >
                      {line.op === 'added' ? (
                        <span className="sr-only">Added in current: </span>
                      ) : null}
                      {line.op === 'removed' ? (
                        <span className="sr-only">Only in this revision: </span>
                      ) : null}
                      {line.text}
                    </p>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
