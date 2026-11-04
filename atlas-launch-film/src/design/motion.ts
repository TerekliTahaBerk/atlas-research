import { Easing, interpolate } from 'remotion';

/**
 * Motion language: controlled mass. Long ease-outs for arrivals, symmetric
 * ease-in-outs for camera, and no overshoot anywhere.
 */
export const ease = {
  /** Arrivals — fast start, long settle. */
  out: Easing.bezier(0.16, 1, 0.3, 1),
  /** Camera and spatial moves. */
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  /** Gentle, for very slow drifts. */
  soft: Easing.bezier(0.45, 0, 0.55, 1),
  /** Departures. */
  in: Easing.bezier(0.7, 0, 0.84, 0),
} as const;

type EasingFn = (t: number) => number;

/** Clamped 0→1 progress between two frames. */
export const progress = (frame: number, start: number, end: number, easing: EasingFn = ease.out): number =>
  interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing,
  });

/** Linear mix between two numbers. */
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Fade in over [a,b] and out over [c,d]. */
export const window4 = (frame: number, a: number, b: number, c: number, d: number): number =>
  Math.min(progress(frame, a, b, ease.out), 1 - progress(frame, c, d, ease.in));

/** Deterministic pseudo-random in [0,1) from an integer seed (no Math.random). */
export const seeded = (seed: number): number => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
