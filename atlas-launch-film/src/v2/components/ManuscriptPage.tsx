import React from 'react';
import { people } from '../../data/demoResearch';
import { shadow } from '../../design/tokens';
import { font } from '../../design/typography';

/**
 * Page 3 of the Sparse Evoformer manuscript preview (reference `tx` PDF
 * pane), standalone so it can lift out as the film's written result.
 */
export const ManuscriptPage: React.FC<{ width: number; highlight?: number; style?: React.CSSProperties }> = ({ width, highlight = 0, style }) => {
  const q = width / 100;
  return (
    <div
      style={{
        width,
        aspectRatio: '8.5/11',
        background: '#fff',
        color: '#1b1b1b',
        borderRadius: 4,
        boxShadow: shadow.page,
        padding: `${6 * q}px ${7 * q}px`,
        fontFamily: font.paper,
        overflow: 'hidden',
        ...style,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 1.5 * q, color: '#777', marginBottom: 3 * q }}>
        <span>Sparse Evoformer · {people.elif.name.split(' ')[1]}, {people.nora.name.split(' ')[1]}, {people.mehmet.name.split(' ')[1]}</span>
        <span>3</span>
      </div>
      <div style={{ fontSize: 2.52 * q, fontWeight: 600, marginBottom: 1.2 * q }}>3&#160;&#160;&#160;Method</div>
      <div style={{ fontSize: 2.1 * q, lineHeight: 1.5, marginBottom: 1.6 * q }}>
        Given queries <i>Q</i> and keys <i>K</i>, we compute
      </div>
      <div style={{ display: 'flex', alignItems: 'center', fontSize: 2.4 * q, marginBottom: 1.6 * q }}>
        <span style={{ flex: 1, textAlign: 'center', fontStyle: 'italic' }}>A = softmax( QK / √d ⊙ M ) V</span>
        <span style={{ fontSize: 2.1 * q }}>(1)</span>
      </div>
      <div style={{ fontSize: 2.1 * q, lineHeight: 1.5, marginBottom: 2.2 * q }}>
        where <i>M</i> is a learned block mask over residue pairs. Masks are shared across heads within a block.
      </div>
      <div style={{ fontSize: 2.3 * q, fontWeight: 600, marginBottom: 1 * q }}>3.1&#160;&#160;&#160;Comparison with low-rank pairs</div>
      <div
        style={{
          fontSize: 2.1 * q,
          lineHeight: 1.5,
          borderRadius: 0.6 * q,
          padding: 0.6 * q,
          margin: `${-0.6 * q}px ${-0.6 * q}px ${2 * q}px`,
          background: `rgba(91,141,239,${0.16 * highlight})`,
        }}
      >
        Low-rank factorization reduces peak memory from 61 GB to 19 GB at <i>r</i> = 32 [2], at a cost of 1.2 lDDT on long targets. Our learned
        mask recovers most of that accuracy at comparable memory.
      </div>
      <div style={{ border: `${0.15 * q}px solid #d6d6d6`, height: 17 * q, display: 'grid', placeItems: 'center', color: '#888', fontSize: 1.92 * q, fontFamily: font.sans, marginBottom: q }}>
        figures/sweep.pdf
      </div>
      <div style={{ fontSize: 1.92 * q, textAlign: 'center', color: '#333', marginBottom: 2.4 * q }}>Figure 1: lDDT and peak memory across block sizes 16–128.</div>
      <div style={{ borderTop: `${0.1 * q}px solid #bbb`, paddingTop: 1.2 * q, fontSize: 1.6 * q, color: '#555', lineHeight: 1.45 }}>
        [2] L. Chen and M. Duarte. Efficient Structure Prediction via Low-Rank Pair Representations. ICML, 2023.
      </div>
    </div>
  );
};
