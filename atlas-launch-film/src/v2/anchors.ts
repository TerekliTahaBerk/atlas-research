import type { Rect } from '../design/rig';

/**
 * Shared screen-space anchors for objects that travel between scenes.
 * Each hand-off places the hero object at exactly these coordinates in both
 * the outgoing and the incoming scene, so matched cuts line up.
 */
type Pair<T> = { landscape: T; portrait: T };

/** The research question composer → Research input. */
export const COMPOSER: Pair<{ cx: number; cy: number; w: number }> = {
  landscape: { cx: 960, cy: 540, w: 1040 },
  portrait: { cx: 540, cy: 900, w: 960 },
};

/** The opened paper page (start of Understand). */
export const PAGE: Pair<Rect> = {
  landscape: { x: 150, y: 70, w: 960, h: 960 * (11 / 8.5) },
  portrait: { x: 60, y: 560, w: 960, h: 960 * (11 / 8.5) },
};

/** The saved research note (Understand → Connect). */
export const NOTE: Pair<{ cx: number; cy: number; w: number }> = {
  landscape: { cx: 960, cy: 540, w: 680 },
  portrait: { cx: 540, cy: 1000, w: 900 },
};

/** The task born from a graph connection (Connect → Collaborate). */
export const TASK: Pair<{ cx: number; cy: number; w: number }> = {
  landscape: { cx: 960, cy: 540, w: 600 },
  portrait: { cx: 540, cy: 1040, w: 900 },
};

export const pick = <T,>(pair: Pair<T>, portrait: boolean): T => (portrait ? pair.portrait : pair.landscape);
