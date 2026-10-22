import Link from 'next/link';
import { Compass } from 'lucide-react';
import { btnVariants } from '@/components/atlas/button';
import { EmptyState } from '@/components/atlas/states';
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas p-6">
      <h1 className="sr-only">Page not found</h1>
      <EmptyState
        icon={Compass}
        title="This path is still unexplored"
        description="We couldn’t find that page. Return to the sample workspace to keep exploring."
      >
        <Link
          href="/app"
          className={btnVariants({ variant: 'primary', size: 'lg' })}
        >
          Back to workspace
        </Link>
      </EmptyState>
    </main>
  );
}
