import { Audio } from '@remotion/media';
import React from 'react';
import { AbsoluteFill, Sequence, staticFile } from 'remotion';
import { SceneFade } from '../components/SceneFade';
import { DISSOLVE, scenes } from '../data/storyboard';
import { loadAtlasFonts } from '../design/typography';
import { CollaborateScene } from '../scenes/CollaborateScene';
import { ComplexityScene } from '../scenes/ComplexityScene';
import { ConnectScene } from '../scenes/ConnectScene';
import { CreateScene } from '../scenes/CreateScene';
import { DiscoverScene } from '../scenes/DiscoverScene';
import { FinalRevealScene } from '../scenes/FinalRevealScene';
import { IntroducingScene } from '../scenes/IntroducingScene';
import { QuestionScene } from '../scenes/QuestionScene';
import { UnderstandScene } from '../scenes/UnderstandScene';

loadAtlasFonts();

export type AtlasLaunchProps = {
  /** Mix level of the original score (0–1). */
  musicVolume: number;
  /** Set false for a silent picture-only render. */
  withAudio: boolean;
};

/**
 * The full 60-second film. Every scene reads the composition size and
 * recomposes itself, so the same timeline drives 16:9 and 9:16.
 * Each Sequence runs DISSOLVE frames past its nominal end so the next scene
 * can dissolve in over it.
 */
export const AtlasLaunch: React.FC<AtlasLaunchProps> = ({ musicVolume, withAudio }) => (
  <AbsoluteFill style={{ background: '#000' }}>
    <Sequence name="01 The Question" from={scenes.question.from} durationInFrames={scenes.question.durationInFrames + DISSOLVE}>
      <SceneFade fadeIn={0}>
        <QuestionScene />
      </SceneFade>
    </Sequence>
    <Sequence name="02 The Complexity" from={scenes.complexity.from} durationInFrames={scenes.complexity.durationInFrames + DISSOLVE}>
      <SceneFade fadeIn={DISSOLVE} depth={false}>
        <ComplexityScene />
      </SceneFade>
    </Sequence>
    <Sequence name="03 Introducing Atlas" from={scenes.introducing.from} durationInFrames={scenes.introducing.durationInFrames + DISSOLVE}>
      <SceneFade fadeIn={0}>
        <IntroducingScene />
      </SceneFade>
    </Sequence>
    <Sequence name="04 Discover" from={scenes.discover.from} durationInFrames={scenes.discover.durationInFrames + DISSOLVE}>
      <SceneFade fadeIn={DISSOLVE}>
        <DiscoverScene />
      </SceneFade>
    </Sequence>
    <Sequence name="05 Understand" from={scenes.understand.from} durationInFrames={scenes.understand.durationInFrames + DISSOLVE}>
      <SceneFade fadeIn={DISSOLVE}>
        <UnderstandScene />
      </SceneFade>
    </Sequence>
    <Sequence name="06 Connect" from={scenes.connect.from} durationInFrames={scenes.connect.durationInFrames + DISSOLVE}>
      <SceneFade fadeIn={DISSOLVE}>
        <ConnectScene />
      </SceneFade>
    </Sequence>
    <Sequence name="07 Collaborate" from={scenes.collaborate.from} durationInFrames={scenes.collaborate.durationInFrames + DISSOLVE}>
      <SceneFade fadeIn={DISSOLVE}>
        <CollaborateScene />
      </SceneFade>
    </Sequence>
    <Sequence name="08 Create" from={scenes.create.from} durationInFrames={scenes.create.durationInFrames + DISSOLVE}>
      <SceneFade fadeIn={DISSOLVE}>
        <CreateScene />
      </SceneFade>
    </Sequence>
    <Sequence name="09 Final Reveal" from={scenes.final.from} durationInFrames={scenes.final.durationInFrames}>
      <SceneFade fadeIn={DISSOLVE + 6} depth={false}>
        <FinalRevealScene />
      </SceneFade>
    </Sequence>
    {withAudio ? <Audio src={staticFile('assets/audio/atlas-score.m4a')} volume={musicVolume} /> : null}
  </AbsoluteFill>
);
