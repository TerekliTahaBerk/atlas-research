import { notFound } from 'next/navigation';
import { WorkspaceProjects } from '@/features/projects/workspace-projects';
export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  if ((await params).workspaceId !== 'sample') notFound();
  return <WorkspaceProjects workspace />;
}
export const dynamicParams = false;
export function generateStaticParams() {
  return [{ workspaceId: 'sample' }];
}
