import React from 'react';
import { AbsoluteFill } from 'remotion';
import { color } from '../design/tokens';

/**
 * The near-black world the film lives in: a soft overhead key light and a
 * gentle vignette, consistent across every scene so dissolves stay seamless.
 */
export const Stage: React.FC<{ light?: number; children?: React.ReactNode }> = ({ light = 1, children }) => (
  <AbsoluteFill style={{ background: color.stage, overflow: 'hidden' }}>
    <AbsoluteFill
      style={{
        opacity: light,
        background: `radial-gradient(ellipse 70% 55% at 50% 30%, ${color.stageLift} 0%, rgba(20,20,19,0) 70%)`,
      }}
    />
    {children}
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        background: 'radial-gradient(ellipse 95% 95% at 50% 45%, rgba(0,0,0,0) 62%, rgba(0,0,0,.38) 100%)',
      }}
    />
  </AbsoluteFill>
);
