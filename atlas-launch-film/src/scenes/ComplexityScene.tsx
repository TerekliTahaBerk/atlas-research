import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { CinematicText } from '../components/CinematicText';
import { Constellation, QuestionPoint, attempts } from '../components/Constellation';
import { Stage } from '../components/Stage';
import { localCue } from '../data/storyboard';
import { useLayout } from '../design/layout';
import { ease, mix, progress } from '../design/motion';

/** 00:06–00:12 — the point becomes a distributed field, then a structure. */
export const ComplexityScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, portrait } = useLayout();

  const spawnAt = localCue('complexity', 'spawn');
  const linkCues = [
    localCue('complexity', 'connectA'),
    localCue('complexity', 'connectB'),
    localCue('complexity', 'connectC'),
    localCue('complexity', 'connectD'),
    localCue('complexity', 'connectD') + 8,
    localCue('complexity', 'connectA') + 10,
  ];
  const convergeAt = localCue('complexity', 'converge');

  const state = {
    spawn: progress(frame, spawnAt, spawnAt + 80, (t) => t),
    order: progress(frame, convergeAt, convergeAt + 46, ease.inOut),
    collapse: 0,
    attempt: attempts.map((_, i) => progress(frame, linkCues[i] ?? 0, (linkCues[i] ?? 0) + 30, ease.out)),
    clock: frame + 180,
  };
  const push = mix(1, 1.035, progress(frame, 0, 194, ease.soft));
  const hubY = height / 2 + (portrait ? 80 : -10) * state.order;

  return (
    <Stage light={0.8}>
      <AbsoluteFill style={{ transform: `scale(${push})` }}>
        <Constellation state={state} portrait={portrait} width={width} height={height} />
        <QuestionPoint x={width / 2} y={hubY} size={mix(7, 11, state.order)} glow={mix(1, 1.6, state.order)} opacity={1} />
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: portrait ? 250 : height - 196,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <CinematicText
          text="Great ideas don’t exist in isolation."
          from={30}
          exitAt={126}
          size={portrait ? 74 : 58}
          weight={500}
          maxWidth={portrait ? 860 : 1500}
          stagger={4}
        />
      </div>
    </Stage>
  );
};
