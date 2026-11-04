import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { ease, progress } from '../design/motion';

/**
 * Dissolve wrapper. The incoming scene fades in over the tail of the outgoing
 * scene (which keeps full opacity), avoiding the brightness dip of a
 * symmetric crossfade. A slight depth settle makes it feel spatial.
 */
export const SceneFade: React.FC<{ fadeIn: number; depth?: boolean; children: React.ReactNode }> = ({
  fadeIn,
  depth = true,
  children,
}) => {
  const frame = useCurrentFrame();
  const t = fadeIn <= 0 ? 1 : progress(frame, 0, fadeIn, ease.soft);
  return (
    <AbsoluteFill
      style={{
        opacity: t,
        transform: depth && t < 1 ? `scale(${1.012 - 0.012 * t})` : undefined,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
