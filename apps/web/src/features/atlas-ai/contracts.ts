import type { ScreenKey } from '@/features/shell/navigation';
import type { PaperId } from '@/lib/preview/research';
/**
 * Atlas AI presentation contracts (Phase 00.5A). Identifiers are structured
 * preview references only; they never grant access to a live artifact and
 * no model, search or tool is invoked anywhere in this phase.
 */
export type EntityKind =
  | 'paper'
  | 'document'
  | 'task'
  | 'person'
  | 'project'
  | 'channel'
  | 'manuscript'
  | 'experiment'
  | 'workspace'
  | 'selection'
  | 'research'
  | 'library'
  | 'graph'
  | 'problems';
export interface ContextReference {
  id: string;
  kind: EntityKind;
  title: string;
}
/** The five handoff modes; `inline` entry points live inside screens. */
export type AtlasMode = 'compact' | 'open' | 'focus' | 'panel';
export type AtlasPlacement = 'canvas' | 'editor' | 'panel' | 'focus' | 'page';
interface ScreenContext {
  placeholder: string;
  label: string;
  chips: ContextReference[];
  /** Whether the floating composer is anchored on this screen. */
  floating: boolean;
}
const ref = (
  id: string,
  kind: EntityKind,
  title: string,
): ContextReference => ({
  id,
  kind,
  title,
});
export const screenContexts: Record<ScreenKey, ScreenContext> = {
  home: {
    placeholder: 'Ask Atlas across Kaya Lab',
    label: 'Workspace',
    chips: [ref('ws-kaya', 'workspace', 'Kaya Lab workspace')],
    floating: true,
  },
  doc: {
    placeholder: 'Ask about this document, or select text',
    label: 'Document',
    chips: [ref('d1', 'document', 'Related work — sparse attention')],
    floating: true,
  },
  manuscript: {
    placeholder: 'Ask Atlas to write or fix LaTeX — try /latex',
    label: 'Manuscript',
    chips: [ref('ms-main.tex', 'manuscript', 'main.tex')],
    floating: false,
  },
  library: {
    placeholder: 'Summarize a paper or compare methods',
    label: 'Library',
    chips: [ref('lib-all', 'library', 'All papers')],
    floating: true,
  },
  reader: {
    placeholder: 'Ask about the selected passage',
    label: 'PDF',
    chips: [
      ref('p2', 'paper', 'Chen & Duarte, 2023'),
      ref('sel-p3', 'selection', 'p.3 selection'),
    ],
    floating: true,
  },
  tasks: {
    placeholder: 'Break a task into research milestones',
    label: 'Tasks',
    chips: [ref('pr1', 'project', 'Sparse Evoformer')],
    floating: true,
  },
  channels: {
    placeholder: 'Summarize this discussion and draft follow-ups',
    label: 'Channel',
    chips: [ref('ch-reading', 'channel', '#reading-group')],
    floating: false,
  },
  experiments: {
    placeholder: 'Explain this result or suggest the next run',
    label: 'Notebook',
    chips: [ref('nb-14', 'experiment', 'run_14_block_sparsity')],
    floating: true,
  },
  research: {
    placeholder: 'Ask Atlas',
    label: 'Research',
    chips: [ref('research', 'research', 'Research')],
    floating: false,
  },
  overview: {
    placeholder: 'Ask about this project’s progress',
    label: 'Project',
    chips: [ref('pr1', 'project', 'Sparse Evoformer')],
    floating: true,
  },
  graph: {
    placeholder: 'Ask how these items connect',
    label: 'Graph',
    chips: [ref('graph', 'graph', 'Knowledge graph')],
    floating: true,
  },
  inbox: {
    placeholder: 'Ask Atlas',
    label: 'Inbox',
    chips: [],
    floating: false,
  },
  settings: {
    placeholder: 'Ask Atlas',
    label: 'Settings',
    chips: [],
    floating: false,
  },
  system: {
    placeholder: 'Ask Atlas',
    label: 'Design system',
    chips: [],
    floating: false,
  },
  mobile: {
    placeholder: 'Ask Atlas',
    label: 'Mobile',
    chips: [],
    floating: false,
  },
  ai: {
    placeholder: 'Ask a research question — try @ or /',
    label: 'Research mode',
    chips: [ref('pr1', 'project', 'Sparse Evoformer')],
    floating: false,
  },
  help: { placeholder: 'Ask Atlas', label: 'Help', chips: [], floating: false },
  projects: {
    placeholder: 'Ask Atlas across Kaya Lab',
    label: 'Workspace',
    chips: [ref('ws-kaya', 'workspace', 'Kaya Lab workspace')],
    floating: true,
  },
};
export interface MentionItem extends ContextReference {
  sub: string;
}
export const mentionGroups: { group: string; items: MentionItem[] }[] = [
  {
    group: 'Papers',
    items: [
      {
        id: 'p1',
        kind: 'paper',
        title: 'Okafor et al., 2024',
        sub: 'NeurIPS 2024',
      },
      {
        id: 'p2',
        kind: 'paper',
        title: 'Chen & Duarte, 2023',
        sub: 'ICML 2023',
      },
      {
        id: 'p3',
        kind: 'paper',
        title: 'Yilmaz et al., 2025',
        sub: 'Bioinformatics 2025',
      },
      {
        id: 'p4',
        kind: 'paper',
        title: 'Novak & Haddad, 2025',
        sub: 'arXiv preprint',
      },
    ],
  },
  {
    group: 'Documents',
    items: [
      {
        id: 'd1',
        kind: 'document',
        title: 'Related work — sparse attention',
        sub: 'Note',
      },
      {
        id: 'd2',
        kind: 'document',
        title: 'Lab meeting · Oct 20',
        sub: 'Notes',
      },
    ],
  },
  {
    group: 'Manuscripts',
    items: [
      {
        id: 'ms-main.tex',
        kind: 'manuscript',
        title: 'Sparse Evoformer · main.tex',
        sub: 'LaTeX',
      },
    ],
  },
  {
    group: 'Tasks',
    items: [
      {
        id: 'ATL-27',
        kind: 'task',
        title: 'ATL-27 Write §3 Method',
        sub: 'In progress',
      },
      {
        id: 'ATL-31',
        kind: 'task',
        title: 'ATL-31 Re-run ablation',
        sub: 'Backlog',
      },
    ],
  },
  {
    group: 'People',
    items: [
      { id: 'ayse', kind: 'person', title: 'Ayşe Demir', sub: 'Editor' },
      { id: 'mehmet', kind: 'person', title: 'Mehmet Kaya', sub: 'Editor' },
    ],
  },
  {
    group: 'Channels',
    items: [
      {
        id: 'ch-reading',
        kind: 'channel',
        title: '#reading-group',
        sub: 'Channel',
      },
    ],
  },
  {
    group: 'Projects',
    items: [
      {
        id: 'pr2',
        kind: 'project',
        title: 'Contact Map Benchmark',
        sub: 'Project',
      },
    ],
  },
  {
    group: 'Experiments',
    items: [
      {
        id: 'nb-14',
        kind: 'experiment',
        title: 'run_14_block_sparsity',
        sub: 'Notebook',
      },
    ],
  },
];
export function filterMentions(query: string) {
  const q = query.toLowerCase();
  return mentionGroups
    .map((g) => ({
      group: g.group,
      items: g.items.filter((i) => !q || i.title.toLowerCase().includes(q)),
    }))
    .filter((g) => g.items.length > 0);
}
export interface SlashCommand {
  id: string;
  description: string;
  /** Screens where the command applies; omitted = everywhere. */
  screens?: readonly ScreenKey[];
}
export const slashCommands: readonly SlashCommand[] = [
  { id: 'ask', description: 'Ask about the attached context' },
  { id: 'search', description: 'Search scholarly sources' },
  { id: 'summarize', description: 'Summarize the current context' },
  { id: 'compare', description: 'Compare papers or methods' },
  {
    id: 'cite',
    description: 'Generate a citation',
    screens: [
      'doc',
      'manuscript',
      'library',
      'reader',
      'research',
      'ai',
      'home',
    ],
  },
  {
    id: 'rewrite',
    description: 'Rewrite the selection',
    screens: ['doc', 'manuscript', 'reader', 'ai'],
  },
  {
    id: 'latex',
    description: 'Write or fix LaTeX',
    screens: ['manuscript', 'doc', 'experiments', 'ai'],
  },
  { id: 'create-task', description: 'Create tasks from this context' },
];
/** Commands for the active surface: applicable ones only, in a stable order. */
export function commandsFor(screen: ScreenKey, query: string) {
  const q = query.toLowerCase();
  return slashCommands.filter(
    (c) =>
      (!c.screens || c.screens.includes(screen)) && (!q || c.id.includes(q)),
  );
}
export type ReplyPart =
  | { type: 'text'; text: string; strong?: boolean }
  | { type: 'cite'; paper: PaperId };
export interface UserMessage {
  id: string;
  role: 'user';
  text: string;
}
export interface AssistantMessage {
  id: string;
  role: 'assistant';
  phase: 'think' | 'stream' | 'done' | 'error';
  steps: string[];
  step: number;
  startedAt: number;
  duration?: number;
  parts: ReplyPart[];
  revealed: number;
  code?: string;
  list?: string[];
  sources: PaperId[];
  stopped?: boolean;
  showSteps?: boolean;
  query: string;
}
export type AtlasMessage = UserMessage | AssistantMessage;
