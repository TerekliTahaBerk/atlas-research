import { isLive } from '@/lib/env';
import { notFound } from 'next/navigation';
import { MobileScreens } from '@/features/system/mobile-screens';
export const metadata = { title: 'Mobile screens' };
export default function Page() {
  if (isLive()) notFound();
  return <MobileScreens />;
}
