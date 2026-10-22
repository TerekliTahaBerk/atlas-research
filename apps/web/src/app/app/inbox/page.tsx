import { isLive } from '@/lib/env';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { InboxScreen } from '@/features/inbox/inbox-screen';
export const metadata = { title: 'Inbox' };
export default function Page() {
  if (isLive()) notFound();
  return (
    <Suspense>
      <InboxScreen />
    </Suspense>
  );
}
