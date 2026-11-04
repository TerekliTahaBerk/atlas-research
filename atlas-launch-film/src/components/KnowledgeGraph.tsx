import { BookOpen, CircleHelp, FileCode, FileText, FlaskConical, Hash, ListTodo, type LucideIcon } from 'lucide-react';
import React from 'react';
import { clusters, type NodeKind } from '../data/demoResearch';
import { mix, seeded } from '../design/motion';
import { color, kind } from '../design/tokens';
import { font } from '../design/typography';
import { Icon } from './Icon';

export type GNode = {
  id: string;
  kind: NodeKind;
  label: string;
  x: number;
  y: number;
  /** 0–1 emergence. */
  appear: number;
  /** 0–1 selected state. */
  selected: number;
  /** 0–1 neighbour-of-selection emphasis. */
  near: number;
};

export type GEdge = { x1: number; y1: number; x2: number; y2: number; draw: number; active: number };

const icons: Record<NodeKind, LucideIcon> = {
  paper: BookOpen,
  doc: FileText,
  ms: FileCode,
  task: ListTodo,
  exp: FlaskConical,
  ch: Hash,
  question: CircleHelp,
};

/** Deterministic blob path (port of the reference Semantic Map `blob()`). */
const blob = (cx: number, cy: number, rx: number, ry: number, sd: number, sc: number): string => {
  const n = 16;
  const P: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + 0.15 * Math.sin(3 * a + sd) + 0.08 * Math.sin(5 * a + sd * 1.7) + 0.05 * Math.cos(2 * a + sd * 0.6) * (1 - sc * 0.3);
    P.push([cx + Math.cos(a) * rx * k * sc, cy + Math.sin(a) * ry * k * sc]);
  }
  const g = (i: number): [number, number] => P[(i + n) % n] ?? [cx, cy];
  let d = `M${g(0)[0].toFixed(1)},${g(0)[1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = g(i - 1);
    const p1 = g(i);
    const p2 = g(i + 1);
    const p3 = g(i + 2);
    d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(
      p2[1] -
      (p3[1] - p1[1]) / 6
    ).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return `${d}Z`;
};

/** Semantic Map layer: topic clusters with ring contours and member points. */
export const SemanticField: React.FC<{ width: number; height: number; reveal: number; portrait: boolean }> = ({ width, height, reveal, portrait }) => {
  if (reveal <= 0) return null;
  return (
    <svg
      viewBox={portrait ? '0 0 700 1000' : '0 0 1000 700'}
      width={width}
      height={height}
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}
    >
      {clusters.map((c, ci) => {
        const cx = portrait ? c.y : c.x;
        const cy = portrait ? 1000 - c.x : c.y;
        const rx = portrait ? c.ry : c.rx;
        const ry = portrait ? c.rx : c.ry;
        const local = Math.max(0, Math.min(1, reveal * 1.6 - ci * 0.08));
        return (
          <g key={c.n} opacity={local}>
            {[1, 0.8, 0.62, 0.45, 0.3].map((sc, j) => (
              <path
                key={j}
                d={blob(cx, cy, rx, ry, c.seed + j * 0.35, sc)}
                fill={c.c}
                fillOpacity={0.035}
                stroke={c.c}
                strokeOpacity={j === 0 ? 0.4 : 0.22}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {Array.from({ length: 14 }).map((_, i) => {
              const a = seeded(ci * 31 + i) * Math.PI * 2;
              const q = Math.sqrt(seeded(ci * 57 + i * 3)) * 0.78;
              return <circle key={i} cx={cx + Math.cos(a) * rx * q} cy={cy + Math.sin(a) * ry * q} r={2.6} fill={c.c} fillOpacity={0.55} />;
            })}
            <text
              x={cx}
              y={cy - ry * 0.95}
              textAnchor="middle"
              fontFamily={font.sans}
              fontSize={portrait ? 17 : 15}
              fontWeight={600}
              fill={color.tx3}
              opacity={0.75}
            >
              {c.n}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

/** Knowledge graph layer (reference `is.graph`): pill nodes and hairline links. */
export const KnowledgeGraph: React.FC<{ nodes: GNode[]; edges: GEdge[]; width: number; height: number; scale: number }> = ({
  nodes,
  edges,
  width,
  height,
  scale,
}) => (
  <>
    <svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
      {edges.map((e, i) =>
        e.draw > 0 ? (
          <line
            key={i}
            x1={e.x1}
            y1={e.y1}
            x2={mix(e.x1, e.x2, e.draw)}
            y2={mix(e.y1, e.y2, e.draw)}
            stroke={e.active > 0.5 ? color.actx : color.bd}
            strokeOpacity={mix(0.85, 1, e.active)}
            strokeWidth={mix(1.1, 1.8, e.active) / scale}
          />
        ) : null,
      )}
    </svg>
    {nodes.map((n) => {
      if (n.appear <= 0.001) return null;
      const tint = kind[n.kind];
      const q = n.kind === 'question';
      return (
        <div
          key={n.id}
          style={{
            position: 'absolute',
            left: n.x,
            top: n.y,
            transform: `translate(-50%, -50%) scale(${mix(0.6, 1, n.appear) * (q ? 1.12 : 1)})`,
            opacity: n.appear * mix(0.55, 1, Math.max(n.near, n.selected)),
            filter: n.appear < 1 ? `blur(${(1 - n.appear) * 6}px)` : undefined,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 40,
            padding: '0 14px 0 5px',
            borderRadius: 20,
            border: `1px solid ${n.selected > 0.5 ? color.tx : q ? '#5A5A55' : color.bd}`,
            background: n.selected > 0.5 ? color.el : color.pop,
            boxShadow:
              n.selected > 0
                ? `0 0 0 ${6 * n.selected}px rgba(91,141,239,${0.12 * n.selected}), 0 12px 30px rgba(0,0,0,.45)`
                : '0 8px 22px rgba(0,0,0,.35)',
            whiteSpace: 'nowrap',
            fontFamily: font.sans,
            fontSize: 15,
            fontWeight: 500,
            color: color.tx,
          }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: q ? 'rgba(236,236,234,.1)' : `color-mix(in srgb, ${tint} 20%, transparent)`,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Icon icon={icons[n.kind]} size={15} tint={tint} />
          </span>
          {n.label}
        </div>
      );
    })}
  </>
);
