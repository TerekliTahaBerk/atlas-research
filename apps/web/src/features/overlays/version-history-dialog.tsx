'use client';
import { useState } from 'react';
import { Bookmark, FileClock, FileSearch, RotateCcw, X } from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import { Avatar } from '@/components/atlas/chips';
import {
  Modal,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalTitle,
} from '@/components/atlas/overlay';
import { useToast } from '@/components/atlas/toast';
import { codeDiff } from '@/lib/preview/manuscript';
import { people } from '@/lib/preview/people';
import { versions } from '@/lib/preview/workspace';
const prose = (v: number) =>
  [
    [
      'Pair representations are the dominant memory cost in modern structure prediction. ',
      '',
    ],
    ['Every Evoformer block updates an L × L grid', ''],
    [', which is expensive', v === 1 ? '' : 'del'],
    [
      ', so memory grows quadratically with sequence length.',
      v === 1 ? '' : 'add',
    ],
    [
      ' Two families of fixes exist. Low-rank methods compress the grid itself; sparse methods keep the grid but restrict which entries attend. ',
      '',
    ],
    [
      'Learned sparsity is a promising direction that several groups have started to explore. ',
      'del',
    ],
    [
      'Learned sparsity sits between the two: the mask is trained end-to-end.',
      'add',
    ],
  ] as const;
/**
 * Version history (handoff `VersionHistoryDialog`, 920×600). Restore asks
 * for confirmation and, in this preview, never replaces content.
 */
export function VersionHistoryDialog({
  open,
  onOpenChange,
  title,
  kind = 'prose',
  empty = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  kind?: 'prose' | 'code';
  empty?: boolean;
}) {
  const flash = useToast();
  const [selected, setSelected] = useState(2);
  const [confirm, setConfirm] = useState(false);
  const current = versions.find((v) => v.id === selected) ?? versions[1];
  const isCurrent = selected === 1;
  const disabled = isCurrent || empty;
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
              View and restore earlier versions of “{title}” · sample history
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
            {empty ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-5 text-center">
                <FileClock aria-hidden="true" className="size-6 text-tx3" />
                <span className="font-medium">No versions yet</span>
                <span className="text-xs text-tx3">
                  No saved versions in this sample. Local edits are not saved.
                </span>
              </div>
            ) : (
              <div
                role="listbox"
                aria-label="Versions"
                className="flex-1 overflow-auto p-2"
              >
                {versions.map((v, i) => {
                  const header = i === 0 || versions[i - 1]?.group !== v.group;
                  const person = people[v.who];
                  return (
                    <div key={v.id}>
                      {header ? (
                        <div className="px-2 pt-2.5 pb-1 text-[11px] text-tx3">
                          {v.group}
                        </div>
                      ) : null}
                      <button
                        type="button"
                        role="option"
                        aria-selected={v.id === selected}
                        onClick={() => {
                          setSelected(v.id);
                          setConfirm(false);
                        }}
                        className={cn(
                          'flex w-full gap-2.5 rounded-[7px] p-2 text-left hover:bg-hov',
                          v.id === selected && 'bg-hov',
                        )}
                      >
                        <span className="flex flex-col items-center pt-[5px]">
                          <span
                            className={cn(
                              'size-2 rounded-full border-[1.5px]',
                              v.id === 1 ? 'border-ac' : 'border-tx3',
                              v.id === selected && 'bg-tx3',
                            )}
                          />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-ctl font-medium">
                            {v.label}
                          </span>
                          <span className="flex items-center gap-1.5 text-[11.5px] text-tx3">
                            <Avatar person={person} size={14} />
                            {person.short} · {v.time}
                          </span>
                        </span>
                        {v.named ? (
                          <Bookmark
                            aria-label="Named version"
                            className="size-3 text-tx3"
                          />
                        ) : null}
                      </button>
                    </div>
                  );
                })}
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
                  onOpenChange(false);
                  flash(
                    'Restore is a preview — the current content was not replaced',
                  );
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
                  : confirm
                    ? 'Confirm restore'
                    : 'Restore this version'}
              </button>
              {confirm && !disabled ? (
                <p
                  role="alert"
                  className="mt-2 text-[11.5px] leading-[1.45] text-warn"
                >
                  Restoring replaces the current content. Your current version
                  stays in history. Click again to confirm.
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-bd2 bg-canvas">
            {empty ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-tx2">
                <FileSearch aria-hidden="true" className="size-7 text-tx3" />
                Select a version to preview
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b border-bd2 px-3.5 py-2.5 text-ctl">
                  <span className="font-medium">{current?.label}</span>
                  <span className="text-tx3">
                    {current
                      ? `${people[current.who].name} · ${current.time}, ${current.group}`
                      : ''}
                  </span>
                  <span className="flex-1" />
                  <span className="flex items-center gap-[5px] text-[11.5px] text-tx2">
                    <span className="size-2 rounded-[2px] border border-actx bg-acs" />
                    Added
                    <span className="ml-1.5 size-2 rounded-[2px] border border-danger bg-dangers" />
                    Removed
                  </span>
                </div>
                <div className="flex-1 overflow-auto px-7 py-[22px]">
                  {kind === 'prose' ? (
                    <>
                      <div className="mb-3 font-serif text-[26px] font-medium">
                        {title}
                      </div>
                      <p className="font-read text-[14.5px] leading-[1.75]">
                        {prose(selected).map(([text, k], i) => (
                          <span
                            key={i}
                            className={cn(
                              'rounded-[2px]',
                              k === 'add' && 'bg-acs text-actx',
                              k === 'del' &&
                                'bg-dangers text-danger line-through',
                              !k && 'text-tx2',
                            )}
                          >
                            {k === 'add' ? (
                              <span className="sr-only">Added: </span>
                            ) : null}
                            {k === 'del' ? (
                              <span className="sr-only">Removed: </span>
                            ) : null}
                            {text}
                          </span>
                        ))}
                      </p>
                    </>
                  ) : (
                    <div className="font-mono text-ctl leading-[22px]">
                      {codeDiff.map((d, i) => (
                        <div
                          key={i}
                          className={cn(
                            'flex gap-3 rounded-[3px] px-2',
                            d.kind === 'add' && 'bg-acs text-actx',
                            d.kind === 'del' && 'bg-dangers text-danger',
                            !d.kind && 'text-[var(--syn-t)]',
                          )}
                        >
                          <span className="w-6 text-right text-tx3">{d.n}</span>
                          <span className="w-2.5">{d.mark}</span>
                          <span className="whitespace-pre">{d.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
