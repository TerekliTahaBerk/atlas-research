import { Highlighter, Quote, Sparkles, StickyNote } from 'lucide-react';
import React from 'react';
import { Icon } from '../../components/Icon';
import { highlightedSentence, papers } from '../../data/demoResearch';
import { mix } from '../../design/motion';
import { color, shadow } from '../../design/tokens';
import { font } from '../../design/typography';

export type PageState = { select?: number; annotate?: number; menu?: number; askPress?: number; lifted?: number };

/** Vertical offset (in units of q = width/100) of the highlighted sentence's first line. */
export const SENTENCE_TOP_Q = 8 + 2.25 + 3 + 3.3 + 1.4 + 5.75 + 1.6;

/**
 * Page 3 of the demo paper (reference reader page: white, Lora, cqw-scaled
 * type). Rendered standalone so it can be a hero object in screen space.
 */
export const PaperPage: React.FC<{ width: number; s?: PageState; style?: React.CSSProperties }> = ({ width, s = {}, style }) => {
  const q = width / 100;
  const select = s.select ?? 0;
  const annotate = s.annotate ?? 0;
  const lifted = s.lifted ?? 0;
  const sel = `rgba(108,121,224,${0.3 * (1 - annotate)})`;
  const hl = `rgba(201,164,72,${0.32 * annotate})`;
  const p: React.CSSProperties = { fontSize: 1.85 * q, lineHeight: 1.55, margin: `0 0 ${1.6 * q}px`, hyphens: 'auto' };
  const paper = papers[0];
  return (
    <div
      style={{
        width,
        aspectRatio: '8.5/11',
        background: '#fff',
        color: '#1b1b1b',
        borderRadius: 4,
        boxShadow: shadow.page,
        padding: `${8 * q}px ${9 * q}px`,
        fontFamily: font.paper,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 1.5 * q, color: '#777', marginBottom: 3 * q }}>
        <span>{paper?.title}</span>
        <span>3</span>
      </div>
      <div style={{ fontSize: 2.2 * q, fontWeight: 600, marginBottom: 1.4 * q }}>3&#160;&#160;&#160;Low-rank pair updates</div>
      <p style={p}>
        The pair representation <i>z</i> is the largest activation in the network. We replace each triangular update with a rank-<i>r</i> factorization,
        so that memory scales as <i>O</i>(<i>Lrc</i>) rather than <i>O</i>(<i>L</i>
        <sup>2</sup>
        <i>c</i>).
      </p>
      <p style={{ ...p, position: 'relative' }}>
        <span
          style={{
            backgroundImage: `linear-gradient(${annotate > 0 ? hl : sel}, ${annotate > 0 ? hl : sel})`,
            backgroundRepeat: 'no-repeat',
            backgroundSize: `${select * 100}% 100%`,
            borderRadius: 0.3 * q,
            opacity: mix(1, 0.35, lifted),
          }}
        >
          {highlightedSentence}
        </span>
        , while lDDT drops by 1.2 points on average across long targets. All measurements use batch size 1 and bfloat16 activations.
        {(s.menu ?? 0) > 0.01 ? (
          <span
            style={{
              position: 'absolute',
              left: '14%',
              top: -5.4 * q,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              padding: 4,
              borderRadius: 8,
              background: color.pop,
              color: color.tx,
              border: `1px solid ${color.bd}`,
              boxShadow: shadow.pop,
              fontFamily: font.sans,
              fontSize: Math.max(12, 1.3 * q),
              whiteSpace: 'nowrap',
              opacity: s.menu,
              transform: `translateY(${(1 - (s.menu ?? 0)) * -4}px)`,
              zIndex: 2,
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                height: '2.2em',
                padding: '0 0.7em',
                borderRadius: 6,
                color: color.actx,
                fontWeight: 500,
                background: (s.askPress ?? 0) > 0 ? `rgba(91,141,239,${0.25 * Math.sin(Math.PI * Math.min(1, s.askPress ?? 0))})` : 'transparent',
              }}
            >
              <Icon icon={Sparkles} size={13} tint={color.actx} />
              Ask Atlas
            </span>
            <span style={{ width: 1, height: 16, background: color.bd }} />
            {[
              [Highlighter, 'Highlight'],
              [StickyNote, 'Note'],
              [Quote, 'Cite'],
            ].map(([I, l]) => (
              <span key={l as string} style={{ display: 'flex', alignItems: 'center', gap: 5, height: '2.2em', padding: '0 0.7em' }}>
                <Icon icon={I as typeof Quote} size={13} tint={color.tx} />
                {l as string}
              </span>
            ))}
          </span>
        ) : null}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', fontSize: 1.95 * q, margin: `${2 * q}px 0` }}>
        <span style={{ flex: 1, textAlign: 'center', fontStyle: 'italic' }}>
          z<sub style={{ fontSize: 1.2 * q }}>ij</sub> ≈ Σ<sub style={{ fontSize: 1.2 * q }}>k≤r</sub> a<sub style={{ fontSize: 1.2 * q }}>ik</sub> b
          <sub style={{ fontSize: 1.2 * q }}>jk</sub>
        </span>
        <span style={{ fontSize: 1.8 * q }}>(4)</span>
      </div>
      <p style={p}>
        Table 2 reports results across rank. Below r = 16 the long-range contact precision degrades sharply, consistent with the intuition that distant
        couplings are not low-rank in general.
      </p>
      <div style={{ borderTop: `${0.2 * q}px solid #222`, borderBottom: `${0.2 * q}px solid #222`, margin: `${2 * q}px 0 ${q}px`, fontSize: 1.6 * q }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: `${0.8 * q}px 0`, borderBottom: `${0.1 * q}px solid #999`, fontWeight: 600 }}>
          <span>Rank r</span>
          <span>Memory (GB)</span>
          <span>lDDT</span>
          <span>P@L (long)</span>
        </div>
        {[
          ['8', '11.2', '0.761', '0.52'],
          ['16', '14.0', '0.788', '0.61'],
          ['32', '19.1', '0.801', '0.66'],
        ].map((r) => (
          <div key={r[0]} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: `${0.5 * q}px 0`, background: r[0] === '32' ? `rgba(201,164,72,${0.18 * annotate})` : undefined }}>
            {r.map((c, i) => (
              <span key={i}>{c}</span>
            ))}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 1.55 * q, textAlign: 'center', color: '#444' }}>Table 2: Effect of rank on memory and accuracy.</div>
    </div>
  );
};
