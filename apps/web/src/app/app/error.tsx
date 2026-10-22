'use client';
import { Btn } from '@/components/atlas/button';
import { ErrorBanner } from '@/components/atlas/states';
export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="p-8">
      <ErrorBanner
        title="We couldn’t load this view."
        action={
          <Btn variant="outline" size="md" onClick={reset}>
            Try again
          </Btn>
        }
      >
        Your work has not been changed. Try loading the view again.
      </ErrorBanner>
    </div>
  );
}
