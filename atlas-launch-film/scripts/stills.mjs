// Render representative frames (and a labelled contact sheet) for QA.
// Usage: node scripts/stills.mjs [AtlasLaunch|AtlasLaunchVertical] [frame,frame,...]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const compId = process.argv[2] ?? 'AtlasLaunch';
const timeline = JSON.parse(readFileSync(path.join(root, 'src/data/timeline.json'), 'utf8'));
const defaultFrames = timeline.scenes.flatMap((s) => {
  const a = Math.round(s.start * 30);
  const b = Math.round(s.end * 30);
  return [Math.round(a + (b - a) * 0.35), Math.round(a + (b - a) * 0.8)];
});
const frames = process.argv[3] ? process.argv[3].split(',').map(Number) : defaultFrames;
const outDir = path.join(root, 'output', 'frames', compId);
mkdirSync(outDir, { recursive: true });

const shell = '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const browserExecutable = existsSync(shell) ? shell : undefined;

const serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.ts') });
const inputProps = { musicVolume: 0, withAudio: false };
const composition = await selectComposition({ serveUrl, id: compId, inputProps, browserExecutable });
const files = [];
for (const frame of frames) {
  const output = path.join(outDir, `f${String(frame).padStart(4, '0')}.png`);
  await renderStill({ composition, serveUrl, output, frame, inputProps, browserExecutable, chromiumOptions: { gl: 'angle' } });
  files.push({ frame, output });
  console.log('rendered', frame);
}

if (files.length > 1) {
  const portrait = composition.height > composition.width;
  const cols = portrait ? 6 : 4;
  const tw = portrait ? 360 : 480;
  const th = portrait ? 640 : 270;
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  const inputs = files.flatMap((f) => ['-i', f.output]);
  const labelled = files
    .map((f, i) => {
      const t = (f.frame / 30).toFixed(1);
      const txt = existsSync(font) ? `,drawtext=fontfile=${font}:text='${f.frame}  ${t}s':x=10:y=10:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.6` : '';
      return `[${i}:v]scale=${tw}:${th}${txt}[v${i}]`;
    })
    .join(';');
  const rows = Math.ceil(files.length / cols);
  const pads = files.map((_, i) => `[v${i}]`).join('');
  const filter = `${labelled};${pads}xstack=inputs=${files.length}:layout=${files
    .map((_, i) => `${(i % cols) * tw}_${Math.floor(i / cols) * th}`)
    .join('|')}:fill=black[out]`;
  const sheet = path.join(root, 'output', `contact-sheet-${compId}.png`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '[out]', sheet]);
  console.log('contact sheet', sheet, `${cols}x${rows}`);
}
