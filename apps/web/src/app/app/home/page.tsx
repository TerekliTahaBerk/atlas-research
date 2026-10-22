import { HomeScreen } from '@/features/home/home-screen';
import { isLive } from '@/lib/env';
import { pageState } from '@/features/platform/server/pages';
import { LiveFrame } from '@/features/platform/live-frame';
import { LiveHome } from '@/features/platform/live-home';
export const metadata = { title: 'Home' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string; cursor?: string }>;
}) {
  if (!isLive()) return <HomeScreen />;
  const params = await searchParams;
  const state = await pageState(params.workspaceId, params.cursor);
  return (
    <LiveFrame state={state}>
      <LiveHome state={state} />
    </LiveFrame>
  );
}
