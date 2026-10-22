import { SkeletonLines } from '@/components/atlas/states';
export default function Loading() {
  return (
    <div className="p-8" role="status" aria-label="Loading workspace">
      <SkeletonLines widths={[40, 92, 80, 60]} />
    </div>
  );
}
