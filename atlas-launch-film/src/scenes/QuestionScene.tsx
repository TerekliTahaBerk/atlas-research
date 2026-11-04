import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { CinematicText } from '../components/CinematicText';
import { QuestionPoint } from '../components/Constellation';
import { Stage } from '../components/Stage';
import { localCue } from '../data/storyboard';
import { useLayout } from '../design/layout';
import { ease, mix, progress } from '../design/motion';
import { color } from '../design/tokens';

/** 00:00–00:06 — silence, a point, two lines, the question. */
export const QuestionScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, portrait } = useLayout();
  const cx = width / 2;
  const cy = height / 2;

  const pointIn = progress(frame, localCue('question', 'pointAppears'), localCue('question', 'pointAppears') + 24, ease.out);
  const l1 = progress(frame, localCue('question', 'lineOne'), localCue('question', 'lineOne') + 56, ease.out);
  const l2 = progress(frame, localCue('question', 'lineTwo'), localCue('question', 'lineTwo') + 56, ease.out);
  const retract = progress(frame, 150, 190, ease.inOut);
  const push = mix(1, 1.07, progress(frame, 0, 200, ease.soft));
  const env = progress(frame, 20, 120, ease.soft);

  const len1 = (portrait ? 300 : 420) * l1 * (1 - retract);
  const len2 = (portrait ? 190 : 250) * l2 * (1 - retract);

  return (
    <Stage light={env * 0.8}>
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: `${cx}px ${cy}px` }}>
        <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <linearGradient id="l1" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor={color.tx} stopOpacity="0" />
              <stop offset="0.5" stopColor={color.tx} stopOpacity="0.75" />
              <stop offset="1" stopColor={color.tx} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="l2" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor={color.tx} stopOpacity="0.6" />
              <stop offset="1" stopColor={color.tx} stopOpacity="0" />
            </linearGradient>
          </defs>
          {len1 > 0.5 ? <rect x={cx - len1} y={cy - 0.5} width={len1 * 2} height={1} fill="url(#l1)" /> : null}
          {len2 > 0.5 ? (
            <g transform={`translate(${cx} ${cy}) rotate(-34)`}>
              <rect x={0} y={-0.5} width={len2} height={1} fill="url(#l2)" />
            </g>
          ) : null}
        </svg>
        <QuestionPoint x={cx} y={cy} size={mix(2, 7, pointIn)} glow={pointIn} opacity={pointIn} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: cy + (portrait ? 120 : 86), display: 'flex', justifyContent: 'center' }}>
          <CinematicText
            text="Every discovery starts with a question."
            from={78}
            exitAt={158}
            size={portrait ? 74 : 62}
            weight={500}
            maxWidth={portrait ? 860 : 1400}
            stagger={4}
          />
        </div>
      </AbsoluteFill>
    </Stage>
  );
};
