import { Skeleton } from '@atlas/ui/components/skeleton';
import { LoadingIndicator } from '@/components/states';
export default function Loading() {
  return (
    <>
      <LoadingIndicator />
      <Skeleton className="h-12 w-2/3" />
      <Skeleton className="mt-6 h-48 w-full" />
    </>
  );
}
