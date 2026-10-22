import type { ScreenKey } from '@/features/shell/navigation';
import type { PaperId } from '@/lib/preview/research';
import type { AtlasMessage, ReplyPart } from './contracts';
/**
 * Prewritten sample responses (prototype `reply()`), chosen by slash command
 * and screen. They are authored design content: no model is called, nothing
 * is read and every rendered answer carries a "Sample response" label.
 */
export interface SampleReply {
  parts: ReplyPart[];
  code?: string;
  list?: string[];
  sources: PaperId[];
}
const t = (text: string, strong = false): ReplyPart => ({
  type: 'text',
  text,
  strong,
});
const c = (paper: PaperId): ReplyPart => ({ type: 'cite', paper });
export function commandOf(text: string) {
  return text.match(/^\/([\w-]+)/)?.[1];
}
export function previewSteps(text: string, context: string) {
  const cmd = commandOf(text);
  const middle =
    cmd === 'latex'
      ? 'Parsing main.tex · 3 sample problems'
      : cmd === 'create-task'
        ? 'Reading project tasks and deadlines'
        : cmd === 'search'
          ? 'Searching the sample index'
          : cmd === 'cite'
            ? 'Looking up sample metadata'
            : 'Searching the sample library · 5 papers';
  return [
    `Reading ${context}`,
    middle,
    'Checking claims against sources',
    'Writing answer',
  ];
}
const byScreen: Partial<Record<ScreenKey, string>> = {
  manuscript:
    'I can draft LaTeX for that section. Use /latex to see a sample insertion, or reference a paper with @ to cite it.',
  tasks:
    'Suggested milestones: 1) confirm baselines, 2) run block-size sweep, 3) write §3 from results. Use /create-task to draft them.',
  experiments:
    'Contact precision drops 10% between block 64 and 128 while memory falls 25%. Block 64 is a reasonable default; test a hybrid local+global pattern at 128 next.',
  reader:
    'This passage claims near-linear memory, but the experiment uses batch size 1 — the saving may shrink at larger batches.',
  library:
    'Of your 5 sample papers, Okafor 2024 and Novak & Haddad 2025 are the closest to your method; both report memory at sequence length 1,024+.',
};
export function sampleReply(
  text: string,
  screen: ScreenKey,
  context: string,
): SampleReply {
  switch (commandOf(text)) {
    case 'latex':
      return {
        parts: [
          t('Here is a sample LaTeX draft for the routing paragraph. ', true),
          t(
            'It defines the mask before Eq. 1 and fixes the undefined \\methodname macro.',
          ),
        ],
        code: 'where $M \\in \\{0,1\\}^{L \\times L}$ is a learned block mask\n\\citep{okafor2024}. As shown by \\method{}, routing\nimproves long-range contact recall (Table~\\ref{tab:sweep}).',
        sources: ['p1'],
      };
    case 'create-task':
      return {
        parts: [
          t('Drafted 3 sample tasks from this context. ', true),
          t(
            'Review them before adding to the board — nothing has been created.',
          ),
        ],
        list: [
          'Re-run sweep at batch 2 and 4',
          'Add Chen & Duarte as baseline in Table 2',
          'Define mask M before Eq. 1',
        ],
        sources: [],
      };
    case 'cite':
      return {
        parts: [t('Sample BibTeX for Okafor et al., 2024:', true)],
        code: '@inproceedings{okafor2024,\n  title  = {Sparse Axial Attention for Long-Range Residue Contacts},\n  author = {Okafor, A. and Lindqvist, J. and Mehta, R.},\n  booktitle = {NeurIPS}, year = {2024}\n}',
        sources: ['p1'],
      };
    case 'compare':
      return {
        parts: [
          t('Sparse vs. low-rank, in one line each. ', true),
          t(
            'Sparse keeps exact values for a subset of pairs; low-rank keeps all pairs approximately. Learned routing (Novak & Haddad) chooses the subset adaptively.',
          ),
        ],
        sources: ['p1', 'p2', 'p4'],
      };
    case 'search':
      return {
        parts: [
          t('Found 5 papers in the sample index. ', true),
          t(
            'Three are directly about learned or structured sparsity; open Research to filter and compare them.',
          ),
        ],
        sources: ['p1', 'p4', 'p3'],
      };
    case 'summarize':
      return {
        parts: [
          t(`Summary of ${context}. `, true),
          t(
            'The note contrasts low-rank and sparse approaches to pair-attention memory, argues sparsity better preserves long-range contacts, and lists three open questions for the lab about block size, batch size and baselines.',
          ),
        ],
        sources: ['p1', 'p2'],
      };
    case 'rewrite':
      return {
        parts: [
          t('Tighter version: ', true),
          t(
            '“Sparse methods keep exact values for the pairs they retain; low-rank methods keep every pair, approximately.”',
          ),
        ],
        sources: [],
      };
  }
  const specific = byScreen[screen];
  return {
    parts: specific
      ? [t(`Based on ${context}: `, true), t(specific), c('p1'), t('.')]
      : [
          t(`Based on ${context}: `, true),
          t(
            'Sparse attention preserves exact long-range contacts for retained pairs',
          ),
          c('p1'),
          t(', while low-rank approaches trade exactness for uniform coverage'),
          c('p2'),
          t('.'),
        ],
    sources: ['p1', 'p2'],
  };
}
/** The prototype's seeded conversation (two sample exchanges). */
export function initialMessages(): AtlasMessage[] {
  return [
    {
      id: 'seed-u1',
      role: 'user',
      text: 'Compare the memory claims in Okafor 2024 and Chen & Duarte 2023',
    },
    {
      id: 'seed-a1',
      role: 'assistant',
      phase: 'done',
      query: '',
      startedAt: 0,
      duration: 1.8,
      steps: [
        'Reading Related work — sparse attention',
        'Searching the sample library · 5 papers',
        'Checking claims against sources',
        'Writing answer',
      ],
      step: 4,
      revealed: Number.POSITIVE_INFINITY,
      parts: [
        t('Both reduce pair-representation memory, '),
        t('but along different axes. ', true),
        t(
          'Okafor et al. keep the full pair grid and restrict which entries attend — a 2.8× saving above 1,024 residues',
        ),
        c('p1'),
        t(
          '. Chen & Duarte compress the grid itself to rank r, so savings grow with length but cost about 1.2 lDDT',
        ),
        c('p2'),
        t('.'),
      ],
      sources: ['p1', 'p2'],
    },
    {
      id: 'seed-u2',
      role: 'user',
      text: 'Which one supports the argument in §2?',
    },
    {
      id: 'seed-a2',
      role: 'assistant',
      phase: 'done',
      query: '',
      startedAt: 0,
      duration: 1.2,
      steps: [
        'Reading §2 of the document',
        'Comparing arguments',
        'Writing answer',
      ],
      step: 3,
      revealed: Number.POSITIVE_INFINITY,
      parts: [
        t('Sparse attention fits better. ', true),
        t(
          'Your §2 argues long-range contacts must be preserved exactly, which low-rank factorization trades away',
        ),
        c('p5'),
        t(
          '. Cite Chen & Duarte as the main alternative rather than as support',
        ),
        c('p2'),
        t('.'),
      ],
      sources: ['p1', 'p2', 'p5'],
    },
  ];
}
