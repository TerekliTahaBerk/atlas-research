import React from 'react';
import { useCurrentFrame } from 'remotion';
import { ease, mix, progress } from '../design/motion';

export type CameraKey = {
  /** Local frame of this key. */
  at: number;
  /** Uniform scale (dolly). */
  s?: number;
  /** Translation in px (applied after scale origin). */
  x?: number;
  y?: number;
  /** Tilt in degrees. */
  rx?: number;
  ry?: number;
};

const sample = (keys: CameraKey[], frame: number, prop: 's' | 'x' | 'y' | 'rx' | 'ry', fallback: number): number => {
  const first = keys[0];
  if (!first) return fallback;
  let prev: CameraKey = first;
  if (frame <= first.at) return first[prop] ?? fallback;
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (!k) continue;
    if (frame <= k.at) {
      const t = progress(frame, prev.at, k.at, ease.inOut);
      return mix(prev[prop] ?? fallback, k[prop] ?? fallback, t);
    }
    prev = k;
  }
  return prev[prop] ?? fallback;
};

/**
 * Reusable virtual camera. Keys are eased in/out segment by segment, giving
 * controlled, mass-like pushes without overshoot.
 */
export const Camera: React.FC<{
  keys: CameraKey[];
  children: React.ReactNode;
  perspective?: number;
  origin?: string;
  style?: React.CSSProperties;
}> = ({ keys, children, perspective = 2600, origin = '50% 50%', style }) => {
  const frame = useCurrentFrame();
  const s = sample(keys, frame, 's', 1);
  const x = sample(keys, frame, 'x', 0);
  const y = sample(keys, frame, 'y', 0);
  const rx = sample(keys, frame, 'rx', 0);
  const ry = sample(keys, frame, 'ry', 0);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transformOrigin: origin,
        transform: `perspective(${perspective}px) translate3d(${x}px, ${y}px, 0) rotateX(${rx}deg) rotateY(${ry}deg) scale(${s})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
