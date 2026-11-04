import React from 'react';
import { useCurrentFrame } from 'remotion';
import { ease, mix, progress } from '../../design/motion';
import { color } from '../../design/tokens';
import { font } from '../../design/typography';

/**
 * Editorial line for V2. Unlike V1's repeated eyebrow+centred headline, each
 * scene places its line deliberately (lower third, side column, sky band…).
 * Reveal: word-staggered tracking/focus settle; exit: soft blur.
 */
export const EditorialTitle: React.FC<{
  text: string;
  from: number;
  exitAt?: number;
  size: number;
  weight?: number;
  tint?: string;
  align?: 'left' | 'center' | 'right';
  style?: React.CSSProperties;
  scrim?: boolean;
}> = ({ text, from, exitAt, size, weight = 500, tint = color.tx, align = 'left', style, scrim }) => {
  const frame = useCurrentFrame();
  const exit = exitAt === undefined ? 0 : progress(frame, exitAt, exitAt + 16, ease.in);
  const words = text.split(' ');
  if (frame < from - 1 || exit >= 1) return null;
  return (
    <div
      style={{
        position: 'absolute',
        fontFamily: font.sans,
        fontSize: size,
        fontWeight: weight,
        lineHeight: 1.06,
        letterSpacing: '-0.028em',
        color: tint,
        textAlign: align,
        opacity: 1 - exit,
        filter: exit > 0 ? `blur(${exit * 8}px)` : undefined,
        textShadow: scrim ? '0 2px 30px rgba(0,0,0,.75)' : undefined,
        ...style,
      }}
    >
      {words.map((w, i) => {
        const t = progress(frame, from + i * 3, from + i * 3 + 26, ease.out);
        return (
          <React.Fragment key={i}>
            <span
              style={{
                display: 'inline-block',
                opacity: t,
                transform: `translateY(${(1 - t) * size * 0.22}px)`,
                filter: t < 1 ? `blur(${(1 - t) * 8}px)` : undefined,
                letterSpacing: `${mix(0.05, 0, t)}em`,
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

/** Bottom scrim that keeps lower-third type legible over interface footage. */
export const Scrim: React.FC<{ opacity: number; height?: number; top?: boolean }> = ({ opacity, height = 420, top }) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      right: 0,
      [top ? 'top' : 'bottom']: 0,
      height,
      opacity,
      background: `linear-gradient(${top ? '180deg' : '0deg'}, rgba(13,13,12,.92) 0%, rgba(13,13,12,.6) 45%, rgba(13,13,12,0) 100%)`,
      pointerEvents: 'none',
    }}
  />
);
