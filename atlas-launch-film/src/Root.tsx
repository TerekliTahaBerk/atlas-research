import React from 'react';
import { Composition, Folder, Still } from 'remotion';
import { AtlasLaunch } from './compositions/AtlasLaunch';
import { AtlasLaunchVertical } from './compositions/AtlasLaunchVertical';
import { AtlasPoster } from './compositions/AtlasPoster';
import { DURATION_IN_FRAMES, FPS } from './data/storyboard';
import { AtlasLaunchV2 } from './v2/AtlasLaunchV2';
import { AtlasTeaserV2, TEASER_DURATION } from './v2/AtlasTeaserV2';

export const RemotionRoot: React.FC = () => (
  <>
    <Folder name="Atlas-Launch-V2">
      <Composition
        id="AtlasLaunchV2"
        component={AtlasLaunchV2}
        durationInFrames={1800}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ musicVolume: 0.9, withAudio: true }}
      />
      <Composition
        id="AtlasLaunchV2Vertical"
        component={AtlasLaunchV2}
        durationInFrames={1800}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ musicVolume: 0.9, withAudio: true }}
      />
      <Composition
        id="AtlasTeaserV2"
        component={AtlasTeaserV2}
        durationInFrames={TEASER_DURATION}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ musicVolume: 0.9 }}
      />
    </Folder>
    <Folder name="Atlas-Launch">
      <Composition
        id="AtlasLaunch"
        component={AtlasLaunch}
        durationInFrames={DURATION_IN_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ musicVolume: 0.9, withAudio: true }}
      />
      <Composition
        id="AtlasLaunchVertical"
        component={AtlasLaunchVertical}
        durationInFrames={DURATION_IN_FRAMES}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ musicVolume: 0.9, withAudio: true }}
      />
      <Still id="AtlasPoster" component={AtlasPoster} width={1920} height={1080} />
    </Folder>
  </>
);
