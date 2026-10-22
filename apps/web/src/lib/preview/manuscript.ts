/**
 * Sample LaTeX project (Phase 00.5A). Nothing here is compiled: the PDF pane
 * renders an authored illustration and diagnostics are fixed sample data.
 */
export const texSources: Record<TexFile, string> = {
  'main.tex': String.raw`\documentclass[11pt]{article}
\usepackage[utf8]{inputenc}
\usepackage{amsmath, amssymb}
\usepackage{graphicx}
\usepackage[numbers]{natbib}
\usepackage{hyperref}
\usepackage[margin=1in]{geometry}

% Project macros
\newcommand{\method}{\textsc{SparseEvo}}
\newcommand{\lddt}{\text{lDDT}}

\title{Sparse Evoformer: Learned Block Sparsity\\
  for Memory-Efficient Structure Prediction}
\author{Taha Berk Terekli \and Ayşe Demir \and Mehmet Kaya}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
Pair representations dominate the memory cost of
structure prediction. We introduce \method{}, which
learns block-sparse attention masks over residue pairs,
reducing peak memory by 2.4$\times$ at a 0.6 point
\lddt{} cost on long targets.
\end{abstract}

\section{Introduction}
\input{sections/intro}

\section{Method}
\label{sec:method}
Given queries $Q$ and keys $K$, we compute
\begin{equation}
  \mathcal{A} = \mathrm{softmax}\left(
    \frac{QK^\top}{\sqrt{d}} \odot M \right) V
\end{equation}
where $M$ is a learned block mask \citep{okafor2024}.
As shown by \methodname{}, routing improves recall.

\section{Experiments}
\input{sections/results}

\bibliographystyle{plainnat}
\bibliography{refs}
\end{document}`,
  'intro.tex': String.raw`% sections/intro.tex
Protein structure prediction models spend most of
their memory on the pair representation, which grows
quadratically with sequence length \citep{chen2023}.
For targets beyond 1{,}024 residues this limits
batch size to one on a single accelerator.

Prior work reduces this cost either by factorizing the
pair grid \citep{chen2023} or by fixing a sparse pattern
\citep{okafor2024}. We instead \emph{learn} the pattern.

\paragraph{Contributions.}
\begin{itemize}
  \item A differentiable block-mask parameterization.
  \item A memory profile across 16--128 block sizes.
  \item An open evaluation harness on CASP15 targets.
\end{itemize}`,
  'refs.bib': String.raw`@inproceedings{okafor2024,
  title     = {Sparse Axial Attention for Long-Range
               Residue Contacts},
  author    = {Okafor, A. and Lindqvist, J. and Mehta, R.},
  booktitle = {NeurIPS},
  year      = {2024}
}

@inproceedings{chen2023,
  title     = {Efficient Structure Prediction via
               Low-Rank Pair Representations},
  author    = {Chen, L. and Duarte, M.},
  booktitle = {ICML},
  year      = {2023}
}`,
};
export type TexFile = 'main.tex' | 'intro.tex' | 'refs.bib';
export const texFiles: TexFile[] = ['main.tex', 'intro.tex', 'refs.bib'];
function lineOf(file: TexFile, needle: string) {
  return texSources[file].split('\n').findIndex((l) => l.includes(needle)) + 1;
}
export const errorLine = lineOf('main.tex', '\\methodname');
export const warnLine = lineOf('main.tex', 'reducing peak');
/** Remote collaborator caret (sample presence). */
export const presenceLine = lineOf('main.tex', 'where $M$');
export interface Problem {
  severity: 'error' | 'warn';
  file: TexFile;
  line: number;
  message: string;
}
export const problems: Problem[] = [
  {
    severity: 'error',
    file: 'main.tex',
    line: errorLine,
    message: 'Undefined control sequence \\methodname',
  },
  {
    severity: 'warn',
    file: 'main.tex',
    line: warnLine,
    message: 'Overfull \\hbox (3.2pt too wide) in paragraph',
  },
  {
    severity: 'warn',
    file: 'intro.tex',
    line: 4,
    message: 'Citation “chen2023” undefined on first pass',
  },
];
export type PdfBlock = 'title' | 'abs' | 'intro1' | 'intro2' | 'method';
/** Source ↔ preview mapping for the illustrated PDF (SyncTeX-like, sample). */
export const syncBlocks: {
  block: PdfBlock;
  file: TexFile;
  from: number;
  to: number;
}[] = [
  {
    block: 'title',
    file: 'main.tex',
    from: lineOf('main.tex', '\\title{'),
    to: lineOf('main.tex', '\\date{'),
  },
  {
    block: 'abs',
    file: 'main.tex',
    from: lineOf('main.tex', '\\begin{abstract}'),
    to: lineOf('main.tex', '\\end{abstract}'),
  },
  { block: 'intro1', file: 'intro.tex', from: 2, to: 6 },
  { block: 'intro2', file: 'intro.tex', from: 8, to: 10 },
  {
    block: 'intro1',
    file: 'main.tex',
    from: lineOf('main.tex', '\\section{Introduction}'),
    to: lineOf('main.tex', '\\input{sections/intro}'),
  },
  {
    block: 'method',
    file: 'main.tex',
    from: lineOf('main.tex', '\\section{Method}'),
    to: errorLine,
  },
];
export const fileTree: {
  name: string;
  depth: number;
  kind: 'tex' | 'dir' | 'image' | 'bib' | 'cls';
  file?: TexFile;
  error?: boolean;
  open?: boolean;
}[] = [
  { name: 'main.tex', depth: 0, kind: 'tex', file: 'main.tex', error: true },
  { name: 'sections', depth: 0, kind: 'dir', open: true },
  { name: 'intro.tex', depth: 1, kind: 'tex', file: 'intro.tex' },
  { name: 'methods.tex', depth: 1, kind: 'tex' },
  { name: 'results.tex', depth: 1, kind: 'tex' },
  { name: 'figures', depth: 0, kind: 'dir' },
  { name: 'sweep.pdf', depth: 1, kind: 'image' },
  { name: 'refs.bib', depth: 0, kind: 'bib', file: 'refs.bib' },
  { name: 'atlas.cls', depth: 0, kind: 'cls' },
];
export const codeDiff = [
  { n: 37, mark: ' ', text: '\\end{equation}', kind: '' },
  {
    n: 38,
    mark: ' ',
    text: 'where $M$ is a learned block mask \\citep{okafor2024}.',
    kind: '',
  },
  {
    n: 39,
    mark: '−',
    text: 'As shown by prior work, routing improves recall.',
    kind: 'del',
  },
  {
    n: 39,
    mark: '+',
    text: 'As shown by \\methodname{}, routing improves recall.',
    kind: 'add',
  },
  { n: 40, mark: ' ', text: '', kind: '' },
  { n: 41, mark: '+', text: '\\section{Experiments}', kind: 'add' },
  { n: 42, mark: '+', text: '\\input{sections/results}', kind: 'add' },
] as const;
