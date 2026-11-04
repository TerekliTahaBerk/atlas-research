import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { ManuscriptInterface } from '../../components/ManuscriptInterface';
import { Stage } from '../../components/Stage';
import { useLayout } from '../../design/layout';
import { ease, mix, progress } from '../../design/motion';
import { Layer, Rig, aim, lerpRect, project, sampleRig, type Rect } from '../../design/rig';
import { ConceptBadge } from '../components/ConceptBadge';
import { EditorialTitle } from '../components/EditorialTitle';
import { ManuscriptPage } from '../components/ManuscriptPage';
import { Window, useWin, winToScreen } from '../components/Window';
import { at } from '../storyboard';

/** The lifted page's final screen rect (shared with AtlasScene). */
export const LIFTED = {
  landscape: { x: 560, y: 70, w: 800, h: 800 * (11 / 8.5) } as Rect,
  portrait: { x: 90, y: 520, w: 900, h: 900 * (11 / 8.5) } as Rect,
};

/** Window-space geometry of the manuscript view (see ManuscriptInterface). */
const GEO = {
  landscape: { editor: [729, 330] as [number, number], editorW: 576, insert: [729, 330] as [number, number], preview: { x: 1052, y: 104, w: 520 } },
  portrait: { editor: [310, 230] as [number, number], editorW: 620, insert: [310, 300] as [number, number], preview: { x: 100, y: 579, w: 420 } },
};

/**
 * 00:48–00:55 — CREATE. From an extreme close-up of the editor (the chip
 * that opened it), the note's insight becomes cited LaTeX; a recompile
 * renders it, and the finished page lifts out of the interface.
 */
export const CreateScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { portrait, pick } = useLayout();
  const w = useWin();
  const g = portrait ? GEO.portrait : GEO.landscape;
  const O: [number, number] = [width / 2, height / 2];

  const ins = at('create', 'insert');
  const comp = at('create', 'compile');
  const prev = at('create', 'preview');
  const lift = at('create', 'liftPage');

  const macro = aim(winToScreen(w, g.editor), O, width / (g.editorW * w.zoom), 1, O);
  const onInsert = aim(winToScreen(w, g.insert), O, pick(1.75, 1.12), 1, O);
  const pv = g.preview;
  const pvCenter = winToScreen(w, [pv.x + pv.w / 2, pv.y + (pv.w * 11) / 8.5 / 2.6]);
  const onPreview = aim(pvCenter, O, pick(1.45, 1.12), 1, O);
  const keys = [
    { at: 0, ...macro },
    { at: ins - 6, ...onInsert },
    { at: comp + 6, ...onInsert, s: onInsert.s * 1.02 },
    { at: prev + 10, ...onPreview, ry: 0 },
    { at: lift, ...onPreview, s: onPreview.s * 1.03 },
    { at: 230, ...onPreview, s: onPreview.s * 0.98 },
  ];
  const cam = sampleRig(keys, frame);

  const s = {
    fly: progress(frame, ins - 24, ins + 4, (t) => t),
    insert: progress(frame, ins, ins + 34, (t) => t),
    compile: progress(frame, comp, comp + 20, (t) => t),
    preview: progress(frame, comp + 12, comp + 60, ease.out),
  };

  const camAtLift = sampleRig(keys, lift);
  const pr: Rect = { x: w.left + pv.x * w.zoom, y: w.top + pv.y * w.zoom, w: pv.w * w.zoom, h: ((pv.w * 11) / 8.5) * w.zoom };
  const [px, py] = project(camAtLift, 1, O, [pr.x, pr.y]);
  const from: Rect = { x: px, y: py, w: pr.w * camAtLift.s, h: pr.h * camAtLift.s };
  const to = portrait ? LIFTED.portrait : LIFTED.landscape;
  const l = progress(frame, lift, lift + 36, ease.inOut);
  const r = lerpRect(from, to, l);
  const dim = progress(frame, lift, lift + 30, ease.inOut);

  return (
    <Stage>
      <Rig keys={keys}>
        <Layer depth={1}>
          <div style={{ opacity: mix(1, 0.18, dim), filter: dim > 0 ? `blur(${dim * 5}px)` : undefined }}>
            <Window active="manuscript">
              <ManuscriptInterface s={s} narrow={portrait} />
            </Window>
          </div>
        </Layer>
      </Rig>
      {frame >= lift ? (
        <div style={{ position: 'absolute', left: r.x, top: r.y, transform: `scale(${r.w / to.w})`, transformOrigin: '0 0' }}>
          <ManuscriptPage width={to.w} highlight={1 - 0.5 * l} style={{ boxShadow: `0 ${60 * l}px ${140 * l}px rgba(0,0,0,.6)` }} />
        </div>
      ) : null}
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <EditorialTitle
          text="From questions to knowledge."
          from={at('create', 'createTitle')}
          size={pick(58, 66)}
          align={portrait ? 'center' : 'left'}
          scrim
          style={portrait ? { left: 60, right: 60, top: 270 } : { left: 110, bottom: 110, width: 420 }}
        />
        <ConceptBadge from={14} exitAt={lift} style={portrait ? { left: 0, right: 0, margin: '0 auto', width: 'fit-content', top: 200 } : { left: 64, top: 44 }} size={pick(13, 17)} />
      </AbsoluteFill>
      <div style={{ display: 'none' }}>{cam.s}</div>
    </Stage>
  );
};
