import type { LucideIcon } from 'lucide-react';
import { AlertCircle, LoaderCircle } from 'lucide-react';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@atlas/ui/components/empty';
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from '@atlas/ui/components/alert';
import { Button } from '@atlas/ui/components/button';
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <Empty className="empty-panel">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle role="heading" aria-level={2}>
          {title}
        </EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children ? <EmptyContent>{children}</EmptyContent> : null}
    </Empty>
  );
}
export function ErrorState({ retry }: { retry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>We couldn’t load this view.</AlertTitle>
      <AlertDescription>
        <p>Your work has not been changed. Try loading the view again.</p>
        <Button variant="outline" onClick={retry}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}
export function LoadingIndicator() {
  return (
    <div role="status" className="loading-indicator">
      <LoaderCircle className="animate-spin" aria-hidden="true" />
      <span>Loading workspace…</span>
    </div>
  );
}
