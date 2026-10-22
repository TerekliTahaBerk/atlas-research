'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, CircleCheck, FileCode, X } from 'lucide-react';
import { Btn, IconBtn } from '@/components/atlas/button';
import { Avatar } from '@/components/atlas/chips';
import { Segmented } from '@/components/atlas/segmented';
import { moduleHref } from '@/features/shell/navigation';
import { TaskStatusIcon } from '@/features/tasks/task-icons';
import { people } from '@/lib/preview/people';
import { papers } from '@/lib/preview/research';
import { tasks } from '@/lib/preview/workspace';
export type RailTab = 'comments' | 'related' | 'linked';
/** Right rail: comments, cited papers and linked work (300px). */
export function DocumentRail({
  tab,
  onTab,
  onClose,
  resolved,
  onResolve,
}: {
  tab: RailTab;
  onTab: (tab: RailTab) => void;
  onClose: () => void;
  resolved: boolean;
  onResolve: () => void;
}) {
  const [showResolved, setShowResolved] = useState(false);
  const [reply, setReply] = useState('');
  const resolvedList = [
    ...(resolved
      ? [
          {
            who: 'Ayşe Demir',
            quote: '…no longer fit at batch size one',
            meta: 'Resolved by Taha · now',
          },
        ]
      : []),
    {
      who: 'Mehmet Kaya',
      quote: '2.8× memory above 1,024 residues',
      meta: 'Resolved by Taha · yesterday',
    },
    {
      who: 'Taha Berk Terekli',
      quote: 'Open questions for the lab',
      meta: 'Resolved by Ayşe · Oct 19',
    },
  ];
  return (
    <aside
      aria-label="Comments and links"
      className="flex w-[300px] shrink-0 flex-col border-l border-bd2 max-[900px]:absolute max-[900px]:inset-y-0 max-[900px]:right-0 max-[900px]:z-20 max-[900px]:bg-canvas max-[900px]:shadow-pop"
    >
      <div className="flex items-center gap-0.5 border-b border-bd2 px-2.5 py-2">
        <Segmented
          label="Rail view"
          variant="plain"
          value={tab}
          onChange={onTab}
          options={[
            { value: 'comments', label: 'Comments' },
            { value: 'related', label: 'Papers' },
            { value: 'linked', label: 'Linked' },
          ]}
        />
        <span className="flex-1" />
        <IconBtn label="Close rail" size="base" tone="muted" onClick={onClose}>
          <X aria-hidden="true" className="size-[14px]" />
        </IconBtn>
      </div>
      <div className="flex-1 overflow-auto p-3">
        {tab === 'comments' ? (
          <>
            {!resolved ? (
              <article
                aria-label="Comment thread"
                className="mb-2.5 rounded-lg border border-bd2 bg-card p-2.5"
              >
                <blockquote className="mb-2 border-b border-bd2 pb-2 font-read text-ctl text-tx3 italic">
                  “…no longer fit at batch size one”
                </blockquote>
                <div className="mb-1 flex items-center gap-2">
                  <Avatar person={people.ayse} size={20} />
                  <span className="text-ctl font-medium">Ayşe Demir</span>
                  <span className="text-[11px] text-tx3">14m</span>
                </div>
                <p className="mb-2 text-ctl text-tx2">
                  <span className="text-actx">@Taha</span> can we cite the
                  low-rank paper here too? Reviewers will ask.
                </p>
                <div className="mb-1 flex items-center gap-2">
                  <Avatar person={people.taha} size={20} />
                  <span className="text-ctl font-medium">Taha</span>
                  <span className="text-[11px] text-tx3">2m</span>
                </div>
                <p className="text-ctl text-tx2">
                  Added in ¶1 — Chen &amp; Duarte.
                </p>
                <div className="mt-2.5 flex gap-1.5">
                  <label className="sr-only" htmlFor="comment-reply">
                    Reply to thread
                  </label>
                  <input
                    id="comment-reply"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Reply…"
                    className="h-7 min-w-0 flex-1 rounded-md border border-bd bg-canvas px-[9px] text-ctl"
                  />
                  <Btn
                    variant="outline"
                    size="base"
                    className="text-xs text-tx2"
                    onClick={onResolve}
                  >
                    <CircleCheck aria-hidden="true" className="!size-3" />
                    Resolve
                  </Btn>
                </div>
              </article>
            ) : (
              <p className="px-2 py-[18px] text-center text-ctl text-tx3">
                No open comments.
              </p>
            )}
            <button
              type="button"
              aria-expanded={showResolved}
              onClick={() => setShowResolved((s) => !s)}
              className="flex h-7 w-full items-center gap-1.5 px-1 text-xs text-tx3 hover:text-tx2"
            >
              <CircleCheck aria-hidden="true" className="size-3" />
              Resolved · {resolvedList.length}
              <span className="flex-1" />
              {showResolved ? (
                <ChevronUp aria-hidden="true" className="size-3" />
              ) : (
                <ChevronDown aria-hidden="true" className="size-3" />
              )}
            </button>
            {showResolved
              ? resolvedList.map((r) => (
                  <div
                    key={r.quote}
                    className="mt-1.5 animate-atlas-rise rounded-lg border border-bd2 px-2.5 py-2 opacity-80"
                  >
                    <div className="mb-1 font-read text-xs text-tx3 italic">
                      “{r.quote}”
                    </div>
                    <div className="text-[11.5px] text-tx2">
                      {r.who} · <span className="text-tx3">{r.meta}</span>
                    </div>
                  </div>
                ))
              : null}
            <p className="mt-3 px-1 text-[11px] text-tx3">
              Sample thread · replies are not sent.
            </p>
          </>
        ) : null}
        {tab === 'related' ? (
          <>
            <h3 className="mb-2 text-[11.5px] text-tx3">
              Papers cited in this note
            </h3>
            {papers
              .filter((p) => ['p1', 'p2', 'p5'].includes(p.id))
              .map((p) => (
                <Link
                  key={p.id}
                  href={moduleHref('library', `paper=${p.id}`)}
                  className="mb-2 block rounded-lg border border-bd2 px-2.5 py-[9px] hover:bg-card"
                >
                  <div className="mb-[3px] font-serif text-[15px] leading-[1.25]">
                    {p.title}
                  </div>
                  <div className="text-[11.5px] text-tx3">
                    {p.short} · {p.venue}
                  </div>
                </Link>
              ))}
            <h3 className="mt-3.5 mb-2 text-[11.5px] text-tx3">
              Suggested by Atlas · sample
            </h3>
            <div className="rounded-lg border border-dashed border-bd px-2.5 py-[9px] text-xs text-tx2">
              Benchmarking Attention Sparsity in Protein Language Models — not
              yet cited
            </div>
          </>
        ) : null}
        {tab === 'linked' ? (
          <>
            {tasks
              .filter((t) => ['ATL-22', 'ATL-27'].includes(t.id))
              .map((t) => (
                <Link
                  key={t.id}
                  href={moduleHref('tasks', `task=${t.id}`)}
                  className="mb-2 flex items-center gap-2 rounded-lg border border-bd2 px-2.5 py-[9px] hover:bg-card"
                >
                  <TaskStatusIcon status={t.status} className="size-[13px]" />
                  <span className="font-mono text-[11px] text-tx3">{t.id}</span>
                  <span className="min-w-0 flex-1 truncate text-ctl">
                    {t.title}
                  </span>
                </Link>
              ))}
            <Link
              href={moduleHref('manuscripts')}
              className="flex items-center gap-2 rounded-lg border border-bd2 px-2.5 py-[9px] hover:bg-card"
            >
              <FileCode aria-hidden="true" className="size-[13px] text-tx3" />
              <span className="text-ctl">main.tex · §2 Related work</span>
            </Link>
          </>
        ) : null}
      </div>
    </aside>
  );
}
