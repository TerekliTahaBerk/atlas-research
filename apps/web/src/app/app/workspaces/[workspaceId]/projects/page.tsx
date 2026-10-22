import { notFound } from 'next/navigation';
import { z } from 'zod';
import { isLive } from '@/lib/env';
import { WorkspaceProjects } from '@/features/home/workspace-projects';
import { pageState } from '@/features/platform/server/pages';
import { LiveFrame } from '@/features/platform/live-frame';
import { LiveHome } from '@/features/platform/live-home';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { workspaceId } = await params;
  if (!isLive()) {
    if (workspaceId !== 'sample') notFound();
    return <WorkspaceProjects workspace />;
  }
  if (!z.uuid().safeParse(workspaceId).success) notFound();
  const state = await pageState(workspaceId, (await searchParams).cursor);
  return (
    <LiveFrame state={state}>
      <LiveHome state={state} workspace />
    </LiveFrame>
  );
}
