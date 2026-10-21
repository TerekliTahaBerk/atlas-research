'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowRight,
  FileText,
  BookOpen,
  Circle,
  Folder,
  CircleCheck,
} from 'lucide-react';
import { Button } from '@atlas/ui/components/button';
import { AtlasComposer } from '@/features/atlas-ai/atlas-composer';
import { useAtlas } from '@/features/atlas-ai/atlas-provider';
import {
  CreatePreview,
  SectionHeading,
  ViewToggle,
} from '@/features/preview/primitives';
import { documentSamples, taskSamples } from '@/features/preview/fixtures';
export function ProjectOverview() {
  const { openAssistant } = useAtlas();
  const [view, setView] = useState('Grid');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const docs = documentSamples
    .filter((doc) => doc.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (sort === 'title' ? a.title.localeCompare(b.title) : 0));
  return (
    <div className="home-screen">
      <header className="home-heading">
        <div>
          <h1>A place for your next discovery.</h1>
          <p>Pick up a thought. Follow a question. Make something new.</p>
        </div>
        <CreatePreview kind="document" />
      </header>
      <AtlasComposer
        onSubmit={(prompt, references) => openAssistant({ prompt, references })}
      />
      <div className="quick-actions">
        <Button variant="outline" asChild>
          <Link href="/app/projects/sample/research">
            <BookOpen data-icon="inline-start" />
            Find papers
            <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            openAssistant({ prompt: '/summarize', context: 'paper' })
          }
        >
          <FileText data-icon="inline-start" />
          Summarize a source
          <ArrowRight data-icon="inline-end" />
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            openAssistant({ prompt: '/create-task', context: 'tasks' })
          }
        >
          <CircleCheck data-icon="inline-start" />
          Plan research
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
      <SectionHeading title="Continue working">
        <Link className="quiet-link" href="/app/projects/sample/documents">
          View all <ArrowRight aria-hidden="true" />
        </Link>
      </SectionHeading>
      <div className="collection-toolbar">
        <label className="sr-only" htmlFor="home-filter">
          Filter recent documents
        </label>
        <input
          id="home-filter"
          className="quiet-input"
          placeholder="Filter recent documents…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="sr-only" htmlFor="home-sort">
          Sort documents
        </label>
        <select
          id="home-sort"
          className="quiet-select"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="recent">Last edited</option>
          <option value="title">Title A–Z</option>
        </select>
        <ViewToggle value={view} onChange={setView} />
      </div>
      <div
        className={
          view === 'Grid' ? 'document-cards' : 'document-cards list-view'
        }
      >
        {docs.map((doc) => (
          <Link
            key={doc.id}
            href={`/app/projects/sample/documents?note=${doc.id}`}
            className="document-card"
          >
            <span className="document-glyph">
              <FileText aria-hidden="true" />
            </span>
            <div>
              <h3>{doc.title}</h3>
              <p className="metadata">Sample document · {doc.edited}</p>
              <p>{doc.description}</p>
            </div>
            <ArrowRight aria-hidden="true" />
          </Link>
        ))}
        {!docs.length ? (
          <p className="empty-inline" role="status">
            No recent documents match. Clear the filter to return to your work.
          </p>
        ) : null}
      </div>
      <div className="home-lower">
        <section>
          <SectionHeading title="Your projects">
            <Link className="quiet-link" href="/app/workspaces/sample/projects">
              View all <ArrowRight aria-hidden="true" />
            </Link>
          </SectionHeading>
          <Link href="/app/projects/sample/research" className="project-card">
            <span className="project-monogram">H</span>
            <div>
              <h3>Human-centered AI</h3>
              <p>Understanding how people work with intelligent systems.</p>
              <small>
                <Folder aria-hidden="true" />
                Sample project · 3 papers · 2 notes
              </small>
            </div>
          </Link>
        </section>
        <section>
          <SectionHeading title="Up next">
            <Link className="quiet-link" href="/app/projects/sample/tasks">
              View all <ArrowRight aria-hidden="true" />
            </Link>
          </SectionHeading>
          <div className="up-next">
            {taskSamples.slice(0, 2).map((task) => (
              <Link key={task.id} href="/app/projects/sample/tasks">
                <Circle aria-hidden="true" />
                <span>
                  {task.title}
                  <small>{task.due}</small>
                </span>
                <ArrowRight aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      </div>
      <section className="connected-desk">
        <div>
          <h2>A connected research desk</h2>
          <p>Move from reading to thinking to doing, all in one place.</p>
        </div>
        <div className="artifact-links">
          <Link href="/app/projects/sample/library">
            <BookOpen aria-hidden="true" />
            Paper
          </Link>
          <ArrowRight aria-hidden="true" />
          <Link href="/app/projects/sample/documents">
            <FileText aria-hidden="true" />
            Note
          </Link>
          <ArrowRight aria-hidden="true" />
          <Link href="/app/projects/sample/tasks">
            <CircleCheck aria-hidden="true" />
            Task
          </Link>
        </div>
      </section>
      <footer className="preview-footer">
        No research data is stored in this preview.
      </footer>
    </div>
  );
}
