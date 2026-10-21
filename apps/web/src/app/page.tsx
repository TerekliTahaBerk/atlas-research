import Link from 'next/link';
import { ArrowUpRight, BookOpen, Network, ShieldCheck } from 'lucide-react';
import { Button } from '@atlas/ui/components/button';
import { ThemeControl } from '@/components/theme-control';
export default function Home() {
  return (
    <div className="public-page">
      <header className="public-header">
        <Link href="/" className="wordmark">
          Atlas
        </Link>
        <div className="header-actions">
          <ThemeControl />
          <Button variant="outline" asChild>
            <Link href="/app">
              Open preview
              <ArrowUpRight data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </header>
      <main className="public-main">
        <h1>
          Research is a journey.
          <br />
          <em>Keep it connected.</em>
        </h1>
        <p>
          A thoughtful home for your papers, ideas, and the work between them.
          Atlas brings the research journey into one shared context.
        </p>
        <Button size="lg" asChild>
          <Link href="/app">
            Explore the workspace
            <ArrowUpRight data-icon="inline-end" />
          </Link>
        </Button>
        <p className="public-disclosure">
          Phase 00 interface preview. No account required.
          <br />
          Research features and authentication are planned.
        </p>
        <div className="public-principles">
          <section>
            <BookOpen aria-hidden="true" />
            <h2>Built around research</h2>
            <p>From the first question to the next discovery.</p>
          </section>
          <section>
            <Network aria-hidden="true" />
            <h2>One connected context</h2>
            <p>A foundation for sources, notes, and collaboration.</p>
          </section>
          <section>
            <ShieldCheck aria-hidden="true" />
            <h2>Private by design</h2>
            <p>Tenant and project boundaries in the architecture.</p>
          </section>
        </div>
      </main>
      <footer className="public-footer">
        Atlas Research OS <span>Foundation · Phase 00</span>
      </footer>
    </div>
  );
}
