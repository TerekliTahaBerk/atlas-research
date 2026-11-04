// Original, deterministic score + UI sound design for the Atlas launch film.
// Pure synthesis (no samples, no third-party audio): sine/triangle voices,
// filtered noise, a Freeverb-style reverb. Every hit is locked to
// src/data/timeline.json, the same file that times the picture.
//
//   node scripts/generate-score.mjs
//
// Writes public/assets/audio/atlas-score.wav and (when ffmpeg is available)
// public/assets/audio/atlas-score.m4a, which the composition plays.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const timeline = JSON.parse(readFileSync(path.join(root, 'src/data/timeline.json'), 'utf8'));
const C = timeline.cues;
const SR = 48000;
const DUR = timeline.durationSeconds;
const N = SR * DUR;
const dryL = new Float32Array(N);
const dryR = new Float32Array(N);
const sendL = new Float32Array(N); // reverb send
const sendR = new Float32Array(N);

// Deterministic PRNG (mulberry32).
let seed = 0x5eed1234;
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const hz = (note) => {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(note);
  if (!m) throw new Error(note);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const midi = (Number(m[3]) + 1) * 12 + base + acc;
  return 440 * Math.pow(2, (midi - 69) / 12);
};
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

const write = (i, l, r, send) => {
  if (i < 0 || i >= N) return;
  dryL[i] += l;
  dryR[i] += r;
  sendL[i] += l * send;
  sendR[i] += r * send;
};

/** A voice with attack/decay/sustain-ish envelope and soft harmonics. */
const tone = ({ f, t0, dur, amp, attack = 0.01, release = 0.4, pan = 0, send = 0.4, harm = [1, 0.3, 0.1], detune = 0, decay = 0, vibrato = 0 }) => {
  const s0 = Math.floor(t0 * SR);
  const len = Math.floor((dur + release) * SR);
  const gl = Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = Math.sin(((pan + 1) * Math.PI) / 4);
  const phases = harm.map(() => rand() * Math.PI * 2);
  for (let k = 0; k < len; k++) {
    const t = k / SR;
    let env = t < attack ? smooth(t / attack) : 1;
    if (decay > 0) env *= Math.exp(-t / decay);
    if (t > dur) env *= Math.max(0, 1 - (t - dur) / release) ** 2;
    if (env < 1e-5 && t > attack) continue;
    const ff = f * (1 + detune) * (1 + vibrato * Math.sin(2 * Math.PI * 4.6 * t));
    let v = 0;
    for (let h = 0; h < harm.length; h++) v += harm[h] * Math.sin(2 * Math.PI * ff * (h + 1) * t + phases[h]);
    v *= amp * env;
    write(s0 + k, v * gl, v * gr, send);
  }
};

/** Glassy pluck (fast attack, exponential decay, inharmonic sparkle). */
const pluck = (f, t0, amp, pan = 0, decay = 0.9, send = 0.55) => {
  tone({ f, t0, dur: decay * 3, amp, attack: 0.004, release: 0.3, pan, send, harm: [1, 0.18, 0.05], decay });
  tone({ f: f * 2.756, t0, dur: decay, amp: amp * 0.12, attack: 0.002, release: 0.2, pan: -pan, send, harm: [1], decay: decay * 0.3 });
};

/** Pad chord: slow attack, detuned pairs, wide stereo. */
const pad = (notes, t0, dur, amp, attack = 2.5, release = 2.5, send = 0.7) => {
  notes.forEach((n, i) => {
    const f = hz(n);
    const pan = ((i / Math.max(1, notes.length - 1)) * 2 - 1) * 0.6;
    tone({ f, t0, dur, amp, attack, release, pan, send, harm: [1, 0.22, 0.06], detune: 0.0018, vibrato: 0.0012 });
    tone({ f, t0, dur, amp: amp * 0.7, attack: attack * 1.2, release, pan: -pan, send, harm: [1, 0.12], detune: -0.0021, vibrato: 0.001 });
  });
};

/** Filtered noise: air, swells, whooshes, ticks. */
const noise = ({ t0, dur, amp, cutoffA = 800, cutoffB = 800, attack = 0.01, pan = 0, send = 0.3, shape = 'swell' }) => {
  const s0 = Math.floor(t0 * SR);
  const len = Math.floor(dur * SR);
  let lp = 0;
  let lp2 = 0;
  const gl = Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let k = 0; k < len; k++) {
    const x = k / len;
    const fc = cutoffA + (cutoffB - cutoffA) * x;
    const a = 1 - Math.exp((-2 * Math.PI * fc) / SR);
    lp += a * (rand() * 2 - 1 - lp);
    lp2 += a * (lp - lp2);
    let env;
    if (shape === 'swell') env = Math.sin(Math.PI * x) ** 2;
    else if (shape === 'rise') env = smooth(x) ** 2 * (x > 0.97 ? (1 - x) / 0.03 : 1);
    else env = Math.min(1, k / (attack * SR)) * Math.exp((-k / SR) / Math.max(0.005, dur / 5));
    const v = lp2 * amp * env;
    write(s0 + k, v * gl, v * gr, send);
  }
};

/** Low cinematic accent: pitch-dropping sine with warm second harmonic. */
const boom = (t0, amp, f0 = 82, f1 = 42, dur = 3) => {
  const s0 = Math.floor(t0 * SR);
  const len = Math.floor(dur * SR);
  let ph = 0;
  for (let k = 0; k < len; k++) {
    const t = k / SR;
    const f = f1 + (f0 - f1) * Math.exp(-t / 0.35);
    ph += (2 * Math.PI * f) / SR;
    const env = Math.min(1, t / 0.012) * Math.exp(-t / (dur / 3.2));
    const v = (Math.sin(ph) + 0.25 * Math.sin(2 * ph)) * amp * env;
    write(s0 + k, v, v, 0.25);
  }
};

/** Soft kick for the pulse. */
const kick = (t0, amp) => {
  const s0 = Math.floor(t0 * SR);
  const len = Math.floor(0.42 * SR);
  let ph = 0;
  for (let k = 0; k < len; k++) {
    const t = k / SR;
    const f = 46 + 70 * Math.exp(-t / 0.03);
    ph += (2 * Math.PI * f) / SR;
    const env = Math.min(1, t / 0.003) * Math.exp(-t / 0.12);
    const v = Math.sin(ph) * amp * env;
    write(s0 + k, v, v, 0.05);
  }
};

/** UI click: tiny band-limited transient + sine blip. */
const click = (t0, amp = 0.05, pitch = 2400, pan = 0) => {
  noise({ t0, dur: 0.03, amp: amp * 1.4, cutoffA: 5000, cutoffB: 3000, attack: 0.0008, pan, send: 0.12, shape: 'hit' });
  tone({ f: pitch, t0, dur: 0.01, amp: amp * 0.5, attack: 0.001, release: 0.05, pan, send: 0.15, harm: [1], decay: 0.02 });
};

// ───────────────────────── Score ─────────────────────────
// Key centre D. Progression language: Dmaj9 · Bm11 · Gmaj7 · A6/9.
const CH = {
  Dmaj9: ['D3', 'A3', 'E4', 'F#4', 'C#5'],
  Bm11: ['B2', 'F#3', 'D4', 'E4', 'A4'],
  Gmaj7: ['G2', 'D3', 'B3', 'F#4', 'A4'],
  Dmaj9F: ['F#2', 'D3', 'A3', 'E4', 'C#5'],
  A69: ['A2', 'E3', 'C#4', 'F#4', 'B4'],
  Gmaj9: ['G2', 'D3', 'A3', 'B3', 'F#4'],
  Bm9: ['B2', 'F#3', 'A3', 'C#4', 'D4'],
  Dres: ['D2', 'A2', 'F#3', 'E4', 'A4', 'D5'],
};
const ROOT = { Dmaj9: 'D2', Bm11: 'B1', Gmaj7: 'G1', Dmaj9F: 'F#1', A69: 'A1', Gmaj9: 'G1', Bm9: 'B1' };

// 1 — Atmosphere (0–12 s): a held fifth, air, the point.
tone({ f: hz('D2'), t0: 0.6, dur: 11.4, amp: 0.07, attack: 6, release: 2, send: 0.5, harm: [1, 0.15] });
tone({ f: hz('A2'), t0: 2.5, dur: 9.5, amp: 0.045, attack: 5, release: 2, send: 0.6, harm: [1, 0.1], pan: 0.2 });
noise({ t0: 0.8, dur: 11.6, amp: 0.05, cutoffA: 500, cutoffB: 1600, send: 0.6, shape: 'swell' });
pluck(hz('D6'), C.pointAppears, 0.05, 0, 1.6);
pluck(hz('A5'), C.lineOne, 0.035, -0.4, 1.4);
pluck(hz('F#5'), C.lineTwo, 0.032, 0.4, 1.4);
// Complexity: the field spawns, links attempt.
noise({ t0: C.spawn - 0.4, dur: 2.2, amp: 0.06, cutoffA: 300, cutoffB: 2400, send: 0.7, shape: 'swell' });
pad(CH.Dmaj9, C.spawn, 5.6, 0.018, 3, 1.5);
[['E6', -0.6], ['A5', 0.5], ['F#6', -0.3], ['D6', 0.6]].forEach(([n, p], i) =>
  pluck(hz(n), [C.connectA, C.connectB, C.connectC, C.connectD][i], 0.03, p, 1.1),
);
// Converge → contract: a rising breath into the wordmark.
noise({ t0: C.converge, dur: C.wordmark - C.converge, amp: 0.08, cutoffA: 400, cutoffB: 5200, send: 0.5, shape: 'rise' });
tone({ f: hz('A3'), t0: C.converge, dur: C.wordmark - C.converge, amp: 0.02, attack: 1.6, release: 0.1, send: 0.6, harm: [1, 0.3] });

// 2 — Introducing (12–25 s): the soundscape opens.
boom(C.wordmark, 0.24, 78, 40, 4);
pad(CH.Dmaj9, C.wordmark, 5.8, 0.022, 0.08, 2.6, 0.85);
pluck(hz('D5'), C.wordmark, 0.05, 0, 2.6);
pluck(hz('A5'), C.wordmark + 0.04, 0.035, 0.3, 2.4);
noise({ t0: C.windowRise - 0.6, dur: 1.8, amp: 0.045, cutoffA: 600, cutoffB: 3000, send: 0.5, shape: 'swell' });
pad(CH.Bm11, 18.0, 3.6, 0.026, 1.5, 1.6);
pad(CH.Gmaj7, 21.6, 3.4, 0.026, 1.4, 1.8);
// Sparse arpeggio from the window rise.
const arp = ['D5', 'A4', 'F#5', 'E5', 'B4', 'A4', 'F#4', 'D5'];
for (let t = 15.5, i = 0; t < 25; t += 0.75, i++) pluck(hz(arp[i % arp.length]), t, 0.016, i % 2 ? 0.45 : -0.45, 0.8, 0.6);
// UI: typing ticks, submit, results, highlight, expand.
for (let t = C.typingStart; t < C.submit - 0.3; t += 0.085 + rand() * 0.05) click(t, 0.012, 3200 + rand() * 600, (rand() - 0.5) * 0.3);
click(C.submit, 0.07, 1800);
noise({ t0: C.submit + 0.02, dur: 0.6, amp: 0.03, cutoffA: 1200, cutoffB: 4000, send: 0.4, shape: 'swell' });
pluck(hz('F#5'), C.results, 0.03, -0.2, 1.2);
pluck(hz('A5'), C.results + 0.09, 0.026, 0.2, 1.2);
pluck(hz('D6'), C.results + 0.18, 0.022, 0, 1.2);
click(C.paperHighlight, 0.04, 2200, 0.2);
noise({ t0: C.paperExpand - 0.1, dur: 0.9, amp: 0.05, cutoffA: 800, cutoffB: 3600, send: 0.5, shape: 'swell' });

// 3 — Understand + Connect (25–41 s): a controlled pulse at 120 BPM.
const prog1 = [
  ['Gmaj7', 25, 4],
  ['Dmaj9F', 29, 4],
  ['Bm11', 33, 4],
  ['A69', 37, 4],
];
prog1.forEach(([c, t, d]) => {
  pad(CH[c], t, d, 0.03, 0.9, 1.4);
  for (let b = 0; b < d * 2; b++) {
    const tt = t + b * 0.5;
    tone({ f: hz(ROOT[c]) * 2, t0: tt, dur: 0.18, amp: 0.05, attack: 0.006, release: 0.18, send: 0.15, harm: [1, 0.35, 0.12], decay: 0.22 });
  }
});
for (let t = 25; t < 41; t += 0.5) kick(t, t < 27 ? 0.15 * ((t - 25) / 2) : 0.15);
for (let t = 27.25; t < 41; t += 0.5) noise({ t0: t, dur: 0.05, amp: 0.012, cutoffA: 7000, cutoffB: 6000, attack: 0.001, pan: 0.3, send: 0.1, shape: 'hit' });
noise({ t0: C.sentenceHighlight, dur: 0.9, amp: 0.02, cutoffA: 2000, cutoffB: 5000, send: 0.3, shape: 'swell' });
click(C.selectionMenu, 0.035, 2600, -0.1);
click(C.askAtlas, 0.06, 2000, 0.1);
['D6', 'F#6', 'A6', 'D7'].forEach((n, i) => pluck(hz(n), C.askAtlas + 0.05 + i * 0.06, 0.016, 0.3 - i * 0.2, 0.6));
noise({ t0: C.answer, dur: 2.2, amp: 0.018, cutoffA: 3000, cutoffB: 6000, send: 0.6, shape: 'swell' });
click(C.saveNote, 0.06, 1600);
pluck(hz('A4'), C.saveNote + 0.05, 0.04, 0, 0.7);
pluck(hz('D6'), C.nodeSelect, 0.04, 0, 1.4);
['E5', 'A5', 'C#6', 'E6'].forEach((n, i) => {
  const t = [C.nodeEmergeA, C.nodeEmergeB, C.nodeEmergeC, C.nodeEmergeD][i];
  pluck(hz(n), t, 0.03, i % 2 ? 0.5 : -0.5, 1.1);
  pluck(hz(n) * 1.5, t + 0.07, 0.014, i % 2 ? -0.3 : 0.3, 0.8);
});
noise({ t0: C.reorganize - 0.3, dur: 2, amp: 0.04, cutoffA: 500, cutoffB: 2600, send: 0.7, shape: 'swell' });
noise({ t0: C.pullBack - 0.4, dur: 3.4, amp: 0.05, cutoffA: 300, cutoffB: 2000, send: 0.8, shape: 'swell' });
boom(C.pullBack, 0.16, 70, 44, 3.2);
pad(['A4', 'C#5', 'E5', 'B5'], C.pullBack, 2.6, 0.012, 1.2, 2, 0.9);

// 4 — Collaborate + Create (41–55 s): an emotional lift, never bombastic.
const prog2 = [
  ['Gmaj9', 41, 4],
  ['A69', 45, 4],
  ['Bm9', 49, 3],
  ['Gmaj9', 52, 3],
];
prog2.forEach(([c, t, d]) => {
  pad(CH[c], t, d, 0.037, 0.8, 1.6);
  pad(CH[c].map((n) => n.replace(/\d/, (o) => String(Number(o) + 1))), t, d, 0.008, 1.2, 1.6, 0.9);
  for (let b = 0; b < d * 2; b++) {
    const tt = t + b * 0.5;
    if (tt > 53.4) break;
    tone({ f: hz(ROOT[c]) * 2, t0: tt, dur: 0.18, amp: 0.045, attack: 0.006, release: 0.18, send: 0.15, harm: [1, 0.35, 0.12], decay: 0.22 });
  }
});
for (let t = 41; t < 53.5; t += 0.5) kick(t, t > 51.5 ? 0.15 * (53.5 - t) / 2 : 0.15);
// A slow melodic line over the lift.
[['F#5', 41.0, 1.8], ['E5', 43.0, 1.8], ['A5', 45.0, 2.2], ['F#5', 47.4, 1.4], ['B5', 49.0, 2.4], ['A5', 51.6, 1.2], ['F#5', 52.9, 2.2]].forEach(([n, t, d]) =>
  tone({ f: hz(n), t0: t, dur: d, amp: 0.022, attack: 0.25, release: 1.4, pan: 0.15, send: 0.8, harm: [1, 0.2, 0.05], vibrato: 0.002 }),
);
noise({ t0: C.taskMorph - 0.3, dur: 1, amp: 0.04, cutoffA: 800, cutoffB: 3600, send: 0.5, shape: 'swell' });
click(C.detailPanel, 0.03, 2400, 0.3);
click(C.assign, 0.05, 2000, 0.2);
pluck(hz('A5'), C.assign + 0.04, 0.025, 0.2, 0.8);
pluck(hz('E5'), C.comment, 0.03, -0.2, 1);
pluck(hz('A5'), C.comment + 0.12, 0.025, 0.2, 1);
pluck(hz('C#6'), C.linkDoc, 0.026, 0.3, 1);
noise({ t0: C.statusUpdate, dur: 0.8, amp: 0.025, cutoffA: 1500, cutoffB: 4200, send: 0.4, shape: 'swell' });
pluck(hz('B5'), C.statusUpdate + 0.6, 0.03, 0, 1.2);
noise({ t0: C.insertCitation - 0.9, dur: 1, amp: 0.03, cutoffA: 900, cutoffB: 3000, send: 0.5, shape: 'swell' });
click(C.insertCitation, 0.05, 2100);
for (let i = 0; i < 3; i++) click(C.insertCitation + 0.25 + i * 0.28, 0.014, 3400, 0);
click(C.compile, 0.045, 2300);
['D6', 'F#6', 'A6'].forEach((n, i) => pluck(hz(n), C.compile + 0.7 + i * 0.08, 0.022, -0.3 + i * 0.3, 1.2));

// 5 — Resolution (55–60 s): stillness, then a clean close.
noise({ t0: 54.2, dur: 1.6, amp: 0.035, cutoffA: 2000, cutoffB: 600, send: 0.8, shape: 'swell' });
pad(CH.Dres, 55.4, 2.4, 0.026, 1.0, 2.2, 0.9);
boom(C.finalWordmark, 0.17, 74, 38, 3.6);
pluck(hz('D5'), C.finalWordmark, 0.05, 0, 3);
pluck(hz('A5'), C.finalWordmark + 0.05, 0.03, 0.25, 2.8);
pluck(hz('F#6'), C.tagline, 0.024, -0.2, 2.4);
pluck(hz('D6'), C.tagline + 0.12, 0.02, 0.2, 2.4);

// ───────────────────────── Mix ─────────────────────────
// Freeverb-style stereo reverb on the send bus.
const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((x) => Math.round((x * SR) / 44100));
const apT = [556, 441, 341, 225].map((x) => Math.round((x * SR) / 44100));
const reverb = (input, spread) => {
  const out = new Float32Array(N);
  const combs = combT.map((t) => ({ buf: new Float32Array(t + spread), i: 0, store: 0 }));
  const aps = apT.map((t) => ({ buf: new Float32Array(t + spread), i: 0 }));
  const fb = 0.86;
  const damp = 0.35;
  for (let n = 0; n < N; n++) {
    const x = input[n] * 0.015;
    let s = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.store = y * (1 - damp) + c.store * damp;
      c.buf[c.i] = x + c.store * fb;
      c.i = (c.i + 1) % c.buf.length;
      s += y;
    }
    for (const a of aps) {
      const b = a.buf[a.i];
      a.buf[a.i] = s + b * 0.5;
      a.i = (a.i + 1) % a.buf.length;
      s = b - s;
    }
    out[n] = s;
  }
  return out;
};
const wetL = reverb(sendL, 0);
const wetR = reverb(sendR, 23);

const outL = new Float32Array(N);
const outR = new Float32Array(N);
let peak = 0;
for (let n = 0; n < N; n++) {
  const t = n / SR;
  // Master fade: true silence at the head, clean tail to silence.
  const head = t < 0.5 ? 0 : smooth((t - 0.5) / 0.4);
  const tail = t > 59.0 ? Math.max(0, 1 - (t - 59.0) / 0.85) ** 2 : 1;
  const g = head * tail;
  // Gentle tanh glue.
  outL[n] = Math.tanh((dryL[n] + wetL[n] * 3.2) * 1.6) * g;
  outR[n] = Math.tanh((dryR[n] + wetR[n] * 3.2) * 1.6) * g;
  peak = Math.max(peak, Math.abs(outL[n]), Math.abs(outR[n]));
}
const norm = peak > 0 ? 0.89 / peak : 1; // ≈ −1 dBFS peak

const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + N * 4, 4);
buf.write('WAVEfmt ', 8);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(N * 4, 40);
for (let n = 0; n < N; n++) {
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, outL[n] * norm)) * 32767), 44 + n * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, outR[n] * norm)) * 32767), 46 + n * 4);
}
const dir = path.join(root, 'public/assets/audio');
mkdirSync(dir, { recursive: true });
const wav = path.join(dir, 'atlas-score.wav');
writeFileSync(wav, buf);
console.log('wrote', wav, `peak normalised from ${peak.toFixed(3)}`);

const m4a = path.join(dir, 'atlas-score.m4a');
const args = ['-y', '-loglevel', 'error', '-i', wav, '-c:a', 'aac', '-b:a', '256k', m4a];
try {
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
  console.log('wrote', m4a);
} catch {
  try {
    execFileSync('npx', ['remotion', 'ffmpeg', ...args], { stdio: 'inherit', cwd: root });
    console.log('wrote', m4a);
  } catch {
    console.warn('ffmpeg unavailable — point the composition at atlas-score.wav instead.');
  }
}
