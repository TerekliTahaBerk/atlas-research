/** Presentation contracts only; identifiers never grant permission to a live artifact. */
export type EntityKind =
  | 'document'
  | 'paper'
  | 'task'
  | 'person'
  | 'project'
  | 'channel'
  | 'manuscript'
  | 'dataset'
  | 'figure'
  | 'experiment'
  | 'selection'
  | 'workspace';
export interface ContextReference {
  id: string;
  kind: EntityKind;
  title: string;
  href?: string;
  future?: boolean;
}
export type AssistantContext =
  | 'global'
  | 'research'
  | 'paper'
  | 'document'
  | 'tasks'
  | 'channel'
  | 'manuscript'
  | 'experiment';
export type AssistantState =
  | 'collapsed'
  | 'focused'
  | 'expanded'
  | 'context-attached'
  | 'search-pending'
  | 'searching-sources'
  | 'reading-documents'
  | 'generating'
  | 'answer'
  | 'approval'
  | 'error'
  | 'cancelled';
export type CitationReference = {
  id: string;
  title: string;
  sourceId?: string;
  location?: string;
  status: 'verified' | 'suggested' | 'generated' | 'unavailable';
  evidence?: string;
};
export interface SlashCommand {
  id: string;
  title: string;
  description: string;
  contexts: readonly AssistantContext[];
}
export const entitySamples: readonly ContextReference[] = [
  {
    id: 'document-review',
    kind: 'document',
    title: 'Literature review',
    href: '/app/projects/sample/documents',
  },
  {
    id: 'paper-collaboration',
    kind: 'paper',
    title: 'Designing for thoughtful human–AI collaboration',
    href: '/app/projects/sample/library',
  },
  {
    id: 'task-method',
    kind: 'task',
    title: 'Draft methodology section',
    href: '/app/projects/sample/tasks',
  },
  {
    id: 'person-morgan',
    kind: 'person',
    title: 'Alex Morgan · sample researcher',
  },
  {
    id: 'project-sample',
    kind: 'project',
    title: 'Sample project',
    href: '/app/projects/sample/overview',
  },
  {
    id: 'channel-reading',
    kind: 'channel',
    title: 'reading-group',
    href: '/app/projects/sample/channels',
  },
  {
    id: 'manuscript-sample',
    kind: 'manuscript',
    title: 'Human–AI collaboration · draft',
    href: '/app/projects/sample/manuscripts',
  },
  { id: 'dataset-future', kind: 'dataset', title: 'Datasets', future: true },
  { id: 'figure-future', kind: 'figure', title: 'Figures', future: true },
  {
    id: 'experiment-future',
    kind: 'experiment',
    title: 'Experiments',
    future: true,
  },
];
const allContexts = [
  'global',
  'research',
  'paper',
  'document',
  'tasks',
  'channel',
  'manuscript',
  'experiment',
] as const;
export const slashCommands: readonly SlashCommand[] = [
  {
    id: 'ask',
    title: 'Ask Atlas',
    description: 'Explore a question with attached context',
    contexts: allContexts,
  },
  {
    id: 'search',
    title: 'Find related papers',
    description: 'Preview a scholarly search',
    contexts: ['global', 'research', 'paper'],
  },
  {
    id: 'summarize',
    title: 'Summarize sources',
    description: 'Review the shape of a grounded summary',
    contexts: allContexts,
  },
  {
    id: 'compare',
    title: 'Compare methodology',
    description: 'Compare approaches and limitations',
    contexts: ['research', 'paper', 'global'],
  },
  {
    id: 'cite',
    title: 'Insert citation',
    description: 'Attach a source; verification is required later',
    contexts: ['document', 'paper', 'manuscript', 'global'],
  },
  {
    id: 'create-task',
    title: 'Create research task',
    description: 'Preview a task proposal',
    contexts: allContexts,
  },
  {
    id: 'create-document',
    title: 'Create document',
    description: 'Preview a new research note',
    contexts: allContexts,
  },
  {
    id: 'improve',
    title: 'Improve selection',
    description: 'Keep your meaning, refine the phrasing',
    contexts: ['document', 'manuscript'],
  },
  {
    id: 'rewrite',
    title: 'Rewrite paragraph',
    description: 'Explore another way to express an idea',
    contexts: ['document', 'manuscript'],
  },
  {
    id: 'latex',
    title: 'Generate LaTeX',
    description: 'Future manuscript capability',
    contexts: ['manuscript'],
  },
  {
    id: 'outline',
    title: 'Generate outline',
    description: 'Structure a note or manuscript',
    contexts: ['document', 'manuscript', 'global'],
  },
  {
    id: 'subtasks',
    title: 'Break into subtasks',
    description: 'Preview a research plan and effort',
    contexts: ['tasks'],
  },
  {
    id: 'gaps',
    title: 'Identify research gaps',
    description: 'Explore missing evidence',
    contexts: ['research'],
  },
];
export function getPickerItems(
  trigger: '@' | '/',
  query: string,
  context: AssistantContext,
) {
  const term = query.toLowerCase();
  return trigger === '@'
    ? entitySamples
        .filter((e) => e.title.toLowerCase().includes(term))
        .map((e) => ({
          id: e.id,
          title: e.title,
          description: e.future
            ? 'Future entity · unavailable'
            : `Sample ${e.kind}`,
          reference: e,
        }))
    : slashCommands
        .filter(
          (c) =>
            c.contexts.includes(context) &&
            `${c.id} ${c.title}`.toLowerCase().includes(term),
        )
        .map((c) => ({
          id: c.id,
          title: `/${c.id}`,
          description: c.description,
          reference: undefined,
        }));
}
