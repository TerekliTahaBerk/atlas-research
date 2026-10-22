import { notFound } from 'next/navigation';
import { WorkspaceProjects } from '@/features/home/workspace-projects';
export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  if ((await params).workspaceId !== 'sample') notFound();
  return <WorkspaceProjects />;
}
export const dynamicParams = false;
export function generateStaticParams() {
  return [{ workspaceId: 'sample' }];
}
