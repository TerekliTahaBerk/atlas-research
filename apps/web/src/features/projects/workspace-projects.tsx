'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Folder, ArrowRight } from 'lucide-react';
import { Input } from '@atlas/ui/components/input';
import { Button } from '@atlas/ui/components/button';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/states';
import {
  CreatePreview,
  PreviewNotice,
  ViewToggle,
} from '@/features/preview/primitives';
export function WorkspaceProjects({
  workspace = false,
}: {
  workspace?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState('Grid');
  const visible = 'Human-centered AI Sample project'
    .toLowerCase()
    .includes(query.toLowerCase());
  return (
    <div>
      <div className="module-heading-row">
        <PageHeader
          title={workspace ? 'Sample workspace' : 'Research projects'}
          description={
            workspace
              ? 'A shared place for questions, sources, and the people connecting them.'
              : 'Give a good question a place to grow.'
          }
        />
        <CreatePreview kind="project" />
      </div>
      <PreviewNotice phase="01">
        One sample workspace and project. Creation, membership and permissions
        require Phase 01 services.
      </PreviewNotice>
      <div className="collection-toolbar">
        <Input
          aria-label="Filter projects"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a project…"
        />
        <ViewToggle value={view} onChange={setView} />
      </div>
      {visible ? (
        <div
          className={
            view === 'Grid'
              ? 'project-collection'
              : 'project-collection list-view'
          }
        >
          <Link href="/app/projects/sample/overview" className="project-card">
            <span className="project-monogram">H</span>
            <div>
              <h2>Human-centered AI</h2>
              <p>Understanding how people work with intelligent systems.</p>
              <small>
                <Folder aria-hidden="true" />
                Sample project · 3 synthetic papers · 2 sample notes
              </small>
            </div>
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <EmptyState
          icon={Folder}
          title="No sample projects match"
          description="Clear the filter to return to the sample project. No project search service is connected."
        >
          <Button variant="outline" onClick={() => setQuery('')}>
            Clear filter
          </Button>
        </EmptyState>
      )}
    </div>
  );
}
