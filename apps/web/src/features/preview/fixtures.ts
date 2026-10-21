/** Synthetic design fixtures, deliberately unrelated to database models or real researchers. */
export interface PreviewPaper {
  id: string;
  title: string;
  authors: string;
  year: number;
  venue: string;
  abstract: string;
  tags: readonly string[];
  citations: number;
  status: 'To read' | 'Reading' | 'Read';
}
export const papers: readonly PreviewPaper[] = [
  {
    id: 'paper-collaboration',
    title: 'Designing for thoughtful human–AI collaboration',
    authors: 'A. Morgan, J. Lee, S. Rivera',
    year: 2025,
    venue: 'Illustrative HCI proceedings',
    abstract:
      'A fictional study exploring how researchers build a shared understanding with intelligent tools. The sample contrasts task completion with reflection, agency, and the ability to trace an idea back to its source.',
    tags: ['Human–AI interaction', 'Design'],
    citations: 42,
    status: 'Reading',
  },
  {
    id: 'paper-trust',
    title: 'Beyond accuracy: understanding trust in research assistants',
    authors: 'S. Rivera, M. Chen',
    year: 2024,
    venue: 'Illustrative research journal',
    abstract:
      'This fictional paper considers how evidence visibility, uncertainty, and researcher control could shape appropriate trust in AI assistance. It is design content, not a published academic finding.',
    tags: ['Trust', 'Evaluation'],
    citations: 28,
    status: 'To read',
  },
  {
    id: 'paper-evidence',
    title: 'Keeping evidence connected in collaborative research',
    authors: 'J. Lee, A. Morgan',
    year: 2023,
    venue: 'Illustrative CSCW proceedings',
    abstract:
      'An illustrative account of connected artifacts: papers inform notes, notes support tasks, and discussion preserves the decisions between them. Metadata and citation counts are synthetic.',
    tags: ['Collaboration', 'Provenance'],
    citations: 61,
    status: 'Read',
  },
];
export const documentSamples = [
  {
    id: 'document-review',
    title: 'Literature review',
    description:
      'A working review of key themes, methods, and open questions in human–AI collaboration.',
    edited: 'Edited 2 hours ago',
    body: 'What makes a useful research partner?\n\nThe literature review begins with a simple distinction: a tool can speed up a task without helping us understand it. Our question is how to support thoughtful collaboration while keeping the researcher in control.\n\nThree themes to explore\n\n1. Agency — researchers should be able to inspect and revise suggestions.\n2. Evidence — every important claim needs a traceable source.\n3. Reflection — useful assistance leaves room for uncertainty.\n\nOpen questions\n\nHow might we evaluate understanding alongside task completion? What evidence would change our working hypothesis?\n\nThese are fictional notes for the Atlas design preview.',
  },
  {
    id: 'document-questions',
    title: 'Research questions',
    description:
      'Initial questions exploring how people work with intelligent systems in real-world settings.',
    edited: 'Edited 1 day ago',
    body: 'Research questions\n\nHow do researchers decide when to accept, revise, or reject a suggestion?\n\nWhat makes a source reference useful during collaborative writing?\n\nWhich parts of the research process benefit from deliberate friction?\n\nThis local demonstration is not saved. Use @ to attach a sample artifact or / to explore writing commands.',
  },
] as const;
export type TaskStatus = 'To do' | 'In progress' | 'Done';
export interface PreviewTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: 'High' | 'Medium' | 'Low';
  assignee: string;
  due: string;
  description: string;
}
export const taskSamples: readonly PreviewTask[] = [
  {
    id: 'task-method',
    title: 'Draft methodology section',
    status: 'In progress',
    priority: 'High',
    assignee: 'AM',
    due: 'Sample · Tomorrow',
    description:
      'Outline the study design and make the evaluation criteria explicit. Link the literature review before drafting.',
  },
  {
    id: 'task-review',
    title: 'Review collaboration paper',
    status: 'To do',
    priority: 'Medium',
    assignee: 'JL',
    due: 'Sample · In 3 days',
    description:
      'Compare the sample paper’s framing with our research questions. Note limitations and alternative explanations.',
  },
  {
    id: 'task-map',
    title: 'Map the research questions',
    status: 'To do',
    priority: 'Low',
    assignee: 'SR',
    due: 'Sample · This week',
    description:
      'Group open questions by theme and identify the evidence needed to answer each.',
  },
  {
    id: 'task-sources',
    title: 'Collect initial reading list',
    status: 'Done',
    priority: 'Medium',
    assignee: 'AM',
    due: 'Sample · Yesterday',
    description: 'A completed sample task showing a connected paper reference.',
  },
];
