import timeline from './timeline.json';

/**
 * Single source of truth for timing. Scene boundaries and audio cues live in
 * timeline.json so the score generator (scripts/generate-score.mjs) and the
 * picture stay frame-locked. Edit seconds there; frames are derived here.
 */
export const FPS = timeline.fps;
export const DURATION_IN_FRAMES = timeline.durationSeconds * FPS;

export type SceneId =
  | 'question'
  | 'complexity'
  | 'introducing'
  | 'discover'
  | 'understand'
  | 'connect'
  | 'collaborate'
  | 'create'
  | 'final';

export type SceneTiming = {
  id: SceneId;
  title: string;
  /** First frame of the scene (global). */
  from: number;
  /** Nominal length in frames (excluding the dissolve tail). */
  durationInFrames: number;
};

/** Frames of overlap used for dissolves between adjacent scenes. */
export const DISSOLVE = 14;

export const scenes: Record<SceneId, SceneTiming> = Object.fromEntries(
  timeline.scenes.map((s) => [
    s.id,
    {
      id: s.id as SceneId,
      title: s.title,
      from: Math.round(s.start * FPS),
      durationInFrames: Math.round((s.end - s.start) * FPS),
    },
  ]),
) as Record<SceneId, SceneTiming>;

export type CueId = keyof typeof timeline.cues;

/** Global frame of a cue. */
export const cue = (id: CueId): number => Math.round(timeline.cues[id] * FPS);

/** Cue frame relative to the start of a scene (for use inside a Sequence). */
export const localCue = (scene: SceneId, id: CueId): number => cue(id) - scenes[scene].from;
