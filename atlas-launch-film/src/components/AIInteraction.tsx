import { BadgeCheck, BookOpen, Check, Copy, FilePlus, FileText, NotebookPen, Quote, Sparkles } from 'lucide-react';
import React from 'react';
import { insight, people } from '../data/demoResearch';
import { ease, mix, progress } from '../design/motion';
import { color } from '../design/tokens';
import { font } from '../design/typography';
import { Icon } from './Icon';

export type AskState = {
  /** 0–1 context chips + question bubble. */
  ask: number;
  /** 0–1 thinking steps. */
  think: number;
  /** 0–1 streamed answer. */
  answer: number;
  /** 0–1 “Save as note” press. */
  save: number;
  /** 0–1 answer → linked note. */
  morph: number;
};

const Chip: React.FC<{ icon: typeof Quote; text: string }> = ({ icon, text }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      height: 22,
      padding: '0 7px',
      borderRadius: 6,
      background: color.el,
      border: `1px solid ${color.bd2}`,
      fontSize: 11.5,
      color: color.tx2,
      maxWidth: 260,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }}
  >
    <Icon icon={icon} size={11} />
    {text}
  </span>
);

const Streamed: React.FC<{ text: string; t: number }> = ({ text, t }) => {
  const words = text.split(' ');
  const n = words.length;
  return (
    <>
      {words.map((w, i) => {
        const o = progress(t * n, i - 0.5, i + 1.5, ease.soft);
        return (
          <span key={i} style={{ opacity: o }}>
            {w}
            {i < n - 1 ? ' ' : ''}
          </span>
        );
      })}
    </>
  );
};

/** The insight card: an Atlas answer that becomes a source-linked note. */
const InsightCard: React.FC<{ s: AskState; width: number }> = ({ s, width }) => {
  const m = s.morph;
  return (
    <div
      style={{
        width,
        borderRadius: 12,
        padding: mix(2, 12, m),
        background: `rgba(28,28,27,${m})`,
        border: `1px solid rgba(56,56,53,${m})`,
        boxShadow: m > 0 && m < 1 ? `0 0 0 1px rgba(91,141,239,${0.5 * Math.sin(Math.PI * m)})` : undefined,
      }}
    >
      {m > 0.01 ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, opacity: m }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: '#C9A448' }} />
          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: color.tx2 }}>p.3 ¶2</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: color.tx3 }}>{people.elif.first} · now</span>
        </div>
      ) : null}
      {m > 0.01 ? (
        <div
          style={{
            fontSize: 12.5,
            color: color.tx2,
            borderLeft: `2px solid rgba(201,164,72,.7)`,
            paddingLeft: 8,
            marginBottom: 8,
            opacity: m,
            lineHeight: 1.45,
          }}
        >
          “peak memory … falls from 61 GB to 19 GB”
        </div>
      ) : null}
      <div style={{ fontSize: mix(13.5, 13, m), lineHeight: 1.6, color: color.tx }}>
        <Streamed text={insight.answer} t={s.answer} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12, opacity: progress(s.answer, 0.85, 1) }}>
        {m < 0.5 ? (
          <>
            <Icon icon={BadgeCheck} size={14} tint={color.actx} />
            <span style={{ fontWeight: 500 }}>Source verified</span>
            <span style={{ color: color.tx2 }}>· {insight.source}</span>
          </>
        ) : (
          <>
            <Icon icon={FileText} size={12} tint={color.tx3} />
            <span style={{ color: color.tx2 }}>{insight.noteTitle}</span>
            <span style={{ flex: 1 }} />
            <Icon icon={BookOpen} size={12} tint={color.tx3} />
            <span style={{ color: color.tx3 }}>linked</span>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Ask Atlas, reconstructed from the reader's Ask tab and the AI composer
 * styles: context chips, user bubble, visible steps, source-verified answer.
 */
export const AIInteraction: React.FC<{ s: AskState; variant: 'panel' | 'floating' }> = ({ s, variant }) => {
  const toNotes = progress(s.morph, 0, 0.5, ease.inOut);
  const chrome = 1 - progress(s.morph, 0, 0.35, ease.in);
  const cardW = variant === 'panel' ? 296 : 556;
  const answerTop = variant === 'panel' ? 244 : 214;
  const noteTop = variant === 'panel' ? 52 : 64;

  const tabs = (
    <div style={{ display: 'flex', gap: 2, padding: '8px 10px', borderBottom: `1px solid ${color.bd2}` }}>
      {['Notes', 'Outline', 'Ask'].map((n) => {
        const on = n === 'Ask' ? 1 - toNotes : n === 'Notes' ? toNotes : 0;
        return (
          <span
            key={n}
            style={{
              height: 26,
              padding: '0 9px',
              borderRadius: 6,
              fontSize: 12.5,
              display: 'grid',
              placeItems: 'center',
              background: `rgba(46,46,44,${on})`,
              color: on > 0.5 ? color.tx : color.tx2,
            }}
          >
            {n}
          </span>
        );
      })}
    </div>
  );

  const body = (
    <div style={{ position: 'relative', flex: 1, padding: 12 }}>
      <div style={{ opacity: chrome }}>
        {variant === 'panel' ? (
          <div style={{ fontSize: 12.5, color: color.tx2, marginBottom: 10 }}>Atlas answers from this paper and cites page locations.</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13 }}>
            <Icon icon={Sparkles} size={14} tint={color.actx} />
            <span style={{ fontWeight: 600 }}>Ask Atlas</span>
            <span style={{ color: color.tx3 }}>· this paper</span>
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, opacity: s.ask, transform: `translateY(${(1 - s.ask) * 6}px)` }}>
          <Chip icon={BookOpen} text="Chen & Duarte, 2023" />
          <Chip icon={Quote} text="p.3: “peak memory … 61 GB to 19 GB”" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 0 6px', opacity: s.ask }}>
          <div style={{ maxWidth: '86%', background: color.aiu, padding: '9px 14px', borderRadius: 18, fontSize: 13.5, lineHeight: 1.5 }}>{insight.prompt}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 4, opacity: s.think * (1 - progress(s.answer, 0.1, 0.4)) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 24, fontSize: 12.5 }}>
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
                height: 22,
                marginLeft: 6,
                paddingLeft: 14,
                borderLeft: `1px solid ${color.bd2}`,
                fontSize: 12,
                color: color.tx2,
                opacity: progress(s.think, 0.2 + i * 0.35, 0.5 + i * 0.35),
              }}
            >
              <Icon icon={Check} size={12} tint={color.tx3} />
              {t}
            </div>
          ))}
        </div>
      </div>
      {s.answer > 0 ? (
        <div style={{ position: 'absolute', left: 12, top: mix(answerTop, noteTop, s.morph) }}>
          {s.morph > 0.4 ? (
            <div style={{ fontSize: 11.5, color: color.tx3, marginBottom: 8, opacity: progress(s.morph, 0.4, 0.8) }}>
              {variant === 'panel' ? 'Your notes on this paper' : `Saved to ${insight.noteTitle}`}
            </div>
          ) : null}
          <InsightCard s={s} width={cardW} />
          <div
            style={{
              display: chrome < 0.02 ? 'none' : 'flex',
              gap: 2,
              margin: '10px 0 0 -8px',
              opacity: progress(s.answer, 0.9, 1) * chrome,
            }}
          >
            {[
              [NotebookPen, 'Save as note'],
              [FilePlus, 'Insert'],
              [Copy, 'Copy'],
            ].map(([I, l], i) => (
              <span
                key={l as string}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 28,
                  padding: '0 8px',
                  borderRadius: 8,
                  fontSize: 12.5,
                  color: i === 0 && s.save > 0 ? color.tx : color.tx2,
                  background: i === 0 && s.save > 0 ? `rgba(46,46,44,${Math.min(1, s.save * 2)})` : 'transparent',
                }}
              >
                <Icon icon={I as typeof Copy} size={13} tint={i === 0 && s.save > 0 ? color.tx : color.tx2} />
                {l as string}
              </span>
            ))}
          </div>
          {variant === 'panel' && s.morph > 0.5 ? (
            <div style={{ marginTop: 14, opacity: progress(s.morph, 0.6, 1), borderRadius: 12, padding: '10px 12px', width: cardW }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: '#6FA79E' }} />
                <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: color.tx2 }}>p.5 Tab.2</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: color.tx3 }}>{people.nora.first} · 1d</span>
              </div>
              <div style={{ fontSize: 12.5, color: color.tx2, lineHeight: 1.5 }}>Below r = 16 long-range contact precision degrades sharply. Useful framing for §2.</div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  if (variant === 'panel') {
    return (
      <>
        {tabs}
        {body}
      </>
    );
  }
  return (
    <div
      style={{
        width: 580,
        height: 470,
        borderRadius: 16,
        background: color.pop,
        border: `1px solid ${color.bd}`,
        boxShadow: '0 24px 60px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.05)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: font.sans,
        color: color.tx,
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      {tabs}
      {body}
    </div>
  );
};
