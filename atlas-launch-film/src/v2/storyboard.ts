import timeline from './timeline.json';

/**
 * V2 timing source of truth (picture + score). Accents sit on a 120 BPM
 * half-second grid so cuts, camera arrivals and interface events land on
 * the beat. Edit seconds in timeline.json; run `npm run audio:v2` after.
 */
export const FPS = timeline.fps;
export const DURATION = timeline.durationSeconds * FPS;
/** Frames the outgoing scene keeps playing under the incoming one. */
export const HANDOFF = 12;

export type SceneId = (typeof timeline.scenes)[number]['id'];
export type CueId = keyof typeof timeline.cues;

export type SceneTiming = { id: string; title: string; from: number; durationInFrames: number };

export const scenes = Object.fromEntries(
  timeline.scenes.map((s) => [
    s.id,
    { id: s.id, title: s.title, from: Math.round(s.start * FPS), durationInFrames: Math.round((s.end - s.start) * FPS) },
  ]),
) as Record<string, SceneTiming>;

export const scene = (id: string): SceneTiming => {
  const s = scenes[id];
  if (!s) throw new Error(`Unknown scene ${id}`);
  return s;
};

export const cue = (id: CueId): number => Math.round(timeline.cues[id] * FPS);
export const at = (sceneId: string, id: CueId): number => cue(id) - scene(sceneId).from;
