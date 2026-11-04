import { BadgeCheck, BookOpen, Check, Copy, FilePlus, NotebookPen, Sparkles } from 'lucide-react';
import React from 'react';
import { Icon } from '../../components/Icon';
import { highlightedSentence, insight } from '../../data/demoResearch';
import { ease, progress } from '../../design/motion';
import { color } from '../../design/tokens';
import { font } from '../../design/typography';

export type AskState = { card: number; quoteIn: number; ask: number; think: number; answer: number; verified: number; save: number };

/** Quote slot position inside the card (for the evidence hand-off). */
export const QUOTE_SLOT = { x: 20, y: 62, h: 64 };

const Streamed: React.FC<{ text: string; t: number }> = ({ text, t }) => {
  const words = text.split(' ');
  return (
    <>
      {words.map((w, i) => (
        <span key={i} style={{ opacity: progress(t * words.length, i - 0.5, i + 1.5, ease.soft) }}>
          {w}
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </>
  );
};

/** Floating Ask Atlas card (reference composer + reader Ask tab language). */
export const AskCard: React.FC<{ width: number; s: AskState }> = ({ width, s }) => (
  <div
    style={{
      width,
      padding: 20,
      borderRadius: 16,
      background: color.pop,
      border: `1px solid ${color.bd}`,
      boxShadow: '0 40px 100px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.04)',
      fontFamily: font.sans,
      color: color.tx,
      opacity: s.card,
      transform: `translateY(${(1 - s.card) * 14}px)`,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 30, fontSize: 14 }}>
      <Icon icon={Sparkles} size={15} tint={color.actx} />
      <span style={{ fontWeight: 600 }}>Ask Atlas</span>
      <span style={{ color: color.tx3 }}>· Chen & Duarte, 2023</span>
    </div>
    <div style={{ height: QUOTE_SLOT.h, marginTop: 12, display: 'flex', alignItems: 'center' }}>
      <div
        style={{
          opacity: s.quoteIn,
          fontSize: 15,
          lineHeight: 1.45,
          color: color.tx2,
          borderLeft: '2px solid rgba(201,164,72,.8)',
          paddingLeft: 12,
        }}
      >
        “{highlightedSentence}”
      </div>
    </div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '14px 0 8px', opacity: s.ask, transform: `translateY(${(1 - s.ask) * 8}px)` }}>
      <div style={{ background: color.aiu, padding: '10px 16px', borderRadius: 18, fontSize: 15 }}>{insight.prompt}</div>
    </div>
    <div style={{ minHeight: 160, position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: s.think * (1 - progress(s.answer, 0.05, 0.3)) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 26, fontSize: 13.5 }}>
          <Icon icon={Sparkles} size={13} tint={color.actx} />
          <span style={{ fontWeight: 500 }}>Reading the cited passage</span>
        </div>
        {['Located p.3 ¶2 and Table 2', 'Checked the claim against the source'].map((t, i) => (
          <div
            key={t}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 24,
              marginLeft: 6,
              paddingLeft: 14,
              borderLeft: `1px solid ${color.bd2}`,
              fontSize: 13,
              color: color.tx2,
              opacity: progress(s.think, 0.25 + i * 0.35, 0.55 + i * 0.35),
            }}
          >
            <Icon icon={Check} size={12} tint={color.tx3} />
            {t}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 16, lineHeight: 1.6 }}>
        <Streamed text={insight.answer} t={s.answer} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, fontSize: 13, opacity: s.verified, transform: `translateY(${(1 - s.verified) * 6}px)` }}>
        <Icon icon={BadgeCheck} size={15} tint={color.actx} />
        <span style={{ fontWeight: 500 }}>Source verified</span>
        <span style={{ color: color.tx2 }}>· {insight.source}</span>
      </div>
    </div>
    <div style={{ display: 'flex', gap: 2, margin: '12px 0 0 -8px', opacity: s.verified }}>
      {[
        [NotebookPen, 'Save as note'],
        [FilePlus, 'Insert'],
        [Copy, 'Copy'],
        [BookOpen, 'Open p.3'],
      ].map(([I, l], i) => (
        <span
          key={l as string}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 30,
            padding: '0 9px',
            borderRadius: 8,
            fontSize: 13,
            color: i === 0 && s.save > 0 ? color.tx : color.tx2,
            background: i === 0 ? `rgba(58,58,55,${Math.min(1, s.save * 2)})` : 'transparent',
          }}
        >
          <Icon icon={I as typeof Copy} size={13} tint={i === 0 && s.save > 0 ? color.tx : color.tx2} />
          {l as string}
        </span>
      ))}
    </div>
  </div>
);
