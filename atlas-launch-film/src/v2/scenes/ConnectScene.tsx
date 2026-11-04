import { BookOpen, CircleHelp, FileCode, FileText, FlaskConical, Hash, ListTodo, type LucideIcon } from 'lucide-react';
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Icon } from '../../components/Icon';
import { Stage } from '../../components/Stage';
import { clusters, type NodeKind } from '../../data/demoResearch';
import { useLayout } from '../../design/layout';
import { ease, mix, progress, seeded } from '../../design/motion';
import { projectPlane, type PlaneCam } from '../../design/rig';
import { color, kind } from '../../design/tokens';
import { font } from '../../design/typography';
import { NOTE, TASK, pick as pickA } from '../anchors';
import { ConceptBadge } from '../components/ConceptBadge';
import { EditorialTitle } from '../components/EditorialTitle';
import { NOTE_H, NOTE_W, NoteCard } from '../components/NoteCard';
import { TASK_W, TaskHeroCard } from '../components/TaskHeroCard';
import { at } from '../storyboard';

type N = { id: string; kind: NodeKind; label: string; a: [number, number]; b: [number, number]; wave: number };

/** V2 topology on the ground plane (px). Phase A orbits the note; B the question. */
const NODES: N[] = [
  { id: 'note', kind: 'doc', label: 'Reading notes — low-rank pairs', a: [0, 0], b: [-380, 300], wave: 0 },
  { id: 'p2', kind: 'paper', label: 'Chen & Duarte 2023', a: [-430, 250], b: [-720, 110], wave: 1 },
  { id: 'p1', kind: 'paper', label: 'Okafor 2024', a: [440, 240], b: [720, 120], wave: 1 },
  { id: 'rq', kind: 'question', label: 'Scaling to long proteins?', a: [0, -330], b: [0, 0], wave: 2 },
  { id: 'p4', kind: 'paper', label: 'Novak & Haddad 2025', a: [-450, -250], b: [-470, -340], wave: 2 },
  { id: 'p5', kind: 'paper', label: 'Park & Osei 2024', a: [460, -240], b: [-880, -120], wave: 3 },
  { id: 'ms', kind: 'ms', label: 'main.tex', a: [660, 10], b: [400, 300], wave: 3 },
  { id: 'ch', kind: 'ch', label: '#reading-group', a: [-670, 20], b: [820, -250], wave: 4 },
  { id: 'd2', kind: 'doc', label: 'Lab meeting · Oct 20', a: [-120, 450], b: [0, 560], wave: 4 },
  { id: 'nb', kind: 'exp', label: 'run_14 sweep', a: [240, -530], b: [430, -380], wave: 4 },
];
const EDGES: Array<[string, string]> = [
  ['note', 'p2'],
  ['note', 'p1'],
  ['note', 'rq'],
  ['note', 'p4'],
  ['note', 'p5'],
  ['note', 'ms'],
  ['rq', 'p2'],
  ['rq', 'p1'],
  ['rq', 'p4'],
  ['rq', 'ms'],
  ['ms', 'p1'],
  ['nb', 'p4'],
  ['nb', 'ms'],
  ['ch', 'note'],
  ['d2', 'note'],
  ['d2', 'rq'],
];
const SPLIT: [string, string] = ['note', 'ms'];
const ICONS: Record<NodeKind, LucideIcon> = { paper: BookOpen, doc: FileText, ms: FileCode, task: ListTodo, exp: FlaskConical, ch: Hash, question: CircleHelp };

type K = { at: number } & Partial<PlaneCam>;
const sampleCam = (keys: K[], f: number, base: PlaneCam): PlaneCam => {
  const out = { ...base };
  (['tx', 'tz', 'yaw', 'pitch', 'dist', 'focal'] as const).forEach((p) => {
    let last = base[p];
    const tr = keys.map((k) => {
      last = k[p] ?? last;
      return [k.at, last] as const;
    });
    let v = tr[0]?.[1] ?? base[p];
    for (let i = 1; i < tr.length; i++) {
      const a = tr[i - 1];
      const b = tr[i];
      if (!a || !b) continue;
      if (f <= a[0]) break;
      v = f >= b[0] ? b[1] : mix(a[1], b[1], progress(f, a[0], b[0], ease.inOut));
    }
    out[p] = v;
  });
  return out;
};

const blobPts = (cx: number, cz: number, rx: number, rz: number, sd: number, sc: number) =>
  Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const k = 1 + 0.15 * Math.sin(3 * a + sd) + 0.08 * Math.sin(5 * a + sd * 1.7);
    return [cx + Math.cos(a) * rx * k * sc, cz + Math.sin(a) * rz * k * sc] as [number, number];
  });
const smooth = (P: Array<[number, number]>) => {
  const n = P.length;
  const g = (i: number) => P[(i + n) % n] ?? [0, 0];
  let d = `M${g(0)[0].toFixed(1)},${g(0)[1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = g(i - 1);
    const p1 = g(i);
    const p2 = g(i + 1);
    const p3 = g(i + 2);
    d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return `${d}Z`;
};

/**
 * 00:31–00:40 — CONNECT (centrepiece). The note becomes a node on a 2.5D
 * research plane. Linked objects rise in waves, the network reorganises
 * around the question, the camera pulls back over the Semantic Map, and one
 * connection splits to give birth to a task.
 */
export const ConnectScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { portrait, pick } = useLayout();
  const C: [number, number] = [width / 2, height / 2 + pick(40, 60)];
  const waves = [0, at('connect', 'waveA'), at('connect', 'waveB'), at('connect', 'waveC'), at('connect', 'waveD')];
  const reorg = at('connect', 'reorganize');
  const pull = at('connect', 'pullBack');
  const pulse = at('connect', 'edgePulse');
  const spawn = at('connect', 'taskSpawn');
  const dive = at('connect', 'taskDive');

  const r = progress(frame, reorg, reorg + 50, ease.inOut);
  const sx = portrait ? 0.62 : 1; // portrait compresses the plane horizontally
  const pos = (n: N): [number, number] => [mix(n.a[0], n.b[0], r) * sx, mix(n.a[1], n.b[1], r) * (portrait ? 1.25 : 1)];
  const noteB = NODES[0]?.b ?? [0, 0];
  const msB = NODES.find((n) => n.id === 'ms')?.b ?? [0, 0];
  const t27: [number, number] = [((noteB[0] + msB[0]) / 2) * sx, ((noteB[1] + msB[1]) / 2 + 120) * (portrait ? 1.25 : 1)];

  const base: PlaneCam = { tx: 0, tz: 0, yaw: 0, pitch: 90, dist: 520, focal: 1000 };
  const cam = sampleCam(
    [
      { at: 0, tx: 0, tz: 0, pitch: 90, dist: 470, yaw: 0 },
      { at: waves[1] ?? 30, pitch: 64, dist: 760, yaw: -12 },
      { at: reorg, tx: 0, tz: -60, pitch: 44, dist: pick(980, 1100), yaw: -6 },
      { at: reorg + 50, tx: 0, tz: 40, pitch: 38, dist: pick(1040, 1150), yaw: 6 },
      { at: pull, pitch: 36, dist: pick(1120, 1250), yaw: 10 },
      { at: pull + 55, tx: 0, tz: 120, pitch: 29, dist: pick(1600, 1750), yaw: 18 },
      { at: pulse, tx: 0, tz: 110, pitch: 30, dist: pick(1520, 1650), yaw: 15 },
      { at: dive, tx: t27[0] * 0.5, tz: t27[1] * 0.6, pitch: 52, dist: 1050, yaw: 6 },
      { at: 270, tx: t27[0], tz: t27[1], pitch: 90, dist: 470, yaw: 0 },
    ],
    frame,
    base,
  );
  const P = (g: [number, number]) => projectPlane(g[0], g[1], cam, C);

  const focusNote = progress(frame, 6, 18) * (1 - progress(frame, reorg, reorg + 30));
  const focusRq = progress(frame, reorg + 10, reorg + 40) * (1 - progress(frame, pulse, pulse + 20));
  const field = progress(frame, pull, pull + 60, ease.inOut);
  const tAppear = progress(frame, spawn, spawn + 16, ease.out);
  const split = progress(frame, spawn - 2, spawn + 10);

  const nodes = NODES.map((n) => {
    const g = pos(n);
    const p = P(g);
    const ap = progress(frame, waves[n.wave] ?? 0, (waves[n.wave] ?? 0) + 20, ease.out);
    return { n, g, p, ap };
  });
  const by = Object.fromEntries(nodes.map((x) => [x.n.id, x]));
  const active = (id: string) => (id === 'note' ? focusNote : id === 'rq' ? focusRq : 0);

  const diveDim = 1 - 0.88 * progress(frame, dive, dive + 22, ease.inOut);
  // Floor: projected grid lines (make the perspective legible) and dots.
  const dots: React.ReactNode[] = [];
  for (let g = -1600; g <= 1600; g += 400) {
    const a = P([g, -1300]);
    const b = P([g, 1300]);
    const c = P([-1600, g * 0.8]);
    const d = P([1600, g * 0.8]);
    dots.push(<line key={`gx${g}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} stroke={color.bd} strokeWidth={1} opacity={0.35 * diveDim * progress(frame, 0, 30)} />);
    dots.push(<line key={`gz${g}`} x1={c.sx} y1={c.sy} x2={d.sx} y2={d.sy} stroke={color.bd} strokeWidth={1} opacity={0.35 * diveDim * progress(frame, 0, 30)} />);
  }
  for (let gx = -1600; gx <= 1600; gx += 100) {
    for (let gz = -1300; gz <= 1300; gz += 100) {
      const p = P([gx, gz]);
      if (p.sx < -40 || p.sx > width + 40 || p.sy < -40 || p.sy > height + 40) continue;
      const fade = Math.max(0, 1 - Math.hypot(gx, gz) / 1700);
      dots.push(<circle key={`${gx}:${gz}`} cx={p.sx} cy={p.sy} r={Math.max(0.6, 1.3 * p.k)} fill="#55554F" opacity={0.9 * fade * diveDim * progress(frame, 0, 30)} />);
    }
  }

  const card = 1 - progress(frame, 0, 18, ease.inOut);
  const nA = pickA(NOTE, portrait);
  const tA = pickA(TASK, portrait);
  const taskCard = progress(frame, 252, 270, ease.inOut);
  const pulseT = progress(frame, pulse, pulse + 20, ease.inOut);

  return (
    <Stage light={0.9}>
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        {dots}
        {clusters.map((c, ci) => {
          const cx = (c.x - 500) * 2.6 * sx;
          const cz = (350 - c.y) * 2.8 * (portrait ? 1.25 : 1);
          const local = Math.max(0, Math.min(1, field * 1.5 - ci * 0.07));
          if (local <= 0) return null;
          const lab = P([cx, cz + c.ry * 2.6]);
          return (
            <g key={c.n} opacity={local * diveDim}>
              {[1, 0.72, 0.48].map((sc, j) => (
                <path
                  key={j}
                  d={smooth(blobPts(cx, cz, c.rx * 2.4, c.ry * 2.6, c.seed + j * 0.35, sc).map((q) => {
                    const p = P(q);
                    return [p.sx, p.sy] as [number, number];
                  }))}
                  fill={c.c}
                  fillOpacity={0.04}
                  stroke={c.c}
                  strokeOpacity={j === 0 ? 0.42 : 0.2}
                  strokeWidth={1}
                />
              ))}
              {Array.from({ length: 12 }).map((_, i) => {
                const a = seeded(ci * 31 + i) * Math.PI * 2;
                const q = Math.sqrt(seeded(ci * 57 + i * 3)) * 0.75;
                const p = P([cx + Math.cos(a) * c.rx * 2.4 * q, cz + Math.sin(a) * c.ry * 2.6 * q]);
                return <circle key={i} cx={p.sx} cy={p.sy} r={2.4 * Math.max(0.6, p.k)} fill={c.c} fillOpacity={0.6} />;
              })}
              <text x={lab.sx} y={lab.sy} textAnchor="middle" fontFamily={font.sans} fontSize={Math.max(13, 17 * lab.k)} fontWeight={600} fill={color.tx3}>
                {c.n}
              </text>
            </g>
          );
        })}
        {EDGES.map(([a, b], i) => {
          const A = by[a];
          const B = by[b];
          if (!A || !B) return null;
          const start = Math.max(waves[A.n.wave] ?? 0, waves[B.n.wave] ?? 0) + 6;
          const d = progress(frame, start, start + 20, ease.out);
          if (d <= 0) return null;
          const isSplit = a === SPLIT[0] && b === SPLIT[1];
          const on = Math.max(active(a), active(b), isSplit ? pulseT * (1 - split) : 0);
          const [first, second] = A.n.wave <= B.n.wave ? [A, B] : [B, A];
          return (
            <line
              key={i}
              x1={first.p.sx}
              y1={first.p.sy}
              x2={mix(first.p.sx, second.p.sx, d)}
              y2={mix(first.p.sy, second.p.sy, d)}
              stroke={on > 0.4 ? color.actx : color.bd}
              strokeWidth={mix(1.1, 2, on)}
              opacity={(isSplit ? 1 - split : 0.95) * diveDim}
            />
          );
        })}
        {split > 0 && by.note && by.ms
          ? ['note', 'ms', 'rq'].map((id) => {
              const A = by[id];
              const T = P(t27);
              if (!A) return null;
              return (
                <line key={id} x1={A.p.sx} y1={A.p.sy} x2={mix(A.p.sx, T.sx, tAppear)} y2={mix(A.p.sy, T.sy, tAppear)} stroke={color.actx} strokeWidth={2} opacity={split} />
              );
            })
          : null}
        {pulseT > 0 && pulseT < 1 && by.note && by.ms ? (
          <circle
            cx={mix(by.note.p.sx, by.ms.p.sx, pulseT)}
            cy={mix(by.note.p.sy, by.ms.p.sy, pulseT)}
            r={5}
            fill={color.actx}
            style={{ filter: 'drop-shadow(0 0 8px rgba(157,187,245,.9))' }}
          />
        ) : null}
      </svg>
      {nodes
        .slice()
        .sort((x, y) => y.p.zc - x.p.zc)
        .map(({ n, p, ap }) => {
          if (ap <= 0.001) return null;
          const sel = active(n.id);
          const q = n.kind === 'question';
          const sc = Math.max(0.66, p.k) * (q ? 1.12 : 1) * pick(1, 1.4);
          const fog = Math.max(0.45, Math.min(1, 2.2 - p.zc / 1400));
          return (
            <div
              key={n.id}
              style={{
                position: 'absolute',
                left: p.sx,
                top: p.sy,
                transform: `translate(-50%, -100%) translateY(${(1 - ap) * 26 * sc}px) scale(${mix(0.7, 1, ap) * sc})`,
                transformOrigin: '50% 100%',
                opacity: ap * fog * diveDim * (n.id === 'note' ? progress(frame, 8, 20) : 1),
                filter: ap < 1 ? `blur(${(1 - ap) * 5}px)` : undefined,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                height: 40,
                padding: '0 14px 0 5px',
                borderRadius: 20,
                border: `1px solid ${sel > 0.5 ? color.tx : q ? '#5A5A55' : color.bd}`,
                background: sel > 0.5 ? color.el : color.pop,
                boxShadow: `0 0 0 ${6 * sel}px rgba(91,141,239,${0.14 * sel}), 0 14px 30px rgba(0,0,0,.5)`,
                whiteSpace: 'nowrap',
                fontFamily: font.sans,
                fontSize: 15,
                fontWeight: 500,
                color: color.tx,
              }}
            >
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: q ? 'rgba(236,236,234,.1)' : `color-mix(in srgb, ${kind[n.kind]} 20%, transparent)`, display: 'grid', placeItems: 'center' }}>
                <Icon icon={ICONS[n.kind]} size={15} tint={kind[n.kind]} />
              </span>
              {n.label}
            </div>
          );
        })}
      {tAppear > 0 && taskCard < 1
        ? (() => {
            const p = P(t27);
            const sc = Math.max(0.5, p.k) * pick(1, 1.15);
            return (
              <div
                style={{
                  position: 'absolute',
                  left: p.sx,
                  top: p.sy,
                  transform: `translate(-50%, -100%) scale(${mix(0.5, 1, tAppear) * sc})`,
                  transformOrigin: '50% 100%',
                  opacity: tAppear * (1 - taskCard),
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  height: 40,
                  padding: '0 14px 0 5px',
                  borderRadius: 20,
                  border: `1px solid ${color.tx}`,
                  background: color.el,
                  boxShadow: '0 0 0 6px rgba(91,141,239,.16), 0 14px 30px rgba(0,0,0,.5)',
                  whiteSpace: 'nowrap',
                  fontFamily: font.sans,
                  fontSize: 15,
                  fontWeight: 500,
                  color: color.tx,
                }}
              >
                <span style={{ width: 30, height: 30, borderRadius: '50%', background: `color-mix(in srgb, ${kind.task} 22%, transparent)`, display: 'grid', placeItems: 'center' }}>
                  <Icon icon={ListTodo} size={15} tint={kind.task} />
                </span>
                ATL-27 · Write §3
              </div>
            );
          })()
        : null}
      {taskCard > 0 ? (
        <div
          style={{
            position: 'absolute',
            left: tA.cx,
            top: tA.cy,
            transform: `translate(-50%, -50%) scale(${(tA.w / TASK_W) * mix(0.55, 1, taskCard)})`,
            opacity: taskCard,
          }}
        >
          <TaskHeroCard />
        </div>
      ) : null}
      {card > 0.01 ? (
        <div style={{ position: 'absolute', left: nA.cx, top: nA.cy, transform: `translate(-50%, -50%) scale(${(nA.w / NOTE_W) * mix(0.4, 1, card)})`, opacity: card }}>
          <NoteCard width={NOTE_W} style={{ height: undefined }} />
        </div>
      ) : null}
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <EditorialTitle
          text="See how ideas connect."
          from={at('connect', 'connectTitle')}
          exitAt={pulse - 10}
          size={pick(96, 84)}
          weight={600}
          align="center"
          style={{ left: 0, right: 0, top: pick(84, 250) }}
        />
        <ConceptBadge from={20} exitAt={250} style={portrait ? { left: 0, right: 0, margin: '0 auto', width: 'fit-content', top: 470 } : { left: 64, bottom: 44 }} size={pick(13, 17)} />
      </AbsoluteFill>
      <div style={{ display: 'none' }}>{NOTE_H(portrait)}</div>
    </Stage>
  );
};
