import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';

/**
 * Fonts resolve from /public so rendering never touches the network.
 * Reference stack: --sans (SF Pro / Geist), --mono (JetBrains Mono),
 * --pdfserif (Lora) for paper pages.
 */
const faces: ReadonlyArray<{ family: string; file: string; weight: string; style?: string }> = [
  { family: 'Geist', file: 'geist-sans-latin-400-normal.woff2', weight: '400' },
  { family: 'Geist', file: 'geist-sans-latin-500-normal.woff2', weight: '500' },
  { family: 'Geist', file: 'geist-sans-latin-600-normal.woff2', weight: '600' },
  { family: 'Geist', file: 'geist-sans-latin-700-normal.woff2', weight: '700' },
  { family: 'JetBrains Mono', file: 'jetbrains-mono-latin-400-normal.woff2', weight: '400' },
  { family: 'JetBrains Mono', file: 'jetbrains-mono-latin-500-normal.woff2', weight: '500' },
  { family: 'Lora', file: 'lora-latin-400-normal.woff2', weight: '400' },
  { family: 'Lora', file: 'lora-latin-600-normal.woff2', weight: '600' },
  { family: 'Lora', file: 'lora-latin-400-italic.woff2', weight: '400', style: 'italic' },
];

let started = false;
export const loadAtlasFonts = (): void => {
  if (started) return;
  started = true;
  for (const f of faces) {
    void loadFont({
      family: f.family,
      url: staticFile(`assets/fonts/${f.file}`),
      weight: f.weight,
      style: f.style ?? 'normal',
      display: 'block',
    });
  }
};

export const font = {
  sans: "'Geist', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
  paper: "'Lora', Georgia, serif",
} as const;
