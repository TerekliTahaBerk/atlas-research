import React from 'react';
import { useCurrentFrame } from 'remotion';
import { AtlasWordmark } from '../../components/AtlasWordmark';
import { useLayout } from '../../design/layout';
import { ease, mix, progress } from '../../design/motion';
import { color } from '../../design/tokens';

/** Wordmark size per orientation (shared so hand-offs match). */
export const wordmarkSize = (portrait: boolean) => (portrait ? 132 : 150);

/** y of the wordmark's horizon hairline (letters block is centred). */
export const horizonY = (height: number, portrait: boolean) => height / 2 + wordmarkSize(portrait) * 0.56;

/**
 * The brand point and the ATLAS wordmark, driven by one start frame so the
 * outgoing and incoming scenes render the identical state during a hand-off.
 * The point that opened the film travels up to sit above the letters.
 */
export const BrandMoment: React.FC<{ start: number; pointFrom?: [number, number]; opacity?: number; lift?: number }> = ({
  start,
  pointFrom,
  opacity = 1,
  lift = 0,
}) => {
  const frame = useCurrentFrame();
  const { width, height, portrait } = useLayout();
  const size = wordmarkSize(portrait);
  const rise = progress(frame, start, start + 26, ease.inOut);
  const from = pointFrom ?? [width / 2, height / 2];
  const dotY = height / 2 - size * 1.02;
  const px = mix(from[0], width / 2, rise);
  const py = mix(from[1], dotY, rise);
  const dot = mix(10, size * 0.085, rise);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity, transform: `translateY(${-lift}px)` }}>
      <div
        style={{
          position: 'absolute',
          left: px - dot / 2,
          top: py - dot / 2,
          width: dot,
          height: dot,
          borderRadius: '50%',
          background: color.ac,
          boxShadow: `0 0 ${18 + 20 * (1 - rise)}px rgba(91,141,239,${0.45 - 0.15 * rise})`,
        }}
      />
      {frame >= start ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <AtlasWordmark from={start} size={size} point={false} />
        </div>
      ) : null}
    </div>
  );
};
