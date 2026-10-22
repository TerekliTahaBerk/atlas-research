import { isLive } from '@/lib/env';
import { notFound } from 'next/navigation';
import { DesignSystemScreen } from '@/features/system/design-system-screen';
export const metadata = { title: 'Design system' };
export default function Page() {
  if (isLive()) notFound();
  return <DesignSystemScreen />;
}
