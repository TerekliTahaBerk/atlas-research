# Atlas launch film — V1 → V2 improvement report

**Deliverables:**

| File | Content |
|---|---|
| `output/atlas-launch-v2-16x9.mp4` | 1920×1080, 60 s master |
| `output/atlas-launch-v2-9x16.mp4` | 1080×1920, recomposed 60 s master |
| `output/atlas-teaser-v2-9x16.mp4` | 24 s social teaser |
| `output/atlas-launch-v2-contact-sheet.png` | Master, one frame every 2 s |
| `output/atlas-launch-v2-9x16-contact-sheet.png` | 9:16 master, one frame every 2 s |

**Companion documents:**

- `V1_AUDIT.md` — gate A
- `V2_MOTION_PLAN.md` — gate B

The editable source is in `src/v2/` and `src/design/rig.tsx`, with the score in `scripts/generate-score-v2.mjs` and `scripts/lib/synth.mjs`. Technical verification is in §6.

## 1. What changed, problem by problem

| V1 problem | V2 response |
|---|---|
| **Static UI footage (18–54 s)** | No shot holds one framing for more than about 3 s. Every product moment is a moving rig shot with a focal object: a lifted row, a lifted sentence, a node, a task card, a lifting page. Interfaces sit behind as parallax and depth-of-field context. They are not the subject. |
| **Weak continuity** | One object path runs through the whole film: question → point → ATLAS → composer → research input → paper row → page → sentence → quote → note → node → connection → task → `main.tex §3` → editor → page → chain → ATLAS. Every boundary is a matched hand-off on a shared screen anchor (`src/v2/anchors.ts`). Positions are solved with `aim()`/`project()` and checked on adjacent frames. |
| **Slow opening** | Frame 0 already shows the blue point, and the question is legible by 0.3 s. The wordmark lands at 6.8 s (V1: 12.55 s) and the product at about 9 s (V1: 15.3 s). |
| **Repetitive titles** | V1's `FeatureTitle` (used 5×) is retired. Each title now has its own composition. See the table below. |
| **Flat interfaces** | `Rig`/`Layer` adds multi-layer parallax, 2.5D tilt, a focus depth with real DoF blur, and drop shadows that scale with lift. The graph sits on a perspective ground plane (`projectPlane`), so labels scale with depth. |
| **Framing** | Camera keys are solved around the selected object. In order of priority: the object, then its context (blurred or dimmed), then the interface. Close-ups render UI at 1.3–1.75× so text stays readable in a laptop-size player. |
| **Weak payoff** | A climax: the six journey objects reassemble as a numbered, connected chain (Question → Paper → Insight → Connections → Task → Manuscript). A pulse runs its length, and the chain converges into the point that becomes ATLAS. The ending is a resolution, not a fade. |

### Title compositions

| Scene | Typography |
|---|---|
| Hook | 86 px left-aligned question, the type is the shot |
| Fragments | 44 px lower-left line |
| Reveal | The wordmark only |
| Discover | Lower-third over a scrim |
| Understand | Right-hand column |
| Connect | One large line in the sky band above the plane |
| Collaborate | A two-part line whose blue "Together." arrives with the collaborator's comment |
| Create | Lower-left caption beside the lifted page |

## 2. The six priority moments

| Moment | Time | How it was solved |
|---|---|---|
| **1. Three-second hook** | 0–3 s | Blue point at frame 0. The question unfurls word by word. A blue hairline marks the problem ("without running out of memory?"). The words loosen into fragments as the point leaves for centre. |
| **2. Wordmark → workspace** | 8.6–13 s | The wordmark's horizon hairline widens and becomes the window's hinge, and the window swings open from edge-on. Then the camera arcs, pulls back to a 3×3 mosaic of real modules, dives into Home, and pushes into the send button for a giant cursor click. |
| **3. PDF highlight → insight** | 23–31 s | The highlighted sentence physically lifts off the page. It travels and morphs (paper → interface) into the quote slot of Ask Atlas, and a blue hairline keeps it tethered to its source. The verified answer then condenses into a note while the page racks out of focus. |
| **4. Knowledge Graph reveal** | 31–40 s | The note becomes a node on a perspective research plane. Linked objects rise in four waves on the beat. The network reorganises around the research question. The camera orbits and pulls back over Semantic Map clusters. |
| **5. Graph node → task** | 38–41 s | A pulse travels the note → manuscript connection and splits it. ATL-27 is born at the midpoint, the camera descends from 29° to top-down, and the node becomes the task card. |
| **6. Final brand reveal** | 55–60 s | The convergence chain, then the point, then ATLAS on the warm low accent. The tagline follows, then the honest footer, a held still, and black. |

## 3. Inspiration from the user-supplied reference

The reference was a third-party product launch film (Base44). Three techniques were adopted, translated into Atlas's restrained dark language:

1. **A breadth mosaic** of real screens, cut on 16ths.
2. **A giant macro of one tiny interaction** (the send click, with a visible cursor).
3. **Beat-locked pacing** in the teaser.

Its look, footage, people, colours and music were not reused.

## 4. Audio

The V1 score's harmonic language was kept (D-centred, Dmaj9 / Bm11 / Gmaj7 / A6/9). The rest was rebuilt:

- **Grid:** cues were re-quantised to a 120 BPM half-second grid. Kick, root plucks and ticks pulse from 13 s to 54 s.
- **Transitions:** V1's filtered-noise whooshes are replaced by tonal swells (chords that brighten as they grow) and felt clicks.
- **Sync accents:** hook mark (1.5), link plucks, wordmark (6.8), mosaic 16ths (10.4), macro click (12.5), focus/open (16.5/19.5), evidence lift and verified dyad (25.0/28.5), graph waves (32.0–33.5), pull-back (36.5), task spawn (38.5), assign/comment/"Together."/status (42–45), compile chime (51.7), chain plucks (55.6–56.5), final mark (57.2).
- **Loudness:** −14.3 LUFS integrated, −1.0 dBTP, with a true-silent tail.
- **Licensing:** the score is fully synthesised and original, so no third-party licences apply.
- **Sound-off:** the editorial lines carry the narrative without audio (`npm run render:v2:silent`).

## 5. Critique of the finished V2 (creative director pass)

**What now works.** The film reads as one camera travelling through one research journey. You can name the object being followed at every instant, and each scene begins where the last one ended. The Understand lift and the graph plane are the strongest images. The ending finally pays off the opening point.

**Fixed during QA:**

- The underline drew as disconnected per-word segments.
- Fragments were too small and dim to read as a field.
- The wordmark held for under a second before the window swung through it (retimed: wordmark 6.8 s, unfold 8.6 s).
- The Ask card and note text were too small for a laptop-size player (both now magnified 1.2–1.3×).
- The vignette smudged the white page.
- The graph pull-back was too far for legible labels.
- The dive into the task card was cluttered (non-hero nodes and clusters now dim).
- About 0.4 s of near-black at the 48 s chip → editor cut (now 5 frames).
- Portrait: invisible frame-0 point, small graph labels, cropped editor.

**Remaining limitations, stated honestly:**

- Interface readability in the 9:16 cut is good at phone size. Dense panels (the board backdrop, the mosaic tiles) are context only, not meant to be read.
- The chain objects in the finale are small for about 1.5 s. Their role is shape and rhythm; the six numbered labels carry the meaning.
- No voiceover is embedded, which is intentional. The V1 scripts in `voiceover-*.txt` still align loosely with V2's beats but would need retiming before a recorded read.

**Honesty:**

- The Knowledge graph / Semantic Map and Manuscript footage is labelled "Concept interface · in development", and the end card says "In development · Some interfaces shown are concepts".
- There are no availability claims, customer metrics or third-party logos.
- All research data and people are fictional.

## 6. Technical verification

Measured on the rendered files with ffprobe and ffmpeg `ebur128`:

| File | Video | Frames / duration | Audio | Loudness |
|---|---|---|---|---|
| `atlas-launch-v2-16x9.mp4` (25.6 MB) | H.264 High · 1920×1080 · 30 fps · yuv420p · BT.709 TV range | 1800 / 60.0 s | AAC-LC 48 kHz | −15.2 LUFS · −2.0 dBFS peak |
| `atlas-launch-v2-9x16.mp4` (22.4 MB) | H.264 High · 1080×1920 · 30 fps · yuv420p · BT.709 | 1800 / 60.0 s | AAC-LC 48 kHz | −15.2 LUFS · −2.0 dBFS |
| `atlas-teaser-v2-9x16.mp4` (9.5 MB) | H.264 High · 1080×1920 · 30 fps · yuv420p · BT.709 | 720 / 24.0 s | AAC-LC 48 kHz | −15.6 LUFS · −1.9 dBFS |

**Checks:**

- **Inspection frames:** every 2 s for both masters (`output/atlas-launch-v2-contact-sheet.png`, `output/atlas-launch-v2-9x16-contact-sheet.png`).
- **Boundary frames:** adjacent pairs at all eight scene boundaries (frames 88/92, 238/242, 388/392, 658/662, 928/932, 1198/1202, 1432/1440, 1648/1652). Each shows the same hero object at the same anchor.
- **End state:** the final frame is black and the audio tail is silent.
- **Renderer:** Remotion 4.0.539 with local fonts and no network access during render.
- **Typecheck:** `tsc --noEmit` (strict) passes.
