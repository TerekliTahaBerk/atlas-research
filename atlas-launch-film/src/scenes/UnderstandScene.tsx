import React from 'react';
import { useCurrentFrame } from 'remotion';
import { AIInteraction } from '../components/AIInteraction';
import { FeatureTitle } from '../components/FeatureTitle';
import { PaperReader } from '../components/PaperReader';
import { ProductShot } from '../components/ProductShot';
import { Stage } from '../components/Stage';
import { localCue } from '../data/storyboard';
import { useLayout } from '../design/layout';
import { ease, mix, progress } from '../design/motion';

/** 00:25–00:33 — evidence becomes understanding, understanding becomes a note. */
export const UnderstandScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { portrait } = useLayout();
  const hl = localCue('understand', 'sentenceHighlight');
  const menu = localCue('understand', 'selectionMenu');
  const ask = localCue('understand', 'askAtlas');
  const answer = localCue('understand', 'answer');
  const save = localCue('understand', 'saveNote');

  const reader = {
    select: progress(frame, hl, hl + 26, ease.inOut),
    annotate: progress(frame, save + 4, save + 24, ease.inOut),
    menu: Math.min(progress(frame, menu, menu + 10, ease.out), 1 - progress(frame, ask + 6, ask + 14, ease.in)),
    askPress: progress(frame, ask, ask + 10, (t) => t),
    scroll: portrait ? 0 : 60,
  };
  const askS = {
    ask: progress(frame, ask + 8, ask + 22, ease.out),
    think: progress(frame, ask + 14, answer + 16, (t) => t),
    answer: progress(frame, answer + 14, answer + 62, (t) => t),
    save: progress(frame, save, save + 8, (t) => t),
    morph: progress(frame, save + 6, save + 40, ease.inOut),
  };
  const float = progress(frame, ask + 4, ask + 24, ease.out);

  return (
    <Stage>
      <ProductShot
        active="reader"
        keys={
          portrait
            ? [
                { at: 0, s: 1.02 },
                { at: hl, s: 1.14, y: 0 },
                { at: ask, s: 1.16, y: 0 },
                { at: 254, s: 1.1, y: 0 },
              ]
            : [
                { at: 0, s: 1.05, x: 0 },
                { at: hl + 8, s: 1.42, x: 40 },
                { at: ask + 4, s: 1.42, x: 40 },
                { at: answer + 30, s: 1.32, x: -470 },
                { at: 254, s: 1.36, x: -500 },
              ]
        }
        overlay={
          portrait ? (
            <div
              style={{
                position: 'absolute',
                left: 20,
                top: mix(940, 420, float),
                opacity: float,
              }}
            >
              <AIInteraction s={askS} variant="floating" />
            </div>
          ) : null
        }
      >
        <PaperReader s={reader} narrow={portrait} panel={<AIInteraction s={askS} variant="panel" />} />
      </ProductShot>
      <FeatureTitle eyebrow="Reader · Ask Atlas" headline="Go beyond reading." from={10} exitAt={226} />
    </Stage>
  );
};
