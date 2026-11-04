# V1 Audit — Atlas launch film

Sources reviewed:

- `output/atlas-launch-16x9.mp4`, sampled every 2 s (`output/frames/v1audit/v1-every2s.png`)
- the Remotion source at commit `c8005be`
- `Atlas.dc.html`

## 1. Scenes and frame ranges (30 fps)

| # | Scene | Frames | Seconds | Composition |
|---|-------|--------|---------|-------------|
| 01 | The Question | 0–180 | 0–6 | Black → dot → two hairlines → centred headline |
| 02 | The Complexity | 180–360 | 6–12 | 10 fragment cards scatter → ring; headline at the bottom |
| 03 | Introducing | 360–540 | 12–18 | Ring collapses → ATLAS wordmark → Home window rises (no title) |
| 04 | Discover | 540–750 | 18–25 | Eyebrow + centred headline + wide Research window |
| 05 | Understand | 750–990 | 25–33 | Eyebrow + centred headline + wide Reader window |
| 06 | Connect | 990–1230 | 33–41 | Eyebrow + centred headline + flat graph, then semantic clusters |
| 07 | Collaborate | 1230–1470 | 41–49 | Eyebrow + centred headline + wide Tasks window |
| 08 | Create | 1470–1650 | 49–55 | Eyebrow + centred headline + wide Manuscript window |
| 09 | Final | 1650–1800 | 55–60 | Dark stage → wordmark → tagline → black |

## 2. Weak compositions

- **0–1.0 s is effectively black.** The first legible frame is the headline at 2.6 s. The hook arrives too late.
- **The product first appears at 15.3 s**, and the brand at 12.55 s. The brief asks for the product by about 8 s.
- **18–54 s is five consecutive "window under headline" shots.** In the 2 s sheet, 17 of 18 frames between 18 s and 54 s share that layout. The window is a flat rectangle at `rx ≈ 0`, and each shot reads like a screenshot.
- **Static holds.** The Reader at 26–32 s and the Tasks board at 42–48 s each hold one framing for 4–6 s. In both, only small UI elements change, at 1–2% of the frame.
- **Readability on a laptop.** Wide shots render UI at scale 1.0–1.07, which puts 12–14 px UI text at about 7 px in a 1000 px-wide player. The Discover and Reader close-ups (s 1.26–1.42) were the only shots readable at that size.
- **Awkward crops.** Discover cut the sidebar mid-word ("e att…", "ank…"). The 08 preview was clipped at the right edge until the late pan. On the 07 board, the "Done" column was half-covered by the detail panel.

## 3. Repeated visual patterns

- **Five identical title layouts.** `FeatureTitle` (mono eyebrow, 60 px centred headline, window beneath) is used in scenes 04, 05, 06, 07 and 08.
- **The same camera move in every product scene.** `ProductShot` always pushes from the top edge, so every product scene shares the same move language.
- **Two copies of the dot → line → wordmark gesture.** It appears at 12.5 s and again at 56 s, so the ending felt like a repeat rather than a payoff.

## 4. Problematic transitions

| Boundary | V1 transition | Problem |
|---|---|---|
| 01→02 (6 s) | Dissolve | Acceptable, but slow. |
| 03→04 (18 s) | Home window → Research window | Unrelated screens, generic dissolve. |
| 04→05 (25 s) | The row's grey fill expands, then the Reader dissolves in | The paper does not become the page. |
| 05→06 (33 s) | A note card is pasted at the centre over the dissolving Reader | Spatially unmotivated; the card appears at a new position. |
| 06→07 (41 s) | Pan toward ATL-27, then a big card dissolves | Closest to a match, but the node does not visibly become the card. |
| 07→08 (49 s) | Board → Manuscript dissolve | Arbitrary. |
| 08→09 (55 s) | Window fades to black → logo | No convergence and no climax. |

## 5. Reusable components (kept in V2)

| Component | Verdict |
|---|---|
| `design/tokens.ts`, `typography.ts`, `motion.ts`, `layout.ts` | Keep (faithful to the reference) |
| `AtlasWorkspace`, `Sidebar`, `TopBar`, `HomeView`, `Avatar`, `Icon` | Keep as background and context layers |
| `ResearchInterface` | Keep. Add `heroRef` support and expose the row layout |
| `PaperReader` | Keep the page renderer; extract a standalone `PaperPage` |
| `AIInteraction` | Reuse its streaming text and chips. Replace the layout with a floating card |
| `KnowledgeGraph` (+ `SemanticField`) | Keep the node and edge renderer. Replace the scene camera with a tilted plane |
| `TaskInterface` | Use as a blurred board behind a new hero `TaskCard` |
| `ManuscriptInterface` | Keep |
| `AtlasWordmark`, `CinematicText`, `Stage`, `Constellation` (fragments data) | Keep |
| `ProductShot` / `Camera` | Superseded by the `Rig`/`Layer` parallax system |
| `FeatureTitle` | Retire. Replaced by distinct per-scene typography |

## 6. Files that need work

- `src/scenes/*` — every scene is rebuilt for V2 in `src/v2/scenes/*`. V1 stays registered for comparison.
- `src/components/Camera.tsx`, `ProductShot.tsx` → `src/design/rig.tsx` (multi-layer parallax, focus/DoF, matched anchors).
- `src/components/FeatureTitle.tsx` → per-scene editorial typography.
- `scripts/generate-score.mjs` → `scripts/generate-score-v2.mjs`. Generic noise whooshes are replaced by tonal swells and felt clicks, with accents quantised to a 120 BPM grid.
- `src/data/timeline.json` → `src/v2/timeline.json`.
