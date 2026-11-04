import { ChevronLeft, ChevronRight, File, Highlighter, PanelRight, Quote, Search, Sparkles, StickyNote, ZoomIn, ZoomOut } from 'lucide-react';
import React from 'react';
import { highlightedSentence, papers } from '../data/demoResearch';
import { mix } from '../design/motion';
import { color, shadow } from '../design/tokens';
import { font } from '../design/typography';
import { Icon } from './Icon';
import { TopBar } from './TopBar';

export type ReaderState = {
  /** 0–1 selection sweep across the sentence. */
  select: number;
  /** 0–1 selection → saved highlight colour. */
  annotate: number;
  /** 0–1 selection popover visibility. */
  menu: number;
  /** 0–1 Ask Atlas button press. */
  askPress: number;
  /** PDF scroll in px. */
  scroll: number;
};

const swatches = ['#C9A448', '#6FA79E', '#8E9AC9', '#C47A8E'];

/** Paper reader (reference `is.reader`): PDF page, selection menu, side panel slot. */
export const PaperReader: React.FC<{ s: ReaderState; narrow: boolean; panel?: React.ReactNode }> = ({ s, narrow, panel }) => {
  const paper = papers[0];
  const pageW = narrow ? 540 : 700;
  const q = pageW / 100; // 1cqw in px
  const sel = `rgba(108,121,224,${0.3 * (1 - s.annotate)})`;
  const hl = `rgba(201,164,72,${0.3 * s.annotate})`;
  const p: React.CSSProperties = { fontSize: 1.85 * q, lineHeight: 1.55, margin: `0 0 ${1.6 * q}px`, hyphens: 'auto' };
  return (
    <>
      <TopBar
        tab={paper?.short ?? ''}
        tabIcon={File}
        border
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {narrow ? null : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', borderRadius: 8, background: color.el, width: 180 }}>
                <Icon icon={Search} size={12} tint={color.tx3} />
                <span style={{ fontSize: 12, color: color.tx3 }}>Search in PDF</span>
              </div>
            )}
            <span style={{ display: 'flex', gap: 4, padding: '0 6px' }}>
              {swatches.map((c, i) => (
                <span key={c} style={{ width: 16, height: 16, borderRadius: '50%', background: c, outline: i === 0 ? `1.5px solid ${color.tx2}` : undefined, outlineOffset: 2 }} />
              ))}
            </span>
            <Icon icon={ZoomOut} size={14} />
            <span style={{ fontSize: 12, width: 38, textAlign: 'center', color: color.tx2 }}>100%</span>
            <Icon icon={ZoomIn} size={14} />
            <Icon icon={PanelRight} size={15} style={{ marginLeft: 6 }} />
          </div>
        }
      />
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: color.pdfbg, overflow: 'hidden', position: 'relative' }}>
          <div style={{ flex: 1, padding: '24px 24px', transform: `translateY(${-s.scroll}px)` }}>
            <div
              style={{
                width: pageW,
                margin: '0 auto',
                aspectRatio: '8.5/11',
                background: '#fff',
                color: '#1b1b1b',
                borderRadius: 4,
                boxShadow: shadow.page,
                padding: `${8 * q}px ${9 * q}px`,
                fontFamily: font.paper,
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 1.5 * q, color: '#777', marginBottom: 3 * q }}>
                <span>{paper?.title}</span>
                <span>3</span>
              </div>
              <div style={{ fontSize: 2.2 * q, fontWeight: 600, marginBottom: 1.4 * q }}>3&#160;&#160;&#160;Low-rank pair updates</div>
              <p style={p}>
                The pair representation <i>z</i> is the largest activation in the network. We replace each triangular update with a rank-<i>r</i>{' '}
                factorization, so that memory scales as <i>O</i>(<i>Lrc</i>) rather than <i>O</i>(<i>L</i>
                <sup>2</sup>
                <i>c</i>).
              </p>
              <p style={{ ...p, position: 'relative' }}>
                <span
                  style={{
                    backgroundImage: `linear-gradient(${s.annotate > 0 ? hl : sel}, ${s.annotate > 0 ? hl : sel})`,
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: `${s.select * 100}% 100%`,
                    borderRadius: 0.3 * q,
                  }}
                >
                  {highlightedSentence}
                </span>
                , while lDDT drops by 1.2 points on average across long targets. All measurements use batch size 1 and bfloat16 activations.
                {s.menu > 0.01 ? (
                  <span
                    style={{
                      position: 'absolute',
                      left: '22%',
                      top: -5.6 * q,
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
                      fontSize: 12,
                      whiteSpace: 'nowrap',
                      opacity: s.menu,
                      transform: `translateY(${(1 - s.menu) * -4}px) scale(${mix(0.985, 1, s.menu)})`,
                      zIndex: 2,
                    }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        height: 26,
                        padding: '0 8px',
                        borderRadius: 6,
                        color: color.actx,
                        fontWeight: 500,
                        background: s.askPress > 0 ? `rgba(91,141,239,${0.22 * Math.sin(Math.PI * Math.min(1, s.askPress))})` : 'transparent',
                      }}
                    >
                      <Icon icon={Sparkles} size={12} tint={color.actx} />
                      Ask Atlas
                    </span>
                    <span style={{ width: 1, height: 16, background: color.bd }} />
                    {[
                      [Highlighter, 'Highlight'],
                      [StickyNote, 'Note'],
                      [Quote, 'Cite'],
                    ].map(([I, l]) => (
                      <span key={l as string} style={{ display: 'flex', alignItems: 'center', gap: 5, height: 26, padding: '0 8px' }}>
                        <Icon icon={I as typeof Quote} size={12} tint={color.tx} />
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
                Table 2 reports results across rank. Below r = 16 the long-range contact precision degrades sharply, consistent with the intuition that
                distant couplings are not low-rank in general.
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
                  <div key={r[0]} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: `${0.5 * q}px 0` }}>
                    {r.map((c, i) => (
                      <span key={i}>{c}</span>
                    ))}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 1.55 * q, textAlign: 'center', color: '#444' }}>Table 2: Effect of rank on memory and accuracy.</div>
            </div>
          </div>
          <div
            style={{
              height: 38,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderTop: `1px solid ${color.bd2}`,
              background: color.bg,
              fontSize: 12,
              color: color.tx2,
              position: 'relative',
              zIndex: 2,
            }}
          >
            <Icon icon={ChevronLeft} size={14} />
            <span>Page 3 of 14</span>
            <Icon icon={ChevronRight} size={14} />
          </div>
        </div>
        {narrow ? null : (
          <div style={{ width: 320, flexShrink: 0, borderLeft: `1px solid ${color.bd2}`, display: 'flex', flexDirection: 'column', background: color.bg }}>
            {panel}
          </div>
        )}
      </div>
    </>
  );
};
