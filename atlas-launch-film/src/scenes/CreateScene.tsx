import React from 'react';
import { useCurrentFrame } from 'remotion';
import { ConceptTag } from '../components/ConceptTag';
import { FeatureTitle } from '../components/FeatureTitle';
import { ManuscriptInterface } from '../components/ManuscriptInterface';
import { ProductShot } from '../components/ProductShot';
import { Stage } from '../components/Stage';
import { localCue } from '../data/storyboard';
import { useLayout } from '../design/layout';
import { ease, progress } from '../design/motion';

/** 00:49–00:55 — an insight from a note becomes a cited paragraph. */
export const CreateScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { portrait } = useLayout();
  const ins = localCue('create', 'insertCitation');
  const comp = localCue('create', 'compile');

  const s = {
    fly: progress(frame, ins - 26, ins + 4, (t) => t),
    insert: progress(frame, ins, ins + 34, (t) => t),
    compile: progress(frame, comp, comp + 20, (t) => t),
    preview: progress(frame, comp + 12, comp + 60, ease.out),
  };
  // Everything recedes before the final reveal.
  const recede = progress(frame, 168, 194, ease.inOut);

  return (
    <Stage light={1 - recede * 0.5}>
      <ProductShot
        active="manuscript"
        opacity={1 - recede}
        keys={
          portrait
            ? [
                { at: 0, s: 1.02 },
                { at: ins + 20, s: 1.06, y: 0 },
                { at: comp + 30, s: 1.06, y: -60 },
                { at: 194, s: 1.0, y: -40 },
              ]
            : [
                { at: 0, s: 1.1, x: 120 },
                { at: ins + 24, s: 1.28, x: 210 },
                { at: comp + 6, s: 1.28, x: 190 },
                { at: comp + 50, s: 1.26, x: -330 },
                { at: 194, s: 1.12, x: -260 },
              ]
        }
      >
        <ManuscriptInterface s={s} narrow={portrait} />
      </ProductShot>
      <FeatureTitle eyebrow="Manuscript" headline="From questions to knowledge." concept from={8} exitAt={166} />
      <ConceptTag from={30} />
    </Stage>
  );
};
