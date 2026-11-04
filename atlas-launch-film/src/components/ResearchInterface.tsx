import { ArrowUp, BookOpen, Bookmark, ChevronDown, History, NotebookPen, Quote, SlidersHorizontal, Sparkles, SquarePen, Telescope, FilePlus } from 'lucide-react';
import React from 'react';
import { papers, researchQuestion } from '../data/demoResearch';
import { ease, mix, progress } from '../design/motion';
import { color } from '../design/tokens';
import { Icon } from './Icon';
import { TopBar } from './TopBar';

export type ResearchState = {
  /** 0–1 share of the question typed. */
  typed: number;
  caret: boolean;
  /** 0–1 press feedback on the send button. */
  press: number;
  /** 0–1 loading indicator visibility. */
  loading: number;
  /** 0–1 results reveal clock. */
  results: number;
  /** 0–1 highlight of the first paper. */
  focus: number;
  /** 0–1 expansion of the focused paper into the reader. */
  expand: number;
  /** In-app scroll offset in px. */
  scroll: number;
  /** 0 = compact composer look, 1 = full Research input (V2 hand-off). */
  inputOpen?: number;
  /** Hide the focused row (it is lifted out as a hero object). */
  hideFocus?: boolean;
  /** Blur in px applied to non-focused rows (depth of field). */
  rowBlur?: number;
};

const Cite: React.FC<{ n: number }> = ({ n }) => (
  <sup
    style={{
      display: 'inline-grid',
      placeItems: 'center',
      minWidth: 17,
      height: 17,
      padding: '0 4px',
      margin: '0 1px',
      borderRadius: 6,
      background: color.el,
      color: color.tx2,
      fontSize: 10.5,
      fontWeight: 500,
      verticalAlign: 2,
    }}
  >
    {n}
  </sup>
);

const modes = ['Quick answer', 'Literature review', 'Compare methods', 'Find datasets'];

/** Research view (reference `is.research`): question composer, answer, papers. */
export const ResearchInterface: React.FC<{ s: ResearchState; narrow: boolean }> = ({ s, narrow }) => {
  const text = researchQuestion.slice(0, Math.round(researchQuestion.length * s.typed));
  const r = (i: number) => progress(s.results, i * 0.12, i * 0.12 + 0.5, ease.out);
  const shown = narrow ? papers.slice(0, 3) : papers;
  return (
    <>
      <TopBar
        tab="Research"
        tabIcon={Telescope}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon icon={History} size={15} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', fontSize: 12.5, fontWeight: 500, color: color.tx2 }}>
              <Icon icon={SquarePen} size={14} />
              New search
            </span>
          </div>
        }
      />
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: narrow ? '22px 24px' : '28px 24px', transform: `translateY(${-s.scroll}px)` }}>
          <h1 style={{ margin: '0 0 18px', fontSize: 26, fontWeight: 600, letterSpacing: '-.025em', lineHeight: 1.15 }}>What are you researching?</h1>
          <div
            style={{
              borderRadius: 16,
              background: color.el,
              border: `1px solid ${s.typed > 0 && s.typed < 1 ? '#45453F' : color.bd}`,
              boxShadow: '0 1px 2px rgba(0,0,0,.12)',
            }}
          >
            <div style={{ minHeight: 60 - 26 * (1 - (s.inputOpen ?? 1)), fontSize: 15, lineHeight: 1.55, padding: '14px 16px 4px', color: text ? color.tx : color.tx3 }}>
              {text || 'Ask a question, paste a DOI, or describe a method'}
              {s.caret ? (
                <span style={{ display: 'inline-block', width: 1.5, height: 18, background: color.tx, verticalAlign: -3, marginLeft: 1 }} />
              ) : null}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px 10px', height: 50 * (s.inputOpen ?? 1), opacity: s.inputOpen ?? 1, overflow: 'hidden' }}>
              <div style={{ display: 'flex', gap: 2 }}>
                {(narrow ? modes.slice(0, 2) : modes).map((m, i) => (
                  <span
                    key={m}
                    style={{
                      height: 28,
                      padding: '0 10px',
                      borderRadius: 999,
                      fontSize: 12.5,
                      display: 'grid',
                      placeItems: 'center',
                      background: i === 1 ? color.hov : 'transparent',
                      color: i === 1 ? color.tx : color.tx2,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {m}
                  </span>
                ))}
              </div>
              <span style={{ flex: 1 }} />
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px', fontSize: 12, color: color.tx2 }}>
                <Icon icon={SlidersHorizontal} size={13} />
                Filters
              </span>
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: s.typed >= 1 ? color.tx : color.hov,
                  display: 'grid',
                  placeItems: 'center',
                  transform: `scale(${1 - 0.1 * Math.sin(Math.PI * s.press)})`,
                }}
              >
                <Icon icon={ArrowUp} size={16} tint={s.typed >= 1 ? color.bg : color.tx3} stroke={2} />
              </span>
            </div>
          </div>

          {s.loading > 0.01 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 36, opacity: s.loading, height: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: color.tx2 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color.actx }} />
                Searching sources and reading abstracts…
              </div>
              {[92, 80, 86].map((w) => (
                <div key={w} style={{ height: 12, width: `${w}%`, borderRadius: 4, background: color.el }} />
              ))}
            </div>
          ) : null}

          {s.results > 0 ? (
            <div style={{ marginTop: 36 }}>
              <div style={{ opacity: r(0), transform: `translateY(${(1 - r(0)) * 10}px)` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13 }}>
                  <Icon icon={Sparkles} size={15} tint={color.actx} />
                  <span style={{ fontWeight: 600 }}>Answer</span>
                  <span style={{ color: color.tx3 }}>4 sources</span>
                </div>
                <div style={{ fontSize: 15, lineHeight: 1.7 }}>
                  Two strategies dominate. <b style={{ fontWeight: 600 }}>Low-rank factorization</b> compresses the pair grid and scales near-linearly
                  <Cite n={1} />. <b style={{ fontWeight: 600 }}>Structured sparsity</b> keeps exact values for retained pairs
                  <Cite n={2} />. Learned routing is newer and not yet peer-reviewed
                  <Cite n={3} />.
                </div>
                <div style={{ display: 'flex', gap: 2, margin: '10px 0 0 -9px' }}>
                  {[
                    [FilePlus, 'Insert'],
                    [NotebookPen, 'Save as note'],
                  ].map(([I, l]) => (
                    <span key={l as string} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 9px', fontSize: 12.5, color: color.tx2 }}>
                      <Icon icon={I as typeof FilePlus} size={13} />
                      {l as string}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '30px 0 8px', opacity: r(1) }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Papers</span>
                <span style={{ fontSize: 12, color: color.tx3 }}>{shown.length}</span>
                <span style={{ flex: 1 }} />
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: color.tx2 }}>
                  Relevance
                  <Icon icon={ChevronDown} size={12} />
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: '0 -12px' }}>
                {shown.map((p, i) => {
                  const t = r(i + 1.5);
                  const isFocus = i === 0;
                  const f = isFocus ? s.focus : 0;
                  const dim = isFocus ? 1 : 1 - 0.55 * s.focus;
                  return (
                    <div
                      key={p.id}
                      style={{
                        position: 'relative',
                        display: 'flex',
                        gap: 12,
                        padding: 12,
                        borderRadius: 12,
                        background: f > 0 ? `rgba(46,46,44,${f})` : 'transparent',
                        boxShadow: f > 0 ? `inset 0 0 0 1px rgba(91,141,239,${0.45 * f})` : undefined,
                        opacity: t * dim * (isFocus && s.hideFocus ? 0 : 1),
                        filter: !isFocus && (s.rowBlur ?? 0) > 0.2 ? `blur(${s.rowBlur}px)` : undefined,
                        transform: `translateY(${(1 - t) * 14}px)`,
                        zIndex: isFocus ? 2 : 1,
                      }}
                    >
                      <span style={{ width: 16, height: 16, flexShrink: 0, marginTop: 3, borderRadius: 4, border: `1.5px solid ${color.tx3}` }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14.5, lineHeight: 1.35, fontWeight: 600, letterSpacing: '-.01em' }}>{p.title}</div>
                        <div style={{ fontSize: 12.5, color: color.tx3, margin: '3px 0 6px' }}>
                          {p.authors} · {p.venue} · Cited by {p.cited}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: color.tx2,
                            lineHeight: 1.55,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {p.abstract}
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, fontSize: 11.5 }}>
                          <span style={{ color: color.tx3 }}>[{i + 1}]</span>
                          <span style={{ padding: '2px 8px', borderRadius: 999, background: color.el, color: color.tx2 }}>{p.relevance}</span>
                          {p.openAccess ? <span style={{ padding: '2px 8px', borderRadius: 999, background: color.el, color: color.tx2 }}>Open access</span> : null}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 2, alignSelf: 'flex-start' }}>
                        {[Bookmark, Quote, BookOpen].map((I, k) => (
                          <span
                            key={k}
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 8,
                              display: 'grid',
                              placeItems: 'center',
                              background: isFocus && k === 2 && f > 0.5 ? color.el : 'transparent',
                            }}
                          >
                            <Icon icon={I} size={15} tint={isFocus && k === 2 && f > 0.5 ? color.tx : color.tx3} />
                          </span>
                        ))}
                      </div>
                      {isFocus && s.expand > 0 ? (
                        <div
                          style={{
                            position: 'absolute',
                            inset: -mix(0, 1600, s.expand),
                            borderRadius: mix(12, 0, s.expand),
                            background: color.pdfbg,
                            opacity: Math.min(1, s.expand * 2.2),
                            boxShadow: `inset 0 0 0 1px rgba(91,141,239,${0.45 * (1 - s.expand)})`,
                          }}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
};
