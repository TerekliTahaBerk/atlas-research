import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { ResearchInterface } from '../../components/ResearchInterface';
import { Stage } from '../../components/Stage';
import { useLayout } from '../../design/layout';
import { ease, mix, progress } from '../../design/motion';
import { Layer, Rig, aim, lerpRect, project, sampleRig, type Rect } from '../../design/rig';
import { color } from '../../design/tokens';
import { COMPOSER, PAGE, pick as pickA } from '../anchors';
import { EditorialTitle, Scrim } from '../components/EditorialTitle';
import { HeroRow } from '../components/HeroRow';
import { PaperPage } from '../components/PaperPage';
import { Window, useWin, winToScreen } from '../components/Window';
import { at } from '../storyboard';

/** Research layout constants in window space (see V2_MOTION_PLAN.md §Discover). */
const GEO = {
  landscape: { input: [920.5, 180] as [number, number], inputW: 712, row: { x: 552.5, y: 466, w: 736, h: 136 }, scroll: 300 },
  portrait: { input: [310, 174] as [number, number], inputW: 572, row: { x: 12, y: 488, w: 596, h: 158 }, scroll: 330 },
};

/**
 * 00:13–00:22 — DISCOVER. The composer becomes the Research input at the
 * same anchor; results stream; depth of field isolates one paper, which
 * lifts out of the list and unfolds into its own first page.
 */
export const DiscoverScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { portrait, pick } = useLayout();
  const w = useWin();
  const g = portrait ? GEO.portrait : GEO.landscape;
  const O: [number, number] = [width / 2, height / 2];

  const answer = at('discover', 'answer');
  const papersAt = at('discover', 'papers');
  const focus = at('discover', 'focusPaper');
  const openAt = at('discover', 'openPaper');
  const morph = at('discover', 'morphPage');
  const title = at('discover', 'discoverTitle');

  const anchor = pickA(COMPOSER, portrait);
  const inputRest = winToScreen(w, g.input);
  const start = aim(inputRest, [anchor.cx, anchor.cy], anchor.w / (g.inputW * w.zoom), 1, O);
  const scroll = progress(frame, papersAt - 10, focus - 6, ease.inOut) * g.scroll;
  const rowRestCenter = winToScreen(w, [g.row.x + g.row.w / 2, g.row.y - g.scroll + g.row.h / 2]);
  const overview = aim(winToScreen(w, [g.input[0], 330]), O, pick(1.18, 1.02), 1, O);
  const onHero = aim(rowRestCenter, [O[0], pick(560, 900)], pick(1.55, 1.18), 1, O);

  const keys = [
    { at: 0, ...start },
    { at: 44, ...overview },
    { at: focus, ...overview, s: overview.s * 1.02 },
    { at: focus + 50, ...onHero },
    { at: morph, ...onHero, s: onHero.s * 1.03 },
    { at: 290, ...onHero, s: onHero.s * 1.05 },
  ];
  const cam = sampleRig(keys, frame);

  const s = {
    typed: 1,
    caret: false,
    press: 0,
    loading: Math.min(progress(frame, 0, 6), 1 - progress(frame, answer - 4, answer + 4)),
    results: progress(frame, answer, papersAt + 40, (t) => t),
    focus: progress(frame, focus - 8, focus + 6, ease.out),
    expand: 0,
    scroll,
    inputOpen: progress(frame, 2, 20, ease.inOut),
    hideFocus: frame >= focus,
    rowBlur: progress(frame, focus, focus + 20, ease.out) * 2.4,
  };

  // Hero row: lifted in layer space, then handed to screen space for the morph.
  const lift = progress(frame, focus, focus + 18, ease.out);
  const m = progress(frame, morph, morph + 38, ease.inOut);
  const rowRect: Rect = {
    x: w.left + g.row.x * w.zoom,
    y: w.top + (g.row.y - g.scroll) * w.zoom,
    w: g.row.w * w.zoom,
    h: g.row.h * w.zoom,
  };
  const liftScale = 1 + 0.035 * lift;
  const camAtMorph = sampleRig(keys, morph);
  const [mx, my] = project(camAtMorph, 1, O, [rowRect.x + rowRect.w / 2, rowRect.y + rowRect.h / 2]);
  const S = (1 + (camAtMorph.s - 1)) * liftScale;
  const fromRect: Rect = { x: mx - (rowRect.w * S) / 2, y: my - (rowRect.h * S) / 2, w: rowRect.w * S, h: rowRect.h * S };
  const page = pickA(PAGE, portrait);
  const r = lerpRect(fromRect, page, m);
  const fade = progress(frame, morph, morph + 30, ease.inOut);

  return (
    <Stage>
      <Rig keys={keys}>
        <Layer depth={1} dof={0}>
          <div style={{ opacity: 1 - fade * 0.92, filter: fade > 0 ? `blur(${fade * 6}px)` : undefined }}>
            <Window active="research">
              <ResearchInterface s={s} narrow={portrait} />
            </Window>
          </div>
        </Layer>
        {frame >= focus && frame < morph ? (
          <Layer depth={1}>
            <div
              style={{
                position: 'absolute',
                left: rowRect.x,
                top: rowRect.y,
                width: rowRect.w,
                transformOrigin: '50% 50%',
                transform: `scale(${liftScale})`,
                boxShadow: `0 ${30 * lift}px ${70 * lift}px rgba(0,0,0,${0.55 * lift})`,
                borderRadius: 12,
              }}
            >
              <div style={{ width: g.row.w, transform: `scale(${w.zoom})`, transformOrigin: '0 0' }}>
                <HeroRow width={g.row.w} open={progress(frame, openAt, openAt + 10, ease.out)} />
              </div>
            </div>
          </Layer>
        ) : null}
      </Rig>
      {frame >= morph ? (
        <div
          style={{
            position: 'absolute',
            left: r.x,
            top: r.y,
            width: r.w,
            height: r.h,
            borderRadius: mix(12, 4, m),
            overflow: 'hidden',
            background: `rgb(${mix(46, 255, m)},${mix(46, 255, m)},${mix(44, 255, m)})`,
            boxShadow: `0 ${mix(30, 40, m)}px ${mix(70, 120, m)}px rgba(0,0,0,.55)`,
          }}
        >
          <div style={{ position: 'absolute', left: 0, top: 0, width: fromRect.w / S, transform: `scale(${(r.w / fromRect.w) * S})`, transformOrigin: '0 0', opacity: 1 - progress(m, 0, 0.45) }}>
            <HeroRow width={fromRect.w / S} open={1} style={{ boxShadow: 'none' }} />
          </div>
          <div style={{ position: 'absolute', left: 0, top: 0, opacity: progress(m, 0.35, 0.9), transform: `scale(${r.w / page.w})`, transformOrigin: '0 0' }}>
            <PaperPage width={page.w} style={{ boxShadow: 'none' }} />
          </div>
        </div>
      ) : null}
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <Scrim opacity={progress(frame, title - 10, title + 10) * (1 - progress(frame, focus + 20, focus + 40))} height={pick(380, 520)} top={portrait} />
        <EditorialTitle
          text="Discover what matters."
          from={title}
          exitAt={focus + 24}
          size={pick(64, 76)}
          scrim
          style={portrait ? { left: 90, right: 90, top: 210 } : { left: 120, bottom: 96 }}
        />
      </AbsoluteFill>
      <div style={{ display: 'none', color: color.tx }}>{cam.s}</div>
    </Stage>
  );
};
