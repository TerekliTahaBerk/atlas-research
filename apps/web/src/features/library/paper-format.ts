import {
  formatReference,
  providerLabels,
  type CitationEntry,
  type NormalizedPaper,
  type ProjectPaperDto,
  type ReadingStatus,
  type SourceState,
} from '@atlas/core';

export function authorSummary(paper: NormalizedPaper) {
  const names = paper.authors.map((a) => a.name);
  if (!names.length) return 'Authors not listed by the provider';
  if (paper.authorCount > 3) return `${names.slice(0, 3).join(', ')} et al.`;
  return names.join(', ');
}
export function providerNames(paper: NormalizedPaper) {
  return [
    ...new Set(paper.provenance.map((p) => providerLabels[p.provider])),
  ].join(' · ');
}
export function citationEntry(
  paper: NormalizedPaper | null,
  title: string,
): CitationEntry {
  return {
    title,
    authors: paper?.authors.map((a) => a.name) ?? [],
    year: paper?.year ?? null,
    venue: paper?.venue ?? null,
    doi: paper?.doi ?? null,
    url: paper?.doi
      ? `https://doi.org/${paper.doi}`
      : (paper?.landingPageUrl ?? null),
    publicationType: paper?.publicationType ?? null,
  };
}
export function referenceText(paper: NormalizedPaper | null, title: string) {
  return formatReference(citationEntry(paper, title));
}
/** The identity the server re-fetches when saving a search result. */
export function saveIdentity(paper: NormalizedPaper) {
  if (paper.openAlexId)
    return { provider: 'openalex' as const, externalId: paper.openAlexId };
  return {
    provider: 'semantic-scholar' as const,
    externalId: paper.semanticScholarId ?? '',
  };
}
export const statusLabels: Record<ReadingStatus, string> = {
  TO_READ: 'To read',
  READING: 'Reading',
  READ: 'Read',
  ARCHIVED: 'Archived',
};
export const sourceStateLabels: Record<SourceState, string> = {
  PENDING_UPLOAD: 'Upload not finished',
  QUARANTINED: 'Quarantined · awaiting validation',
  SCANNING: 'Being scanned',
  PROCESSING: 'Processing',
  READY: 'Ready to read',
  FAILED: 'Validation failed',
  REJECTED: 'Rejected',
};
export function readySource(paper: ProjectPaperDto) {
  return paper.sources.find((s) => s.state === 'READY') ?? null;
}
export function formatBytes(bytes: number | null) {
  if (bytes === null) return 'Unknown size';
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
