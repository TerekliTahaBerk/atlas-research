import React from 'react';
import { useCurrentFrame } from 'remotion';
import { FeatureTitle } from '../components/FeatureTitle';
import { ProductShot } from '../components/ProductShot';
import { ResearchInterface } from '../components/ResearchInterface';
import { Stage } from '../components/Stage';
import { localCue } from '../data/storyboard';
import { useLayout } from '../design/layout';
import { ease, progress } from '../design/motion';

/** 00:18–00:25 — one meaningful search, one paper that matters. */
export const DiscoverScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { portrait } = useLayout();
  const typing = localCue('discover', 'typingStart');
  const submit = localCue('discover', 'submit');
  const results = localCue('discover', 'results');
  const hl = localCue('discover', 'paperHighlight');
  const expand = localCue('discover', 'paperExpand');

  const s = {
    typed: progress(frame, typing, submit - 8, (t) => t),
    caret: frame >= typing - 10 && frame < submit && Math.floor(frame / 15) % 2 === 0,
    press: progress(frame, submit, submit + 8, (t) => t),
    loading: Math.min(progress(frame, submit + 2, submit + 8, ease.out), 1 - progress(frame, results - 4, results + 4, ease.out)),
    results: progress(frame, results, results + 48, (t) => t),
    focus: progress(frame, hl, hl + 14, ease.out),
    expand: progress(frame, expand, expand + 30, ease.inOut),
    scroll: progress(frame, results + 10, hl + 6, ease.inOut) * (portrait ? 250 : 238),
  };

  return (
    <Stage>
      <ProductShot
        active="research"
        keys={
          portrait
            ? [
                { at: 0, s: 1, rx: 2.5 },
                { at: 60, s: 1.06, rx: 0 },
                { at: hl, s: 1.1 },
                { at: 224, s: 1.16, y: 10 },
              ]
            : [
                { at: 0, s: 1, rx: 2.5 },
                { at: 70, s: 1.2, x: -150, rx: 0 },
                { at: hl, s: 1.26, x: -190 },
                { at: 224, s: 1.36, x: -230, y: 0 },
              ]
        }
      >
        <ResearchInterface s={s} narrow={portrait} />
      </ProductShot>
      <FeatureTitle eyebrow="Research" headline="Discover what matters." from={8} exitAt={196} />
    </Stage>
  );
};
