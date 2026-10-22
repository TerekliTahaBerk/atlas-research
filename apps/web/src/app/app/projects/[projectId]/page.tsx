import { notFound, redirect } from 'next/navigation';
import { isLive } from '@/lib/env';
import { pageProject } from '@/features/platform/server/pages';
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  if (isLive()) {
    await pageProject(projectId);
  } else if (projectId !== 'sample') notFound();
  redirect(`/app/projects/${projectId}/overview`);
}
