import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Download,
  FileCode,
  FileText,
  Folder,
  History,
  LoaderCircle,
  LocateFixed,
  PanelLeft,
  PanelRight,
  Play,
  Sparkles,
  ZoomIn,
  ZoomOut,
  FilePlus,
  FolderPlus,
  Image,
  BookMarked,
} from 'lucide-react';
import React from 'react';
import { insight, people } from '../data/demoResearch';
import { ease, mix, progress } from '../design/motion';
import { color, shadow, syntax } from '../design/tokens';
import { font } from '../design/typography';
import { Icon } from './Icon';

export type ManuscriptState = {
  /** 0–1 note card flying into the editor. */
  fly: number;
  /** 0–1 inserted LaTeX lines revealed. */
  insert: number;
  /** 0–1 compile (spinner → compiled). */
  compile: number;
  /** 0–1 preview paragraph highlight after compile. */
  preview: number;
};

type Seg = [string, string];
const S = (t: string, c: string = syntax.text): Seg => [t, c];

const before: Seg[][] = [
  [S('\\section', syntax.keyword), S('{', syntax.brace), S('Method'), S('}', syntax.brace)],
  [S('\\label', syntax.keyword), S('{', syntax.brace), S('sec:method'), S('}', syntax.brace)],
  [],
  [S('% Learned block routing over residue pairs', syntax.comment)],
  [S('Given queries '), S('$Q$', syntax.math), S(' and keys '), S('$K$', syntax.math), S(', we compute')],
  [S('\\begin', syntax.keyword), S('{', syntax.brace), S('equation', syntax.env), S('}', syntax.brace)],
  [S('  \\mathcal{A} = \\mathrm{softmax}(QK^\\top / \\sqrt{d} \\odot M)V', syntax.math)],
  [S('\\end', syntax.keyword), S('{', syntax.brace), S('equation', syntax.env), S('}', syntax.brace)],
  [S('where '), S('$M$', syntax.math), S(' is a learned block mask.')],
  [],
  [S('\\subsection', syntax.keyword), S('{', syntax.brace), S('Comparison with low-rank pairs'), S('}', syntax.brace)],
];
const inserted: Seg[][] = [
  [S('Low-rank factorization reduces peak memory from')],
  [S('61'), S('\\,', syntax.keyword), S('GB to 19'), S('\\,', syntax.keyword), S('GB at '), S('$r = 32$', syntax.math), S(' '), S('\\citep', syntax.keyword), S('{', syntax.brace), S('chen2023lowrank', syntax.env), S('}', syntax.brace), S(',')],
  [S('at a cost of 1.2 lDDT on long targets.')],
];
const after: Seg[][] = [
  [],
  [S('\\begin', syntax.keyword), S('{', syntax.brace), S('figure', syntax.env), S('}', syntax.brace), S('[t]')],
  [S('  \\includegraphics', syntax.keyword), S('{', syntax.brace), S('figures/sweep.pdf'), S('}', syntax.brace)],
  [S('\\end', syntax.keyword), S('{', syntax.brace), S('figure', syntax.env), S('}', syntax.brace)],
  [],
  [S('\\subsection', syntax.keyword), S('{', syntax.brace), S('Training'), S('}', syntax.brace)],
  [S('We train for 40k steps with '), S('\\texttt', syntax.keyword), S('{', syntax.brace), S('bfloat16'), S('}', syntax.brace), S(' activations.')],
];

const tree = [
  { n: 'main.tex', ic: FileCode, pad: 8 },
  { n: 'sections', ic: Folder, pad: 8 },
  { n: 'intro.tex', ic: FileCode, pad: 26 },
  { n: 'method.tex', ic: FileCode, pad: 26, on: true },
  { n: 'results.tex', ic: FileCode, pad: 26 },
  { n: 'refs.bib', ic: BookMarked, pad: 8 },
  { n: 'figures', ic: Folder, pad: 8 },
  { n: 'sweep.pdf', ic: Image, pad: 26 },
];

const LINE = 22;

const Line: React.FC<{ n: number; segs: Seg[]; bg?: string; opacity?: number; offset?: number }> = ({ n, segs, bg, opacity = 1, offset = 0 }) => (
  <div style={{ display: 'flex', height: LINE, background: bg, opacity, transform: offset ? `translateX(${offset}px)` : undefined }}>
    <span style={{ width: 52, flexShrink: 0, textAlign: 'right', paddingRight: 14, color: '#5E5D59', fontSize: 12 }}>{n}</span>
    <span style={{ whiteSpace: 'pre' }}>
      {segs.map(([t, c], i) => (
        <span key={i} style={{ color: c }}>
          {t}
        </span>
      ))}
    </span>
  </div>
);

/** Manuscript view (reference `is.manuscript`): file tree, LaTeX editor, PDF preview. */
export const ManuscriptInterface: React.FC<{ s: ManuscriptState; narrow: boolean }> = ({ s, narrow }) => {
  const shift = s.insert > 0 ? progress(s.insert, 0, 0.35, ease.inOut) * inserted.length * LINE : 0;
  const compiling = s.compile > 0 && s.compile < 0.6;
  const compiled = s.compile >= 0.6;
  const pageW = narrow ? 420 : 520;
  const q = pageW / 100;
  const newPara = s.preview;

  const editor = (
    <div style={{ flex: narrow ? undefined : 1, height: narrow ? 440 : undefined, minWidth: 0, display: 'flex', flexDirection: 'column', background: color.code, position: 'relative' }}>
      <div style={{ height: 34, flexShrink: 0, display: 'flex', alignItems: 'flex-end', gap: 1, padding: '0 6px', borderBottom: `1px solid ${color.bd2}`, background: color.bg }}>
        {['main.tex', 'method.tex'].map((t) => (
          <span
            key={t}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 32,
              padding: '0 10px',
              borderRadius: '6px 6px 0 0',
              background: t === 'method.tex' ? color.code : 'transparent',
              color: t === 'method.tex' ? color.tx : color.tx3,
              fontFamily: font.mono,
              fontSize: 12,
              border: `1px solid ${t === 'method.tex' ? color.bd2 : 'transparent'}`,
              borderBottom: 0,
            }}
          >
            <Icon icon={FileCode} size={12} tint={color.tx3} />
            {t}
          </span>
        ))}
      </div>
      <div style={{ flex: 1, padding: '12px 0', fontFamily: font.mono, fontSize: 13, lineHeight: `${LINE}px`, overflow: 'hidden', position: 'relative' }}>
        {before.map((l, i) => (
          <Line key={`b${i}`} n={i + 1} segs={l} />
        ))}
        <div style={{ height: shift, position: 'relative' }}>
          {inserted.map((l, i) => {
            const t = progress(s.insert, 0.3 + i * 0.18, 0.62 + i * 0.18, ease.out);
            return (
              <div key={`i${i}`} style={{ position: 'absolute', left: 0, right: 0, top: i * LINE }}>
                <Line
                  n={before.length + i + 1}
                  segs={l}
                  bg={`rgba(91,141,239,${0.14 * Math.min(1, s.insert * 2) * (1 - 0.6 * s.preview)})`}
                  opacity={t}
                  offset={(1 - t) * 10}
                />
              </div>
            );
          })}
        </div>
        {after.map((l, i) => (
          <Line key={`a${i}`} n={before.length + Math.round(shift / LINE) + i + 1} segs={l} />
        ))}
        <span
          style={{
            position: 'absolute',
            left: 52 + 3 * 7.8,
            top: 12 + 10 * LINE + 4,
            display: 'none',
          }}
        />
      </div>
      <div style={{ flexShrink: 0, borderTop: `1px solid ${color.bd2}`, background: color.bg, display: 'flex', alignItems: 'center', gap: 10, height: 30, padding: '0 12px', fontSize: 12, color: color.tx2 }}>
        <span style={{ fontWeight: 500, color: color.tx }}>Problems</span>
        <span style={{ color: color.tx3 }}>None</span>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: color.actx, fontSize: 11.5 }}>
          <Icon icon={Sparkles} size={11} tint={color.actx} />
          Fix with Atlas
        </span>
      </div>
      {s.fly > 0 && s.fly < 1 ? (
        <div
          style={{
            position: 'absolute',
            left: mix(narrow ? 40 : 140, narrow ? 30 : 60, ease.inOut(s.fly)),
            top: mix(narrow ? 380 : 520, 46 + 12 + before.length * LINE, ease.inOut(s.fly)),
            width: narrow ? 400 : mix(380, 460, s.fly),
            padding: 12,
            borderRadius: 12,
            background: color.card,
            border: `1px solid rgba(91,141,239,${0.5})`,
            boxShadow: shadow.pop,
            opacity: Math.min(1, s.fly * 4) * (1 - progress(s.fly, 0.75, 1)),
            transform: `scale(${mix(1, 0.92, s.fly)})`,
            fontFamily: font.sans,
            zIndex: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: color.tx3, marginBottom: 6 }}>
            <Icon icon={FileText} size={12} tint={color.tx3} />
            {insight.noteTitle}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: color.tx }}>Rank-32 cuts peak memory 61 → 19 GB; costs 1.2 lDDT on long targets.</div>
        </div>
      ) : null}
    </div>
  );

  const pdf = (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: color.pdfbg }}>
      <div style={{ height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', borderBottom: `1px solid ${color.bd2}`, background: color.bg }}>
        <Icon icon={ChevronLeft} size={14} />
        <span style={{ fontSize: 12.5, color: color.tx2 }}>3 / 7</span>
        <Icon icon={ChevronRight} size={14} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 6, fontSize: 11.5, color: color.tx3 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: compiling ? color.warn : color.ac }} />
          {compiling ? 'Compiling…' : compiled ? 'Compiled · just now' : 'Compiled · 12 min ago'}
        </span>
        <span style={{ flex: 1 }} />
        <Icon icon={LocateFixed} size={14} />
        <Icon icon={ZoomOut} size={14} />
        <span style={{ fontSize: 12, width: 40, textAlign: 'center', color: color.tx2 }}>100%</span>
        <Icon icon={ZoomIn} size={14} />
      </div>
      <div style={{ flex: 1, padding: '16px 12px', overflow: 'hidden' }}>
        <div
          style={{
            width: pageW,
            margin: '0 auto',
            aspectRatio: '8.5/11',
            background: '#fff',
            color: '#1b1b1b',
            borderRadius: 4,
            boxShadow: shadow.page,
            padding: `${6 * q}px ${7 * q}px`,
            fontFamily: font.paper,
            opacity: compiling ? 0.55 : 1,
          }}
        >
          <div style={{ fontSize: 2.52 * q, fontWeight: 600, marginBottom: 1.2 * q }}>3&#160;&#160;&#160;Method</div>
          <div style={{ fontSize: 2.1 * q, lineHeight: 1.5, marginBottom: 1.6 * q }}>
            Given queries <i>Q</i> and keys <i>K</i>, we compute
          </div>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 2.4 * q, marginBottom: 1.6 * q }}>
            <span style={{ flex: 1, textAlign: 'center', fontStyle: 'italic' }}>A = softmax( QK / √d ⊙ M ) V</span>
            <span style={{ fontSize: 2.1 * q }}>(1)</span>
          </div>
          <div style={{ fontSize: 2.1 * q, lineHeight: 1.5, marginBottom: 2 * q }}>
            where <i>M</i> is a learned block mask.
          </div>
          <div style={{ fontSize: 2.3 * q, fontWeight: 600, marginBottom: 1 * q }}>3.1&#160;&#160;&#160;Comparison with low-rank pairs</div>
          <div
            style={{
              fontSize: 2.1 * q,
              lineHeight: 1.5,
              marginBottom: 2 * q,
              borderRadius: 0.6 * q,
              padding: 0.6 * q,
              margin: `${-0.6 * q}px ${-0.6 * q}px ${1.6 * q}px`,
              background: `rgba(91,141,239,${0.16 * newPara * (1 - progress(newPara, 0.7, 1) * 0.5)})`,
              opacity: compiled ? 1 : 0,
            }}
          >
            Low-rank factorization reduces peak memory from 61 GB to 19 GB at <i>r</i> = 32 [2], at a cost of 1.2 lDDT on long targets.
          </div>
          <div style={{ border: `${0.15 * q}px solid #d6d6d6`, height: 15 * q, display: 'grid', placeItems: 'center', color: '#888', fontSize: 1.92 * q, fontFamily: font.sans, marginBottom: q }}>
            figures/sweep.pdf
          </div>
          <div style={{ fontSize: 1.92 * q, textAlign: 'center', color: '#333' }}>Figure 1: lDDT and peak memory across block sizes 16–128.</div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div style={{ height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px 0 12px', borderBottom: `1px solid ${color.bd2}`, position: 'relative', zIndex: 3, background: color.bg }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', fontSize: 12.5, fontWeight: 500, color: color.tx2 }}>
          <Icon icon={Sparkles} size={13} />
          Ask Atlas
        </span>
        <div style={{ flex: 1 }} />
        {narrow ? null : (
          <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, background: color.el, border: `1px solid ${color.bd2}` }}>
            {[PanelLeft, Columns2, PanelRight].map((I, i) => (
              <span key={i} style={{ width: 28, height: 24, borderRadius: 6, display: 'grid', placeItems: 'center', background: i === 1 ? color.hov : 'transparent' }}>
                <Icon icon={I} size={14} tint={i === 1 ? color.tx : color.tx2} />
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', borderRadius: 6, border: `1px solid ${color.bd}`, background: color.el, overflow: 'hidden' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', fontSize: 12.5, fontWeight: 500 }}>
            <Icon icon={compiling ? LoaderCircle : Play} size={13} tint={color.tx} style={compiling ? { transform: `rotate(${s.compile * 900}deg)` } : undefined} />
            {compiling ? 'Compiling' : 'Recompile'}
          </span>
          <span style={{ width: 24, height: 28, borderLeft: `1px solid ${color.bd}`, display: 'grid', placeItems: 'center' }}>
            <Icon icon={ChevronDown} size={12} />
          </span>
        </div>
        {narrow ? null : (
          <>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 9px', borderRadius: 6, border: `1px solid ${color.bd}`, background: color.el, fontSize: 12.5, fontWeight: 500 }}>
              <Icon icon={Download} size={13} tint={color.tx} />
              Export
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 9px', borderRadius: 6, border: `1px solid ${color.bd}`, background: color.el, fontSize: 12.5, fontWeight: 500 }}>
              <Icon icon={History} size={13} tint={color.tx} />
              History
            </span>
          </>
        )}
        <span style={{ height: 28, padding: '0 12px', borderRadius: 6, background: color.tx, color: color.bg, fontSize: 12.5, fontWeight: 500, display: 'grid', placeItems: 'center' }}>Share</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: narrow ? 'column' : 'row' }}>
        {narrow ? null : (
          <div style={{ width: 200, flexShrink: 0, borderRight: `1px solid ${color.bd2}`, display: 'flex', flexDirection: 'column', background: color.bg }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 10px 6px 12px', fontSize: 11.5, color: color.tx3, fontWeight: 500 }}>
              <span style={{ flex: 1 }}>Files</span>
              <Icon icon={FilePlus} size={13} tint={color.tx3} />
              <Icon icon={FolderPlus} size={13} tint={color.tx3} />
            </div>
            <div style={{ flex: 1, padding: '0 6px' }}>
              {tree.map((f) => (
                <div
                  key={f.n}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    height: 28,
                    padding: `0 8px 0 ${f.pad}px`,
                    borderRadius: 6,
                    background: f.on ? color.hov : 'transparent',
                    color: f.on ? color.tx : color.tx2,
                    fontSize: 12.5,
                    fontFamily: font.mono,
                  }}
                >
                  <Icon icon={f.ic} size={13} tint={color.tx3} />
                  {f.n}
                </div>
              ))}
            </div>
            <div style={{ padding: '10px 12px', borderTop: `1px solid ${color.bd2}`, fontSize: 11.5, color: color.tx3, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color.ac }} />
                {people.nora.first} is viewing intro.tex
              </span>
              <span>Saved · pdfLaTeX</span>
            </div>
          </div>
        )}
        {editor}
        <div style={{ width: narrow ? '100%' : 7, height: narrow ? 7 : '100%', flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', background: color.bg }}>
          <span style={{ width: narrow ? '100%' : 1, height: narrow ? 1 : '100%', background: color.bd2 }} />
        </div>
        {pdf}
      </div>
    </>
  );
};
