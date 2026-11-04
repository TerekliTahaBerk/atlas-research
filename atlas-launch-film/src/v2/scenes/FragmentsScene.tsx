import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { fragments } from '../../components/Constellation';
import { Icon } from '../../components/Icon';
import { Stage } from '../../components/Stage';
import { useLayout } from '../../design/layout';
import { ease, mix, progress, seeded } from '../../design/motion';
import { color } from '../../design/tokens';
import { font } from '../../design/typography';
import { BrandMoment } from '../components/BrandMoment';
import { at } from '../storyboard';

const F = 900;
/** 3D layout of the fragments (x, y in px at z = F; z = depth). */
const field = fragments.map((fr, i) => {
  const [lx, ly] = fr.l;
  const [px, py] = fr.p;
  return { fr, l: [lx * 1.05, ly * 1.1] as const, p: [px * 1.15, py * 0.85 + 80] as const, z: 1000 + seeded(i * 13 + 5) * 700 };
});
const links: Array<[number, number, 'linkA' | 'linkB' | 'linkC']> = [
  [0, 2, 'linkA'],
  [4, 8, 'linkA'],
  [1, 3, 'linkB'],
  [6, 4, 'linkB'],
  [7, 5, 'linkC'],
  [9, 1, 'linkC'],
];

/**
 * 00:03–00:08 — FROM FRAGMENTS TO ATLAS. A true depth fly-through: the
 * camera dollies forward through research fragments (perspective-correct
 * parallax and focus). Links are only suggested. Then everything is drawn
 * into the point, and the point becomes the mark.
 */
export const FragmentsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, portrait, pick } = useLayout();
  const cx = width / 2;
  const cy = height / 2;
  const converge = at('fragments', 'converge');
  const wm = at('fragments', 'wordmark');
  const burst = progress(frame, 0, 46, ease.out);
  const camZ = mix(0, 520, progress(frame, 0, converge + 10, ease.soft));
  const pull = progress(frame, converge, wm, ease.in);

  const pts = field.map((f, i) => {
    const [x, y] = portrait ? f.p : f.l;
    const k = F / (f.z - camZ);
    const b = progress(burst, i * 0.04, 0.6 + i * 0.04, ease.out);
    const sx = cx + x * k * b;
    const sy = cy + y * k * b;
    return { x: mix(sx, cx, pull), y: mix(sy, cy, pull), k: k * mix(1, 0.15, pull), b, z: f.z - camZ };
  });

  return (
    <Stage light={mix(0.55, 0.8, burst)}>
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        {links.map(([a, b, c], i) => {
          const A = pts[a];
          const B = pts[b];
          if (!A || !B) return null;
          const t = progress(frame, at('fragments', c), at('fragments', c) + 24, ease.out);
          if (t <= 0) return null;
          const reach = Math.min(1, t * 1.25) * 0.78;
          return (
            <line
              key={i}
              x1={A.x}
              y1={A.y}
              x2={mix(A.x, B.x, reach)}
              y2={mix(A.y, B.y, reach)}
              stroke={color.tx2}
              strokeWidth={1.4}
              strokeDasharray="2 6"
              opacity={mix(0.7, 0.35, t) * (1 - pull)}
            />
          );
        })}
      </svg>
      {field.map((f, i) => {
        const p = pts[i];
        if (!p || p.b <= 0.01) return null;
        const blur = Math.abs(p.z - 900) / 190;
        const vis = p.b * (1 - progress(pull, 0.6, 1));
        return (
          <div
            key={f.fr.title}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              transform: `translate(-50%, -50%) scale(${p.k * pick(1.55, 1.6)})`,
              opacity: vis * mix(1, 0.55, Math.min(1, blur / 4)),
              filter: blur > 0.6 ? `blur(${Math.min(5, blur).toFixed(2)}px)` : undefined,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 14px 9px 10px',
              borderRadius: 12,
              background: 'rgba(38,38,37,.9)',
              border: `1px solid ${color.bd}`,
              boxShadow: '0 16px 40px rgba(0,0,0,.45)',
              fontFamily: font.sans,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ width: 30, height: 30, borderRadius: 8, background: color.el, border: `1px solid ${color.bd2}`, display: 'grid', placeItems: 'center' }}>
              <Icon icon={f.fr.icon} size={15} tint={f.fr.tint} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: color.tx }}>{f.fr.title}</span>
              <span style={{ fontSize: 11.5, color: color.tx3 }}>{f.fr.sub}</span>
            </span>
          </div>
        );
      })}
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <div
          style={{
            position: 'absolute',
            left: pick(140, 90),
            right: pick(undefined, 90),
            bottom: pick(110, 300),
            fontFamily: font.sans,
            fontSize: pick(44, 58),
            fontWeight: 500,
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            color: color.tx,
            opacity: progress(frame, at('fragments', 'isolation'), at('fragments', 'isolation') + 20) * (1 - progress(frame, converge - 12, converge + 6)),
            transform: `translateY(${(1 - progress(frame, at('fragments', 'isolation'), at('fragments', 'isolation') + 26, ease.out)) * 16}px)`,
          }}
        >
          Great ideas don’t exist in isolation.
        </div>
      </AbsoluteFill>
      <BrandMoment start={wm} pointFrom={[cx, cy]} />
    </Stage>
  );
};
