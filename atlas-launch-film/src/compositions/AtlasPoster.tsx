import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { AtlasWordmark } from '../components/AtlasWordmark';
import { CinematicText, Eyebrow } from '../components/CinematicText';
import { ConnectScene } from '../scenes/ConnectScene';
import { color } from '../design/tokens';
import { loadAtlasFonts } from '../design/typography';

loadAtlasFonts();

/**
 * Cover frame: the knowledge structure from Scene 06, held still and pushed
 * into shadow, with the lockup centred over it. Negative Sequence offsets
 * select the settled frame of each animated layer.
 */
export const AtlasPoster: React.FC = () => (
  <AbsoluteFill style={{ background: color.stage }}>
    <AbsoluteFill style={{ opacity: 0.34, transform: 'scale(1.1) translateY(40px)', filter: 'blur(1.5px)' }}>
      <Sequence from={-216} layout="none">
        <ConnectScene bare />
      </Sequence>
    </AbsoluteFill>
    <AbsoluteFill
      style={{
        background: 'radial-gradient(ellipse 50% 46% at 50% 47%, rgba(13,13,12,.97) 0%, rgba(13,13,12,.82) 55%, rgba(13,13,12,.35) 100%)',
      }}
    />
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40, marginTop: -30 }}>
        <Sequence from={-400} layout="none">
          <AtlasWordmark from={0} size={176} />
        </Sequence>
        <Sequence from={-400} layout="none">
          <CinematicText text="Where research comes together." from={0} size={42} weight={400} tint={color.tx2} />
        </Sequence>
      </div>
      <div style={{ position: 'absolute', bottom: 72 }}>
        <Sequence from={-400} layout="none">
          <Eyebrow text="Introducing Atlas Research" from={0} size={16} />
        </Sequence>
      </div>
    </AbsoluteFill>
  </AbsoluteFill>
);
