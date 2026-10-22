import type { PersonId } from './people';
/** Notebook, graph, onboarding and settings fixtures (Phase 00.5A preview). */
export const notebookCells = [
  {
    kind: 'code',
    n: 3,
    duration: '2.4s',
    output: 'table',
    source:
      'import atlas.experiments as ax\n\nruns = ax.load_runs(project="sparse-evoformer", tag="sweep-oct")\ndf = runs.metrics(["block_size", "lddt", "mem_gb", "contact_p@L"])\ndf.groupby("block_size").mean().round(3)',
  },
  {
    kind: 'code',
    n: 4,
    duration: '0.8s',
    output: 'chart',
    source:
      '# long-range contact precision vs. peak memory\nax.plot(df, x="block_size", y=["contact_p@L", "mem_gb"], kind="bar")',
  },
  { kind: 'ai' },
  {
    kind: 'md',
    heading: 'Decision',
    body: 'Default to block size 64 for the NeurIPS draft. Re-run at batch 4 (ATL-31) before final numbers.',
  },
] as const;
export const sweepRows = [
  { block: 16, lddt: '0.812', mem: '38.2', pAtL: '0.71' },
  { block: 32, lddt: '0.809', mem: '24.6', pAtL: '0.70' },
  { block: 64, lddt: '0.801', mem: '17.1', pAtL: '0.68' },
  { block: 128, lddt: '0.774', mem: '12.9', pAtL: '0.61' },
];
export type GraphKind = 'paper' | 'doc' | 'ms' | 'task' | 'exp' | 'ch';
export interface GraphNode {
  id: string;
  kind: GraphKind;
  label: string;
  sub: string;
  x: number;
  y: number;
  href: string;
}
export const graphNodes: GraphNode[] = [
  {
    id: 'm',
    kind: 'ms',
    label: 'main.tex',
    sub: 'Manuscript · Sparse Evoformer',
    x: 52,
    y: 50,
    href: 'manuscripts',
  },
  {
    id: 'd1',
    kind: 'doc',
    label: 'Related work',
    sub: 'Research note',
    x: 31,
    y: 31,
    href: 'documents?doc=d1',
  },
  {
    id: 'd2',
    kind: 'doc',
    label: 'Lab meeting · Oct 20',
    sub: 'Meeting notes',
    x: 55,
    y: 13,
    href: 'documents?doc=d2',
  },
  {
    id: 'p1',
    kind: 'paper',
    label: 'Okafor 2024',
    sub: 'Sparse Axial Attention for Long-Range Residue Contacts',
    x: 12,
    y: 20,
    href: 'library?paper=p1',
  },
  {
    id: 'p2',
    kind: 'paper',
    label: 'Chen & Duarte 2023',
    sub: 'Efficient Structure Prediction via Low-Rank Pair Representations',
    x: 11,
    y: 52,
    href: 'library?paper=p2',
  },
  {
    id: 'p4',
    kind: 'paper',
    label: 'Novak & Haddad 2025',
    sub: 'Learned Routing for Memory-Efficient Evoformer Blocks',
    x: 28,
    y: 80,
    href: 'library?paper=p4',
  },
  {
    id: 'p5',
    kind: 'paper',
    label: 'Park & Osei 2024',
    sub: 'On the Limits of Linear Attention for Biological Sequences',
    x: 9,
    y: 84,
    href: 'library?paper=p5',
  },
  {
    id: 't27',
    kind: 'task',
    label: 'ATL-27 §3 Method',
    sub: 'In progress · Taha',
    x: 77,
    y: 27,
    href: 'tasks?task=ATL-27',
  },
  {
    id: 't31',
    kind: 'task',
    label: 'ATL-31 Ablation b=64',
    sub: 'Backlog · Taha',
    x: 82,
    y: 66,
    href: 'tasks?task=ATL-31',
  },
  {
    id: 'nb',
    kind: 'exp',
    label: 'run_14 sweep',
    sub: 'Notebook · sample outputs',
    x: 60,
    y: 84,
    href: 'experiments',
  },
  {
    id: 'ch',
    kind: 'ch',
    label: '#reading-group',
    sub: 'Channel · 5 messages today',
    x: 88,
    y: 44,
    href: 'channels',
  },
];
export const graphEdges: [string, string][] = [
  ['d1', 'p1'],
  ['d1', 'p2'],
  ['d1', 'p5'],
  ['d1', 'm'],
  ['m', 'p1'],
  ['m', 'p2'],
  ['m', 't27'],
  ['m', 'nb'],
  ['t27', 'p1'],
  ['t27', 'p4'],
  ['t31', 'nb'],
  ['ch', 'p2'],
  ['ch', 'd1'],
  ['ch', 't31'],
  ['d2', 'd1'],
  ['d2', 't31'],
  ['p4', 'd1'],
  ['nb', 'p4'],
];
/** Node kind marks; decorative dots alongside text labels. */
export const graphKinds: { kind: GraphKind; label: string; color: string }[] = [
  { kind: 'paper', label: 'Papers', color: '#c99a3e' },
  { kind: 'doc', label: 'Documents', color: '#8e9ac9' },
  { kind: 'ms', label: 'Manuscripts', color: 'var(--ac)' },
  { kind: 'task', label: 'Tasks', color: '#b08aae' },
  { kind: 'exp', label: 'Experiments', color: '#6fa79e' },
  { kind: 'ch', label: 'Channels', color: '#8a908a' },
];
export const graphSuggestions = [
  {
    text: 'Novak & Haddad 2025 is cited in ATL-27 but not in main.tex',
    action: 'Add citation',
  },
  { text: 'run_14 results aren’t linked to Table 1 yet', action: 'Link' },
];
export const onboardingSteps = [
  {
    title: 'A quieter place to do research.',
    sub: 'Atlas keeps your papers, writing, experiments and lab conversations in one workspace — with an assistant that knows the context.',
  },
  {
    title: 'What best describes you?',
    sub: 'This tunes defaults like citation style and suggested templates.',
  },
  {
    title: 'What do you research?',
    sub: 'Pick a few fields. Atlas uses them to rank papers and alerts.',
  },
  {
    title: 'Who is this workspace for?',
    sub: 'You can invite people and change this later.',
  },
  {
    title: 'Start your first project',
    sub: 'Projects hold papers, documents, manuscripts and tasks together.',
  },
  {
    title: 'Invite your lab',
    sub: 'Collaborators get access to this workspace only. You control roles.',
  },
  {
    title: 'Your workspace preview is ready.',
    sub: 'Here’s what this walkthrough collected. Nothing was created or saved.',
  },
] as const;
export const onboardingRoles = [
  'PhD researcher',
  'Master’s student',
  'Postdoc',
  'Faculty / PI',
  'Industry researcher',
  'Independent',
] as const;
export const onboardingFields = [
  'Machine learning',
  'Structural biology',
  'Genomics',
  'NLP',
  'Neuroscience',
  'Physics',
  'Chemistry',
  'Economics',
  'Statistics',
  'Climate science',
];
export const onboardingWorkspaces = [
  {
    key: 'solo',
    label: 'Just me',
    description: 'A private workspace for your own research',
  },
  {
    key: 'lab',
    label: 'A lab or team',
    description: 'Shared projects, channels and library',
  },
  {
    key: 'dept',
    label: 'A department',
    description: 'Several labs under one institution',
  },
] as const;
export const onboardingTemplates = [
  {
    key: 'review',
    label: 'Literature review',
    description: 'Search, read, synthesize',
  },
  {
    key: 'paper',
    label: 'Paper / manuscript',
    description: 'LaTeX, citations, tasks',
  },
  { key: 'thesis', label: 'Thesis', description: 'Chapters and committee' },
  {
    key: 'exp',
    label: 'Experiment series',
    description: 'Notebooks and results',
  },
] as const;
export const projectTeam: { id: PersonId; role: string }[] = [
  { id: 'taha', role: 'Owner' },
  { id: 'ayse', role: 'Editor' },
  { id: 'mehmet', role: 'Editor' },
  { id: 'elif', role: 'Viewer' },
];
