import {
  ArrowRightLeft,
  ArrowUp,
  BookOpen,
  CircleDashed,
  CircleDot,
  CircleEllipsis,
  CircleCheck,
  Columns3,
  FileCode,
  FileText,
  Hash,
  List,
  ListFilter,
  ListTodo,
  Plus,
  SignalHigh,
  SignalMedium,
  SignalLow,
  SlidersHorizontal,
  Sparkles,
  UserPlus,
  X,
  type LucideIcon,
} from 'lucide-react';
import React from 'react';
import { people, tasks, type Task } from '../data/demoResearch';
import { ease, mix, progress } from '../design/motion';
import { color, label } from '../design/tokens';
import { font } from '../design/typography';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { TopBar } from './TopBar';

export type TaskState = {
  /** 0–1 the hero card settling from the graph into its slot. */
  settle: number;
  /** 0–1 board chrome reveal. */
  board: number;
  /** 0–1 detail panel. */
  panel: number;
  /** 0–1 assignee set. */
  assign: number;
  /** 0–1 comment arrives. */
  comment: number;
  /** 0–1 linked note chip. */
  link: number;
  /** 0–1 status: In progress → In review. */
  status: number;
};

const cols: Array<{ k: Task['status']; n: string; ic: LucideIcon; c: string }> = [
  { k: 'backlog', n: 'Backlog', ic: CircleDashed, c: color.tx3 },
  { k: 'progress', n: 'In progress', ic: CircleDot, c: color.warn },
  { k: 'review', n: 'In review', ic: CircleEllipsis, c: color.tx2 },
  { k: 'done', n: 'Done', ic: CircleCheck, c: color.ac },
];
const pri: Record<Task['priority'], LucideIcon> = { High: SignalHigh, Medium: SignalMedium, Low: SignalLow };

const COL_W = 268;
const GAP = 12;
const CARD_H = 112;
const HERO = 'ATL-27';

const Card: React.FC<{ t: Task; assignee: (typeof people)[keyof typeof people] | null; selected: number; style?: React.CSSProperties }> = ({
  t,
  assignee,
  selected,
  style,
}) => (
  <div
    style={{
      width: COL_W - 8,
      height: CARD_H,
      padding: '11px 12px',
      borderRadius: 12,
      background: color.el,
      border: `1px solid ${selected > 0.5 ? color.tx3 : color.bd2}`,
      boxShadow: selected > 0 ? `0 0 0 ${4 * selected}px rgba(91,141,239,${0.14 * selected}), 0 10px 28px rgba(0,0,0,.35)` : '0 1px 2px rgba(0,0,0,.08)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      ...style,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontFamily: font.mono, fontSize: 10.5, color: color.tx3, flex: 1 }}>{t.id}</span>
      <Icon icon={pri[t.priority]} size={13} tint={color.tx3} />
      {assignee ? (
        <Avatar person={assignee} size={20} />
      ) : (
        <span style={{ width: 20, height: 20, borderRadius: '50%', border: `1px dashed ${color.tx3}` }} />
      )}
    </div>
    <div style={{ fontSize: 13, lineHeight: 1.4, fontWeight: 500, height: 36, overflow: 'hidden' }}>{t.title}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: color.tx3 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 20, padding: '0 7px', borderRadius: 12, border: `1px solid ${color.bd2}` }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: label[t.label] }} />
        {t.label}
      </span>
      <span style={{ flex: 1 }} />
      {t.papers ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <Icon icon={BookOpen} size={11} tint={color.tx3} />
          {t.papers}
        </span>
      ) : null}
      {t.docs ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <Icon icon={FileText} size={11} tint={color.tx3} />
          {t.docs}
        </span>
      ) : null}
    </div>
  </div>
);

const Prop: React.FC<{ k: string; children: React.ReactNode }> = ({ k, children }) => (
  <>
    <span style={{ color: color.tx3 }}>{k}</span>
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 22 }}>{children}</span>
  </>
);

const LinkChip: React.FC<{ icon: LucideIcon; text: string; glow?: number; style?: React.CSSProperties }> = ({ icon, text, glow = 0, style }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      height: 24,
      padding: '0 8px',
      borderRadius: 6,
      border: `1px solid ${glow > 0 ? `rgba(91,141,239,${0.25 + 0.4 * glow})` : color.bd2}`,
      background: glow > 0 ? `rgba(91,141,239,${0.12 * glow})` : color.el,
      fontSize: 12,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    <Icon icon={icon} size={12} tint={color.tx3} />
    {text}
  </span>
);

/** Detail panel (reference `tk.detail`), driven by the collaboration beats. */
const Detail: React.FC<{ s: TaskState; hero: Task }> = ({ s, hero }) => {
  const inReview = s.status > 0.5;
  const sw = progress(s.status, 0.3, 0.7);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderBottom: `1px solid ${color.bd2}` }}>
        <span style={{ fontFamily: font.mono, fontSize: 11.5, color: color.tx3, flex: 1 }}>{hero.id}</span>
        <Icon icon={X} size={14} />
      </div>
      <div style={{ padding: '16px 18px', overflow: 'hidden' }}>
        <div style={{ fontSize: 20.5, fontWeight: 600, lineHeight: 1.15, marginBottom: 14, letterSpacing: '-.02em' }}>{hero.title}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '9px 10px', fontSize: 12.5, alignItems: 'center', marginBottom: 18 }}>
          <Prop k="Status">
            <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon icon={inReview ? CircleEllipsis : CircleDot} size={13} tint={inReview ? color.tx2 : color.warn} />
              <span style={{ opacity: Math.abs(sw - 0.5) * 2 }}>{inReview ? 'In review' : 'In progress'}</span>
            </span>
          </Prop>
          <Prop k="Priority">
            <Icon icon={SignalHigh} size={13} />
            {hero.priority}
          </Prop>
          <Prop k="Assignee">
            {s.assign > 0.05 ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: s.assign }}>
                <Avatar person={people.nora} size={18} style={{ transform: `scale(${mix(0.6, 1, s.assign)})` }} />
                {people.nora.name}
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: color.tx3 }}>
                <Icon icon={UserPlus} size={13} tint={color.tx3} />
                Unassigned
              </span>
            )}
          </Prop>
          <Prop k="Labels">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 20, padding: '0 7px', borderRadius: 12, border: `1px solid ${color.bd2}`, fontSize: 11.5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: label.writing }} />
              writing
            </span>
          </Prop>
          <Prop k="Due">Nov 7 · internal review</Prop>
        </div>
        <div style={{ fontSize: 11.5, color: color.tx3, marginBottom: 6 }}>Description</div>
        <div style={{ fontSize: 14, lineHeight: 1.65, marginBottom: 16, color: color.tx2 }}>
          Compare our method against the low-rank baseline in §3, using the rank-32 memory figure from the reading notes.
        </div>
        <div style={{ fontSize: 11.5, color: color.tx3, marginBottom: 6 }}>Linked</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
          <LinkChip icon={BookOpen} text="Chen & Duarte, 2023" />
          <LinkChip icon={FileCode} text="main.tex §3" />
          {s.link > 0.01 ? (
            <LinkChip
              icon={FileText}
              text="Reading notes — low-rank pairs"
              glow={1 - progress(s.link, 0.5, 1)}
              style={{ opacity: s.link, transform: `translateY(${(1 - s.link) * 6}px)` }}
            />
          ) : null}
        </div>
        <div style={{ fontSize: 11.5, color: color.tx3, marginBottom: 8 }}>Activity</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, fontSize: 12, color: color.tx3, opacity: s.assign }}>
          <Icon icon={UserPlus} size={12} tint={color.tx3} style={{ margin: '2px 4px 0' }} />
          {people.elif.first} assigned {people.nora.first} · now
        </div>
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: 10,
            fontSize: 12.5,
            opacity: s.comment,
            transform: `translateY(${(1 - s.comment) * 8}px)`,
          }}
        >
          <Avatar person={people.nora} size={20} />
          <div>
            <span style={{ fontWeight: 500 }}>{people.nora.first}</span> <span style={{ color: color.tx3 }}>· now</span>
            <div style={{ color: color.tx2, lineHeight: 1.5 }}>Added the 61 → 19 GB comparison to Table 1. Linked my notes — ready for review.</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11.5, color: color.tx3 }}>
              <Icon icon={Hash} size={11} tint={color.tx3} />
              Shared in #reading-group
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, fontSize: 12, color: color.tx3, opacity: progress(s.status, 0.4, 1) }}>
          <Icon icon={ArrowRightLeft} size={12} tint={color.tx3} style={{ margin: '2px 4px 0' }} />
          {people.nora.first} moved this from In progress to In review · now
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ flex: 1, height: 32, padding: '0 10px', borderRadius: 8, border: `1px solid ${color.bd}`, fontSize: 12.5, color: color.tx3, display: 'flex', alignItems: 'center' }}>
            Leave a comment… use @ to mention
          </div>
          <span style={{ width: 32, height: 32, borderRadius: 8, background: color.el, display: 'grid', placeItems: 'center' }}>
            <Icon icon={ArrowUp} size={14} />
          </span>
        </div>
      </div>
    </div>
  );
};

/** Tasks view (reference `is.tasks`): board + detail, recomposed for portrait. */
export const TaskInterface: React.FC<{ s: TaskState; narrow: boolean; paneW: number; paneH: number }> = ({ s, narrow, paneW, paneH }) => {
  const hero = tasks.find((t) => t.id === HERO) ?? tasks[0];
  if (!hero) return null;
  const visibleCols = narrow ? cols.slice(0, 3) : cols;
  const colX = (i: number) => 20 + i * (COL_W + GAP) + 4;
  const slotY = (j: number) => 36 + j * (CARD_H + 6);
  const move = progress(s.status, 0, 1, ease.inOut);

  // Slot index per card, with the hero moving from In progress to In review.
  const layout = tasks.map((t) => {
    const ci = cols.findIndex((c) => c.k === t.status);
    const siblings = tasks.filter((x) => x.status === t.status);
    let j = siblings.indexOf(t);
    let x = colX(ci);
    let y = slotY(j);
    if (t.id === HERO) {
      x = mix(colX(1), colX(2), move);
      y = slotY(0) - Math.sin(Math.PI * move) * 14;
    } else if (t.status === 'progress') {
      const heroIdx = siblings.findIndex((z) => z.id === HERO);
      if (j > heroIdx) {
        j -= 1;
        y = mix(slotY(j + 1), slotY(j), move);
      }
    } else if (t.status === 'review') {
      y = mix(slotY(j), slotY(j + 1), move);
    }
    return { t, x, y };
  });

  const counts = cols.map((c) => tasks.filter((t) => t.status === c.k).length + (c.k === 'review' ? Math.round(move) : c.k === 'progress' ? -Math.round(move) : 0));
  const panelW = narrow ? paneW : 420;
  const heroLay = layout.find((l) => l.t.id === HERO);
  // Narrow: scroll the board so In progress / In review fill the frame.
  const shiftX = narrow ? -(COL_W + GAP) : 0;
  // Settle: from a large centred card (graph node blown up) into the slot.
  const boardTop = 48 + 46;
  const sx = mix(paneW / 2 - (COL_W - 8) / 2 - (heroLay?.x ?? 0) - shiftX, 0, s.settle);
  const sy = mix(paneH * 0.32 - boardTop - (heroLay?.y ?? 0), 0, s.settle);
  const sscale = mix(1.55, 1, s.settle);

  return (
    <>
      <TopBar
        tab="Tasks"
        tabIcon={ListTodo}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: s.board }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', fontSize: 12.5, color: color.tx2 }}>
              <Icon icon={Sparkles} size={13} tint={color.actx} />
              Plan with Atlas
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 11px', borderRadius: 8, background: color.tx, color: color.bg, fontSize: 12.5, fontWeight: 500 }}>
              <Icon icon={Plus} size={13} tint={color.bg} />
              New task
            </span>
          </div>
        }
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 20px 12px', opacity: s.board, height: 46 }}>
        <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, background: color.el }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', borderRadius: 6, fontSize: 12.5, background: color.hov }}>
            <Icon icon={Columns3} size={13} tint={color.tx} />
            Board
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', fontSize: 12.5, color: color.tx2 }}>
            <Icon icon={List} size={13} />
            List
          </span>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px', fontSize: 12.5, color: color.tx2 }}>
          <Icon icon={ListFilter} size={13} />
          Filter
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px', fontSize: 12.5, color: color.tx2 }}>
          <Icon icon={SlidersHorizontal} size={13} />
          Display
        </span>
      </div>
      <div style={{ position: 'relative', flex: 1, transform: shiftX ? `translateX(${shiftX}px)` : undefined }}>
        {visibleCols.map((c, i) => (
          <div key={c.k} style={{ position: 'absolute', left: colX(i), top: 0, width: COL_W - 8, opacity: s.board }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, height: 30, padding: '0 4px', fontSize: 12.5 }}>
              <Icon icon={c.ic} size={14} tint={c.c} />
              <span style={{ fontWeight: 500 }}>{c.n}</span>
              <span style={{ color: color.tx3 }}>{counts[i]}</span>
              <span style={{ flex: 1 }} />
              <Icon icon={Plus} size={13} tint={color.tx3} />
            </div>
          </div>
        ))}
        {layout
          .filter((l) => l.t.id !== HERO && visibleCols.some((c) => c.k === l.t.status))
          .map((l) => (
            <Card key={l.t.id} t={l.t} assignee={people[l.t.who]} selected={0} style={{ position: 'absolute', left: l.x, top: l.y, opacity: s.board }} />
          ))}
        {heroLay ? (
          <Card
            t={hero}
            assignee={s.assign > 0.5 ? people.nora : null}
            selected={Math.max(1 - s.settle, s.panel)}
            style={{
              position: 'absolute',
              left: heroLay.x,
              top: heroLay.y,
              transformOrigin: '0 0',
              transform: `translate(${sx}px, ${sy}px) scale(${sscale})`,
              zIndex: 5,
            }}
          />
        ) : null}
      </div>
      {s.panel > 0.01 ? (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: narrow ? undefined : 48,
            bottom: 0,
            width: panelW,
            height: narrow ? 560 : undefined,
            background: color.bg,
            borderLeft: narrow ? undefined : `1px solid ${color.bd2}`,
            borderTop: narrow ? `1px solid ${color.bd}` : undefined,
            borderRadius: narrow ? '16px 16px 0 0' : undefined,
            boxShadow: narrow ? '0 -20px 50px rgba(0,0,0,.45)' : '-20px 0 40px rgba(0,0,0,.25)',
            opacity: s.panel,
            transform: narrow ? `translateY(${(1 - s.panel) * 120}px)` : `translateX(${(1 - s.panel) * 40}px)`,
            zIndex: 6,
          }}
        >
          <Detail s={s} hero={hero} />
        </div>
      ) : null}
    </>
  );
};
