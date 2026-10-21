import Link from 'next/link';
import { Compass } from 'lucide-react';
import { Button } from '@atlas/ui/components/button';
import { EmptyState } from '@/components/states';
export default function NotFound() {
  return (
    <main className="not-found">
      <h1 className="sr-only">Page not found</h1>
      <EmptyState
        icon={Compass}
        title="This path is still unexplored"
        description="We couldn’t find that page. Return to the sample workspace to keep exploring."
      >
        <Button asChild>
          <Link href="/app">Back to workspace</Link>
        </Button>
      </EmptyState>
    </main>
  );
}
