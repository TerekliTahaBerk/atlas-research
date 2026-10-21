'use client';
import { useId, useState } from 'react';
import {
  Copy,
  FilePlus,
  ListPlus,
  Bookmark,
  Quote,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@atlas/ui/components/button';
import { Badge } from '@atlas/ui/components/badge';
import { type CitationReference } from './contracts';
import { CapabilityButton } from '@/features/preview/primitives';
const sources: readonly CitationReference[] = [
  {
    id: 'sample-ref-1',
    sourceId: 'paper-collaboration',
    title: 'Designing for thoughtful human–AI collaboration',
    status: 'suggested',
    location: 'Synthetic paper · no verified passage',
  },
  {
    id: 'sample-ref-2',
    sourceId: 'document-review',
    title: 'Literature review',
    status: 'generated',
    location: 'Prewritten sample note · not evidence',
  },
  {
    id: 'sample-ref-3',
    title: 'Further evidence needed',
    status: 'unavailable',
  },
];
export function SourceCard({ source }: { source: CitationReference }) {
  // A status alone cannot turn an unsupported reference into verified provenance.
  const verified =
    source.status === 'verified' &&
    Boolean(source.sourceId && source.location && source.evidence);
  const label = verified
    ? 'Verified passage'
    : source.status === 'verified'
      ? 'Unavailable provenance'
      : (
          {
            suggested: 'Suggested · unverified',
            generated: 'Generated sample',
            unavailable: 'Citation unavailable',
          } as const
        )[source.status];
  return (
    <div className="source-card">
      <strong>{source.title}</strong>
      <p>{source.location ?? 'No source location available'}</p>
      <Badge variant="secondary">{label}</Badge>
      {verified ? <blockquote>{source.evidence}</blockquote> : null}
    </div>
  );
}
const sampleText =
  'A useful research partner should preserve researcher agency, make evidence traceable, and leave room for uncertainty. This is a prewritten design example, not a generated or source-verified answer.';
export function AIResponse({
  onRetry,
  onAction,
}: {
  onRetry: () => void;
  onAction: (action: string) => void;
}) {
  const sourcePrefix = useId();
  const [copyStatus, setCopyStatus] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(sampleText);
      setCopyStatus('Sample answer copied.');
    } catch {
      setCopyStatus(
        'Copy is unavailable in this browser. Select the answer text to copy it.',
      );
    }
  }
  return (
    <article className="ai-response" aria-label="Sample Atlas answer">
      <Badge variant="secondary">Prewritten answer · not AI output</Badge>
      <h3>Keep the researcher in the loop.</h3>
      <p>
        A useful research partner should preserve <strong>agency</strong>, make
        evidence <strong>traceable</strong>, and leave room for{' '}
        <strong>uncertainty</strong>.{' '}
        <a
          href={`#${sourcePrefix}-sample-ref-1`}
          className="inline-citation"
          aria-label="Suggested sample source 1"
        >
          [1]
        </a>
      </p>
      <p>
        Start by mapping your question to the evidence you would need. Then
        compare approaches before committing to one interpretation.
      </p>
      <ul>
        <li>Record what a source supports, and what it leaves open.</li>
        <li>Keep a note of decisions alongside the reading.</li>
        <li>Turn unresolved questions into small research tasks.</li>
      </ul>
      <details className="sources-disclosure">
        <summary>3 source states · none verified</summary>
        {sources.map((source) => (
          <div key={source.id} id={`${sourcePrefix}-${source.id}`}>
            <SourceCard source={source} />
          </div>
        ))}
      </details>
      <details>
        <summary>Technical response formatting</summary>
        <p>
          Example mathematical notation:{' '}
          <span
            className="math-expression"
            role="math"
            aria-label="L equals one over n times the sum of squared prediction errors"
          >
            L = (1/n) ∑ (y − ŷ)²
          </span>
        </p>
        <pre>
          <code>
            {
              '# Display only; never executed\nclaim = {"source": None, "verified": False}'
            }
          </code>
        </pre>
      </details>
      <div className="response-actions">
        <Button size="sm" variant="ghost" onClick={copy}>
          <Copy data-icon="inline-start" />
          Copy
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onAction('Add to document')}
        >
          <FilePlus data-icon="inline-start" />
          Add to document
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onAction('Create task')}
        >
          <ListPlus data-icon="inline-start" />
          Create task
        </Button>
        <CapabilityButton title="Save finding" phase="03">
          <Bookmark data-icon="inline-start" />
          Save finding
        </CapabilityButton>
        <CapabilityButton title="Insert citation" phase="03">
          <Quote data-icon="inline-start" />
          Cite
        </CapabilityButton>
        <Button size="sm" variant="ghost" onClick={onRetry}>
          <RotateCcw data-icon="inline-start" />
          Retry preview
        </Button>
      </div>
      <p role="status" className="muted">
        {copyStatus}
      </p>
    </article>
  );
}
