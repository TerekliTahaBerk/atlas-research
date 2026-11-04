import React from 'react';
import { useCurrentFrame } from 'remotion';
import { FeatureTitle } from '../components/FeatureTitle';
import { ProductShot, useWindowRest } from '../components/ProductShot';
import { Stage } from '../components/Stage';
import { TaskInterface } from '../components/TaskInterface';
import { localCue } from '../data/storyboard';
import { useLayout } from '../design/layout';
import { ease, progress } from '../design/motion';

/** 00:41–00:49 — a node becomes work, and work becomes shared. */
export const CollaborateScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { portrait } = useLayout();
  const rest = useWindowRest();
  const morph = localCue('collaborate', 'taskMorph');
  const panel = localCue('collaborate', 'detailPanel');
  const assign = localCue('collaborate', 'assign');
  const comment = localCue('collaborate', 'comment');
  const link = localCue('collaborate', 'linkDoc');
  const status = localCue('collaborate', 'statusUpdate');

  const s = {
    settle: progress(frame, morph + 4, morph + 40, ease.inOut),
    board: progress(frame, morph + 16, morph + 44, ease.out),
    panel: progress(frame, panel, panel + 18, ease.out),
    assign: progress(frame, assign, assign + 12, ease.out),
    comment: progress(frame, comment, comment + 16, ease.out),
    link: progress(frame, link, link + 24, ease.out),
    status: progress(frame, status, status + 26, ease.inOut),
  };

  return (
    <Stage>
      <ProductShot
        active="tasks"
        keys={
          portrait
            ? [
                { at: 0, s: 1 },
                { at: panel, s: 1.04 },
                { at: 254, s: 1.1 },
              ]
            : [
                { at: 0, s: 1.04, x: 0 },
                { at: panel - 4, s: 1.04, x: 0 },
                { at: panel + 40, s: 1.22, x: -300 },
                { at: status - 10, s: 1.22, x: -300 },
                { at: status + 20, s: 1.2, x: -190 },
                { at: 254, s: 1.22, x: -200 },
              ]
        }
      >
        <TaskInterface s={s} narrow={portrait} paneW={portrait ? rest.width : rest.width - 241} paneH={rest.height} />
      </ProductShot>
      <FeatureTitle eyebrow="Tasks · Channels" headline="Move research forward. Together." from={10} exitAt={226} />
    </Stage>
  );
};
