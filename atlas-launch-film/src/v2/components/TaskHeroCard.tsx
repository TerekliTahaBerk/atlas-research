import { BookOpen, CircleDot, CircleEllipsis, FileCode, FileText, ListTodo, SignalHigh, UserPlus } from 'lucide-react';
import React from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { people } from '../../data/demoResearch';
import { mix, progress } from '../../design/motion';
import { color, kind } from '../../design/tokens';
import { font } from '../../design/typography';

/** Layout width of the hero task card (magnified to the TASK anchor). */
export const TASK_W = 520;

export type TaskHeroState = { assign?: number; status?: number; chipGlow?: number; msGlow?: number; msPress?: number };

const Chip: React.FC<{ icon: typeof BookOpen; tint: string; text: string; glow?: number; press?: number }> = ({ icon, tint, text, glow = 0, press = 0 }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: 28,
      padding: '0 10px',
      borderRadius: 7,
      border: `1px solid ${glow > 0 ? `rgba(91,141,239,${0.3 + 0.5 * glow})` : color.bd2}`,
      background: glow > 0 ? `rgba(91,141,239,${0.14 * glow})` : color.el,
      fontSize: 13,
      whiteSpace: 'nowrap',
      transform: `scale(${1 - 0.05 * Math.sin(Math.PI * Math.min(1, press))})`,
    }}
  >
    <Icon icon={icon} size={13} tint={tint} />
    {text}
  </span>
);

/** ATL-27 — the task born from a graph connection (reference task card + detail grammar). */
export const TaskHeroCard: React.FC<{ s?: TaskHeroState; style?: React.CSSProperties }> = ({ s = {}, style }) => {
  const assign = s.assign ?? 0;
  const status = s.status ?? 0;
  const review = status > 0.5;
  const swap = Math.abs(progress(status, 0.3, 0.7) - 0.5) * 2;
  return (
    <div
      style={{
        width: TASK_W,
        padding: '16px 18px 18px',
        borderRadius: 14,
        background: color.el,
        border: `1px solid ${color.bd}`,
        boxShadow: '0 40px 100px rgba(0,0,0,.6)',
        fontFamily: font.sans,
        color: color.tx,
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon icon={ListTodo} size={14} tint={kind.task} />
        <span style={{ fontFamily: font.mono, fontSize: 12, color: color.tx3, flex: 1 }}>ATL-27 · Sparse Evoformer</span>
        <Icon icon={SignalHigh} size={14} tint={color.tx3} />
        {assign > 0.5 ? (
          <Avatar person={people.nora} size={24} style={{ transform: `scale(${mix(0.6, 1, Math.min(1, (assign - 0.5) * 2))})` }} />
        ) : (
          <span style={{ width: 24, height: 24, borderRadius: '50%', border: `1px dashed ${color.tx3}` }} />
        )}
      </div>
      <div style={{ fontSize: 21, fontWeight: 600, lineHeight: 1.2, letterSpacing: '-.02em', margin: '12px 0 14px' }}>
        Write §3 — compare against the low-rank baseline
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '84px 1fr', rowGap: 9, fontSize: 13.5, alignItems: 'center', marginBottom: 14 }}>
        <span style={{ color: color.tx3 }}>Status</span>
        <span
          style={{
            justifySelf: 'start',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            height: 26,
            padding: '0 10px',
            borderRadius: 999,
            border: `1px solid ${color.bd}`,
            background: review ? 'rgba(91,141,239,.10)' : 'transparent',
          }}
        >
          <Icon icon={review ? CircleEllipsis : CircleDot} size={13} tint={review ? color.actx : color.warn} />
          <span style={{ opacity: swap }}>{review ? 'In review' : 'In progress'}</span>
        </span>
        <span style={{ color: color.tx3 }}>Assignee</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {assign > 0.5 ? (
            <>
              <Avatar person={people.nora} size={20} />
              {people.nora.name}
            </>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: color.tx3, background: assign > 0 ? 'rgba(46,46,44,1)' : undefined, borderRadius: 6, padding: '2px 6px', margin: '-2px -6px' }}>
              <Icon icon={UserPlus} size={13} tint={color.tx3} />
              Unassigned
            </span>
          )}
        </span>
        <span style={{ color: color.tx3 }}>Due</span>
        <span>Nov 7 · internal review</span>
      </div>
      <div style={{ fontSize: 12, color: color.tx3, marginBottom: 8 }}>Linked</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <Chip icon={FileText} tint={kind.doc} text="Reading notes — low-rank pairs" glow={s.chipGlow} />
        <Chip icon={BookOpen} tint={kind.paper} text="Chen & Duarte, 2023" glow={s.chipGlow} />
        <Chip icon={FileCode} tint={kind.ms} text="main.tex §3" glow={s.msGlow} press={s.msPress} />
      </div>
    </div>
  );
};
