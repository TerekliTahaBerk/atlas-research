import React from 'react';
import { useCurrentFrame } from 'remotion';
import { useLayout } from '../design/layout';
import { progress } from '../design/motion';
import { color } from '../design/tokens';
import { font } from '../design/typography';

/**
 * Honest labelling for footage of capabilities that are designed but not yet
 * shipped (see docs/ROADMAP.md): a small, unobtrusive caption.
 */
export const ConceptTag: React.FC<{ from: number; text?: string }> = ({ from, text = 'Concept interface · in development' }) => {
  const frame = useCurrentFrame();
  const { portrait } = useLayout();
  // Portrait carries the label in the eyebrow instead (see FeatureTitle).
  if (portrait) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: portrait ? 0 : 64,
        right: portrait ? 0 : undefined,
        top: portrait ? 478 : undefined,
        bottom: portrait ? undefined : 40,
        textAlign: portrait ? 'center' : 'left',
        fontFamily: font.mono,
        fontSize: portrait ? 18 : 14,
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        color: color.tx3,
        opacity: 0.75 * progress(frame, from, from + 30),
      }}
    >
      <span style={{ background: portrait ? 'rgba(13,13,12,.85)' : undefined, padding: portrait ? '8px 14px' : undefined, borderRadius: 8 }}>{text}</span>
    </div>
  );
};
