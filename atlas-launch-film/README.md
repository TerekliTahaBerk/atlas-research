# Atlas — Cinematic Brand Launch Film

This folder holds a 60-second launch film for **Atlas Research**, built with React, TypeScript and [Remotion](https://www.remotion.dev/docs). Every frame comes from editable code. The film uses no screenshots, no stock footage and no third-party audio.

| Deliverable | File |
|---|---|
| 16:9 film: 1920×1080, 30 fps, H.264 + AAC, 60 s | `output/atlas-launch-16x9.mp4` |
| 9:16 film: 1080×1920, 30 fps, H.264 + AAC, 60 s | `output/atlas-launch-9x16.mp4` |
| Poster / cover frame (1920×1080) | `output/atlas-launch-poster.png` |
| Final timing and scene descriptions | `storyboard.md` |
| Optional narration (English / Turkish) | `voiceover-en.txt`, `voiceover-tr.txt` |
| QA contact sheets (regenerate with `node scripts/stills.mjs`) | `output/contact-sheet-*.png` |

The film is self-contained. It has its own `package.json` and lockfile, sits outside the pnpm workspace, and imports nothing from `apps/` or `packages/`. The root ESLint and Prettier configs ignore this folder.

## Install

Requires Node 20 or newer.

```bash
cd atlas-launch-film
```

```bash
npm ci
```

## Preview

```bash
npm run dev
```

This opens Remotion Studio. The compositions are in the **Atlas-Launch** folder: `AtlasLaunch` (16:9), `AtlasLaunchVertical` (9:16) and `AtlasPoster` (still). Each scene is a named Sequence on the timeline (*01 The Question* … *09 Final Reveal*).

## Render

```bash
npm run render:16x9
```

```bash
npm run render:9x16
```

```bash
npm run render:poster
```

To render all three in sequence:

```bash
npm run render:all
```

To render the picture without audio:

```bash
npx remotion render AtlasLaunch output/silent-16x9.mp4 --props='{"withAudio":false,"musicVolume":0}'
```

`remotion.config.ts` sets H.264 output in yuv420p with BT.709 colour, which keeps contrast consistent on social platforms and in QuickTime. It also uses a preinstalled Chrome headless shell when one exists at the CI path. Otherwise Remotion downloads its own browser on first render.

QA frames and a labelled contact sheet:

```bash
node scripts/stills.mjs AtlasLaunch
```

```bash
node scripts/stills.mjs AtlasLaunchVertical 120,700,1100
```

## Editing

- **Timing:** `src/data/timeline.json` holds scene boundaries and about 40 named cues, in seconds. The picture (`src/data/storyboard.ts` → `localCue()`) and the score both read from it. After moving a cue, run `npm run audio` so the music and sound effects follow.
- **Copy:** headlines are inline in each `src/scenes/*Scene.tsx` file, passed to `<FeatureTitle>` or `<CinematicText>`. Demo research content (papers, people, tasks, graph topology) is in `src/data/demoResearch.ts`.
- **Look:** tokens are in `src/design/tokens.ts` (taken from the `:root` dark theme of `Atlas.dc.html`). Easing curves and helpers are in `src/design/motion.ts`. Fonts are in `src/design/typography.ts`.
- **Camera:** each product shot passes `keys` to `<ProductShot>`/`<Camera>` (`at`, `s`, `x`, `y`, `rx`, `ry`). Segments use ease-in-out, with no springs or overshoot.
- **Vertical:** scenes call `useLayout()` and recompose for portrait. Portrait renders the narrow app layout at 620 px, magnified 1.52× (`windowRest` in `src/components/ProductShot.tsx`). Graph nodes have separate portrait coordinates (`ap`, `bp`).

```
src/
  Root.tsx                      composition registry
  compositions/                 AtlasLaunch (shared 16:9/9:16 timeline), AtlasLaunchVertical, AtlasPoster
  scenes/                       nine scene components
  components/                   AtlasWorkspace, Sidebar, TopBar, ResearchInterface, PaperReader,
                                AIInteraction, KnowledgeGraph (+ SemanticField), TaskInterface,
                                ManuscriptInterface, AtlasWordmark, CinematicText, Camera, Stage, …
  design/                       tokens, motion, typography, layout
  data/                         timeline.json, storyboard.ts, demoResearch.ts
scripts/
  generate-score.mjs            deterministic score + sound-design synthesiser
  stills.mjs                    QA frames + contact sheet
public/assets/
  fonts/                        Geist, JetBrains Mono, Lora (woff2, SIL OFL, via @fontsource)
  audio/atlas-score.m4a         the rendered score
```

## Audio

`scripts/generate-score.mjs` composes the soundtrack from scratch: sine and harmonic voices, filtered noise and a Freeverb-style reverb. It uses no samples or downloaded audio, so no third-party licence applies. The script is deterministic (seeded PRNG) and places every hit using `timeline.json`.

```bash
npm run audio
```

This writes `atlas-score.wav` (git-ignored) and the `atlas-score.m4a` that the composition plays. The current mix measures −14.4 LUFS integrated and −1.0 dBTP.

### Adding the voiceover

The film works without narration. To add a recorded read of `voiceover-en.txt` (or `voiceover-tr.txt`):

1. Put a 48 kHz WAV at `public/assets/audio/voiceover-en.wav`.
2. In `src/compositions/AtlasLaunch.tsx`, add `<Audio src={staticFile('assets/audio/voiceover-en.wav')} volume={1} />` next to the score.
3. Lower `musicVolume` to about 0.6 in `Root.tsx` so the voice sits on top.

Do not use synthetic TTS as a placeholder.

## Product honesty

The film draws on the design reference and on the repository's current status (`docs/ROADMAP.md`):

- Research discovery, reading and annotations, source-cited AI answers, notes, tasks and channels have local implementations. Hosted activation is still gated.
- The **Knowledge graph / Semantic Map** and **Manuscript** footage is product vision. Those scenes are captioned *Concept interface · in development*. Manuscripts are Phase 07, and there is no graph store.
- The end card reads *In development · Some interfaces shown are concepts*. The film makes no "available now" claim and shows no customer metrics, live integrations or third-party logos.
- All papers, authors, numbers, people and the "Kaya Lab" workspace are fictional. The reference's personal names and e-mail addresses are not used.
- No approved logo exists, so the mark is a typographic ATLAS wordmark.

## Licensing notes

The film uses Remotion, which has its own licence terms. Free use covers individuals and small teams; larger companies need a company licence. See https://www.remotion.dev/license. Fonts are SIL OFL 1.1, and Lucide icons are ISC.
