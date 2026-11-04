// V2 score: original, deterministic, locked to src/v2/timeline.json.
// Accents sit on a 120 BPM grid; transitions use tonal swells, not noise.
//   node scripts/generate-score-v2.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSynth } from './lib/synth.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const T = JSON.parse(readFileSync(path.join(root, 'src/v2/timeline.json'), 'utf8'));
const C = T.cues;
const S = createSynth({ duration: T.durationSeconds });
const { hz, tone, pluck, pad, swell, click, air, boom, kick, tick } = S;

const CH = {
  Dmaj9: ['D3', 'A3', 'E4', 'F#4', 'C#5'],
  Bm11: ['B2', 'F#3', 'D4', 'E4', 'A4'],
  Gmaj7: ['G2', 'D3', 'B3', 'F#4', 'A4'],
  DF: ['F#2', 'D3', 'A3', 'E4', 'C#5'],
  A69: ['A2', 'E3', 'C#4', 'F#4', 'B4'],
  Gmaj9: ['G2', 'D3', 'A3', 'B3', 'F#4'],
  Bm9: ['B2', 'F#3', 'A3', 'C#4', 'D4'],
  Dres: ['D2', 'A2', 'F#3', 'E4', 'A4', 'D5'],
};
const ROOT = { Dmaj9: 'D2', Bm11: 'B1', Gmaj7: 'G1', DF: 'F#1', A69: 'A1', Gmaj9: 'G1', Bm9: 'B1' };
const prog = (list, opts = {}) =>
  list.forEach(([c, t, d]) => {
    pad(CH[c], t, d, opts.pad ?? 0.03, opts.attack ?? 0.9, 1.4);
    if (opts.bass)
      for (let b = 0; b < d * 2; b++) {
        const tt = t + b * 0.5;
        if (opts.until && tt >= opts.until) break;
        tone({ f: hz(ROOT[c]) * 2, t0: tt, dur: 0.18, amp: opts.bass, attack: 0.006, release: 0.18, send: 0.15, harm: [1, 0.35, 0.12], decay: 0.22 });
      }
  });

// HOOK 0–3: the point, the problem, the release.
pluck(hz('D6'), 0.02, 0.05, 0, 1.6);
click(0.02, 0.025, 2200);
tone({ f: hz('D2'), t0: 0.0, dur: 3, amp: 0.05, attack: 0.6, release: 1.5, send: 0.5, harm: [1, 0.15] });
tone({ f: hz('A4'), f2: hz('D5'), t0: C.hookMark, dur: 0.5, amp: 0.03, attack: 0.05, release: 0.6, send: 0.7, harm: [1, 0.2] });
swell(['A3', 'E4', 'F#4'], C.hookRelease - 0.3, 1.1, 0.014);
// FRAGMENTS 3–8.
air(3.0, 3.5, 0.03, 1400);
pad(CH.Dmaj9, C.fragBurst, 3.4, 0.022, 0.4, 1.2);
boom(C.fragBurst, 0.12, 70, 42, 2.4);
[[C.linkA, 'E6', 'A5'], [C.linkB, 'F#6', 'D6'], [C.linkC, 'A6', 'E6']].forEach(([t, a, b], i) => {
  pluck(hz(a), t, 0.03, i % 2 ? 0.5 : -0.5, 1.1);
  pluck(hz(b), t + 0.11, 0.022, i % 2 ? -0.4 : 0.4, 1.0);
});
swell(['D3', 'A3', 'D4', 'F#4', 'A4'], C.converge, C.wordmark - C.converge, 0.03);
// WORDMARK 6.8.
boom(C.wordmark, 0.24, 78, 40, 4);
pad(CH.Dmaj9, C.wordmark, 2.0, 0.026, 0.06, 2.4, 0.85);
pluck(hz('D5'), C.wordmark, 0.05, 0, 2.6);
pluck(hz('A5'), C.wordmark + 0.05, 0.032, 0.3, 2.4);
// REVEAL 8–13: hinge opens, camera arcs, focus on the composer.
swell(['A2', 'E3', 'B3', 'E4'], C.unfold - 0.5, 1.4, 0.024);
pad(CH.Bm11, C.unfold + 0.4, 4.0, 0.026, 1.2, 1.2);
for (let t = C.arc, i = 0; t < C.submit; t += 0.5, i++) pluck(hz(['D5', 'A4', 'F#5', 'E5'][i % 4]), t, 0.016, i % 2 ? 0.45 : -0.45, 0.8, 0.6);
for (let t = C.composer; t < C.submit; t += 0.25) tick(t, 0.008);
click(C.submit, 0.08, 1500);
boom(C.submit, 0.1, 90, 50, 1.4);

// DISCOVER 13–22: the pulse begins.
prog([['Bm11', 13, 4], ['Gmaj7', 17, 4], ['DF', 21, 1]], { pad: 0.03, bass: 0.05 });
for (let t = 13; t < 41; t += 0.5) kick(t, t < 15 ? 0.15 * ((t - 13) / 2) : 0.15);
for (let t = 13.25; t < 41; t += 0.5) tick(t, 0.011);
pluck(hz('F#6'), C.answer, 0.024, -0.3, 1);
pluck(hz('A6'), C.answer + 0.12, 0.02, 0.3, 1);
[0, 0.25, 0.5].forEach((d, i) => pluck(hz(['D6', 'E6', 'F#6'][i]), C.papers + d, 0.02, -0.4 + i * 0.4, 0.8));
click(C.focusPaper, 0.035, 2000, 0.2);
tone({ f: hz('D4'), t0: C.focusPaper, dur: 2.5, amp: 0.02, attack: 0.8, release: 1.2, send: 0.8, harm: [1, 0.2] });
click(C.openPaper, 0.06, 1600);
swell(['D4', 'A4', 'E5', 'F#5'], C.morphPage - 0.2, 1.3, 0.02);

// UNDERSTAND 22–31.
prog([['DF', 22, 3], ['A69', 25, 4], ['Bm9', 29, 4]], { pad: 0.03, bass: 0.05 });
air(C.highlight, 0.9, 0.012, 2600);
click(C.selectMenu, 0.03, 2400, -0.1);
click(C.askAtlas, 0.06, 1900, 0.1);
['D6', 'F#6', 'A6', 'D7'].forEach((n, i) => pluck(hz(n), C.askAtlas + 0.05 + i * 0.06, 0.015, 0.3 - i * 0.2, 0.6));
tone({ f: hz('A4'), f2: hz('E5'), t0: C.liftEvidence, dur: 0.7, amp: 0.025, attack: 0.08, release: 0.6, send: 0.7, harm: [1, 0.25] });
pluck(hz('E5'), C.liftEvidence + 1.25, 0.028, 0.4, 1.2);
swell(['F#5', 'A5', 'C#6'], C.answerStream, 1.6, 0.008);
pluck(hz('E6'), C.verified, 0.028, -0.2, 1);
pluck(hz('A6'), C.verified + 0.14, 0.026, 0.2, 1.2);
click(C.saveNote, 0.06, 1500);
tone({ f: hz('D3'), t0: C.saveNote + 0.02, dur: 0.2, amp: 0.06, attack: 0.004, release: 0.3, send: 0.3, harm: [1, 0.3], decay: 0.2 });

// CONNECT 31–40: the centrepiece opens up.
prog([['Gmaj9', 31, 4], ['A69', 35, 3], ['Bm11', 38, 2]], { pad: 0.034 });
['E5', 'A5', 'C#6', 'E6'].forEach((n, i) => {
  const t = [C.waveA, C.waveB, C.waveC, C.waveD][i];
  pluck(hz(n), t, 0.032, i % 2 ? 0.5 : -0.5, 1.2);
  pluck(hz(n) * 1.5, t + 0.08, 0.014, i % 2 ? -0.3 : 0.3, 0.9);
});
swell(['A3', 'E4', 'A4', 'C#5'], C.reorganize - 0.6, 1.4, 0.02);
boom(C.pullBack, 0.15, 70, 44, 3.2);
pad(['A4', 'C#5', 'E5', 'B5'], C.pullBack, 2.2, 0.012, 1.0, 2, 0.9);
tone({ f: hz('B4'), f2: hz('F#5'), t0: C.edgePulse, dur: 0.6, amp: 0.024, attack: 0.05, release: 0.5, send: 0.7, harm: [1, 0.2] });
pluck(hz('B5'), C.taskSpawn, 0.04, 0, 1.4);
swell(['G3', 'D4', 'B4', 'F#5'], C.taskDive, 1.0, 0.02);

// COLLABORATE 40–48: the lift.
prog([['Gmaj9', 40, 4], ['A69', 44, 4]], { pad: 0.038, bass: 0.045 });
for (let t = 41; t < 48; t += 0.5) kick(t, 0.15);
for (let t = 41.25; t < 48; t += 0.5) tick(t, 0.011);
[['F#5', 40.5, 1.6], ['E5', 42.2, 1.6], ['A5', 44.0, 2.0], ['F#5', 46.2, 1.4]].forEach(([n, t, d]) =>
  tone({ f: hz(n), t0: t, dur: d, amp: 0.022, attack: 0.25, release: 1.4, pan: 0.15, send: 0.8, harm: [1, 0.2, 0.05], vibrato: 0.002 }),
);
tick(C.cursorIn, 0.015, -0.3);
click(C.assign, 0.05, 2000, 0.2);
pluck(hz('A5'), C.assign + 0.04, 0.026, 0.2, 0.8);
pluck(hz('E5'), C.comment, 0.03, -0.2, 1);
pluck(hz('A5'), C.comment + 0.12, 0.025, 0.2, 1);
pad(['D4', 'F#4', 'A4', 'D5'], C.together, 1.2, 0.02, 0.05, 1.4, 0.8);
click(C.status, 0.045, 2100, 0.2);
pluck(hz('C#6'), C.status + 0.1, 0.022, 0.2, 0.9);
pluck(hz('E6'), C.status + 0.25, 0.022, -0.2, 0.9);
click(C.openManuscript, 0.06, 1700);
swell(['A3', 'E4', 'A4', 'B4'], C.openManuscript + 0.1, 1.4, 0.02);

// CREATE 48–55.
prog([['Bm9', 48, 4], ['Gmaj9', 52, 3]], { pad: 0.034, bass: 0.04, until: 54 });
for (let t = 48; t < 54; t += 0.5) kick(t, t > 52.5 ? 0.13 * (54 - t) / 1.5 : 0.14);
click(C.insert, 0.045, 2100);
for (let i = 0; i < 3; i++) click(C.insert + 0.3 + i * 0.3, 0.014, 3000);
click(C.compile, 0.04, 2300);
['D6', 'F#6', 'A6'].forEach((n, i) => pluck(hz(n), C.compile + 0.7 + i * 0.08, 0.022, -0.3 + i * 0.3, 1.2));
swell(['G3', 'D4', 'A4', 'D5'], C.liftPage - 0.3, 1.4, 0.022);

// ATLAS 55–60: the chain, the convergence, the mark.
pad(['D3', 'A3', 'E4', 'F#4'], 55, 1.8, 0.02, 0.5, 1.0);
['D5', 'E5', 'F#5', 'A5', 'B5', 'D6'].forEach((n, i) => pluck(hz(n), C.journeyLinks + 0.1 + i * 0.17, 0.03, -0.5 + i * 0.2, 1.2));
swell(['D3', 'A3', 'D4', 'A4', 'D5'], C.collapse, C.finalWordmark - C.collapse, 0.03);
boom(C.finalWordmark, 0.2, 74, 38, 3.4);
pad(CH.Dres, C.finalWordmark, 1.6, 0.028, 0.05, 2.0, 0.9);
pluck(hz('D5'), C.finalWordmark, 0.05, 0, 2.6);
pluck(hz('A5'), C.finalWordmark + 0.05, 0.03, 0.25, 2.4);
pluck(hz('F#6'), C.tagline, 0.022, -0.2, 2.2);
pluck(hz('D6'), C.tagline + 0.12, 0.018, 0.2, 2.2);

S.render(path.join(root, 'public/assets/audio/atlas-score-v2.m4a'), { headSilence: 0, tail: 0.75 });
