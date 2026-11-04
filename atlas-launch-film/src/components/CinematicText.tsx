import React from 'react';
import { useCurrentFrame } from 'remotion';
import { ease, mix, progress } from '../design/motion';
import { color } from '../design/tokens';
import { font } from '../design/typography';

type Props = {
  text: string;
  /** Local frame the reveal begins. */
  from: number;
  /** Local frame the exit begins (omit to hold). */
  exitAt?: number;
  size: number;
  weight?: number;
  tint?: string;
  align?: 'left' | 'center';
  maxWidth?: number;
  lineHeight?: number;
  /** Frames between words. */
  stagger?: number;
  style?: React.CSSProperties;
};

/**
 * Headline reveal through tracking, opacity and depth (blur) — never a
 * typewriter. Each word settles from slightly wider tracking and soft focus.
 */
export const CinematicText: React.FC<Props> = ({
  text,
  from,
  exitAt,
  size,
  weight = 600,
  tint = color.tx,
  align = 'center',
  maxWidth,
  lineHeight = 1.08,
  stagger = 3,
  style,
}) => {
  const frame = useCurrentFrame();
  const words = text.split(' ');
  const exit = exitAt === undefined ? 0 : progress(frame, exitAt, exitAt + 18, ease.in);
  return (
    <div
      style={{
        fontFamily: font.sans,
        fontSize: size,
        fontWeight: weight,
        lineHeight,
        color: tint,
        textAlign: align,
        maxWidth,
        textWrap: 'balance',
        opacity: 1 - exit,
        filter: exit > 0 ? `blur(${exit * 8}px)` : undefined,
        ...style,
      }}
    >
      {words.map((w, i) => {
        const t = progress(frame, from + i * stagger, from + i * stagger + 34, ease.out);
        return (
          <React.Fragment key={`${w}-${i}`}>
            <span
              style={{
                display: 'inline-block',
                opacity: t,
                letterSpacing: `${mix(0.09, -0.025, t)}em`,
                filter: t < 1 ? `blur(${(1 - t) * 10}px)` : undefined,
                transform: `translateY(${(1 - t) * size * 0.16}px)`,
              }}
            >
              {w}
            </span>
            {i < words.length - 1 ? ' ' : null}
          </React.Fragment>
        );
      })}
    </div>
  );
};

/** Small feature label (mono, tertiary) that sits above a headline. */
export const Eyebrow: React.FC<{ text: string; from: number; exitAt?: number; size: number; align?: 'left' | 'center' }> = ({
  text,
  from,
  exitAt,
  size,
  align = 'center',
}) => {
  const frame = useCurrentFrame();
  const t = progress(frame, from, from + 30, ease.out);
  const exit = exitAt === undefined ? 0 : progress(frame, exitAt, exitAt + 16, ease.in);
  return (
    <div
      style={{
        fontFamily: font.mono,
        fontSize: size,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: `${mix(0.32, 0.18, t)}em`,
        color: color.tx3,
        textAlign: align,
        opacity: t * (1 - exit),
      }}
    >
      {text}
    </div>
  );
};
