/**
 * Clearly fictional demo research data. Paper titles, authors, venues,
 * numbers and people are invented for the film (adapted from the synthetic
 * fixtures in the Atlas.dc.html reference). No real customers, metrics or
 * personal data appear here.
 */
export type Person = { name: string; first: string; initials: string; color: string };

export const people = {
  elif: { name: 'Elif Arslan', first: 'Elif', initials: 'EA', color: '#5B6B8C' },
  nora: { name: 'Nora Lind', first: 'Nora', initials: 'NL', color: '#7D6648' },
  mehmet: { name: 'Mehmet Kaya', first: 'Mehmet', initials: 'MK', color: '#4D6577' },
} satisfies Record<string, Person>;

export const workspace = { lab: 'Kaya Lab', project: 'Sparse Evoformer' } as const;

export type Paper = {
  id: string;
  title: string;
  authors: string;
  venue: string;
  cited: number;
  short: string;
  abstract: string;
  relevance: string;
  openAccess: boolean;
};

export const papers: Paper[] = [
  {
    id: 'p2',
    title: 'Efficient Structure Prediction via Low-Rank Pair Representations',
    authors: 'L. Chen, M. Duarte',
    venue: 'ICML 2023',
    cited: 389,
    short: 'Chen & Duarte, 2023',
    abstract:
      'Factorizing the pair representation into rank-r components yields near-linear memory in sequence length, at a 1.2 point lDDT cost on long targets.',
    relevance: 'Highly relevant',
    openAccess: true,
  },
  {
    id: 'p1',
    title: 'Sparse Axial Attention for Long-Range Residue Contacts',
    authors: 'A. Okafor, J. Lindqvist, R. Mehta',
    venue: 'NeurIPS 2024',
    cited: 214,
    short: 'Okafor et al., 2024',
    abstract:
      'A block-sparse axial attention pattern that preserves long-range residue contacts while reducing pair-representation memory by 2.8× on sequences over 1,024 residues.',
    relevance: 'Highly relevant',
    openAccess: true,
  },
  {
    id: 'p4',
    title: 'Learned Routing for Memory-Efficient Evoformer Blocks',
    authors: 'P. Novak, E. Haddad',
    venue: 'arXiv preprint 2025',
    cited: 12,
    short: 'Novak & Haddad, 2025',
    abstract:
      'Token routing selects a subset of residue pairs per block, learned end-to-end, matching dense accuracy on most targets at a fraction of the memory.',
    relevance: 'Highly relevant',
    openAccess: true,
  },
  {
    id: 'p5',
    title: 'On the Limits of Linear Attention for Biological Sequences',
    authors: 'H. Park, D. Osei',
    venue: 'TMLR 2024',
    cited: 98,
    short: 'Park & Osei, 2024',
    abstract:
      'Linear attention approximations systematically underestimate long-range couplings; we characterize the failure mode and propose a hybrid correction.',
    relevance: 'Related',
    openAccess: true,
  },
];

export const researchQuestion = 'How do we model long proteins without running out of memory?';

export const highlightedSentence =
  'With r = 32, peak memory on a 1,400-residue target falls from 61 GB to 19 GB';

export const insight = {
  prompt: 'What does this trade away?',
  answer:
    'Rank-32 factorization cuts peak memory about 3× (61 → 19 GB). The trade-off is accuracy on long-range contacts: lDDT drops 1.2 points, measured at batch size 1 only.',
  source: 'Chen & Duarte, 2023 · p.3 ¶2',
  noteTitle: 'Reading notes — low-rank pairs',
} as const;

export type NodeKind = 'paper' | 'doc' | 'ms' | 'task' | 'exp' | 'ch' | 'question';

export type GraphNode = {
  id: string;
  kind: NodeKind;
  label: string;
  /** Layout A: around the selected note (landscape %, portrait %). */
  a: [number, number];
  ap: [number, number];
  /** Layout B: reorganised around the research question. */
  b: [number, number];
  bp: [number, number];
  /** Emergence order (0 = selected node). */
  order: number;
};

export const graphNodes: GraphNode[] = [
  { id: 'note', kind: 'doc', label: 'Reading notes — low-rank pairs', a: [50, 50], ap: [50, 46], b: [36, 34], bp: [30, 30], order: 0 },
  { id: 'p2', kind: 'paper', label: 'Chen & Duarte 2023', a: [27, 32], ap: [24, 30], b: [17, 22], bp: [22, 18], order: 1 },
  { id: 'p1', kind: 'paper', label: 'Okafor 2024', a: [73, 30], ap: [76, 31], b: [62, 18], bp: [74, 18], order: 1 },
  { id: 'rq', kind: 'question', label: 'Scaling to long proteins?', a: [50, 82], ap: [50, 70], b: [50, 50], bp: [50, 50], order: 2 },
  { id: 'p4', kind: 'paper', label: 'Novak & Haddad 2025', a: [26, 70], ap: [22, 61], b: [24, 70], bp: [24, 70], order: 2 },
  { id: 'p5', kind: 'paper', label: 'Park & Osei 2024', a: [76, 70], ap: [78, 61], b: [14, 50], bp: [22, 42], order: 3 },
  { id: 'ms', kind: 'ms', label: 'main.tex', a: [88, 50], ap: [80, 82], b: [70, 46], bp: [78, 58], order: 3 },
  { id: 't27', kind: 'task', label: 'ATL-27 §3 Method', a: [12, 50], ap: [20, 82], b: [83, 28], bp: [76, 36], order: 3 },
  { id: 'nb', kind: 'exp', label: 'run_14 sweep', a: [62, 92], ap: [62, 92], b: [62, 80], bp: [70, 82], order: 4 },
  { id: 'ch', kind: 'ch', label: '#reading-group', a: [38, 10], ap: [40, 10], b: [84, 66], bp: [36, 86], order: 4 },
  { id: 'd2', kind: 'doc', label: 'Lab meeting · Oct 20', a: [64, 10], ap: [62, 12], b: [44, 12], bp: [50, 10], order: 4 },
];

export const graphEdges: Array<[string, string]> = [
  ['note', 'p2'],
  ['note', 'p1'],
  ['note', 'rq'],
  ['note', 'p4'],
  ['note', 'p5'],
  ['rq', 'p2'],
  ['rq', 'p1'],
  ['rq', 'p4'],
  ['rq', 'ms'],
  ['rq', 't27'],
  ['ms', 't27'],
  ['ms', 'p1'],
  ['t27', 'p4'],
  ['nb', 'p4'],
  ['nb', 'ms'],
  ['ch', 'note'],
  ['ch', 't27'],
  ['d2', 'note'],
  ['d2', 'rq'],
];

/** Semantic Map topic clusters (MAPC in the reference; topics, not papers). */
export const clusters = [
  { n: 'Sparse & efficient attention', x: 350, y: 170, rx: 150, ry: 92, seed: 1.2, c: '#A970D9' },
  { n: 'Protein structure prediction', x: 670, y: 165, rx: 165, ry: 88, seed: 2.7, c: '#3FAE95' },
  { n: 'Pair representations', x: 840, y: 395, rx: 125, ry: 100, seed: 4.1, c: '#4D8FE0' },
  { n: 'Long-context benchmarks', x: 180, y: 520, rx: 120, ry: 95, seed: 5.3, c: '#E0B030' },
  { n: 'Low-rank approximations', x: 500, y: 420, rx: 140, ry: 105, seed: 0.4, c: '#E07AAE' },
  { n: 'Memory-efficient training', x: 680, y: 620, rx: 130, ry: 70, seed: 3.3, c: '#6DBA6A' },
  { n: 'Evolutionary signal', x: 105, y: 300, rx: 85, ry: 85, seed: 6.0, c: '#E28A4A' },
] as const;

export type Task = {
  id: string;
  title: string;
  status: 'backlog' | 'progress' | 'review' | 'done';
  priority: 'High' | 'Medium' | 'Low';
  who: keyof typeof people;
  label: keyof typeof labelNames;
  papers: number;
  docs: number;
};

export const labelNames = {
  writing: 'writing',
  experiment: 'experiment',
  benchmark: 'benchmark',
  reading: 'reading',
} as const;

export const tasks: Task[] = [
  { id: 'ATL-31', title: 'Re-run ablation with block size 64', status: 'backlog', priority: 'High', who: 'elif', label: 'experiment', papers: 1, docs: 0 },
  { id: 'ATL-35', title: 'Read Novak & Haddad routing preprint', status: 'backlog', priority: 'Medium', who: 'nora', label: 'reading', papers: 1, docs: 0 },
  { id: 'ATL-34', title: 'Collect baselines for long-target subset', status: 'backlog', priority: 'Low', who: 'mehmet', label: 'benchmark', papers: 3, docs: 0 },
  { id: 'ATL-27', title: 'Write §3 Method — low-rank baseline comparison', status: 'progress', priority: 'High', who: 'elif', label: 'writing', papers: 2, docs: 1 },
  { id: 'ATL-29', title: 'Profile memory on sweep runs', status: 'progress', priority: 'Medium', who: 'mehmet', label: 'experiment', papers: 0, docs: 1 },
  { id: 'ATL-22', title: 'Related work draft for §2', status: 'review', priority: 'Medium', who: 'nora', label: 'writing', papers: 5, docs: 1 },
  { id: 'ATL-18', title: 'Set up evaluation harness', status: 'done', priority: 'High', who: 'mehmet', label: 'experiment', papers: 0, docs: 1 },
];
