import React from 'react';
import { useCurrentFrame } from 'remotion';
import { progress } from '../../design/motion';
import { color } from '../../design/tokens';
import { font } from '../../design/typography';

/** Honest label for designed-but-unshipped capabilities (see docs/ROADMAP.md). */
export const ConceptBadge: React.FC<{ from: number; exitAt?: number; style: React.CSSProperties; size?: number }> = ({ from, exitAt, style, size = 14 }) => {
  const frame = useCurrentFrame();
  const o = progress(frame, from, from + 20) * (exitAt === undefined ? 1 : 1 - progress(frame, exitAt, exitAt + 12));
  return (
    <div
      style={{
        position: 'absolute',
        fontFamily: font.mono,
        fontSize: size,
        letterSpacing: '.09em',
        textTransform: 'uppercase',
        color: color.tx3,
        opacity: 0.8 * o,
        padding: '6px 10px',
        borderRadius: 8,
        border: `1px solid ${color.bd2}`,
        background: 'rgba(13,13,12,.7)',
        ...style,
      }}
    >
      Concept interface · in development
    </div>
  );
};
