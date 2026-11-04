import React from 'react';
import { useCurrentFrame } from 'remotion';
import { ease, mix, progress } from '../design/motion';
import { color } from '../design/tokens';
import { font } from '../design/typography';

type Props = {
  /** Local frame where the reveal starts. */
  from: number;
  size: number;
  /** Show the accent point above the letters (the film's "question"). */
  point?: boolean;
  /** Skip animation (poster). */
  still?: boolean;
};

const LETTERS = ['A', 'T', 'L', 'A', 'S'];

/**
 * Typographic ATLAS wordmark. No approved symbol exists, so the mark is pure
 * type: Geist Semibold, wide tracking, letters rising from beneath a hairline
 * horizon that then retracts. A single accent point echoes the opening shot.
 */
export const AtlasWordmark: React.FC<Props> = ({ from, size, point = true, still = false }) => {
  const frame = useCurrentFrame();
  const f = still ? from + 200 : frame;
  const line = progress(f, from, from + 22, ease.out);
  const lineOut = progress(f, from + 40, from + 70, ease.inOut);
  const track = progress(f, from + 6, from + 80, ease.out);
  const dot = progress(f, from + 46, from + 76, ease.out);
  const spacing = mix(0.62, 0.36, track);
  return (
    <div style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      {point ? (
        <div
          style={{
            width: size * 0.085,
            height: size * 0.085,
            borderRadius: '50%',
            background: color.ac,
            marginBottom: size * 0.42,
            opacity: dot,
            transform: `scale(${mix(0.4, 1, dot)})`,
            boxShadow: `0 0 ${size * 0.25}px rgba(91,141,239,${0.35 * dot})`,
          }}
        />
      ) : null}
      <div style={{ position: 'relative', overflow: 'hidden', padding: `${size * 0.08}px 0 ${size * 0.04}px` }}>
        <div
          style={{
            display: 'flex',
            fontFamily: font.sans,
            fontWeight: 600,
            fontSize: size,
            lineHeight: 1,
            letterSpacing: `${spacing}em`,
            marginRight: `-${spacing}em`,
            color: color.tx,
          }}
        >
          {LETTERS.map((l, i) => {
            const t = progress(f, from + 8 + i * 4, from + 46 + i * 4, ease.out);
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  transform: `translateY(${(1 - t) * 105}%)`,
                  opacity: mix(0.2, 1, t),
                }}
              >
                {l}
              </span>
            );
          })}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 0,
          height: 1,
          width: `${mix(0, 118, line) * (1 - lineOut)}%`,
          transform: 'translateX(-50%)',
          background: `linear-gradient(90deg, rgba(236,236,234,0), ${color.tx} 50%, rgba(236,236,234,0))`,
          opacity: 0.7,
        }}
      />
    </div>
  );
};
