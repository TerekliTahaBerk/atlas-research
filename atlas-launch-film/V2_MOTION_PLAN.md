# V2 Motion Plan — Atlas launch film

60.0 s · 30 fps · 1800 frames. Timing source: `src/v2/timeline.json`, which drives both the picture and the score. Accents sit on a 120 BPM half-second grid. The kick pulse runs 13–41 s and 41–54 s.

## Narrative chain (one continuous object path)

**Question** → **Point** → **ATLAS** → **Composer** → **Research input** → **Paper row** → **Page** → **Sentence** → **Quote** → **Note** → **Graph node** → **Connection** → **Task** → **`main.tex §3` chip** → **Editor** → **Manuscript page** → **Journey chain** → **Point** → **ATLAS**

Each arrow is a matched hand-off. The outgoing scene keeps playing for `HANDOFF` = 12 frames while the incoming scene, which starts with the same object at the same screen anchor, fades in over it. The anchors are defined in `src/v2/anchors.ts` (`COMPOSER`, `PAGE`, `NOTE`, `TASK`, `LIFTED`).

## Motion system

| Piece | File | Role |
|---|---|---|
| `Rig` / `Layer` | `src/design/rig.tsx` | Eased keyframe camera (`x`, `y`, `s`, `rx`, `ry`, `focus`). Layers apply depth-scaled parallax, a shared 2.5D tilt, and depth-of-field blur by distance from `focus`. |
| `aim()` / `project()` | `src/design/rig.tsx` | Solve and verify camera keys so a layer-space point lands on a screen anchor at a given scale. Every hand-off uses these. |
| `projectPlane()` | `src/design/rig.tsx` | Perspective ground-plane projector (target, yaw, pitch, distance) for the knowledge graph. |
| `lerpRect()` | `src/design/rig.tsx` | Rectangle morphs for hero objects in screen space. |
| Curves | `src/design/motion.ts` | `ease.out` (0.16,1,0.3,1) for arrivals, `ease.inOut` (0.65,0,0.35,1) for camera, `ease.soft` for drifts, `ease.in` for departures. No springs and no overshoot. |
| `EditorialTitle` | `src/v2/components/EditorialTitle.tsx` | Word-staggered tracking and focus settle, placed per scene. |

## Timeline

| Time | Scene | Camera | Focal object | Typography | Audio |
|---|---|---|---|---|---|
| 0.0–3.0 | **Hook** | 4.5% push on the point | Blue point (visible at frame 0) → the question | 86 px left-aligned question. At 1.5 s a blue hairline sweeps under "without running out of memory?" | Point pluck at 0.0, rising glide at 1.5, tonal breath at 2.2 |
| 3.0–8.0 | **Fragments → ATLAS** | Forward dolly through 3D fragments (`camZ` 0→520), perspective-true parallax and DoF | Ten fragments; dashed links at 4.0, 4.5 and 5.0 s | 44 px lower-left: "Great ideas don't exist in isolation." | Sub accent, link plucks, swell 6.0→6.8, **wordmark accent at 6.8** |
| 6.8 | Wordmark | Static | The point rises to sit above the letters | ATLAS 150 px | Low boom, Dmaj9 bloom |
| 8.0–13.0 | **Reveal** | The window hinges open from edge-on (rotateX 86°→0) on the wordmark's horizon line. Three-layer arc (ry −16°→0) with a foreground DoF layer. Then `aim()` at the composer (S = 1.53) | Composer holding the opening question | None; the wordmark is the title | Tonal lift at 8.8, arpeggio from 9.5, ticks from 11.0, **submit at 12.5** |
| 13.0–22.0 | **Discover** | Starts aimed at the input at the composer anchor, pulls back to 1.18 as results stream, then pushes to the lifted row (1.55) | Paper row → lifted hero (16.5) → open (19.5) → morph to `PAGE` (20.5–21.8) | 64 px lower-third over a scrim | Pulse begins at 13.0, answer plucks, focus tick, open click, tonal swell |
| 22.0–31.0 | **Understand** | Page at `PAGE`. Gentle push and drift; rack focus to the note (focus 1→2.4) | Sentence highlight (23.0) → menu (24.0) → Ask (24.5) → **strip lifts and travels into the quote slot (25.0–26.3)**. The hairline tether holds until save. | 80 px right column: "Go beyond reading." (22.3–24.8) | Rising pair at the lift, quote pluck, verified dyad, save thunk |
| 31.0–40.0 | **Connect** (centrepiece) | `projectPlane`: pitch 90°→64°→44°→29°, distance 470→1600, yaw −12°→18°. The dive returns to 90° over the new task. | Note → node. Waves at 32.0, 32.5, 33.0 and 33.5. Reorganise around the question (35.0). Semantic Map over the floor (36.5). Pulse on note→manuscript (38.0) → **task born at the midpoint (38.5)** | 96 px centred in the sky band (35.5–37.7). Concept badge. | Wave plucks, swell, pull-back accent, edge glide, spawn pluck |
| 40.0–48.0 | **Collaborate** | Board backdrop at depth 0.6 with DoF; slow arc ry −5°→4° | Task hero card. Cursor → assign (42.0) → comment (43.0) → status (45.0) → `main.tex §3` (46.5) expands to full frame | 76 px left: "Move research forward." with "Together." (blue) at 44.0, on the comment | Lift chords and melody, assign pop, comment dyad, warm accent on "Together." |
| 48.0–55.0 | **Create** | Editor macro (S ≈ 3.3) → insertion (1.75) → preview (1.45) | Note snippet → three LaTeX lines (49.0) → compile (51.0) → preview paragraph (52.0) → **page lifts to `LIFTED` (53.5)** | 58 px lower-left. Concept badge. | Insert clicks, compile chime, lift swell |
| 55.0–60.0 | **ATLAS** (climax) | Slow pull (1.03→1) | The manuscript returns to the chain; six numbered objects linked; a pulse runs 01→06 (55.5–56.7); **convergence into the point (56.6–57.2)** | ATLAS 150 px. Tagline 42 px at 57.9. Honest footer. | Six rising plucks, convergence swell, **final accent at 57.2**, tagline bells, silence by 59.9 |

## Vertical (9:16)

Every scene branches on `useLayout().portrait`:

- **Window:** the narrow app layout (620×940) magnified 1.516×.
- **Typography:** set in the band y ≈ 210–470.
- **Anchors:** portrait variants keep hero objects between y ≈ 520 and 1800.
- **Graph:** the plane is compressed horizontally (0.62×), stretched in depth (1.25×), with nodes scaled 1.4×.
- **Finale:** the chain zig-zags vertically.

## Teaser (9:16, 23.3 s)

`src/v2/AtlasTeaserV2.tsx` cuts five master segments with 8-frame crossfades. Each segment carries its matching audio slice, so picture and music stay locked:

| Segment | Master frames | Seconds |
|---|---|---|
| Hook | 0–90 | 0.0–3.0 |
| Fragments → Atlas | 90–240 | 3.0–8.0 |
| Evidence → Insight | 740–900 | 24.7–30.0 |
| Connect | 990–1170 | 33.0–39.0 |
| Atlas | 1650–1800 | 55.0–60.0 |
