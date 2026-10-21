'use client';
import { useState } from 'react';
import {
  Search,
  SlidersHorizontal,
  Library,
  BookOpen,
  Minus,
  Plus,
  ArrowLeft,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { Button } from '@atlas/ui/components/button';
import { Input } from '@atlas/ui/components/input';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@atlas/ui/components/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@atlas/ui/components/dialog';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/states';
import {
  PreviewNotice,
  ViewToggle,
  CapabilityButton,
} from '@/features/preview/primitives';
import { papers, type PreviewPaper } from '@/features/preview/fixtures';
import { AtlasComposer } from '@/features/atlas-ai/atlas-composer';
import { useAtlas } from '@/features/atlas-ai/atlas-provider';
import { PaperCard } from './paper-card';
export function ResearchScreen({ library = false }: { library?: boolean }) {
  const { openAssistant } = useAtlas();
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('all');
  const [collection, setCollection] = useState('all');
  const [sort, setSort] = useState('relevance');
  const [view, setView] = useState('List');
  const [saved, setSaved] = useState<string[]>(
    library ? papers.map((p) => p.id) : [],
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [reading, setReading] = useState<PreviewPaper | null>(null);
  const [compared, setCompared] = useState(false);
  const visible = papers
    .filter(
      (paper) =>
        `${paper.title} ${paper.authors} ${paper.tags.join(' ')}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (year === 'all' || String(paper.year) === year) &&
        (collection === 'all' || paper.status === collection),
    )
    .sort((a, b) =>
      sort === 'year'
        ? b.year - a.year
        : sort === 'citations'
          ? b.citations - a.citations
          : 0,
    );
  const card = (paper: PreviewPaper) => (
    <PaperCard
      key={paper.id}
      paper={paper}
      saved={saved.includes(paper.id)}
      onSave={() =>
        setSaved((prev) =>
          prev.includes(paper.id)
            ? prev.filter((id) => id !== paper.id)
            : [...prev, paper.id],
        )
      }
      selected={selected.includes(paper.id)}
      onSelect={() =>
        setSelected((prev) =>
          prev.includes(paper.id)
            ? prev.filter((id) => id !== paper.id)
            : [...prev, paper.id],
        )
      }
      onOpen={() => setReading(paper)}
    />
  );
  return (
    <div>
      <PageHeader
        title={library ? 'Paper library' : 'Research discovery'}
        description={
          library
            ? 'A considered collection of the ideas that matter.'
            : 'Follow a question. Discover a new perspective.'
        }
      />
      <PreviewNotice phase="02">
        Synthetic papers and metadata · Planned for Phase 02. Search filters
        these examples only. Nothing is fetched or persisted.
      </PreviewNotice>
      {!library ? (
        <AtlasComposer
          context="research"
          onSubmit={(prompt, references) =>
            openAssistant({ prompt, references, context: 'research' })
          }
        />
      ) : null}
      <div className={library ? 'library-layout' : ''}>
        {library ? (
          <aside className="collection-rail" aria-label="Library collections">
            <h2>Collections</h2>
            {[
              ['all', 'All papers'],
              ['To read', 'Reading list'],
              ['Reading', 'Currently reading'],
              ['Read', 'Finished'],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={collection === value}
                onClick={() => setCollection(value ?? 'all')}
              >
                <Library aria-hidden="true" />
                {label}
              </button>
            ))}
            <h3>Tags</h3>
            <button
              onClick={() => setQuery(query ? '' : 'Trust')}
              aria-pressed={query === 'Trust'}
            >
              # Trust
            </button>
            <button
              onClick={() => setQuery(query ? '' : 'Collaboration')}
              aria-pressed={query === 'Collaboration'}
            >
              # Collaboration
            </button>
          </aside>
        ) : null}
        <div className="min-width-zero">
          <div className="collection-toolbar research-filter">
            <Search aria-hidden="true" />
            <label className="sr-only" htmlFor="paper-search">
              Search sample papers
            </label>
            <Input
              id="paper-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles, authors, or keywords…"
            />
            <label className="sr-only" htmlFor="paper-year">
              Publication year
            </label>
            <select
              id="paper-year"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            >
              <option value="all">All years</option>
              {[2025, 2024, 2023].map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
            <label className="sr-only" htmlFor="paper-sort">
              Sort papers
            </label>
            <select
              id="paper-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="relevance">Sample order</option>
              <option value="year">Newest</option>
              <option value="citations">Citation count</option>
            </select>
            {library ? (
              <ViewToggle value={view} onChange={setView} />
            ) : (
              <CapabilityButton title="Scholarly providers" phase="02">
                <SlidersHorizontal data-icon="inline-start" />
                Sources
              </CapabilityButton>
            )}
          </div>
          <Tabs defaultValue="papers">
            <TabsList variant="line" aria-label="Research views">
              <TabsTrigger value="papers">Papers</TabsTrigger>
              <TabsTrigger value="synthesis">AI synthesis</TabsTrigger>
              <TabsTrigger value="sources">Sources</TabsTrigger>
              <TabsTrigger value="saved">
                Saved locally ({saved.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="papers">
              <div className="results-heading">
                <span>{visible.length} illustrative papers</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selected.length < 2}
                  onClick={() => setCompared(true)}
                >
                  Compare selected ({selected.length})
                </Button>
              </div>
              <div className={view === 'Grid' ? 'paper-grid' : 'paper-list'}>
                {visible.map(card)}
              </div>
              {!visible.length ? (
                <EmptyState
                  icon={Search}
                  title="No sample papers match"
                  description="Try another keyword or year. This is a local filter, not a scholarly search."
                >
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQuery('');
                      setYear('all');
                      setCollection('all');
                    }}
                  >
                    Clear filters
                  </Button>
                </EmptyState>
              ) : null}
            </TabsContent>
            <TabsContent value="synthesis">
              <div className="synthesis-intro">
                <Sparkles aria-hidden="true" />
                <h2>From individual papers to a connected picture.</h2>
                <p>
                  Atlas will bring together methods, themes, and open questions
                  with source-level provenance.
                </p>
                <Button
                  onClick={() =>
                    openAssistant({
                      context: 'research',
                      prompt: 'Show the sample synthesis',
                    })
                  }
                >
                  Inspect sample answer
                </Button>
                <PreviewNotice phase="03" />
              </div>
            </TabsContent>
            <TabsContent value="sources">
              <div className="source-card">
                <h2>Source transparency</h2>
                <p>
                  These are authored design fixtures, not indexed publications.
                  Authors, venues, dates, and counts are illustrative. No DOI or
                  source verification is claimed.
                </p>
                <CapabilityButton
                  title="Connect a scholarly provider"
                  phase="02"
                >
                  Connect a provider
                </CapabilityButton>
              </div>
            </TabsContent>
            <TabsContent value="saved">
              {papers.filter((p) => saved.includes(p.id)).map(card)}
              {!saved.length ? (
                <EmptyState
                  icon={Library}
                  title="Your local reading list is empty"
                  description="Save one of the illustrative papers to explore this view. This list resets when this screen unmounts."
                />
              ) : null}
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <Dialog
        open={Boolean(reading)}
        onOpenChange={(open) => {
          if (!open) setReading(null);
        }}
      >
        <DialogContent className="reader-dialog">
          <DialogHeader>
            <DialogTitle>{reading?.title}</DialogTitle>
            <DialogDescription>
              Reading layout preview · synthetic text, not an uploaded or
              ingested PDF.
            </DialogDescription>
          </DialogHeader>
          {reading ? (
            <ReaderPreview paper={reading} onAsk={() => setReading(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={compared} onOpenChange={setCompared}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compare sample papers</DialogTitle>
            <DialogDescription>
              Metadata comparison only. No model analyzed these papers.
            </DialogDescription>
          </DialogHeader>
          <div className="comparison-table">
            <table>
              <caption className="sr-only">
                Selected illustrative papers
              </caption>
              <thead>
                <tr>
                  <th>Paper</th>
                  <th>Year</th>
                  <th>Reading</th>
                </tr>
              </thead>
              <tbody>
                {papers
                  .filter((p) => selected.includes(p.id))
                  .map((p) => (
                    <tr key={p.id}>
                      <th scope="row">{p.title}</th>
                      <td>{p.year}</td>
                      <td>{p.status}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function ReaderPreview({
  paper,
  onAsk,
}: {
  paper: PreviewPaper;
  onAsk: () => void;
}) {
  const { openAssistant } = useAtlas();
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(false);
  return (
    <div className="reader-preview">
      <div className="reader-tools">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous page"
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          <ArrowLeft aria-hidden="true" />
        </Button>
        <span>Page {page} of 3</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next page"
          disabled={page === 3}
          onClick={() => setPage((p) => p + 1)}
        >
          <ArrowRight aria-hidden="true" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Zoom out"
          disabled={zoom === 80}
          onClick={() => setZoom((z) => z - 10)}
        >
          <Minus aria-hidden="true" />
        </Button>
        <span>{zoom}%</span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Zoom in"
          disabled={zoom === 140}
          onClick={() => setZoom((z) => z + 10)}
        >
          <Plus aria-hidden="true" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-pressed={highlight}
          onClick={() => setHighlight((h) => !h)}
        >
          Highlight sample
        </Button>
      </div>
      <label className="sr-only" htmlFor="reader-search">
        Find in sample text
      </label>
      <Input
        id="reader-search"
        placeholder="Find in sample text…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query ? (
        <p role="status">
          {paper.abstract.toLowerCase().includes(query.toLowerCase())
            ? 'Found in abstract on page 1.'
            : 'No matches in this sample.'}
        </p>
      ) : null}
      <div className="reader-body">
        <nav aria-label="Paper outline">
          <strong>Outline</strong>
          {['Abstract', 'Approach', 'Discussion'].map((heading, i) => (
            <button
              key={heading}
              onClick={() => setPage(i + 1)}
              aria-current={page === i + 1 ? 'location' : undefined}
            >
              {heading}
            </button>
          ))}
        </nav>
        <article className="paper-sheet" style={{ fontSize: `${zoom}%` }}>
          <BookOpen aria-hidden="true" />
          <h2>{paper.title}</h2>
          <p className="metadata">{paper.authors} · Synthetic text</p>
          <h3>{['Abstract', 'Approach', 'Discussion'][page - 1]}</h3>
          <p className={highlight ? 'highlighted' : ''}>
            {page === 1
              ? paper.abstract
              : page === 2
                ? 'The approach would specify participants, tasks, and evaluation criteria. This sample contains no real study or results.'
                : 'The limitations and alternative interpretations belong beside the findings. This is a typography and reader layout demonstration.'}
          </p>
          <p>
            Evidence should stay connected to its original context. A future
            reader will preserve page and passage anchors for annotations and AI
            retrieval.
          </p>
        </article>
        <aside>
          <h3>Notes & context</h3>
          <p>Local highlight: {highlight ? 'on' : 'off'}</p>
          <p>DOI unavailable. No real PDF loaded.</p>
          <Button
            size="sm"
            onClick={() => {
              onAsk();
              openAssistant({
                context: 'paper',
                references: [
                  { id: paper.id, kind: 'paper', title: paper.title },
                ],
                prompt: 'Discuss this sample passage',
              });
            }}
          >
            Ask Atlas
          </Button>
          <CapabilityButton title="Add a paper comment" phase="02">
            Add comment
          </CapabilityButton>
        </aside>
      </div>
    </div>
  );
}
