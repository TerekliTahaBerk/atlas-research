import { BookOpen, FileText } from 'lucide-react';
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { HomeView } from '../../components/HomeView';
import { Icon } from '../../components/Icon';
import { Stage } from '../../components/Stage';
import { useLayout } from '../../design/layout';
import { ease, mix, progress } from '../../design/motion';
import { Layer, Rig, aim } from '../../design/rig';
import { color, kind } from '../../design/tokens';
import { font } from '../../design/typography';
import { COMPOSER, pick as pickA } from '../anchors';
import { BrandMoment, horizonY } from '../components/BrandMoment';
import { Composer } from '../components/Composer';
import { Window, useWin, winToScreen } from '../components/Window';
import { at } from '../storyboard';

/** Composer geometry in window space (bottom-centre of the main pane). */
export const composerInWin = (portrait: boolean) =>
  portrait ? { x: 30, y: 820, w: 560 } : { x: 241 + (1359 - 680) / 2, y: 868, w: 680 };

const Chip: React.FC<{ icon: typeof BookOpen; tint: string; t: string; s: string }> = ({ icon, tint, t, s }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '9px 14px 9px 10px',
      borderRadius: 12,
      background: 'rgba(38,38,37,.92)',
      border: `1px solid ${color.bd}`,
      boxShadow: '0 20px 50px rgba(0,0,0,.5)',
      fontFamily: font.sans,
      whiteSpace: 'nowrap',
    }}
  >
    <span style={{ width: 30, height: 30, borderRadius: 8, background: color.el, display: 'grid', placeItems: 'center' }}>
      <Icon icon={icon} size={15} tint={tint} />
    </span>
    <span style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 14, fontWeight: 500, color: color.tx }}>{t}</span>
      <span style={{ fontSize: 11.5, color: color.tx3 }}>{s}</span>
    </span>
  </div>
);

/**
 * 00:08–00:13 — THE PRODUCT REVEAL. The wordmark's horizon hairline widens
 * and becomes the hinge of the workspace: the window swings open from
 * edge-on while the camera arcs across three parallax layers, then aims at
 * the composer that already holds the opening question.
 */
export const RevealScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, portrait, pick } = useLayout();
  const w = useWin();
  const wm = at('reveal', 'wordmark');
  const unfold = at('reveal', 'unfold');
  const submit = at('reveal', 'submit');
  const lineY = horizonY(height, portrait);

  const spread = progress(frame, unfold - 10, unfold + 8, ease.inOut);
  const open = progress(frame, unfold + 10, unfold + 58, ease.out);
  const wordOut = progress(frame, unfold - 12, unfold + 10, ease.in);

  const c = composerInWin(portrait);
  const anchor = pickA(COMPOSER, portrait);
  const cRest = winToScreen(w, [c.x + c.w / 2, c.y + 28]);
  const S = anchor.w / (c.w * w.zoom);
  const depth = 1.15;
  const end = aim(cRest, [anchor.cx, anchor.cy], S, depth, [width / 2, height / 2]);

  const keys = portrait
    ? [
        { at: unfold, s: 0.94, ry: -10, rx: 4, x: 0, y: 30 },
        { at: unfold + 70, s: 1, ry: -4, rx: 2, x: 0, y: 0 },
        { at: unfold + 95, s: 1.02, ry: 0, rx: 0 },
        { at: submit - 6, ...end, ry: 0, rx: 0 },
        { at: 170, ...end },
      ]
    : [
        { at: unfold, s: 0.9, ry: -16, rx: 5, x: 90, y: 20 },
        { at: unfold + 70, s: 1, ry: -5, rx: 2, x: 0, y: 0 },
        { at: unfold + 95, s: 1.02, ry: 0, rx: 0, x: 0, y: 0 },
        { at: submit - 6, ...end, ry: 0, rx: 0 },
        { at: 170, ...end },
      ];

  // Window: top edge starts on the horizon line, edge-on, and swings open.
  const top0 = lineY - w.top;
  const hinge = `translateY(${mix(top0, 0, ease.inOut(open))}px) perspective(1800px) rotateX(${mix(86, 0, open)}deg)`;
  const composerIn = progress(frame, unfold + 40, unfold + 64, ease.out);

  return (
    <Stage light={mix(0.6, 1, open)}>
      <Rig keys={keys}>
        <Layer depth={0.35}>
          <AbsoluteFill
            style={{
              opacity: open * 0.8,
              background: `radial-gradient(ellipse 60% 45% at ${pick(55, 50)}% 35%, rgba(91,141,239,.06), rgba(0,0,0,0) 70%)`,
            }}
          />
        </Layer>
        <Layer depth={1}>
          {frame >= unfold - 2 ? (
            <Window active="home" hinge={hinge} style={{ opacity: Math.min(1, open * 4) }}>
              <HomeView narrow={portrait} />
            </Window>
          ) : null}
        </Layer>
        <Layer depth={depth}>
          <div
            style={{
              position: 'absolute',
              left: w.left + c.x * w.zoom,
              top: w.top + c.y * w.zoom,
              transform: `scale(${w.zoom}) translateY(${(1 - composerIn) * 30}px)`,
              transformOrigin: '0 0',
              opacity: composerIn,
            }}
          >
            <Composer
              width={c.w}
              caret={frame < submit && Math.floor(frame / 15) % 2 === 0}
              press={progress(frame, submit, submit + 8, (t) => t)}
            />
          </div>
        </Layer>
        <Layer depth={1.6} dof={5}>
          <div style={{ position: 'absolute', left: pick(60, 40), top: pick(720, 1500), opacity: open * 0.9 * (1 - progress(frame, submit - 30, submit)) }}>
            <Chip icon={BookOpen} tint={kind.paper} t="Chen & Duarte, 2023" s="Paper · page 3 of 14" />
          </div>
          <div style={{ position: 'absolute', left: pick(1500, 640), top: pick(160, 320), opacity: open * 0.9 * (1 - progress(frame, submit - 30, submit)) }}>
            <Chip icon={FileText} tint={kind.doc} t="Reading notes" s="low-rank pairs" />
          </div>
        </Layer>
      </Rig>
      <AbsoluteFill style={{ opacity: 1 - wordOut, transform: `translateY(${-wordOut * 60}px)` }}>
        <BrandMoment start={wm} />
      </AbsoluteFill>
      {spread < 1 || frame < unfold + 10 ? (
        <div
          style={{
            position: 'absolute',
            top: lineY,
            left: width / 2,
            height: 1,
            width: mix(wordmarkWidth(portrait), w.width * w.zoom, spread),
            transform: 'translateX(-50%)',
            background: `linear-gradient(90deg, rgba(236,236,234,0), ${color.tx} 12%, ${color.tx} 88%, rgba(236,236,234,0))`,
            opacity: progress(frame, unfold - 14, unfold - 6) * (1 - progress(frame, unfold + 6, unfold + 16)),
          }}
        />
      ) : null}
    </Stage>
  );
};

const wordmarkWidth = (portrait: boolean) => (portrait ? 620 : 720);
