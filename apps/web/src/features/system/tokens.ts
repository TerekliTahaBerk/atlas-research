/**
 * Token table mirrored from styles/globals.css for documentation and the
 * contrast audit. Keep in sync with the stylesheet (asserted by unit test).
 */
export const tokenTable = [
  { name: 'Sidebar', token: '--sb', dark: '#181818', light: '#f7f7f5' },
  { name: 'Canvas', token: '--bg', dark: '#212121', light: '#ffffff' },
  { name: 'Card', token: '--card', dark: '#1c1c1c', light: '#f7f7f5' },
  { name: 'Elevated', token: '--el', dark: '#2a2a2a', light: '#ffffff' },
  { name: 'Popover', token: '--pop', dark: '#262626', light: '#ffffff' },
  { name: 'Hover', token: '--hov', dark: '#2f2f2f', light: '#efefed' },
  { name: 'Border', token: '--bd', dark: '#363636', light: '#e6e6e3' },
  { name: 'Hairline', token: '--bd2', dark: '#2c2c2c', light: '#efefec' },
  { name: 'Text', token: '--tx', dark: '#ececec', light: '#1f1f1e' },
  { name: 'Text 2', token: '--tx2', dark: '#a3a3a3', light: '#5f5f5f' },
  { name: 'Text 3', token: '--tx3', dark: '#969696', light: '#6c6c6c' },
  { name: 'Accent', token: '--ac', dark: '#6c79e0', light: '#5e6ad2' },
  { name: 'Button fill', token: '--acb', dark: '#5a67cf', light: '#5e6ad2' },
  { name: 'Accent text', token: '--actx', dark: '#a9b1f4', light: '#4450b8' },
  { name: 'AI input', token: '--aiin', dark: '#2a2a2a', light: '#f4f4f2' },
  { name: 'AI border', token: '--aiib', dark: '#3a3a3a', light: '#e3e3e0' },
  { name: 'Danger', token: '--danger', dark: '#e7746c', light: '#b8463d' },
  { name: 'Warning', token: '--warn', dark: '#d3a548', light: '#8e6519' },
  { name: 'Code surface', token: '--code', dark: '#1b1b1b', light: '#ffffff' },
  { name: 'Code comment', token: '--syn-c', dark: '#838383', light: '#767676' },
] as const;
/** Prototype values that were adjusted for WCAG AA small-text contrast. */
export const contrastAdjustments = [
  {
    token: '--tx3',
    theme: 'Dark',
    handoff: '#858585',
    now: '#969696',
    reason: 'Meta text was 3.9:1 on elevated and AI input, 3.6:1 on hover rows',
  },
  {
    token: '--danger',
    theme: 'Dark',
    handoff: '#e5685f',
    now: '#e7746c',
    reason: '4.4:1 on elevated surfaces',
  },
  {
    token: '--tx3',
    theme: 'Light',
    handoff: '#737373',
    now: '#6c6c6c',
    reason: '4.4:1 on the sidebar, 4.1:1 on hover rows',
  },
  {
    token: '--warn',
    theme: 'Light',
    handoff: '#a9781e',
    now: '#8e6519',
    reason: '3.6:1 on cards',
  },
  {
    token: '--danger',
    theme: 'Light',
    handoff: '#c24a40',
    now: '#b8463d',
    reason: '4.5:1 on the sidebar with no margin; below on hover rows',
  },
  {
    token: '--syn-c',
    theme: 'Both',
    handoff: '#6b6b6b / #9a9a9a',
    now: '#838383 / #767676',
    reason: 'LaTeX/Python comments were 3.4:1 and 2.8:1 on the code surface',
  },
  {
    token: '--acb (new)',
    theme: 'Dark',
    handoff: '#6c79e0 fill',
    now: '#5a67cf',
    reason:
      'White on the prototype indigo is 3.9:1; --ac stays for non-text accents',
  },
] as const;
function luminance(hex: string) {
  const c = hex.replace('#', '');
  const v = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((u) => (u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (v[0] ?? 0) + 0.7152 * (v[1] ?? 0) + 0.0722 * (v[2] ?? 0);
}
export function contrastRatio(a: string, b: string) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const t = (token: string, theme: 'dark' | 'light') =>
  tokenTable.find((r) => r.token === token)?.[theme] ?? '#000000';
export function contrastPairs(theme: 'dark' | 'light') {
  return [
    {
      name: 'Text on canvas',
      fg: t('--tx', theme),
      bg: t('--bg', theme),
      need: 4.5,
    },
    {
      name: 'Text 2 on canvas',
      fg: t('--tx2', theme),
      bg: t('--bg', theme),
      need: 4.5,
    },
    {
      name: 'Text 2 on hover row',
      fg: t('--tx2', theme),
      bg: t('--hov', theme),
      need: 4.5,
    },
    {
      name: 'Text 3 (meta) on sidebar',
      fg: t('--tx3', theme),
      bg: t('--sb', theme),
      need: 4.5,
    },
    {
      name: 'Text 3 (meta) on elevated',
      fg: t('--tx3', theme),
      bg: t('--el', theme),
      need: 4.5,
    },
    {
      name: 'Text 3 (meta) on hover row',
      fg: t('--tx3', theme),
      bg: t('--hov', theme),
      need: 4.5,
    },
    {
      name: 'Text 3 (meta) on AI input',
      fg: t('--tx3', theme),
      bg: t('--aiin', theme),
      need: 4.5,
    },
    {
      name: 'Accent text on canvas',
      fg: t('--actx', theme),
      bg: t('--bg', theme),
      need: 4.5,
    },
    {
      name: 'White on button fill',
      fg: '#ffffff',
      bg: t('--acb', theme),
      need: 4.5,
    },
    {
      name: 'Text 3 (meta) on popover',
      fg: t('--tx3', theme),
      bg: t('--pop', theme),
      need: 4.5,
    },
    {
      name: 'Accent text on hover row',
      fg: t('--actx', theme),
      bg: t('--hov', theme),
      need: 4.5,
    },
    {
      name: 'Danger on elevated',
      fg: t('--danger', theme),
      bg: t('--el', theme),
      need: 4.5,
    },
    {
      name: 'Danger on hover row',
      fg: t('--danger', theme),
      bg: t('--hov', theme),
      need: 4.5,
    },
    {
      name: 'Code comment on code surface',
      fg: t('--syn-c', theme),
      bg: t('--code', theme),
      need: 4.5,
    },
    {
      name: 'Danger on card',
      fg: t('--danger', theme),
      bg: t('--card', theme),
      need: 4.5,
    },
    {
      name: 'Warning on card',
      fg: t('--warn', theme),
      bg: t('--card', theme),
      need: 4.5,
    },
    {
      name: 'Accent (non-text) on canvas',
      fg: t('--ac', theme),
      bg: t('--bg', theme),
      need: 3,
    },
    { name: 'Ink on paper (PDF)', fg: '#1b1b1b', bg: '#ffffff', need: 4.5 },
  ].map((p) => ({ ...p, ratio: contrastRatio(p.fg, p.bg) }));
}
