/**
 * Token table mirrored from styles/globals.css for documentation and the
 * contrast audit. Keep in sync with the stylesheet (asserted by unit test).
 */
export const tokenTable = [
  { name: 'Sidebar', token: '--sb', dark: '#171817', light: '#f2f1eb' },
  { name: 'Canvas', token: '--bg', dark: '#232423', light: '#faf9f6' },
  { name: 'Card', token: '--card', dark: '#1c1d1c', light: '#f2f1eb' },
  { name: 'Elevated', token: '--el', dark: '#2b2d2b', light: '#fffdf9' },
  { name: 'Popover', token: '--pop', dark: '#1d1f1d', light: '#ffffff' },
  { name: 'Hover', token: '--hov', dark: '#343734', light: '#e9e7e0' },
  { name: 'Border', token: '--bd', dark: '#383b38', light: '#e2e0d8' },
  { name: 'Hairline', token: '--bd2', dark: '#2e302e', light: '#eae8e1' },
  { name: 'Text', token: '--tx', dark: '#f1f1ec', light: '#242622' },
  { name: 'Text 2', token: '--tx2', dark: '#a7aca6', light: '#5a5f57' },
  { name: 'Text 3', token: '--tx3', dark: '#9fa59e', light: '#64695f' },
  { name: 'Accent', token: '--ac', dark: '#329a53', light: '#399b5a' },
  { name: 'Button fill', token: '--acb', dark: '#2b7d46', light: '#2d7f48' },
  { name: 'Green text', token: '--actx', dark: '#7ccb95', light: '#2d7445' },
  { name: 'AI input', token: '--aiin', dark: '#24382a', light: '#e4eedf' },
  { name: 'AI border', token: '--aiib', dark: '#2f5b3c', light: '#bfd8ba' },
  { name: 'Danger', token: '--danger', dark: '#ee8178', light: '#ae3d36' },
  { name: 'Warning', token: '--warn', dark: '#d3a548', light: '#8a600f' },
] as const;
/** Handoff values that were adjusted for WCAG AA small-text contrast. */
export const contrastAdjustments = [
  {
    token: '--tx3',
    theme: 'Dark',
    handoff: '#7a817a',
    now: '#9fa59e',
    reason: 'Meta text fell to 3.9:1 on the canvas and 4.2:1 on hover rows',
  },
  {
    token: '--danger',
    theme: 'Dark',
    handoff: '#e5685f',
    now: '#ee8178',
    reason: '4.3:1 on elevated surfaces',
  },
  {
    token: '--tx2',
    theme: 'Light',
    handoff: '#696e66',
    now: '#5a5f57',
    reason: '4.2:1 on hover rows',
  },
  {
    token: '--tx3',
    theme: 'Light',
    handoff: '#8e938b',
    now: '#64695f',
    reason: '2.8:1 on the sidebar',
  },
  {
    token: '--warn',
    theme: 'Light',
    handoff: '#a9781e',
    now: '#8a600f',
    reason: '3.4:1 on cards',
  },
  {
    token: '--danger',
    theme: 'Light',
    handoff: '#c24a40',
    now: '#ae3d36',
    reason: '4.3:1 on the sidebar',
  },
  {
    token: '--presence',
    theme: 'Light',
    handoff: '#9c7442',
    now: '#b08550',
    reason: 'Collaborator labels were 4.1:1 with dark ink',
  },
  {
    token: '--acb (new)',
    theme: 'Both',
    handoff: '#329a53 fill',
    now: '#2b7d46 / #2d7f48',
    reason:
      'White on the handoff green is 3.5:1; --ac stays for non-text accents',
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
      name: 'Green text on canvas',
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
