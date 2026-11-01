import type { CitationAttrs, DocNode } from './documents';

/*
 * A02 connected research journey: pure, evidence-only builders shared by the
 * server command and the confirmation UI. The server derives every input
 * from database rows it re-authorized; nothing here trusts a client label.
 */

/** `citationAttrs.quote` limit; longer annotation quotes cannot be quoted. */
export const CITATION_QUOTE_LIMIT = 2000;
/** User commentary appended under an inserted source reference. */
export const SOURCE_NOTE_COMMENTARY_LIMIT = 4000;

export interface SourceEvidence {
  projectPaperId: string;
  /** A READY source version of the same project paper, or null. */
  sourceVersionId: string | null;
  /** The accepted version's stored SHA-256, only with `sourceVersionId`. */
  sourceChecksum: string | null;
  /** A visible, live annotation on that exact version, or null. */
  annotation: {
    id: string;
    page: number;
    quote: string | null;
    startOffset: number | null;
    endOffset: number | null;
  } | null;
}

/**
 * How precisely the evidence locates the cited material.
 * - `quote`: exact annotated text, its page and offsets on one version.
 * - `page`: an annotation that pins a page (page note) without quotable text.
 * - `version`: one accepted PDF version; no page is recorded.
 * - `paper`: the project paper only (metadata, no readable version).
 */
export type CitationPrecision = 'quote' | 'page' | 'version' | 'paper';

export function citationPrecision(e: SourceEvidence): CitationPrecision {
  if (
    e.annotation &&
    e.sourceVersionId &&
    annotationCitable(e.annotation.quote)
  )
    return e.annotation.quote ? 'quote' : 'page';
  return e.sourceVersionId ? 'version' : 'paper';
}

/** Whether an annotation can be cited with its own identity at all. */
export const annotationCitable = (quote: string | null) =>
  !quote || quote.length <= CITATION_QUOTE_LIMIT;

/**
 * Citation attributes populated only from evidence. Page, quote and offsets
 * come exclusively from a real annotation anchor; a version-only citation
 * records no page, because nothing verifiable pins one.
 */
export function sourceCitationAttrs(e: SourceEvidence): CitationAttrs {
  const located =
    e.annotation && e.sourceVersionId && annotationCitable(e.annotation.quote)
      ? e.annotation
      : null;
  return {
    projectPaperId: e.projectPaperId,
    sourceVersionId: e.sourceVersionId,
    annotationId: located?.id ?? null,
    chunkId: null,
    page: located?.page ?? null,
    quote: located?.quote ?? null,
    // Offsets are copied verbatim from the anchor (the database compares them).
    startOffset: located?.startOffset ?? null,
    endOffset: located?.endOffset ?? null,
    sourceChecksum: e.sourceVersionId ? e.sourceChecksum : null,
    label: null,
  };
}

const cleanText = (value: string) =>
  value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\r\n?/g, '\n');

/**
 * Blocks appended to a research note. A source-backed quotation is kept in
 * its own blockquote ending with the citation; optional user commentary is a
 * separate paragraph and is never merged into the quoted evidence.
 */
export function sourceNoteBlocks(
  e: SourceEvidence,
  commentary?: string,
): DocNode[] {
  const attrs = sourceCitationAttrs(e);
  const citation: DocNode = { type: 'citation', attrs: { ...attrs } };
  const blocks: DocNode[] = attrs.quote
    ? [
        {
          type: 'blockquote',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: `“${cleanText(attrs.quote)}” ` },
                citation,
              ],
            },
          ],
        },
      ]
    : [{ type: 'paragraph', content: [citation] }];
  const note = cleanText(commentary ?? '')
    .trim()
    .slice(0, SOURCE_NOTE_COMMENTARY_LIMIT);
  for (const line of note.split(/\n{2,}/).filter((l) => l.trim()))
    blocks.push({
      type: 'paragraph',
      content: [{ type: 'text', text: line.replace(/\s*\n\s*/g, ' ') }],
    });
  return blocks;
}

/** Appends blocks to stored content, dropping one trailing empty paragraph. */
export function appendBlocks(base: DocNode, blocks: DocNode[]): DocNode {
  const existing = [...(base.content ?? [])];
  const last = existing.at(-1);
  if (
    existing.length === 1 &&
    last?.type === 'paragraph' &&
    !last.content?.length
  )
    existing.pop();
  return { type: 'doc', content: [...existing, ...blocks] };
}

export const citationPrecisionLabels: Record<CitationPrecision, string> = {
  quote: 'Exact quotation with its page and source version',
  page: 'Page-level reference on this source version',
  version: 'Source version reference — no page is recorded',
  paper: 'Paper-level reference — no readable version is cited',
};
