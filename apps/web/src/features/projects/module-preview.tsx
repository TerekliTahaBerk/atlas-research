import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@atlas/ui/components/button';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/states';
import { modules } from '@/features/shell/navigation';
export function ModulePreview({
  module,
}: {
  module: (typeof modules)[number];
}) {
  return (
    <>
      <PageHeader title={module.label} description={module.description} />
      <EmptyState
        icon={module.icon}
        title={`Your ${module.label.toLowerCase()} starts here`}
        description={`Planned for Phase ${module.phase}. This screen demonstrates navigation and layout. No ${module.slug === 'ai' ? 'AI requests are made' : 'research data is loaded or stored'}.`}
      >
        <Button variant="outline" asChild>
          <Link href="/app/projects/sample/overview">
            <ArrowLeft data-icon="inline-start" />
            Back to overview
          </Link>
        </Button>
      </EmptyState>
    </>
  );
}
