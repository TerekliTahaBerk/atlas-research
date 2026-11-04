import { Hash } from 'lucide-react';
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { Stage } from '../../components/Stage';
import { TaskInterface } from '../../components/TaskInterface';
import { people } from '../../data/demoResearch';
import { useLayout } from '../../design/layout';
import { ease, mix, progress } from '../../design/motion';
import { Layer, Rig } from '../../design/rig';
import { color } from '../../design/tokens';
import { font } from '../../design/typography';
import { TASK, pick as pickA } from '../anchors';
import { Cursor } from '../components/Cursor';
import { EditorialTitle } from '../components/EditorialTitle';
import { TASK_W, TaskHeroCard } from '../components/TaskHeroCard';
import { Window, useWin } from '../components/Window';
import { at } from '../storyboard';

/** Card-space hotspots (px inside TaskHeroCard at layout width). */
const HOT = { status: [140, 128] as [number, number], assignee: [150, 163] as [number, number], ms: [80, 286] as [number, number], height: 330 };

/**
 * 00:40–00:48 — COLLABORATE. One believable interaction: a colleague's
 * cursor arrives, takes the task, comments with evidence and moves it to
 * review — then opens the linked manuscript section.
 */
export const CollaborateScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { portrait, pick } = useLayout();
  const w = useWin();
  const tA = pickA(TASK, portrait);

  const title = at('collaborate', 'forwardTitle');
  const cin = at('collaborate', 'cursorIn');
  const assign = at('collaborate', 'assign');
  const comment = at('collaborate', 'comment');
  const together = at('collaborate', 'together');
  const status = at('collaborate', 'status');
  const openMs = at('collaborate', 'openManuscript');

  // Hero card: from the TASK anchor to its stage position, gently drifting.
  const settle = progress(frame, 6, 40, ease.inOut);
  const S0 = tA.w / TASK_W;
  const S1 = pick(1.36, 1.7);
  const cx = mix(tA.cx, pick(1250, 540), settle);
  const cy = mix(tA.cy, pick(470, 1010), settle) + Math.sin(frame / 40) * 3;
  const S = mix(S0, S1, settle);
  const left = cx - (TASK_W * S) / 2;
  const top = cy - (HOT.height * S) / 2;
  const toScreen = (p: [number, number]): [number, number] => [left + p[0] * S, top + p[1] * S];

  // Cursor path: enter → assignee → status → main.tex chip.
  const enter: [number, number] = pick([760, 1060], [200, 1760]);
  const pA = toScreen(HOT.assignee);
  const pS = toScreen(HOT.status);
  const pM = toScreen(HOT.ms);
  const leg1 = progress(frame, cin, assign - 4, ease.inOut);
  const leg2 = progress(frame, status - 24, status - 3, ease.inOut);
  const leg3 = progress(frame, openMs - 22, openMs - 3, ease.inOut);
  let cxr = mix(enter[0], pA[0], leg1);
  let cyr = mix(enter[1], pA[1], leg1) - Math.sin(Math.PI * leg1) * 60;
  if (frame >= status - 24) {
    cxr = mix(pA[0], pS[0], leg2);
    cyr = mix(pA[1], pS[1], leg2) - Math.sin(Math.PI * leg2) * 30;
  }
  if (frame >= openMs - 22) {
    cxr = mix(pS[0], pM[0], leg3);
    cyr = mix(pS[1], pM[1], leg3) - Math.sin(Math.PI * leg3) * 30;
  }
  const press = Math.max(
    progress(frame, assign, assign + 8, (t) => t) * (frame < assign + 8 ? 1 : 0),
    progress(frame, status, status + 8, (t) => t) * (frame < status + 8 ? 1 : 0),
    progress(frame, openMs, openMs + 8, (t) => t) * (frame < openMs + 8 ? 1 : 0),
  );

  const hs = {
    assign: progress(frame, assign, assign + 12, ease.out),
    status: progress(frame, status, status + 20, ease.inOut),
    chipGlow: progress(frame, comment + 6, comment + 20) * (1 - progress(frame, comment + 40, comment + 60)),
    msGlow: progress(frame, openMs - 12, openMs, ease.out),
    msPress: progress(frame, openMs, openMs + 8, (t) => t),
  };
  const commentIn = progress(frame, comment, comment + 18, ease.out);

  // Chip expands to the manuscript editor (full frame) — the hand-off.
  const ex = progress(frame, openMs + 4, openMs + 34, ease.inOut);
  const chip = { x: pM[0] - 60 * S, y: pM[1] - 14 * S, w: 130 * S, h: 28 * S };

  return (
    <Stage>
      <Rig
        keys={[
          { at: 0, s: 1.05, ry: -5, x: pick(-120, 0), focus: 1 },
          { at: 240, s: 1.1, ry: 4, x: pick(-60, 0), focus: 1 },
        ]}
      >
        <Layer depth={0.6} dof={9}>
          <div style={{ opacity: 0.32 }}>
            <Window active="tasks">
              <TaskInterface
                s={{ settle: 1, board: 1, panel: 0, assign: hs.assign, comment: 0, link: 0, status: hs.status }}
                narrow={portrait}
                paneW={portrait ? w.width : w.width - 241}
                paneH={w.height}
              />
            </Window>
          </div>
        </Layer>
      </Rig>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 60% 70% at ${pick(65, 50)}% ${pick(45, 55)}%, rgba(13,13,12,0) 0%, rgba(13,13,12,.55) 100%)` }} />
      <div style={{ position: 'absolute', left, top, transform: `scale(${S})`, transformOrigin: '0 0' }}>
        <TaskHeroCard s={hs} />
      </div>
      {commentIn > 0.01 ? (
        <div
          style={{
            position: 'absolute',
            left,
            top: top + (HOT.height + 18) * S,
            width: TASK_W,
            transform: `translateY(${(1 - commentIn) * -24}px) scale(${S})`,
            transformOrigin: '0 0',
            opacity: commentIn * (1 - ex),
          }}
        >
          <div style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 12, background: color.card, border: `1px solid ${color.bd}`, fontFamily: font.sans, color: color.tx, boxShadow: '0 20px 50px rgba(0,0,0,.5)' }}>
            <Avatar person={people.nora} size={26} />
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>
              <span style={{ fontWeight: 600 }}>{people.nora.first}</span> <span style={{ color: color.tx3 }}>· now</span>
              <div style={{ color: color.tx2 }}>Added the 61 → 19 GB comparison to Table 1. Linked my notes — ready for review.</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 12.5, color: color.tx3 }}>
                <Icon icon={Hash} size={12} tint={color.tx3} />
                Shared in #reading-group
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {frame >= cin && ex < 0.6 ? <Cursor x={cxr} y={cyr} name={people.nora.first} tint={people.nora.color} press={press} scale={pick(1.25, 1.5)} opacity={progress(frame, cin, cin + 10) * (1 - progress(ex, 0.2, 0.6))} /> : null}
      <AbsoluteFill style={{ pointerEvents: 'none', opacity: 1 - progress(ex, 0, 0.5) }}>
        <EditorialTitle text="Move research forward." from={title} size={pick(76, 76)} style={portrait ? { left: 90, right: 90, top: 250 } : { left: 120, top: 330, width: 700 }} />
        <EditorialTitle
          text="Together."
          from={together}
          size={pick(76, 76)}
          tint={color.actx}
          style={portrait ? { left: 90, top: 250 + 2 * 81 } : { left: 120, top: 330 + 2 * 81 }}
        />
      </AbsoluteFill>
      {ex > 0 ? (
        <div
          style={{
            position: 'absolute',
            left: mix(chip.x, 0, ex),
            top: mix(chip.y, 0, ex),
            width: mix(chip.w, width, ex),
            height: mix(chip.h, height, ex),
            borderRadius: mix(7 * S, 0, ex),
            background: `rgb(${mix(42, 27, ex)},${mix(46, 27, ex)},${mix(60, 27, ex)})`,
            border: `1px solid rgba(91,141,239,${0.6 * (1 - ex)})`,
          }}
        />
      ) : null}
    </Stage>
  );
};
