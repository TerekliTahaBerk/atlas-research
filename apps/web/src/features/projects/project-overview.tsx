import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  FileText,
  CircleCheck,
  Sprout,
  MessagesSquare,
} from 'lucide-react';
import { Button } from '@atlas/ui/components/button';
import { Badge } from '@atlas/ui/components/badge';
import { PageHeader } from '@/components/page-header';
const entries = [
  {
    title: 'Paper library',
    description: 'Collect and organise relevant papers.',
    href: 'library',
    icon: BookOpen,
  },
  {
    title: 'Documents & notes',
    description: 'Capture your ideas and write.',
    href: 'documents',
    icon: FileText,
  },
  {
    title: 'Research tasks',
    description: 'Keep track of your progress.',
    href: 'tasks',
    icon: CircleCheck,
  },
];
export function ProjectOverview() {
  return (
    <>
      <PageHeader
        title="A place for your next discovery."
        description="Connect your sources, ideas, and research. This is a sample project in the Phase 00 interface preview."
      />
      <section className="welcome-panel" aria-labelledby="welcome-heading">
        <div className="seed-icon">
          <Sprout aria-hidden="true" />
        </div>
        <div>
          <h2 id="welcome-heading">Research begins with a good question.</h2>
          <p>
            Your project is a blank canvas. Explore the workspace foundation.
          </p>
        </div>
        <Button asChild>
          <Link href="/app/projects/sample/library">
            Explore paper library
            <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </section>
      <div className="overview-columns">
        <section aria-labelledby="research-heading">
          <h2 id="research-heading">Your research workspace</h2>
          <div className="research-rows">
            {entries.map((e) => (
              <Link
                key={e.href}
                className="research-row"
                href={`/app/projects/sample/${e.href}`}
              >
                <span className="row-icon">
                  <e.icon aria-hidden="true" />
                </span>
                <span>
                  <h3>{e.title}</h3>
                  <p>{e.description}</p>
                </span>
                <Badge variant="secondary">Planned</Badge>
              </Link>
            ))}
          </div>
        </section>
        <section className="project-details" aria-labelledby="details-heading">
          <h2 id="details-heading">Project details</h2>
          <dl>
            {[
              ['Name', 'Sample project'],
              ['Workspace', 'Sample workspace'],
              ['Access', 'Preview only'],
              ['Phase', 'Foundation'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      <section className="connected-panel">
        <div>
          <h2>Connected by design</h2>
          <p>
            Papers, notes, tasks, and conversations will share one research
            context.
          </p>
        </div>
        <div className="artifact-network" aria-hidden="true">
          <span>
            <BookOpen />
          </span>
          <i />
          <span>
            <FileText />
          </span>
          <i />
          <span>
            <CircleCheck />
          </span>
          <i />
          <span>
            <MessagesSquare />
          </span>
        </div>
      </section>
      <footer className="preview-footer">
        No research data is stored in this preview.
      </footer>
    </>
  );
}
