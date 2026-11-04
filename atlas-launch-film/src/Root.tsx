import React from 'react';
import { Composition, Folder, Still } from 'remotion';
import { AtlasLaunch } from './compositions/AtlasLaunch';
import { AtlasLaunchVertical } from './compositions/AtlasLaunchVertical';
import { AtlasPoster } from './compositions/AtlasPoster';
import { DURATION_IN_FRAMES, FPS } from './data/storyboard';

export const RemotionRoot: React.FC = () => (
  <>
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
