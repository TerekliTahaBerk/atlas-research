import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Button } from '@atlas/ui/components/button';
export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  if ((await params).workspaceId !== 'sample') notFound();
  return (
    <>
      <PageHeader
        title="Sample workspace"
        description="An interface preview of a personal research workspace. Workspace creation and membership arrive in Phase 01."
      />
      <Button asChild>
        <Link href="/app/workspaces/sample/projects">Explore projects</Link>
      </Button>
    </>
  );
}

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ workspaceId: 'sample' }];
}
