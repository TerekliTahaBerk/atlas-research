/**
 * Atlas design tokens, extracted from the dark theme `:root` block of the
 * Atlas.dc.html reference (the authoritative source). Names mirror the CSS
 * custom properties so the film and the product stay aligned.
 */
export const color = {
  sb: '#191918', // --sb   sidebar
  bg: '#1F1F1E', // --bg   main background
  card: '#1C1C1B', // --card
  el: '#2A2A28', // --el   elevated surface
  pop: '#262625', // --pop  popover
  hov: '#2E2E2C', // --hov  hover / selected row
  bd: '#383835', // --bd   border
  bd2: '#2D2D2B', // --bd2  divider
  tx: '#ECECEA', // --tx   primary text
  tx2: '#A8A6A1', // --tx2  secondary text
  tx3: '#8A8883', // --tx3  tertiary text
  ac: '#5B8DEF', // --ac   accent blue
  ach: '#4C7EE0', // --ach  accent hover
  acs: 'rgba(91,141,239,.16)', // --acs accent soft
  actx: '#9DBBF5', // --actx accent text
  aiib: '#3A3A3A', // --aiib AI border
  aiu: '#2F2F2F', // --aiu  user bubble
  code: '#1B1B1B', // --code editor background
  pdfbg: '#1B1B1B', // --pdfbg reader backdrop
  danger: '#E5685F',
  warn: '#D3A548',
  hl: 'rgba(201,164,72,.28)', // --hl highlight
  sel: 'rgba(108,121,224,.30)', // --sel selection
  // Film-only stage colours: a near-black world the interface lives in.
  void: '#000000',
  stage: '#0D0D0C',
  stageLift: '#141413',
} as const;

/** Syntax colours from the reference (--syn-*). */
export const syntax = {
  keyword: '#B8A4EE',
  brace: '#D9B76A',
  env: '#82B4DE',
  comment: '#6B6B6B',
  number: '#E28FB0',
  math: '#8FCFA5',
  text: '#DADAD4',
} as const;

/** Knowledge-graph kind colours (KC map in the reference). */
export const kind = {
  paper: '#C99A3E',
  doc: '#8E9AC9',
  ms: color.ac,
  task: '#B08AAE',
  exp: '#6FA79E',
  ch: '#8A8A8A',
  question: color.tx,
} as const;

/** Task label colours (LBL map in the reference). */
export const label = {
  writing: '#8E9AC9',
  experiment: '#C99A3E',
  benchmark: '#6FA79E',
  reading: '#B08AAE',
} as const;

export const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

export const shadow = {
  pop: '0 12px 32px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.07)',
  page: '0 1px 3px rgba(0,0,0,.2), 0 8px 28px rgba(0,0,0,.18)',
  window:
    '0 60px 140px rgba(0,0,0,.65), 0 24px 48px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.06)',
} as const;
