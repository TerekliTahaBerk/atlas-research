import { isLive } from '@/lib/env';
import { Suspense } from 'react';
import { InboxScreen } from '@/features/inbox/inbox-screen';
import { pageState } from '@/features/platform/server/pages';
import { LiveFrame } from '@/features/platform/live-frame';
import { LiveInbox } from '@/features/communication/live-inbox';
export const metadata = { title: 'Inbox' };
export default async function Page() {
  // A04: the live inbox is the persistent, recipient-scoped notification list.
  if (isLive())
    return (
      <LiveFrame state={await pageState()}>
        <LiveInbox />
      </LiveFrame>
    );
  return (
    <Suspense>
      <InboxScreen />
    </Suspense>
  );
}
