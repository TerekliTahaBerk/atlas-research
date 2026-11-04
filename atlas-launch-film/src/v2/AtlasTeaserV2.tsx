import { Audio } from '@remotion/media';
import React from 'react';
import { AbsoluteFill, Sequence, interpolate, staticFile } from 'remotion';
import { SceneFade } from '../components/SceneFade';
import { AtlasLaunchV2 } from './AtlasLaunchV2';

/**
 * ~24 s social teaser (9:16), edited from the V2 master so picture and score
 * stay frame-locked. Each segment = [masterStart, length] in frames.
 */
export const TEASER_EDIT: Array<{ name: string; from: number; len: number }> = [
  { name: 'Hook', from: 0, len: 90 },
  { name: 'Fragments → Atlas', from: 90, len: 150 },
  { name: 'Evidence → Insight', from: 740, len: 160 },
  { name: 'Connect', from: 990, len: 180 },
  { name: 'Atlas', from: 1650, len: 150 },
];
const XF = 8;
export const TEASER_DURATION = TEASER_EDIT.reduce((a, s) => a + s.len, 0) - XF * (TEASER_EDIT.length - 1);

export const AtlasTeaserV2: React.FC<{ musicVolume: number }> = ({ musicVolume }) => {
  let t = 0;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {TEASER_EDIT.map((seg, i) => {
        const start = t;
        t += seg.len - XF;
        const last = i === TEASER_EDIT.length - 1;
        return (
          <Sequence key={seg.name} name={seg.name} from={start} durationInFrames={seg.len}>
            <SceneFade fadeIn={i === 0 ? 0 : XF} depth={false}>
              <Sequence from={-seg.from} layout="none">
                <AtlasLaunchV2 withAudio={false} musicVolume={0} />
              </Sequence>
            </SceneFade>
            <Audio
              src={staticFile('assets/audio/atlas-score-v2.m4a')}
              trimBefore={seg.from}
              durationInFrames={seg.len}
              volume={(f) =>
                musicVolume *
                Math.min(
                  i === 0 ? 1 : interpolate(f, [0, XF], [0, 1], { extrapolateRight: 'clamp' }),
                  last ? 1 : interpolate(f, [seg.len - XF, seg.len], [1, 0], { extrapolateLeft: 'clamp' }),
                )
              }
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
