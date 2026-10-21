import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
export default function Page() {
  return (
    <div className="reading-layout">
      <PageHeader
        title="Make yourself at home."
        description="A few simple ways to move through Atlas."
      />
      <div className="help-content">
        <h2>Stay in context</h2>
        <p>
          Cmd/Ctrl + K opens navigation. Escape dismisses a picker or overlay.
          In a composer, @ opens sample artifact references and / opens commands
          for that context.
        </p>
        <h2>Explore the design</h2>
        <p>
          <Link href="/login">Sign in preview</Link> ·{' '}
          <Link href="/register">Sign up preview</Link> ·{' '}
          <Link href="/reset-password">Recovery preview</Link> ·{' '}
          <Link href="/onboarding">Onboarding walkthrough</Link>
        </p>
        <h2>What is saved?</h2>
        <p>
          Only appearance and sidebar preferences are stored in your browser.
          Documents, messages, tasks, and sample reading lists are in-memory
          demonstrations and reset when you leave their screen. Do not enter
          private research into this public preview.
        </p>
        <h2>What comes next?</h2>
        <p>
          Identity and authorization in Phase 01; discovery and lawful reading
          in Phase 02; evidence-grounded AI in Phase 03; persisted notes and
          tasks in Phase 04; team communication in Phase 05. Compilation and
          execution require a separate Phase 07 security design.
        </p>
      </div>
    </div>
  );
}
