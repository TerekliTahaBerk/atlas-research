import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { AtlasWordmark } from '../components/AtlasWordmark';
import { Eyebrow } from '../components/CinematicText';
import { Constellation, QuestionPoint } from '../components/Constellation';
import { HomeView } from '../components/HomeView';
import { ProductShot } from '../components/ProductShot';
import { Stage } from '../components/Stage';
import { localCue } from '../data/storyboard';
import { useLayout } from '../design/layout';
import { ease, mix, progress } from '../design/motion';

/** 00:12–00:18 — the structure contracts, the wordmark, the workspace. */
export const IntroducingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, portrait } = useLayout();
  const wm = localCue('introducing', 'wordmark');
  const rise = localCue('introducing', 'windowRise');

  const collapse = progress(frame, 0, 24, ease.in);
  const hubGlow = progress(frame, 12, 22, ease.out) * (1 - progress(frame, 22, 46, ease.inOut));
  const wordOut = progress(frame, rise - 8, rise + 30, ease.inOut);
  // Continues ComplexityScene's push (ended at 1.035) and eases back.
  const push = mix(1.035, 1, progress(frame, 0, 40, ease.inOut));

  return (
    <Stage light={mix(0.8, 1, progress(frame, rise, rise + 60, ease.soft))}>
      <AbsoluteFill style={{ transform: `scale(${push})` }}>
        {collapse < 1 ? (
          <Constellation
            state={{ spawn: 1, order: 1, collapse, attempt: [], clock: frame + 360 }}
            portrait={portrait}
            width={width}
            height={height}
          />
        ) : null}
        <QuestionPoint
          x={width / 2}
          y={height / 2 + (portrait ? 80 : -10) * (1 - collapse)}
          size={mix(11, 5, collapse)}
          glow={1.6 + hubGlow * 1.5}
          opacity={1 - progress(frame, 24, 44, ease.inOut)}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 1 - wordOut,
          transform: `translateY(${-wordOut * (portrait ? 220 : 160)}px) scale(${mix(1, 0.92, wordOut)})`,
          filter: wordOut > 0 ? `blur(${wordOut * 6}px)` : undefined,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: portrait ? 44 : 34, marginTop: portrait ? -60 : -70 }}>
          <AtlasWordmark from={wm} size={portrait ? 128 : 150} />
          <Eyebrow text="Introducing Atlas" from={wm + 52} size={portrait ? 22 : 18} />
        </div>
      </AbsoluteFill>
      {frame >= rise - 2 ? (
        <ProductShot
          active="home"
          opacity={progress(frame, rise, rise + 34, ease.soft)}
          keys={[
            { at: rise, y: portrait ? 900 : 640, rx: 26, s: 0.9 },
            { at: rise + 70, y: 0, rx: 5, s: 1 },
            { at: 200, y: 0, rx: 2.5, s: 1 },
          ]}
        >
          <HomeView narrow={portrait} />
        </ProductShot>
      ) : null}
    </Stage>
  );
};
