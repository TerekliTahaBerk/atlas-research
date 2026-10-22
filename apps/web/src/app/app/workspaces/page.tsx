import { redirect } from 'next/navigation';
import { isLive } from '@/lib/env';
import { pageState } from '@/features/platform/server/pages';
import { LiveFrame } from '@/features/platform/live-frame';
import { LiveHome } from '@/features/platform/live-home';
export default async function Page() {
  if (!isLive()) redirect('/app/workspaces/sample');
  const state = await pageState();
  return (
    <LiveFrame state={state}>
      <LiveHome state={state} workspace />
    </LiveFrame>
  );
}
