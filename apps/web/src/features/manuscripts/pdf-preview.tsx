'use client';
import type { ReactNode } from 'react';
import { cn } from '@atlas/ui/lib/utils';
import type { PdfBlock } from '@/lib/preview/manuscript';
/**
 * Illustrated sample PDF page (not a compiled document). Paragraph blocks
 * are clickable for the SyncTeX-style preview → source jump.
 */
export function PdfPreview({
  page,
  widthPct,
  highlight,
  onBlock,
  dimmed,
}: {
  page: number;
  widthPct: number;
  highlight: PdfBlock | null;
  onBlock: (block: PdfBlock) => void;
  dimmed?: boolean;
}) {
  if (page !== 1)
    return (
      <div
        className="pdf-page mx-auto grid place-items-center text-center font-sans"
        style={{ width: `${widthPct}%` }}
      >
        <p className="px-[10cqw] text-[1.9cqw] text-[#5c5b55]">
          Page {page} of the sample PDF is not included in this preview.
          <br />
          Only page 1 is illustrated; nothing has been compiled.
        </p>
      </div>
    );
  const on = { highlight, onBlock };
  return (
    <div
      aria-label="Sample PDF preview, page 1"
      role="document"
      className={cn(
        'pdf-page mx-auto transition-opacity',
        dimmed && 'opacity-55',
      )}
      style={{ width: `${widthPct}%` }}
    >
      <div className="px-[10cqw] py-[9cqw]">
        <Block on={on} id="title" className="mb-[2.4cqw] text-center">
          <span className="mb-[2.2cqw] block text-[3.1cqw] leading-[1.25] font-semibold">
            Sparse Evoformer: Learned Block Sparsity for Memory-Efficient
            Structure Prediction
          </span>
          <span className="mb-[0.6cqw] block text-[1.9cqw]">
            Taha Berk Terekli &nbsp; Ayşe Demir &nbsp; Mehmet Kaya
          </span>
          <span className="mb-[1.2cqw] block text-[1.6cqw] text-[#555]">
            Kaya Lab, Department of Computational Biology
          </span>
          <span className="block text-[1.7cqw]">October 22, 2026</span>
        </Block>
        <Block on={on} id="abs" className="mb-[2.4cqw]">
          <span className="mb-[1cqw] block text-center text-[1.75cqw] font-semibold">
            Abstract
          </span>
          <span className="mx-[5cqw] block text-justify text-[1.65cqw] leading-[1.5] hyphens-auto">
            Pair representations dominate the memory cost of structure
            prediction. We introduce{' '}
            <span className="[font-variant:small-caps]">SparseEvo</span>, which
            learns block-sparse attention masks over residue pairs, reducing
            peak memory by 2.4× at a 0.6 point lDDT cost on long targets.
          </span>
        </Block>
        <div className="mb-[1.2cqw] text-[2.1cqw] font-semibold">
          1&nbsp;&nbsp;&nbsp;Introduction
        </div>
        <Block
          on={on}
          id="intro1"
          className="mb-[0.8cqw] text-justify text-[1.75cqw] leading-[1.5] hyphens-auto"
        >
          Protein structure prediction models spend most of their memory on the
          pair representation, which grows quadratically with sequence length
          [1]. For targets beyond 1,024 residues this limits batch size to one
          on a single accelerator.
        </Block>
        <Block
          on={on}
          id="intro2"
          className="mb-[1.8cqw] text-justify text-[1.75cqw] leading-[1.5] hyphens-auto"
        >
          Prior work reduces this cost either by factorizing the pair grid [1]
          or by fixing a sparse pattern [2]. We instead <i>learn</i> the
          pattern.
        </Block>
        <Block on={on} id="method" className="mb-[1.8cqw]">
          <span className="mb-[1.2cqw] block text-[2.1cqw] font-semibold">
            2&nbsp;&nbsp;&nbsp;Method
          </span>
          <span className="mb-[1.6cqw] block text-justify text-[1.75cqw] leading-[1.5]">
            Given queries <i>Q</i> and keys <i>K</i>, we compute
          </span>
          <span className="mb-[1.6cqw] flex items-center text-[2cqw]">
            <span className="flex-1 text-center italic">
              𝒜 = softmax( QK<sup className="text-[1.2cqw]">⊤</sup> / √d ⊙ M ) V
            </span>
            <span className="text-[1.75cqw]">(1)</span>
          </span>
          <span className="block text-justify text-[1.75cqw] leading-[1.5]">
            where <i>M</i> is a learned block mask [2]. As shown by{' '}
            <b className="text-[#b3261e]">??</b>, routing improves recall.
          </span>
        </Block>
        <div className="mb-[1cqw] grid h-[16cqw] place-items-center border-[0.15cqw] border-[#d8d6cf] font-sans text-[1.6cqw] text-[#6b6a64]">
          figures/sweep.pdf
        </div>
        <div className="text-center text-[1.6cqw] text-[#333]">
          Figure 1: lDDT and peak memory across block sizes 16–128.
        </div>
      </div>
    </div>
  );
}
const labels: Record<PdfBlock, string> = {
  title: 'title block',
  abs: 'abstract',
  intro1: 'introduction, paragraph 1',
  intro2: 'introduction, paragraph 2',
  method: 'method section',
};

function Block({
  id,
  on,
  children,
  className,
}: {
  id: PdfBlock;
  on: { highlight: PdfBlock | null; onBlock: (block: PdfBlock) => void };
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => on.onBlock(id)}
      aria-label={`Jump to source for ${labels[id]}`}
      title="Click to jump to source"
      className={cn(
        '-m-[0.6cqw] block w-[calc(100%+1.2cqw)] cursor-pointer rounded-[0.6cqw] p-[0.6cqw] text-left transition-colors duration-200',
        on.highlight === id
          ? 'bg-[rgb(50_154_83/0.16)] outline-[0.25cqw] outline-[rgb(50_154_83/0.55)] outline-solid'
          : 'hover:bg-[rgb(0_0_0/0.04)]',
        className,
      )}
    >
      {children}
    </button>
  );
}
