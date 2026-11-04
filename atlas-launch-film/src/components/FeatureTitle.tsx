import React from 'react';
import { AbsoluteFill } from 'remotion';
import { useLayout } from '../design/layout';
import { CinematicText, Eyebrow } from './CinematicText';

/** Eyebrow (real Atlas module label) + headline, placed in the top band. */
export const FeatureTitle: React.FC<{ eyebrow: string; headline: string; from: number; exitAt?: number; concept?: boolean }> = ({
  eyebrow,
  concept = false,
  headline,
  from,
  exitAt,
}) => {
  const { portrait } = useLayout();
  return (
    <AbsoluteFill style={{ alignItems: 'center', pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          top: portrait ? 262 : 64,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: portrait ? 22 : 14,
        }}
      >
        <Eyebrow text={concept && portrait ? `${eyebrow} · Concept` : eyebrow} from={from} exitAt={exitAt} size={portrait ? 22 : 16} />
        <CinematicText
          text={headline}
          from={from + 6}
          exitAt={exitAt}
          size={portrait ? 80 : 60}
          maxWidth={portrait ? 900 : 1500}
          lineHeight={1.06}
        />
      </div>
    </AbsoluteFill>
  );
};
