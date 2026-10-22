import type { PersonId } from './people';
import type { PaperId } from './research';
/** Synthetic workspace fixtures (Phase 00.5A preview data). */
export type DocId = 'd1' | 'd2' | 'd3' | 'd4';
export interface SampleDocument {
  id: DocId;
  title: string;
  kind: string;
  edited: string;
  owner: PersonId;
  shared: boolean;
}
export const documents: SampleDocument[] = [
  {
    id: 'd1',
    title: 'Related work — sparse attention',
    kind: 'Research note',
    edited: '12 min ago',
    owner: 'taha',
    shared: true,
  },
  {
    id: 'd2',
    title: 'Lab meeting · Oct 20',
    kind: 'Meeting notes',
    edited: '2 days ago',
    owner: 'ayse',
    shared: true,
  },
  {
    id: 'd3',
    title: 'Reading notes — low-rank pairs',
    kind: 'Reading note',
    edited: 'Yesterday',
    owner: 'taha',
    shared: false,
  },
  {
    id: 'd4',
    title: 'Thesis outline v3',
    kind: 'Document',
    edited: 'Oct 14',
    owner: 'taha',
    shared: false,
  },
];
export function documentById(id: string | null | undefined) {
  return documents.find((d) => d.id === id);
}
export interface SampleProject {
  id: string;
  title: string;
  description: string;
  next: string;
  counts: string;
  edited: string;
  people: PersonId[];
  owned: boolean;
}
export const projects: SampleProject[] = [
  {
    id: 'pr1',
    title: 'Sparse Evoformer',
    description:
      'Learned block sparsity for memory-efficient structure prediction',
    next: 'Next: §3 Method draft, ablation at block size 64',
    counts: '14 papers · 6 docs · 9 tasks',
    edited: 'Edited today',
    people: ['taha', 'ayse', 'mehmet'],
    owned: true,
  },
  {
    id: 'pr2',
    title: 'Contact Map Benchmark',
    description: 'A shared CASP15 harness for long-range contact precision',
    next: 'Elif shared this with you',
    counts: '31 papers · 3 docs · 4 tasks',
    edited: 'Edited yesterday',
    people: ['elif', 'taha'],
    owned: false,
  },
  {
    id: 'pr3',
    title: 'Thesis',
    description: 'Efficient attention for biological sequences',
    next: 'Chapter 3 in progress',
    counts: '52 papers · 11 docs · 6 tasks',
    edited: 'Edited Oct 14',
    people: ['taha', 'jonas'],
    owned: true,
  },
];
export const manuscripts = [
  {
    title: 'Sparse Evoformer',
    subtitle: 'NeurIPS 2026 draft · 7 pages',
    files: 'main.tex · 4 files',
    edited: 'Sample PDF · not compiled',
  },
  {
    title: 'Thesis — Chapter 3',
    subtitle: 'Methods · 22 pages',
    files: 'ch3.tex · 9 files',
    edited: 'Edited Oct 9',
  },
];
export type TaskStatus = 'backlog' | 'progress' | 'review' | 'done';
export type Priority = 'High' | 'Medium' | 'Low';
export type TaskLabel =
  'writing' | 'experiment' | 'benchmark' | 'reading' | 'planning';
export interface SampleTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  assignee: PersonId;
  labels: TaskLabel[];
  linkedPapers: number;
  linkedDocs: number;
}
export const tasks: SampleTask[] = [
  {
    id: 'ATL-27',
    title: 'Write §3 Method — learned block routing',
    status: 'progress',
    priority: 'High',
    assignee: 'taha',
    labels: ['writing'],
    linkedPapers: 2,
    linkedDocs: 1,
  },
  {
    id: 'ATL-29',
    title: 'Profile memory on A100 sweep runs',
    status: 'progress',
    priority: 'Medium',
    assignee: 'mehmet',
    labels: ['experiment'],
    linkedPapers: 0,
    linkedDocs: 1,
  },
  {
    id: 'ATL-31',
    title: 'Re-run ablation with block size 64',
    status: 'backlog',
    priority: 'High',
    assignee: 'taha',
    labels: ['experiment'],
    linkedPapers: 1,
    linkedDocs: 0,
  },
  {
    id: 'ATL-34',
    title: 'Collect baselines for CASP15 subset',
    status: 'backlog',
    priority: 'Low',
    assignee: 'elif',
    labels: ['benchmark'],
    linkedPapers: 3,
    linkedDocs: 0,
  },
  {
    id: 'ATL-35',
    title: 'Read Novak & Haddad routing preprint',
    status: 'backlog',
    priority: 'Medium',
    assignee: 'ayse',
    labels: ['reading'],
    linkedPapers: 1,
    linkedDocs: 0,
  },
  {
    id: 'ATL-22',
    title: 'Related work draft for §2',
    status: 'review',
    priority: 'Medium',
    assignee: 'ayse',
    labels: ['writing'],
    linkedPapers: 5,
    linkedDocs: 1,
  },
  {
    id: 'ATL-18',
    title: 'Set up evaluation harness',
    status: 'done',
    priority: 'High',
    assignee: 'mehmet',
    labels: ['experiment'],
    linkedPapers: 0,
    linkedDocs: 1,
  },
  {
    id: 'ATL-15',
    title: 'Choose target venue and deadline',
    status: 'done',
    priority: 'Low',
    assignee: 'taha',
    labels: ['planning'],
    linkedPapers: 0,
    linkedDocs: 0,
  },
];
export const taskColumns: {
  key: TaskStatus;
  label: string;
  tone: 'muted' | 'warn' | 'secondary' | 'accent';
}[] = [
  { key: 'backlog', label: 'Backlog', tone: 'muted' },
  { key: 'progress', label: 'In progress', tone: 'warn' },
  { key: 'review', label: 'In review', tone: 'secondary' },
  { key: 'done', label: 'Done', tone: 'accent' },
];
/** Label dots are non-text color marks (≥3:1 not required for decoration). */
export const labelColors: Record<TaskLabel, string> = {
  writing: '#8e9ac9',
  experiment: '#c99a3e',
  benchmark: '#6fa79e',
  reading: '#b08aae',
  planning: '#8a908a',
};
export const milestones = [
  { title: 'Outline §3 from routing notes', due: 'Oct 24' },
  { title: 'Define mask M and fix Eq. 1 notation', due: 'Oct 25' },
  { title: 'Insert Table 1 from run_14 results', due: 'Oct 27' },
  { title: 'Ask Ayşe for review', due: 'Oct 29' },
];
export type NotificationType =
  'mention' | 'task' | 'ai' | 'share' | 'comment' | 'invite' | 'update';
export interface SampleNotification {
  id: string;
  type: NotificationType;
  who: PersonId;
  text: string;
  object: string;
  quote?: string;
  time: string;
  group: 'Today' | 'This week';
  unread: boolean;
  target: string;
}
export const notifications: SampleNotification[] = [
  {
    id: 'n1',
    type: 'mention',
    who: 'ayse',
    text: 'mentioned you in',
    object: 'Related work — sparse attention',
    quote: '@Taha can we cite the low-rank paper here too?',
    time: '14m',
    group: 'Today',
    unread: true,
    target: 'documents?doc=d1',
  },
  {
    id: 'n2',
    type: 'task',
    who: 'mehmet',
    text: 'assigned you',
    object: 'ATL-31 · Re-run ablation with block size 64',
    time: '1h',
    group: 'Today',
    unread: true,
    target: 'tasks?task=ATL-31',
  },
  {
    id: 'n3',
    type: 'ai',
    who: 'atlas',
    text: 'prepared a sample literature scan for',
    object: '“learned sparsity, protein”',
    quote: 'Sample · 18 papers · 5 highly relevant',
    time: '2h',
    group: 'Today',
    unread: true,
    target: 'research',
  },
  {
    id: 'n4',
    type: 'share',
    who: 'elif',
    text: 'shared a project with you',
    object: 'Contact Map Benchmark',
    time: 'Yesterday',
    group: 'This week',
    unread: false,
    target: '/app/home',
  },
  {
    id: 'n5',
    type: 'comment',
    who: 'ayse',
    text: 'commented on',
    object: 'main.tex · line 31',
    quote: 'The mask M needs defining before Eq. 1.',
    time: 'Mon',
    group: 'This week',
    unread: false,
    target: 'manuscripts',
  },
  {
    id: 'n6',
    type: 'invite',
    who: 'jonas',
    text: 'invited you to',
    object: 'Thesis committee',
    quote: 'Workspace · 4 members',
    time: 'Sun',
    group: 'This week',
    unread: false,
    target: '/app/home',
  },
  {
    id: 'n7',
    type: 'update',
    who: 'atlas',
    text: 'Sample alert match:',
    object: 'Learned Routing for Memory-Efficient Evoformer Blocks',
    time: 'Sat',
    group: 'This week',
    unread: false,
    target: 'research',
  },
];
export interface ChannelMessage {
  id: string;
  who: PersonId;
  time: string;
  text: string;
  paper?: PaperId;
  task?: string;
  doc?: DocId;
  reactions?: { icon: 'thumbs-up' | 'eye'; count: number }[];
  replies?: number;
  ai?: boolean;
  local?: boolean;
}
export const channels = [
  { key: 'general', unread: 0, topic: 'Lab announcements' },
  {
    key: 'reading-group',
    unread: 3,
    topic: 'Thursday reading · low-rank vs sparse',
  },
  { key: 'experiments', unread: 1, topic: 'Runs, sweeps and GPU queue' },
  { key: 'sparse-evoformer', unread: 0, topic: 'NeurIPS draft' },
] as const;
export type ChannelKey = (typeof channels)[number]['key'];
export const channelMessages: Record<ChannelKey, ChannelMessage[]> = {
  'reading-group': [
    {
      id: 'c1',
      who: 'ayse',
      time: '10:02',
      text: 'Thursday we’re reading Chen & Duarte on low-rank pair representations. The PDF is in the project library.',
      paper: 'p2',
      reactions: [{ icon: 'thumbs-up', count: 3 }],
    },
    {
      id: 'c2',
      who: 'mehmet',
      time: '10:05',
      text: 'Their memory numbers assume batch size 1 — worth checking against our A100 profile before we compare.',
      task: 'ATL-29',
      replies: 2,
    },
    {
      id: 'c3',
      who: 'elif',
      time: '10:11',
      text: '@Atlas summarize where the low-rank and sparse approaches disagree, based on this week’s reading.',
    },
    {
      id: 'c4',
      who: 'atlas',
      time: '10:11',
      ai: true,
      text: 'They disagree on what to give up. Low-rank keeps every residue pair but compresses it, so long-range contacts blur (Chen & Duarte, 2023). Sparse attention keeps exact values for a chosen subset, so missed pairs drop out entirely (Okafor et al., 2024).',
    },
    {
      id: 'c5',
      who: 'taha',
      time: '10:20',
      text: 'Good framing — I’m folding this into §2. Draft notes are here:',
      doc: 'd1',
      reactions: [{ icon: 'eye', count: 2 }],
    },
  ],
  general: [
    {
      id: 'g1',
      who: 'jonas',
      time: '09:14',
      text: 'Reminder: group photo for the department site on Friday at 12:00.',
    },
    {
      id: 'g2',
      who: 'elif',
      time: '09:40',
      text: 'GPU queue is clear until 14:00 if anyone needs the A100s.',
      reactions: [{ icon: 'thumbs-up', count: 2 }],
    },
  ],
  experiments: [
    {
      id: 'e1',
      who: 'mehmet',
      time: '08:52',
      text: 'run_14 sweep finished overnight. Block size 64 looks like the sweet spot — notebook is updated.',
      task: 'ATL-31',
    },
  ],
  'sparse-evoformer': [
    {
      id: 's1',
      who: 'taha',
      time: 'Yesterday',
      text: 'Moved the NeurIPS draft to the new template. Please don’t edit atlas.cls directly.',
    },
  ],
};
export const threadReplies: { who: PersonId; time: string; text: string }[] = [
  {
    who: 'taha',
    time: '10:07',
    text: 'Agreed. Mehmet, can you add batch 2 and 4 to the sweep?',
  },
  {
    who: 'mehmet',
    time: '10:09',
    text: 'Already queued — results by tomorrow in run_14.',
  },
];
export interface SampleVersion {
  id: number;
  group: string;
  who: PersonId;
  time: string;
  label: string;
  named?: boolean;
}
export const versions: SampleVersion[] = [
  {
    id: 1,
    group: 'Today',
    who: 'taha',
    time: '12:40',
    label: 'Current version',
  },
  {
    id: 2,
    group: 'Today',
    who: 'ayse',
    time: '11:58',
    label: 'Edited §2 Learned sparsity',
  },
  {
    id: 3,
    group: 'Today',
    who: 'atlas',
    time: '11:20',
    label: 'Atlas sample rewrite, requested by Taha',
  },
  {
    id: 4,
    group: 'Yesterday',
    who: 'taha',
    time: '18:04',
    label: 'Before lab meeting',
    named: true,
  },
  {
    id: 5,
    group: 'Oct 18',
    who: 'taha',
    time: '09:12',
    label: 'Created from template',
  },
];
export interface Plan {
  key: 'free' | 'researcher' | 'lab';
  name: string;
  description: string;
  monthly: number;
  yearly: number;
  recommended?: boolean;
  student?: boolean;
  perSeat?: boolean;
  features: string[];
}
/** Illustrative only — prices and entitlements are not validated. */
export const plans: Plan[] = [
  {
    key: 'free',
    name: 'Free',
    description: 'For trying Atlas on your own',
    monthly: 0,
    yearly: 0,
    features: [
      'Documents, library and LaTeX editor',
      'Limited Atlas requests',
      'One personal workspace',
    ],
  },
  {
    key: 'researcher',
    name: 'Researcher',
    description: 'For individual researchers',
    monthly: 12,
    yearly: 10,
    recommended: true,
    student: true,
    features: [
      'Higher Atlas request limits',
      'Full-text PDF questions and synthesis',
      'Unlimited version history',
      'Priority LaTeX compile',
    ],
  },
  {
    key: 'lab',
    name: 'Lab',
    description: 'For research groups',
    monthly: 24,
    yearly: 20,
    perSeat: true,
    student: true,
    features: [
      'Everything in Researcher',
      'Shared projects, channels and tasks',
      'Workspace roles and access control',
      'Shared library and collections',
    ],
  },
];
export const projectPhases = [
  { label: 'Literature review', state: 'done', dates: 'Oct 1–14' },
  { label: 'Method draft', state: 'now', dates: 'Oct 15–28' },
  { label: 'Experiments', state: 'now', dates: 'Oct 10–30' },
  { label: 'Writing', state: 'next', dates: 'Oct 24–Nov 6' },
  { label: 'Internal review', state: 'next', dates: 'Nov 7' },
  { label: 'Submission', state: 'next', dates: 'Nov 14' },
] as const;
export const projectActivity: {
  who: PersonId;
  verb: string;
  object: string;
  time: string;
  href: string;
}[] = [
  {
    who: 'ayse',
    verb: 'edited',
    object: 'Related work — sparse attention',
    time: '12m',
    href: 'documents?doc=d1',
  },
  {
    who: 'mehmet',
    verb: 'updated',
    object: 'run_14 block sweep',
    time: '3h',
    href: 'experiments',
  },
  {
    who: 'taha',
    verb: 'edited',
    object: 'main.tex · 1 sample error',
    time: '1h',
    href: 'manuscripts',
  },
  {
    who: 'elif',
    verb: 'saved',
    object: 'Benchmarking Attention Sparsity…',
    time: 'Yesterday',
    href: 'library?paper=p3',
  },
  {
    who: 'atlas',
    verb: 'suggested 5 sample papers for',
    object: '“learned sparsity, protein”',
    time: 'Yesterday',
    href: 'research',
  },
];
