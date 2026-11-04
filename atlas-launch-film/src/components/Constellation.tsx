import {
  BookOpen,
  CircleHelp,
  FileCode,
  FileText,
  FlaskConical,
  Hash,
  ListTodo,
  Quote,
  type LucideIcon,
} from 'lucide-react';
import React from 'react';
import { ease, mix, progress, seeded } from '../design/motion';
import { color, kind } from '../design/tokens';
import { font } from '../design/typography';
import { Icon } from './Icon';

type Fragment = {
  icon: LucideIcon;
  tint: string;
  title: string;
  sub: string;
  /** Scattered offset from centre (landscape / portrait) + depth. */
  l: [number, number, number];
  p: [number, number, number];
};

/** Abstract research objects (fictional demo data). */
export const fragments: Fragment[] = [
  { icon: BookOpen, tint: kind.paper, title: 'Low-Rank Pair Representations', sub: 'Chen & Duarte · ICML 2023', l: [-640, -285, 1], p: [-215, -470, 1] },
  { icon: BookOpen, tint: kind.paper, title: 'Sparse Axial Attention', sub: 'Okafor et al. · NeurIPS 2024', l: [600, -300, 0.92], p: [215, -320, 0.92] },
  { icon: FileText, tint: kind.doc, title: 'Reading notes', sub: 'low-rank pairs · edited 12m ago', l: [-250, -345, 0.8], p: [-225, -150, 0.82] },
  { icon: Quote, tint: color.tx2, title: '[2]  Cited by 389', sub: 'p.3 ¶2 — peak memory', l: [260, -150, 0.76], p: [225, 10, 0.8] },
  { icon: CircleHelp, tint: color.tx, title: 'Why does memory grow as L²?', sub: 'Open question', l: [-470, 40, 1.05], p: [-200, 170, 1.05] },
  { icon: ListTodo, tint: kind.task, title: 'ATL-31  Re-run ablation', sub: 'Backlog · block size 64', l: [690, 70, 0.95], p: [210, 330, 0.95] },
  { icon: FlaskConical, tint: kind.exp, title: 'run_14 sweep', sub: 'Notebook · block 16–128', l: [-700, 255, 0.85], p: [-215, 490, 0.86] },
  { icon: FileCode, tint: color.ac, title: 'main.tex', sub: 'Manuscript · §3 Method', l: [430, 250, 1], p: [200, 650, 1] },
  { icon: Hash, tint: kind.ch, title: '#reading-group', sub: 'Channel · 5 new', l: [-170, 175, 0.72], p: [-150, 780, 0.74] },
  { icon: BookOpen, tint: kind.paper, title: 'Learned Routing', sub: 'Novak & Haddad · 2025', l: [170, -415, 0.7], p: [40, -640, 0.72] },
];

/** Attempted (pre-structure) connections between scattered fragments. */
export const attempts: Array<[number, number]> = [
  [0, 2],
  [4, 8],
  [1, 3],
  [6, 4],
  [7, 5],
  [9, 1],
];

export type ConstellationState = {
  /** 0 = all at centre, 1 = scattered. */
  spawn: number;
  /** 0 = scattered, 1 = organised ring. */
  order: number;
  /** 0 = present, 1 = collapsed into the centre point. */
  collapse: number;
  /** Progress of each attempted link (0–1 draw). */
  attempt: number[];
  /** Drift clock in frames. */
  clock: number;
};

type Props = {
  state: ConstellationState;
  portrait: boolean;
  width: number;
  height: number;
};

const ringPos = (i: number, n: number, portrait: boolean): [number, number] => {
  const a = (i / n) * Math.PI * 2 - Math.PI / 2;
  const rx = portrait ? 330 : 560;
  const ry = portrait ? 560 : 300;
  return [Math.cos(a) * rx, Math.sin(a) * ry + (portrait ? 80 : -10)];
};

/**
 * The research-object field used by Scenes 02–03: fragments spawn from the
 * question point, attempt connections, then organise into one structure.
 */
export const Constellation: React.FC<Props> = ({ state, portrait, width, height }) => {
  const cx = width / 2;
  const cy = height / 2;
  const n = fragments.length;
  const scaleBase = portrait ? 1.3 : 1.18;

  const pos = fragments.map((fr, i) => {
    const [sx, syRaw, z] = portrait ? fr.p : fr.l;
    // Portrait: keep the field clear of the headline band at the top.
    const sy = portrait ? syRaw * 0.82 + 150 : syRaw;
    const sp = progress(state.spawn, i * 0.045, i * 0.045 + 0.55, ease.out);
    const drift = 1 - state.order;
    const dx = Math.sin(state.clock * 0.018 + seeded(i) * 6) * 7 * drift;
    const dy = Math.cos(state.clock * 0.015 + seeded(i + 9) * 6) * 6 * drift;
    const [rx, ry] = ringPos(i, n, portrait);
    const ox = mix(sx * sp + dx, rx, state.order);
    const oy = mix(sy * sp + dy, ry, state.order);
    const k = 1 - state.collapse;
    return {
      x: cx + ox * k,
      y: cy + oy * k,
      z: mix(z, 1, state.order),
      sp,
    };
  });

  const hub = { x: cx, y: cy + (portrait ? 80 : -10) * state.order * (1 - state.collapse) };

  return (
    <>
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        {attempts.map(([a, b], i) => {
          const A = pos[a];
          const B = pos[b];
          const t = state.attempt[i] ?? 0;
          if (!A || !B || t <= 0) return null;
          const fade = 1 - state.order;
          const x2 = mix(A.x, B.x, Math.min(1, t * 1.4));
          const y2 = mix(A.y, B.y, Math.min(1, t * 1.4));
          return (
            <line
              key={`at-${i}`}
              x1={A.x}
              y1={A.y}
              x2={x2}
              y2={y2}
              stroke={color.tx3}
              strokeWidth={1}
              strokeDasharray={t > 0.7 ? '3 5' : undefined}
              opacity={(t > 0.7 ? mix(0.6, 0.28, (t - 0.7) / 0.3) : 0.6) * fade * (1 - state.collapse)}
            />
          );
        })}
        {pos.map((p, i) => {
          const draw = progress(state.order, 0.25 + i * 0.04, 0.75 + i * 0.04, ease.out);
          if (draw <= 0) return null;
          const next = pos[(i + 1) % n];
          return (
            <g key={`st-${i}`} opacity={1 - state.collapse}>
              <line
                x1={hub.x}
                y1={hub.y}
                x2={mix(hub.x, p.x, draw)}
                y2={mix(hub.y, p.y, draw)}
                stroke={color.bd}
                strokeWidth={1}
                opacity={0.9}
              />
              {next ? (
                <line x1={p.x} y1={p.y} x2={mix(p.x, next.x, draw)} y2={mix(p.y, next.y, draw)} stroke={color.bd2} strokeWidth={1} />
              ) : null}
            </g>
          );
        })}
      </svg>
      {fragments.map((fr, i) => {
        const p = pos[i];
        if (!p) return null;
        const vis = p.sp * (1 - progress(state.collapse, 0.55, 1, ease.in));
        if (vis <= 0.001) return null;
        const blur = Math.max(0, (1 - p.z) * 5) * (1 - state.order);
        const s = scaleBase * mix(0.35, 1, p.sp) * mix(1, 0.2, state.collapse) * mix(0.85 + p.z * 0.15, 1, state.order);
        return (
          <div
            key={fr.title}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              transform: `translate(-50%, -50%) scale(${s})`,
              opacity: vis * mix(0.55 + p.z * 0.45, 1, state.order),
              filter: blur > 0.2 ? `blur(${blur}px)` : undefined,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 14px 9px 10px',
              borderRadius: 12,
              background: 'rgba(38,38,37,.86)',
              border: `1px solid ${color.bd}`,
              boxShadow: '0 10px 30px rgba(0,0,0,.4)',
              fontFamily: font.sans,
              whiteSpace: 'nowrap',
            }}
          >
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: color.el,
                border: `1px solid ${color.bd2}`,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon icon={fr.icon} size={15} tint={fr.tint} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: color.tx, letterSpacing: '-.01em' }}>{fr.title}</span>
              <span style={{ fontSize: 11.5, color: color.tx3 }}>{fr.sub}</span>
            </span>
          </div>
        );
      })}
    </>
  );
};

/** The single precise point — the question. */
export const QuestionPoint: React.FC<{ x: number; y: number; size: number; glow: number; opacity: number }> = ({
  x,
  y,
  size,
  glow,
  opacity,
}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      width: size,
      height: size,
      marginLeft: -size / 2,
      marginTop: -size / 2,
      borderRadius: '50%',
      background: color.tx,
      opacity,
      boxShadow: `0 0 ${12 * glow}px rgba(236,236,234,${0.45 * glow}), 0 0 ${48 * glow}px rgba(157,187,245,${0.18 * glow})`,
    }}
  />
);
