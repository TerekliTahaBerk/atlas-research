import { Audio } from '@remotion/media';
import React from 'react';
import { AbsoluteFill, Sequence, staticFile } from 'remotion';
import { SceneFade } from '../components/SceneFade';
import { loadAtlasFonts } from '../design/typography';
import { AtlasScene } from './scenes/AtlasScene';
import { CollaborateScene } from './scenes/CollaborateScene';
import { ConnectScene } from './scenes/ConnectScene';
import { CreateScene } from './scenes/CreateScene';
import { DiscoverScene } from './scenes/DiscoverScene';
import { FragmentsScene } from './scenes/FragmentsScene';
import { HookScene } from './scenes/HookScene';
import { RevealScene } from './scenes/RevealScene';
import { UnderstandScene } from './scenes/UnderstandScene';
import { HANDOFF, scene } from './storyboard';

loadAtlasFonts();

export type AtlasLaunchV2Props = { musicVolume: number; withAudio: boolean };

/**
 * V2 master. Scenes are matched hand-offs, not dissolves between unrelated
 * screens: each Sequence runs HANDOFF frames past its end while the next
 * scene — which begins with the same hero object at the same anchor —
 * fades in over it. Every scene recomposes itself for 9:16 via useLayout().
 */
export const AtlasLaunchV2: React.FC<AtlasLaunchV2Props> = ({ musicVolume, withAudio }) => (
  <AbsoluteFill style={{ background: '#000' }}>
    <Sequence name="01 Hook" from={scene('hook').from} durationInFrames={scene('hook').durationInFrames + HANDOFF}>
      <HookScene />
    </Sequence>
    <Sequence name="02 Fragments → Atlas" from={scene('fragments').from} durationInFrames={scene('fragments').durationInFrames + HANDOFF}>
      <SceneFade fadeIn={HANDOFF} depth={false}>
        <FragmentsScene />
      </SceneFade>
    </Sequence>
    <Sequence name="03 Product reveal" from={scene('reveal').from} durationInFrames={scene('reveal').durationInFrames + HANDOFF}>
      <SceneFade fadeIn={HANDOFF} depth={false}>
        <RevealScene />
      </SceneFade>
    </Sequence>
    <Sequence name="04 Discover" from={scene('discover').from} durationInFrames={scene('discover').durationInFrames + HANDOFF}>
      <SceneFade fadeIn={HANDOFF} depth={false}>
        <DiscoverScene />
      </SceneFade>
    </Sequence>
    <Sequence name="05 Understand" from={scene('understand').from} durationInFrames={scene('understand').durationInFrames + HANDOFF}>
      <SceneFade fadeIn={HANDOFF} depth={false}>
        <UnderstandScene />
      </SceneFade>
    </Sequence>
    <Sequence name="06 Connect" from={scene('connect').from} durationInFrames={scene('connect').durationInFrames + HANDOFF}>
      <SceneFade fadeIn={HANDOFF} depth={false}>
        <ConnectScene />
      </SceneFade>
    </Sequence>
    <Sequence name="07 Collaborate" from={scene('collaborate').from} durationInFrames={scene('collaborate').durationInFrames + HANDOFF}>
      <SceneFade fadeIn={HANDOFF} depth={false}>
        <CollaborateScene />
      </SceneFade>
    </Sequence>
    <Sequence name="08 Create" from={scene('create').from - 6} durationInFrames={scene('create').durationInFrames + HANDOFF + 6}>
      <SceneFade fadeIn={6} depth={false}>
        <CreateScene />
      </SceneFade>
    </Sequence>
    <Sequence name="09 Atlas" from={scene('atlas').from} durationInFrames={scene('atlas').durationInFrames}>
      <SceneFade fadeIn={HANDOFF} depth={false}>
        <AtlasScene />
      </SceneFade>
    </Sequence>
    {withAudio ? <Audio src={staticFile('assets/audio/atlas-score-v2.m4a')} volume={musicVolume} /> : null}
  </AbsoluteFill>
);
