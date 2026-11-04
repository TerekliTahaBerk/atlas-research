import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { AtlasWordmark } from '../components/AtlasWordmark';
import { CinematicText } from '../components/CinematicText';
import { Stage } from '../components/Stage';
import { localCue } from '../data/storyboard';
import { useLayout } from '../design/layout';
import { ease, progress } from '../design/motion';
import { color } from '../design/tokens';
import { font } from '../design/typography';

/** 00:55–01:00 — stillness, the wordmark, the line, black. */
export const FinalRevealScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { portrait } = useLayout();
  const wm = localCue('final', 'finalWordmark');
  const tag = localCue('final', 'tagline');
  const out = localCue('final', 'fadeOut');
  const fade = progress(frame, out, 150, ease.inOut);

  return (
    <Stage light={0.45}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: 1 - fade }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: portrait ? 56 : 44, marginTop: portrait ? -40 : -40 }}>
          <AtlasWordmark from={wm} size={portrait ? 136 : 168} />
          <CinematicText text="Where research comes together." from={tag} size={portrait ? 46 : 40} weight={400} tint={color.tx2} stagger={3} />
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: portrait ? 360 : 64,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: font.mono,
            fontSize: portrait ? 17 : 13,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            color: color.tx3,
            opacity: 0.7 * progress(frame, tag + 20, tag + 50),
          }}
        >
          Atlas Research · In development · Some interfaces shown are concepts
        </div>
      </AbsoluteFill>
    </Stage>
  );
};
