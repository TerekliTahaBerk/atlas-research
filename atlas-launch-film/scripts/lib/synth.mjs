// Deterministic synthesis engine shared by the V2 score (and teaser).
// Sine/harmonic voices, felt clicks, tonal swells, Freeverb-style reverb.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const createSynth = ({ sr = 48000, duration, seed = 0x5eed1234 }) => {
  const N = Math.round(sr * duration);
  const dryL = new Float32Array(N);
  const dryR = new Float32Array(N);
  const sendL = new Float32Array(N);
  const sendR = new Float32Array(N);
  let s = seed;
  const rand = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const hz = (note) => {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(note);
    if (!m) throw new Error(note);
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
    const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
    return 440 * Math.pow(2, ((Number(m[3]) + 1) * 12 + base + acc - 69) / 12);
  };
  const write = (i, l, r, send) => {
    if (i < 0 || i >= N) return;
    dryL[i] += l;
    dryR[i] += r;
    sendL[i] += l * send;
    sendR[i] += r * send;
  };
  const pan2 = (pan) => [Math.cos(((pan + 1) * Math.PI) / 4), Math.sin(((pan + 1) * Math.PI) / 4)];

  /** Voice: attack/decay/release, harmonics, optional glide (f → f2) and brightness ramp. */
  const tone = ({ f, f2, t0, dur, amp, attack = 0.01, release = 0.4, pan = 0, send = 0.4, harm = [1, 0.3, 0.1], detune = 0, decay = 0, vibrato = 0, bright }) => {
    const s0 = Math.floor(t0 * sr);
    const len = Math.floor((dur + release) * sr);
    const [gl, gr] = pan2(pan);
    const ph = harm.map(() => rand() * Math.PI * 2);
    let phase = 0;
    for (let k = 0; k < len; k++) {
      const t = k / sr;
      let env = t < attack ? smooth(t / attack) : 1;
      if (decay > 0) env *= Math.exp(-t / decay);
      if (t > dur) env *= Math.max(0, 1 - (t - dur) / release) ** 2;
      if (env < 1e-5 && t > attack) continue;
      const glide = f2 ? f + (f2 - f) * smooth(Math.min(1, t / dur)) : f;
      const ff = glide * (1 + detune) * (1 + vibrato * Math.sin(2 * Math.PI * 4.6 * t));
      phase += (2 * Math.PI * ff) / sr;
      const br = bright ? bright[0] + (bright[1] - bright[0]) * smooth(Math.min(1, t / dur)) : 1;
      let v = 0;
      for (let h = 0; h < harm.length; h++) v += harm[h] * (h === 0 ? 1 : br) * Math.sin(phase * (h + 1) + ph[h]);
      v *= amp * env;
      write(s0 + k, v * gl, v * gr, send);
    }
  };
  const pluck = (f, t0, amp, pan = 0, decay = 0.9, send = 0.55) => {
    tone({ f, t0, dur: decay * 3, amp, attack: 0.004, release: 0.3, pan, send, harm: [1, 0.18, 0.05], decay });
    tone({ f: f * 2.756, t0, dur: decay, amp: amp * 0.1, attack: 0.002, release: 0.2, pan: -pan, send, harm: [1], decay: decay * 0.3 });
  };
  const pad = (notes, t0, dur, amp, attack = 2.5, release = 2.5, send = 0.7, bright) => {
    notes.forEach((n, i) => {
      const f = hz(n);
      const p = ((i / Math.max(1, notes.length - 1)) * 2 - 1) * 0.6;
      tone({ f, t0, dur, amp, attack, release, pan: p, send, harm: [1, 0.22, 0.06], detune: 0.0018, vibrato: 0.0012, bright });
      tone({ f, t0, dur, amp: amp * 0.7, attack: attack * 1.2, release, pan: -p, send, harm: [1, 0.12], detune: -0.0021, vibrato: 0.001, bright });
    });
  };
  /** Tonal swell: a chord that brightens as it grows (replaces noise whooshes). */
  const swell = (notes, t0, dur, amp, send = 0.8) => pad(notes, t0, dur, amp, dur * 0.85, 0.6, send, [0.1, 1.6]);
  /** Felt click: very short, low-passed transient + soft body. */
  const click = (t0, amp = 0.05, body = 1400, pan = 0) => {
    const s0 = Math.floor(t0 * sr);
    const len = Math.floor(0.025 * sr);
    const [gl, gr] = pan2(pan);
    let lp = 0;
    for (let k = 0; k < len; k++) {
      lp += 0.35 * (rand() * 2 - 1 - lp);
      const v = lp * amp * Math.exp(-k / (0.004 * sr));
      write(s0 + k, v * gl, v * gr, 0.08);
    }
    tone({ f: body, t0, dur: 0.01, amp: amp * 0.45, attack: 0.001, release: 0.04, pan, send: 0.1, harm: [1], decay: 0.015 });
  };
  const air = (t0, dur, amp, cutoff = 900) => {
    const s0 = Math.floor(t0 * sr);
    const len = Math.floor(dur * sr);
    let lp = 0;
    const a = 1 - Math.exp((-2 * Math.PI * cutoff) / sr);
    for (let k = 0; k < len; k++) {
      lp += a * (rand() * 2 - 1 - lp);
      const v = lp * amp * Math.sin((Math.PI * k) / len) ** 2;
      write(s0 + k, v, v * 0.95, 0.6);
    }
  };
  const boom = (t0, amp, f0 = 80, f1 = 40, dur = 3) => {
    const s0 = Math.floor(t0 * sr);
    const len = Math.floor(dur * sr);
    let ph = 0;
    for (let k = 0; k < len; k++) {
      const t = k / sr;
      const f = f1 + (f0 - f1) * Math.exp(-t / 0.35);
      ph += (2 * Math.PI * f) / sr;
      const v = (Math.sin(ph) + 0.25 * Math.sin(2 * ph)) * amp * Math.min(1, t / 0.012) * Math.exp(-t / (dur / 3.2));
      write(s0 + k, v, v, 0.25);
    }
  };
  const kick = (t0, amp) => {
    const s0 = Math.floor(t0 * sr);
    const len = Math.floor(0.42 * sr);
    let ph = 0;
    for (let k = 0; k < len; k++) {
      const t = k / sr;
      ph += (2 * Math.PI * (46 + 70 * Math.exp(-t / 0.03))) / sr;
      const v = Math.sin(ph) * amp * Math.min(1, t / 0.003) * Math.exp(-t / 0.12);
      write(s0 + k, v, v, 0.05);
    }
  };
  const tick = (t0, amp = 0.012, pan = 0.3) => {
    const s0 = Math.floor(t0 * sr);
    const len = Math.floor(0.04 * sr);
    const [gl, gr] = pan2(pan);
    let hp = 0;
    let prev = 0;
    for (let k = 0; k < len; k++) {
      const x = rand() * 2 - 1;
      hp = 0.9 * (hp + x - prev);
      prev = x;
      const v = hp * amp * Math.exp(-k / (0.008 * sr));
      write(s0 + k, v * gl, v * gr, 0.1);
    }
  };

  const reverb = (input, spread) => {
    const out = new Float32Array(N);
    const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((x) => ({ buf: new Float32Array(Math.round((x * sr) / 44100) + spread), i: 0, store: 0 }));
    const aps = [556, 441, 341, 225].map((x) => ({ buf: new Float32Array(Math.round((x * sr) / 44100) + spread), i: 0 }));
    for (let n = 0; n < N; n++) {
      const x = input[n] * 0.015;
      let acc = 0;
      for (const c of combs) {
        const y = c.buf[c.i];
        c.store = y * 0.65 + c.store * 0.35;
        c.buf[c.i] = x + c.store * 0.86;
        c.i = (c.i + 1) % c.buf.length;
        acc += y;
      }
      for (const a of aps) {
        const b = a.buf[a.i];
        a.buf[a.i] = acc + b * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        acc = b - acc;
      }
      out[n] = acc;
    }
    return out;
  };

  /** Mix, normalise to ≈ −1 dBFS, write WAV + AAC (m4a). */
  const render = (outPath, { headSilence = 0, tail = 0.8 } = {}) => {
    const wetL = reverb(sendL, 0);
    const wetR = reverb(sendR, 23);
    const L = new Float32Array(N);
    const R = new Float32Array(N);
    let peak = 0;
    for (let n = 0; n < N; n++) {
      const t = n / sr;
      const head = t < headSilence ? 0 : smooth((t - headSilence) / 0.05);
      const end = t > duration - tail ? Math.max(0, 1 - (t - (duration - tail)) / (tail * 0.9)) ** 2 : 1;
      L[n] = Math.tanh((dryL[n] + wetL[n] * 3.2) * 1.6) * head * end;
      R[n] = Math.tanh((dryR[n] + wetR[n] * 3.2) * 1.6) * head * end;
      peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
    }
    const norm = peak > 0 ? 0.89 / peak : 1;
    const buf = Buffer.alloc(44 + N * 4);
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + N * 4, 4);
    buf.write('WAVEfmt ', 8);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(2, 22);
    buf.writeUInt32LE(sr, 24);
    buf.writeUInt32LE(sr * 4, 28);
    buf.writeUInt16LE(4, 32);
    buf.writeUInt16LE(16, 34);
    buf.write('data', 36);
    buf.writeUInt32LE(N * 4, 40);
    for (let n = 0; n < N; n++) {
      buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[n] * norm)) * 32767), 44 + n * 4);
      buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[n] * norm)) * 32767), 46 + n * 4);
    }
    mkdirSync(path.dirname(outPath), { recursive: true });
    const wav = outPath.replace(/\.m4a$/, '.wav');
    writeFileSync(wav, buf);
    const args = ['-y', '-loglevel', 'error', '-i', wav, '-c:a', 'aac', '-b:a', '256k', outPath];
    try {
      execFileSync('ffmpeg', args, { stdio: 'inherit' });
    } catch {
      execFileSync('npx', ['remotion', 'ffmpeg', ...args], { stdio: 'inherit' });
    }
    console.log('wrote', outPath);
  };

  return { hz, tone, pluck, pad, swell, click, air, boom, kick, tick, render, rand };
};
