'use client';
import { Bookmark, Check, ArrowUpRight, Quote, Sparkles } from 'lucide-react';
import { Button } from '@atlas/ui/components/button';
import { Badge } from '@atlas/ui/components/badge';
import { CapabilityButton } from '@/features/preview/primitives';
import { type PreviewPaper } from '@/features/preview/fixtures';
import { useAtlas } from '@/features/atlas-ai/atlas-provider';
export function PaperCard({
  paper,
  saved,
  onSave,
  selected,
  onSelect,
  onOpen,
}: {
  paper: PreviewPaper;
  saved: boolean;
  onSave: () => void;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const { openAssistant } = useAtlas();
  return (
    <article className="paper-card">
      <div className="paper-topline">
        <span className="metadata">
          {paper.year} · {paper.venue}
        </span>
        <label className="compare-checkbox">
          <input type="checkbox" checked={selected} onChange={onSelect} />
          <span>Compare</span>
        </label>
      </div>
      <h2>
        <button onClick={onOpen}>{paper.title}</button>
      </h2>
      <p className="paper-authors">{paper.authors}</p>
      <p>{paper.abstract}</p>
      <div className="paper-tags">
        {paper.tags.map((tag) => (
          <Badge variant="secondary" key={tag}>
            {tag}
          </Badge>
        ))}
        <span className="metadata">
          {paper.citations} illustrative citations · DOI unavailable
        </span>
      </div>
      <div className="paper-actions">
        <Button
          size="sm"
          variant={saved ? 'secondary' : 'outline'}
          onClick={onSave}
          aria-pressed={saved}
        >
          {saved ? (
            <Check data-icon="inline-start" />
          ) : (
            <Bookmark data-icon="inline-start" />
          )}
          {saved ? 'In sample library' : 'Save locally'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onOpen}>
          Read preview
          <ArrowUpRight data-icon="inline-end" />
        </Button>
        <CapabilityButton title="Cite paper" phase="02">
          <Quote data-icon="inline-start" />
          Cite
        </CapabilityButton>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            openAssistant({
              context: 'paper',
              references: [{ id: paper.id, kind: 'paper', title: paper.title }],
              prompt: 'What questions should I ask about this paper?',
            })
          }
        >
          <Sparkles data-icon="inline-start" />
          Ask Atlas
        </Button>
        <CapabilityButton title="Add paper to project" phase="02">
          Add to project
        </CapabilityButton>
      </div>
    </article>
  );
}
