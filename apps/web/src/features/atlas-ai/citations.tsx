'use client';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, BookOpen } from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/atlas/overlay';
import { moduleHref } from '@/features/shell/navigation';
import { paperById, type PaperId } from '@/lib/preview/research';
import { usePreviewStore } from '@/features/shell/preview-store';
/** Opens the reader on the cited passage (sample source verification). */
export function useOpenSource() {
  const router = useRouter();
  return (paper: PaperId) =>
    router.push(moduleHref('reader', `paper=${paper}&cite=1`));
}
/** Hover preview for a cited paper (handoff "hover quick preview"). */
export function PaperHoverCard({
  paper,
  children,
}: {
  paper: PaperId;
  children: ReactNode;
}) {
  const p = paperById(paper);
  const { saved } = usePreviewStore();
  return (
    <HoverCard openDelay={220} closeDelay={80}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent>
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-tx3">
          <BookOpen aria-hidden="true" className="size-[11px]" />
          {p.venue}
          <span className="flex-1" />
          {saved.includes(p.id) ? 'In your library' : 'Not in library'}
        </div>
        <div className="mb-1 font-serif text-[17px] leading-[1.2]">
          {p.title}
        </div>
        <div className="mb-2 text-[11.5px] text-tx2">{p.authors}</div>
        <p className="line-clamp-3 text-xs leading-normal text-tx2">
          {p.abstract}
        </p>
        <div className="mt-[9px] flex items-center gap-2.5 border-t border-bd2 pt-2 text-[11px] text-tx3">
          <span>Cited by {p.citedBy} · sample</span>
          <span className="flex-1" />
          <span className="text-actx">Click to open the cited passage</span>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
/** Author–year citation chip used inside prose (handoff `CitationChip`). */
export function CitationChip({
  paper,
  className,
}: {
  paper: PaperId;
  className?: string;
}) {
  const open = useOpenSource();
  const p = paperById(paper);
  return (
    <PaperHoverCard paper={paper}>
      <button
        type="button"
        onClick={() => open(paper)}
        className={cn(
          'cursor-pointer whitespace-nowrap rounded-xs bg-acs px-1.5 py-px align-baseline font-sans text-xs text-actx hover:bg-aiin',
          className,
        )}
      >
        {p.short}
      </button>
    </PaperHoverCard>
  );
}
/** Numbered inline citation in an answer (handoff `[n]` pill). */
export function CitePill({ paper, n }: { paper: PaperId; n: number }) {
  const open = useOpenSource();
  return (
    <PaperHoverCard paper={paper}>
      <button
        type="button"
        onClick={() => open(paper)}
        aria-label={`Source ${n}: ${paperById(paper).short} — open cited passage`}
        className="mx-px ml-[3px] inline-grid h-4 min-w-4 place-items-center rounded-xs bg-acs px-1 align-[2px] font-mono text-[10px] leading-none text-actx hover:bg-aiin"
      >
        {n}
      </button>
    </PaperHoverCard>
  );
}
/** Source reference under an answer (handoff `SourcePill`). */
export function SourcePill({ paper, n }: { paper: PaperId; n: number }) {
  const open = useOpenSource();
  return (
    <PaperHoverCard paper={paper}>
      <button
        type="button"
        onClick={() => open(paper)}
        className="inline-flex h-[22px] items-center gap-[5px] rounded-sm border border-bd px-[7px] text-[11.5px] text-tx2 hover:bg-hov hover:text-tx"
      >
        <span className="font-mono text-[10px] text-actx">[{n}]</span>
        {paperById(paper).short}
        <ArrowUpRight aria-hidden="true" className="size-[10px] text-tx3" />
      </button>
    </PaperHoverCard>
  );
}
