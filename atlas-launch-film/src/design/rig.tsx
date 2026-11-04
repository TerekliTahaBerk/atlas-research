import React, { createContext, useContext } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { ease, mix, progress } from './motion';

/**
 * Cinematic camera rig (V2).
 *
 * A Rig samples eased keyframes once per frame and shares the camera through
 * context. Each <Layer depth> reads it and applies parallax: translation and
 * dolly scale are multiplied by depth, rotation is shared, and blur grows
 * with distance from the focus depth (subtle depth of field).
 */
export type RigKey = {
  at: number;
  x?: number;
  y?: number;
  /** Dolly / zoom (1 = rest). */
  s?: number;
  rx?: number;
  ry?: number;
  /** Depth that is in focus. */
  focus?: number;
};

export type Cam = { x: number; y: number; s: number; rx: number; ry: number; focus: number };

const DEFAULTS: Cam = { x: 0, y: 0, s: 1, rx: 0, ry: 0, focus: 1 };
type Easing = (t: number) => number;

export const sampleRig = (keys: RigKey[], frame: number, easing: Easing = ease.inOut): Cam => {
  const out = { ...DEFAULTS };
  (Object.keys(DEFAULTS) as Array<keyof Cam>).forEach((p) => {
    // Carry each property forward so keys only need to state what changes.
    let last = DEFAULTS[p];
    const track = keys.map((k) => {
      last = k[p] ?? last;
      return [k.at, last] as const;
    });
    const first = track[0];
    if (!first) return;
    if (frame <= first[0]) {
      out[p] = first[1];
      return;
    }
    let v = track[track.length - 1]?.[1] ?? first[1];
    for (let i = 1; i < track.length; i++) {
      const a = track[i - 1];
      const b = track[i];
      if (!a || !b) continue;
      if (frame <= b[0]) {
        v = mix(a[1], b[1], progress(frame, a[0], b[0], easing));
        break;
      }
    }
    out[p] = v;
  });
  return out;
};

type RigCtx = { cam: Cam; origin: [number, number]; perspective: number };
const Ctx = createContext<RigCtx>({ cam: DEFAULTS, origin: [960, 540], perspective: 2400 });
export const useRig = () => useContext(Ctx);

export const Rig: React.FC<{
  keys: RigKey[];
  origin?: [number, number];
  perspective?: number;
  children: React.ReactNode;
}> = ({ keys, origin, perspective = 2400, children }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const cam = sampleRig(keys, frame);
  return <Ctx.Provider value={{ cam, origin: origin ?? [width / 2, height / 2], perspective }}>{children}</Ctx.Provider>;
};

/** Effective scale of a layer at `depth`. */
export const layerScale = (cam: Cam, depth: number) => 1 + (cam.s - 1) * depth;

/** Project a point from layer space to screen (valid when rx = ry = 0). */
export const project = (cam: Cam, depth: number, origin: [number, number], p: [number, number]): [number, number] => {
  const S = layerScale(cam, depth);
  return [origin[0] + S * (p[0] - origin[0]) + cam.x * depth, origin[1] + S * (p[1] - origin[1]) + cam.y * depth];
};

/**
 * Solve camera x/y/s so that layer point `p` (at rest) lands on screen
 * `target` with on-screen scale `S` — used for matched hand-offs.
 */
export const aim = (p: [number, number], target: [number, number], S: number, depth = 1, origin: [number, number] = [960, 540]) => {
  const s = 1 + (S - 1) / depth;
  const x = (target[0] - origin[0] - S * (p[0] - origin[0])) / depth;
  const y = (target[1] - origin[1] - S * (p[1] - origin[1])) / depth;
  return { s, x, y };
};

export const Layer: React.FC<{
  depth?: number;
  /** Blur in px per unit of depth distance from focus. */
  dof?: number;
  /** Extra rotation multiplier (parallax in tilt). */
  tilt?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ depth = 1, dof = 0, tilt = 1, style, children }) => {
  const { cam, origin, perspective } = useRig();
  const S = layerScale(cam, depth);
  const blur = dof > 0 ? Math.abs(depth - cam.focus) * dof : 0;
  return (
    <AbsoluteFill
      style={{
        transformOrigin: `${origin[0]}px ${origin[1]}px`,
        transform: `perspective(${perspective}px) translate3d(${cam.x * depth}px, ${cam.y * depth}px, 0) rotateX(${cam.rx * tilt}deg) rotateY(${
          cam.ry * tilt
        }deg) scale(${S})`,
        filter: blur > 0.2 ? `blur(${blur.toFixed(2)}px)` : undefined,
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Rect helpers for hero-object morphs between scenes. */
export type Rect = { x: number; y: number; w: number; h: number };
export const lerpRect = (a: Rect, b: Rect, t: number): Rect => ({
  x: mix(a.x, b.x, t),
  y: mix(a.y, b.y, t),
  w: mix(a.w, b.w, t),
  h: mix(a.h, b.h, t),
});

/**
 * 2.5D ground-plane projection for the knowledge graph. Plane coordinates
 * (gx, gz) in px around a target; the camera orbits (yaw), tilts (pitch, 90° =
 * top-down) and dollies (distance). Returns screen position and scale.
 */
export type PlaneCam = { tx: number; tz: number; yaw: number; pitch: number; dist: number; focal: number };
export const projectPlane = (gx: number, gz: number, c: PlaneCam, center: [number, number]) => {
  const yaw = (c.yaw * Math.PI) / 180;
  const pitch = (c.pitch * Math.PI) / 180;
  const dx = gx - c.tx;
  const dz = gz - c.tz;
  const x = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const z = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  const zc = c.dist + z * Math.cos(pitch);
  const k = c.focal / Math.max(40, zc);
  return { sx: center[0] + x * k, sy: center[1] - z * Math.sin(pitch) * k, k, zc };
};
