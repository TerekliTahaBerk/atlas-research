# Atlas — Launch Film Storyboard (final)

60.0 s · 30 fps · 1800 frames · 1920×1080 (`AtlasLaunch`) and 1080×1920 (`AtlasLaunchVertical`).

All timings come from `src/data/timeline.json`. That file drives the picture
(`src/data/storyboard.ts`) and the score (`scripts/generate-score.mjs`), so the
picture and the music cannot drift apart. Scenes overlap by 14 frames: the
incoming scene dissolves over the outgoing one with a slight depth settle. The
exception is 02 → 03, which is a seamless match (the same structure continues).

## Visual language

- **World:** a near-black stage (`#0D0D0C`) with a soft overhead key light and a light vignette. The same stage sits behind every scene, so the film reads as one continuous space.
- **Product:** the Atlas workspace rebuilt natively from `Atlas.dc.html` using its dark tokens (`--sb #191918`, `--bg #1F1F1E`, `--el #2A2A28`, `--tx #ECECEA`, `--tx2 #A8A6A1`, `--ac #5B8DEF`), the 240 px sidebar, the 48 px tab bar, and the reference's real labels.
- **Type:** Geist (headlines and UI), JetBrains Mono (eyebrows, IDs, LaTeX), Lora (paper pages). Headlines resolve through tracking, opacity and focus. There is no typewriter effect.
- **Colour:** blue is used only for the selection, the active graph links, Ask Atlas and the single brand point.
- **Camera:** a reusable `Camera` with eased keyframes and no overshoot. In product shots it is anchored to the window's top edge, so pushes never rise into the headline band. Content scrolls inside the app rather than the window drifting.
- **Honesty:** the Knowledge graph, Semantic Map and Manuscript scenes carry "Concept interface · in development". The end card reads "In development · Some interfaces shown are concepts". No availability claims, no customer metrics, no third-party logos. All research data is fictional.

## Scenes

| # | Time | Frames | Scene | On-screen text |
|---|------|--------|-------|----------------|
| 01 | 00:00–00:06 | 0–180 | The Question | "Every discovery starts with a question." |
| 02 | 00:06–00:12 | 180–360 | The Complexity | "Great ideas don't exist in isolation." |
| 03 | 00:12–00:18 | 360–540 | Introducing Atlas | ATLAS · "Introducing Atlas" |
| 04 | 00:18–00:25 | 540–750 | Discover | RESEARCH · "Discover what matters." |
| 05 | 00:25–00:33 | 750–990 | Understand | READER · ASK ATLAS · "Go beyond reading." |
| 06 | 00:33–00:41 | 990–1230 | Connect | KNOWLEDGE GRAPH · SEMANTIC MAP · "See how ideas connect." |
| 07 | 00:41–00:49 | 1230–1470 | Collaborate | TASKS · CHANNELS · "Move research forward. Together." |
| 08 | 00:49–00:55 | 1470–1650 | Create | MANUSCRIPT · "From questions to knowledge." |
| 09 | 00:55–01:00 | 1650–1800 | Final Reveal | ATLAS · "Where research comes together." |

### 01 — The Question (0–6 s)
The film opens on pure black and silence for 0.5 s. At 0.9 s a single point resolves at the centre, followed by a soft high tone. At 1.5 s a hairline extends horizontally from it, and at 2.1 s a second line rises at −34°. At 2.6 s the headline resolves word by word, each word settling from wide tracking and soft focus. Throughout, the camera makes a 7% push-in. At 5.0 s the lines retract and the text dissolves away.

### 02 — The Complexity (6–12 s)
At 6.25 s ten research fragments travel outward from the point at staggered depths: two papers, a reading note, a citation, an open question, a task, a notebook run, the manuscript, a channel and a preprint. Distant fragments sit slightly out of focus. Between 7.7 and 9.5 s, four dashed links try to form and fall back (each with a glassy pluck). The headline sits low in the frame. At 10.4 s everything converges into one ordered ring, with spokes from the brightened centre point.

### 03 — Introducing Atlas (12–18 s)
At 12.0 s the structure contracts into the point, which flares and fades. At 12.55 s the wordmark arrives on a low accent: a hairline horizon draws, the letters A·T·L·A·S rise from beneath it as tracking tightens, and a blue point settles above. "Introducing Atlas" follows. At 15.3 s the wordmark lifts away as the workspace rises in perspective (rotateX 26° → 2.5°) and settles on Home ("Good afternoon, Elif", Continue working, Projects).

### 04 — Discover (18–25 s)
This is the Research view ("What are you researching?"). From 18.7 s the question *"How can structure prediction scale to long proteins without exhausting memory?"* is typed with a caret. The camera pushes in on the composer. At 20.9 s the query is submitted; a send-button press and "Searching sources and reading abstracts…" follow. At 21.5 s the answer appears with numbered citations, then the papers. The view scrolls naturally. At 23.1 s *Efficient Structure Prediction via Low-Rank Pair Representations* is highlighted and the other rows recede. At 24.3 s that row expands to fill the pane, carrying the viewer into the reader.

### 05 — Understand (25–33 s)
The paper reader shows page 3 of 14 on a white Lora page, with the Notes / Outline / Ask panel beside it. The camera pushes to the paragraph. At 26.5 s a selection sweeps across *"With r = 32, peak memory … falls from 61 GB to 19 GB"*. At 27.45 s the selection menu appears (Ask Atlas | Highlight | Note | Cite). At 28.15 s Ask Atlas is pressed and the camera travels to the panel. There, context chips and the question "What does this trade away?" appear, followed by visible steps (*Located p.3 ¶2 and Table 2 · Checked the claim against the source*). A streamed answer ends with **Source verified · Chen & Duarte, 2023 · p.3 ¶2**. At 31.1 s **Save as note** is pressed: the answer moves into the Notes tab as a source-linked note, and the PDF selection turns into a saved highlight. In portrait, Ask Atlas is a floating card over the page.

### 06 — Connect (33–41 s) · centrepiece
The note card shrinks into a graph node, *Reading notes — low-rank pairs* (33.4 s), which is selected with a blue ring. Linked objects emerge in four waves (34.1, 34.5, 34.9 and 35.3 s): papers, the research question, the manuscript, a task, a notebook, a channel and meeting notes. Hairline links draw from the earlier node to the later one, and the selected node's links turn blue. At 36.4 s the network reorganises around the question *"Scaling to long proteins?"*, which becomes the hub. At 38.2 s the camera pulls back to 0.8× and the Semantic Map topic clusters (blob contours, member points, labels) fade in behind, revealing the wider structure. At 40.2 s focus slides to *ATL-27 §3 Method* and the camera leans in. The legend ("Show · Papers · Documents · Manuscripts · Tasks · Experiments · Channels") follows the reference's graph filters.

### 07 — Collaborate (41–49 s)
At 41.1 s the ATL-27 node becomes a large task card, which settles into **In progress** while the board assembles (Backlog / In progress / In review / Done). At 42.5 s the detail panel slides in. At 43.3 s the assignee changes from *Unassigned* to **Nora Lind**, with an avatar on the card and an "Elif assigned Nora" entry in the activity log. At 44.5 s a comment arrives: *"Added the 61 → 19 GB comparison to Table 1. Linked my notes — ready for review."* · Shared in #reading-group. At 45.5 s a linked-document chip, *Reading notes — low-rank pairs*, lights up. At 46.6 s the card moves across to **In review**, the other cards reflow, the status changes and the move is logged.

### 08 — Create (49–55 s) · product vision
The Manuscript view has a file tree, a LaTeX editor (`method.tex`, syntax-coloured) and a split PDF preview. At ~49.6 s the note's insight flies into the editor. At 50.5 s three new lines are inserted, including `\citep{chen2023lowrank}`, and the code below shifts down. At 52.1 s Recompile runs: "Compiling…", then "Compiled · just now". The camera pans to the preview, where the new paragraph appears in §3.1 with citation [2] and fades from a blue highlight. From 54.6 s everything recedes into darkness.

### 09 — Final Reveal (55–60 s)
The scene opens on a near-black, still stage. At 56.0 s the wordmark reveal repeats on a warm low accent and the blue point returns. At 57.0 s "Where research comes together." resolves beneath it. At 57.7 s a quiet footer appears: *Atlas Research · In development · Some interfaces shown are concepts*. From 59.2 s the frame fades to black, and the last frame is pure black and silent.

## Vertical edition (9:16)

The vertical cut is recomposed, not cropped:

- Headlines are set at 80 px, wrapped and balanced, in the band y ≈ 262–470, clear of the Reels top UI.
- The workspace switches to the reference's narrow layout (no sidebar), rendered at 620 px and magnified 1.52×, so interface type is about 50% larger than in 16:9.
- Reader: Ask Atlas becomes a floating card. Tasks: the board scrolls to In progress / In review, and the detail opens as a bottom sheet. Manuscript: the editor sits above the preview.
- The graph has its own portrait topology (`ap`/`bp` coordinates), and the Semantic Map is rotated to portrait.
- The fragment field is compressed away from the headline band. The "Concept" label moves into the eyebrow.
- Key content stays between y ≈ 250 and 1500.

## Sound map

| Time | Music | Sound design |
|------|-------|--------------|
| 0–12 s | D/A drone and air; Dmaj9 pad from 6.25 s | point tone, two line plucks, four link plucks, rising breath into 12.5 s |
| 12–25 s | wordmark bloom and low accent; Bm11 → Gmaj7; sparse arpeggio | typing ticks, submit click and whoosh, results chime, highlight tick, expand whoosh |
| 25–41 s | 120 BPM pulse (soft kick, root plucks, off-beat air); Gmaj7 → D/F# → Bm11 → A6/9 | selection swipe, menu tick, Ask Atlas sparkle, answer shimmer, save thunk, node plucks, reorganise swell, pull-back accent |
| 41–55 s | lift: Gmaj9 → A6/9 → Bm9 → Gmaj9 with octave pad and slow melody; pulse fades by 53.5 s | card whoosh, panel tick, assign pop, comment two-note, link ping, status slide, insert clicks, compile chime |
| 55–60 s | Dmaj9 resolution; final accent and bell | — clean tail to silence by 59.85 s |

Loudness: −14.4 LUFS integrated, −1.0 dBTP.
