import { BookOpen, CircleHelp, FileCode, FileText, ListTodo } from 'lucide-react';
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { CinematicText } from '../../components/CinematicText';
import { Icon } from '../../components/Icon';
import { Stage } from '../../components/Stage';
import { useLayout } from '../../design/layout';
import { ease, mix, progress } from '../../design/motion';
import { lerpRect } from '../../design/rig';
import { color, kind } from '../../design/tokens';
import { font } from '../../design/typography';
import { BrandMoment, wordmarkSize } from '../components/BrandMoment';
import { Composer } from '../components/Composer';
import { ManuscriptPage } from '../components/ManuscriptPage';
import { NOTE_W, NoteCard } from '../components/NoteCard';
import { PaperPage } from '../components/PaperPage';
import { TASK_W, TaskHeroCard } from '../components/TaskHeroCard';
import { at } from '../storyboard';
import { LIFTED } from './CreateScene';

const MiniGraph: React.FC = () => {
  const pts: Array<[number, number, string, string]> = [
    [150, 95, 'Scaling to long proteins?', color.tx],
    [55, 40, 'Reading notes', kind.doc],
    [250, 40, 'main.tex', kind.ms],
    [40, 150, 'Chen & Duarte', kind.paper],
    [255, 150, 'Okafor', kind.paper],
    [150, 172, 'ATL-27', kind.task],
  ];
  return (
    <div style={{ width: 300, height: 200, borderRadius: 14, background: color.card, border: `1px solid ${color.bd}`, position: 'relative', boxShadow: '0 30px 70px rgba(0,0,0,.5)' }}>
      <svg width={300} height={200} style={{ position: 'absolute', inset: 0 }}>
        {pts.slice(1).map((p, i) => (
          <line key={i} x1={150} y1={95} x2={p[0]} y2={p[1]} stroke={i === 0 || i === 4 ? color.actx : color.bd} strokeWidth={1.3} />
        ))}
        <line x1={55} y1={40} x2={250} y2={40} stroke={color.bd} />
      </svg>
      {pts.map((p) => (
        <div
          key={p[2]}
          style={{
            position: 'absolute',
            left: p[0],
            top: p[1],
            transform: 'translate(-50%,-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            height: 22,
            padding: '0 8px 0 4px',
            borderRadius: 11,
            border: `1px solid ${color.bd}`,
            background: color.pop,
            fontFamily: font.sans,
            fontSize: 11,
            color: color.tx,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p[3] }} />
          {p[2]}
        </div>
      ))}
    </div>
  );
};

type Slot = { id: string; cx: number; cy: number; w: number; icon: typeof BookOpen; tint: string; label: string };

/**
 * 00:55–01:00 — ATLAS. The climax: every object the film followed —
 * question, paper, note, graph, task, manuscript — reassembles as one
 * connected chain. A pulse runs its length, the chain converges into the
 * point, and the point resolves into the wordmark.
 */
export const AtlasScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { portrait, pick } = useLayout();
  const cx = width / 2;
  const cy = height / 2;
  const linksAt = at('atlas', 'journeyLinks');
  const collapse = at('atlas', 'collapse');
  const wm = at('atlas', 'finalWordmark');
  const tag = at('atlas', 'tagline');
  const out = at('atlas', 'fadeOut');

  const slots: Slot[] = portrait
    ? [
        { id: 'q', cx: 360, cy: 470, w: 520, icon: CircleHelp, tint: color.tx, label: 'Question' },
        { id: 'paper', cx: 760, cy: 700, w: 300, icon: BookOpen, tint: kind.paper, label: 'Paper' },
        { id: 'note', cx: 330, cy: 930, w: 430, icon: FileText, tint: kind.doc, label: 'Insight' },
        { id: 'graph', cx: 750, cy: 1160, w: 360, icon: CircleHelp, tint: color.actx, label: 'Connections' },
        { id: 'task', cx: 330, cy: 1390, w: 430, icon: ListTodo, tint: kind.task, label: 'Task' },
        { id: 'ms', cx: 760, cy: 1560, w: 300, icon: FileCode, tint: kind.ms, label: 'Manuscript' },
      ]
    : [
        { id: 'q', cx: 340, cy: 280, w: 520, icon: CircleHelp, tint: color.tx, label: 'Question' },
        { id: 'paper', cx: 520, cy: 740, w: 290, icon: BookOpen, tint: kind.paper, label: 'Paper' },
        { id: 'note', cx: 880, cy: 320, w: 400, icon: FileText, tint: kind.doc, label: 'Insight' },
        { id: 'graph', cx: 1090, cy: 770, w: 360, icon: CircleHelp, tint: color.actx, label: 'Connections' },
        { id: 'task', cx: 1420, cy: 320, w: 400, icon: ListTodo, tint: kind.task, label: 'Task' },
        { id: 'ms', cx: 1640, cy: 720, w: 280, icon: FileCode, tint: kind.ms, label: 'Manuscript' },
      ];

  const conv = progress(frame, collapse, wm - 2, ease.in);
  const push = mix(1.03, 1, progress(frame, 0, collapse, ease.soft));
  const place = (s: Slot, i: number) => {
    const t = progress(frame, i * 3, i * 3 + 26, ease.out);
    return {
      x: mix(cx + (s.cx - cx) * push, cx, conv),
      y: mix(cy + (s.cy - cy) * push, cy, conv),
      k: mix(0.92, 1, t) * mix(1, 0.08, conv),
      o: (s.id === 'ms' ? 1 : t) * (1 - progress(conv, 0.7, 1)),
      blur: (1 - t) * 6,
    };
  };
  const P = slots.map((s, i) => ({ s, ...place(s, i) }));

  // Manuscript page arrives from the lifted position of Create.
  const lifted = portrait ? LIFTED.portrait : LIFTED.landscape;
  const msSlot = P[5];
  const msT = progress(frame, 0, 34, ease.inOut);
  const msW = msSlot ? msSlot.s.w : 250;
  const msRect = lerpRect(lifted, { x: (msSlot?.x ?? cx) - msW / 2, y: (msSlot?.y ?? cy) - (msW * 11) / 8.5 / 2, w: msW, h: (msW * 11) / 8.5 }, msT);

  const chain = progress(frame, linksAt, linksAt + 30, ease.inOut);
  const pulse = progress(frame, linksAt + 14, collapse + 4, ease.inOut);
  const segs = P.slice(0, -1).map((a, i) => [a, P[i + 1]] as const);
  const flash = progress(frame, wm - 8, wm, ease.out) * (1 - progress(frame, wm, wm + 20));
  const fade = progress(frame, out, 150, ease.inOut);
  const size = wordmarkSize(portrait);

  const render = (id: string, w: number) => {
    switch (id) {
      case 'q':
        return <Composer width={w / 0.9} style={{ transform: 'scale(0.9)', transformOrigin: '0 0' }} />;
      case 'paper':
        return (
          <div style={{ width: w, height: w * 0.9, overflow: 'hidden', borderRadius: 4, boxShadow: '0 30px 70px rgba(0,0,0,.5)' }}>
            <PaperPage width={w} s={{ annotate: 1, select: 1 }} />
          </div>
        );
      case 'note':
        return (
          <div style={{ transform: `scale(${w / NOTE_W})`, transformOrigin: '0 0', width: NOTE_W }}>
            <NoteCard width={NOTE_W} />
          </div>
        );
      case 'graph':
        return (
          <div style={{ transform: `scale(${w / 300})`, transformOrigin: '0 0', width: 300 }}>
            <MiniGraph />
          </div>
        );
      case 'task':
        return (
          <div style={{ transform: `scale(${w / TASK_W})`, transformOrigin: '0 0', width: TASK_W }}>
            <TaskHeroCard s={{ assign: 1, status: 1 }} />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Stage light={mix(0.9, 0.45, progress(frame, collapse, wm))}>
      <AbsoluteFill style={{ opacity: 1 - fade }}>
        <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
          {segs.map(([a, b], i) => {
            if (!b) return null;
            const t = Math.max(0, Math.min(1, chain * segs.length - i));
            const mx = (a.x + b.x) / 2;
            const d = `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
            const on = Math.max(0, 1 - Math.abs(pulse * segs.length - i - 0.5) * 1.4);
            return (
              <path
                key={i}
                d={d}
                fill="none"
                stroke={on > 0.05 ? color.actx : color.bd}
                strokeWidth={mix(1.2, 2.2, on)}
                strokeDasharray="2000"
                strokeDashoffset={2000 * (1 - t)}
                opacity={(1 - conv) * 0.95}
              />
            );
          })}
        </svg>
        {P.map((p, i) => {
          if (p.s.id === 'ms') return null;
          const rw = p.s.w;
          return (
            <div
              key={p.s.id}
              style={{
                position: 'absolute',
                left: p.x,
                top: p.y,
                transform: `translate(-50%, -50%) scale(${p.k})`,
                opacity: p.o,
                filter: p.blur > 0.3 ? `blur(${p.blur}px)` : undefined,
              }}
            >
              <div style={{ position: 'relative', width: rw }}>
                <div
                  style={{
                    position: 'absolute',
                    top: -34,
                    left: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontFamily: font.mono,
                    fontSize: 13,
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                    color: color.tx3,
                    opacity: chain,
                  }}
                >
                  <span style={{ color: color.tx2 }}>{String(i + 1).padStart(2, '0')}</span>
                  {p.s.label}
                </div>
                {render(p.s.id, rw)}
              </div>
            </div>
          );
        })}
        {msSlot ? (
          <div
            style={{
              position: 'absolute',
              left: msT < 1 ? msRect.x : msSlot.x - (msW * msSlot.k) / 2,
              top: msT < 1 ? msRect.y : msSlot.y - ((msW * 11) / 8.5 / 2) * msSlot.k,
              transform: `scale(${(msT < 1 ? msRect.w : msW * msSlot.k) / lifted.w})`,
              transformOrigin: '0 0',
              opacity: msSlot.o,
            }}
          >
            <ManuscriptPage width={lifted.w} highlight={0.5} style={{ boxShadow: '0 40px 100px rgba(0,0,0,.55)' }} />
          </div>
        ) : null}
        <div
          style={{
            position: 'absolute',
            left: cx - 160,
            top: cy - 160,
            width: 320,
            height: 320,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(157,187,245,.35) 0%, rgba(91,141,239,0) 60%)',
            opacity: flash,
          }}
        />
        <BrandMoment start={wm} pointFrom={[cx, cy]} opacity={progress(frame, collapse + 6, collapse + 14)} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: cy + size * 0.56 + pick(44, 54), display: 'flex', justifyContent: 'center' }}>
          <CinematicText text="Where research comes together." from={tag} size={pick(42, 48)} weight={400} tint={color.tx2} stagger={3} />
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: pick(60, 330),
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: font.mono,
            fontSize: pick(14, 18),
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            color: color.tx3,
            opacity: 0.75 * progress(frame, tag + 12, tag + 36),
            padding: '0 60px',
          }}
        >
          Atlas Research · In development · Some interfaces shown are concepts
        </div>
      </AbsoluteFill>
      <div style={{ display: 'none' }}>
        <Icon icon={BookOpen} />
      </div>
    </Stage>
  );
};
