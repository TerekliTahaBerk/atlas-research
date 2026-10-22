import type { PersonId } from './people';
/** Fictional sample papers. Titles, authors and figures are design content. */
export type PaperId = 'p1' | 'p2' | 'p3' | 'p4' | 'p5';
export type ReadingStatus = 'To read' | 'Reading' | 'Read';
export interface Paper {
  id: PaperId;
  title: string;
  authors: string;
  venue: string;
  year: number;
  citedBy: number;
  openAccess: boolean;
  short: string;
  key: string;
  abstract: string;
  status: ReadingStatus;
  tags: string[];
  notes: number;
  relevance: 'Highly relevant' | 'Relevant' | 'Related';
}
export const papers: Paper[] = [
  {
    id: 'p1',
    title: 'Sparse Axial Attention for Long-Range Residue Contacts',
    authors: 'A. Okafor, J. Lindqvist, R. Mehta',
    venue: 'NeurIPS 2024',
    year: 2024,
    citedBy: 214,
    openAccess: true,
    short: 'Okafor et al., 2024',
    key: 'okafor2024',
    abstract:
      'We introduce a block-sparse axial attention pattern that preserves long-range residue contacts while reducing pair-representation memory by 2.8× on sequences over 1,024 residues.',
    status: 'Reading',
    tags: ['method', 'sparse'],
    notes: 3,
    relevance: 'Highly relevant',
  },
  {
    id: 'p2',
    title: 'Efficient Structure Prediction via Low-Rank Pair Representations',
    authors: 'L. Chen, M. Duarte',
    venue: 'ICML 2023',
    year: 2023,
    citedBy: 389,
    openAccess: true,
    short: 'Chen & Duarte, 2023',
    key: 'chen2023',
    abstract:
      'Factorizing the pair representation into rank-r components yields near-linear memory in sequence length, at a 1.2 point lDDT cost on long CASP14 targets.',
    status: 'To read',
    tags: ['baseline', 'low-rank'],
    notes: 1,
    relevance: 'Highly relevant',
  },
  {
    id: 'p3',
    title: 'Benchmarking Attention Sparsity in Protein Language Models',
    authors: 'S. Yilmaz, K. Brandt, T. Ito',
    venue: 'Bioinformatics 2025',
    year: 2025,
    citedBy: 57,
    openAccess: false,
    short: 'Yilmaz et al., 2025',
    key: 'yilmaz2025',
    abstract:
      'A controlled benchmark of eleven sparsity patterns across four protein language models, reporting contact precision, perplexity and memory under matched compute.',
    status: 'Read',
    tags: ['benchmark'],
    notes: 0,
    relevance: 'Relevant',
  },
  {
    id: 'p4',
    title: 'Learned Routing for Memory-Efficient Evoformer Blocks',
    authors: 'P. Novak, E. Haddad',
    venue: 'arXiv preprint 2025',
    year: 2025,
    citedBy: 12,
    openAccess: true,
    short: 'Novak & Haddad, 2025',
    key: 'novak2025',
    abstract:
      'Token routing selects a subset of residue pairs per block, learned end-to-end, matching dense accuracy on 87% of targets at 41% of the memory.',
    status: 'To read',
    tags: ['method', 'routing'],
    notes: 0,
    relevance: 'Highly relevant',
  },
  {
    id: 'p5',
    title: 'On the Limits of Linear Attention for Biological Sequences',
    authors: 'H. Park, D. Osei',
    venue: 'TMLR 2024',
    year: 2024,
    citedBy: 98,
    openAccess: true,
    short: 'Park & Osei, 2024',
    key: 'park2024',
    abstract:
      'Linear attention approximations systematically underestimate long-range couplings; we characterize the failure mode and propose a hybrid correction.',
    status: 'Read',
    tags: ['analysis'],
    notes: 2,
    relevance: 'Related',
  },
];
export function paperById(id: string): Paper {
  return papers.find((p) => p.id === id) ?? (papers[0] as Paper);
}
export function isPaperId(id: string | null | undefined): id is PaperId {
  return papers.some((p) => p.id === id);
}
export function bibtexFor(p: Paper) {
  return `@inproceedings{${p.key},\n  title  = {${p.title}},\n  author = {${p.authors.replace(/, /g, ' and ')}},\n  year   = {${p.year}},\n  note   = {Atlas sample record — not a real publication}\n}`;
}
/** Research comparison rows (prototype CMP table), extracted from abstracts. */
export const comparisonKeys = [
  'Approach',
  'Datasets',
  'Memory',
  'lDDT vs dense',
  'Code released',
] as const;
export const comparison: Record<PaperId, string[]> = {
  p1: [
    'Fixed axial block-sparse',
    'CASP14, CAMEO',
    '2.8× lower',
    '−0.3',
    'Yes',
  ],
  p2: ['Low-rank pair factorization', 'CASP14', 'Near-linear', '−1.2', 'Yes'],
  p3: ['Benchmark of 11 patterns', '4 protein LMs', 'Varies', '—', 'Yes'],
  p4: [
    'Learned token routing',
    'CASP15',
    '41% of dense',
    'Matched on 87%',
    'Not yet',
  ],
  p5: ['Linear attention + correction', 'Pfam, CASP14', 'Linear', '−2.1', 'No'],
};
export const libraryCollections = [
  {
    kind: 'item',
    key: 'all',
    label: 'All papers',
    icon: 'library',
    count: '128',
  },
  {
    kind: 'item',
    key: 'reading',
    label: 'Currently reading',
    icon: 'book',
    count: '4',
  },
  {
    kind: 'item',
    key: 'toread',
    label: 'To read',
    icon: 'bookmark',
    count: '17',
  },
  { kind: 'header', key: 'h-col', label: 'Collections' },
  {
    kind: 'item',
    key: 'sparse',
    label: 'Sparse attention',
    icon: 'folder',
    count: '23',
  },
  {
    kind: 'item',
    key: 'plm',
    label: 'Protein LMs',
    icon: 'folder',
    count: '41',
  },
  {
    kind: 'item',
    key: 'thesis',
    label: 'Thesis · Chapter 3',
    icon: 'folder',
    count: '12',
  },
  { kind: 'header', key: 'h-tag', label: 'Tags' },
  { kind: 'item', key: 't-method', label: '#method', icon: 'tag', count: '19' },
  {
    kind: 'item',
    key: 't-bench',
    label: '#benchmark',
    icon: 'tag',
    count: '7',
  },
] as const;
export interface PaperNote {
  location: string;
  who: string;
  quote: string;
  note: string;
}
export const libraryNotes: PaperNote[] = [
  {
    location: 'p.3 ¶2',
    who: 'Taha · 2d',
    quote: 'All measurements use batch size 1',
    note: 'Check against our batch-4 runs before citing the memory number.',
  },
  {
    location: 'p.5 Tab.2',
    who: 'Ayşe · 1d',
    quote: 'Below r = 16 the long-range contact precision degrades sharply',
    note: 'Useful framing for §2.',
  },
];
export const highlightColors = [
  { name: 'Amber', value: 'rgb(214 168 60 / 0.8)' },
  { name: 'Green', value: 'rgb(50 154 83 / 0.8)' },
  { name: 'Blue', value: 'rgb(130 180 222 / 0.8)' },
] as const;
export const readerNotes: (PaperNote & { color: number; page: number })[] = [
  {
    location: 'p.3 ¶2',
    who: 'You',
    color: 0,
    page: 3,
    quote:
      'With r = 32, peak memory on a 1,400-residue target falls from 61 GB to 19 GB',
    note: 'Compare to our 17 GB at block 64.',
  },
  {
    location: 'p.3 ¶2',
    who: 'You',
    color: 1,
    page: 3,
    quote: 'All measurements use batch size 1 and bfloat16 activations.',
    note: '',
  },
  {
    location: 'p.5 Tab.2',
    who: 'Ayşe',
    color: 2,
    page: 5,
    quote: 'Below r = 16 the long-range contact precision degrades sharply',
    note: 'Cite in §2.',
  },
];
export const readerOutline = [
  { label: 'Abstract', page: 1, depth: 0 },
  { label: '1 Introduction', page: 1, depth: 0 },
  { label: '2 Background', page: 2, depth: 0 },
  { label: '3 Low-rank pair updates', page: 3, depth: 0 },
  { label: '3.1 Factorized triangular updates', page: 3, depth: 1 },
  { label: '3.2 Rank selection', page: 4, depth: 1 },
  { label: '4 Experiments', page: 5, depth: 0 },
  { label: '5 Limitations', page: 9, depth: 0 },
];
export const readerQuestions = [
  'What does Table 2 imply for long-range contacts?',
  'Summarize the method in 3 sentences',
  'Which claims depend on batch size 1?',
];
export const researchModes = [
  { key: 'quick', label: 'Quick answer' },
  { key: 'review', label: 'Literature review' },
  { key: 'compare', label: 'Compare methods' },
  { key: 'data', label: 'Find datasets' },
] as const;
export const researchSources = [
  { key: 'ss', label: 'Semantic Scholar', on: true },
  { key: 'arxiv', label: 'arXiv', on: true },
  { key: 'pubmed', label: 'PubMed', on: false },
  { key: 'openalex', label: 'OpenAlex', on: true },
] as const;
export const defaultResearchQuestion =
  'How do learned sparse attention patterns compare to low-rank pair representations for long protein targets?';
export type SavedBy = PersonId;
