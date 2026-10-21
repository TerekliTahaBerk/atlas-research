import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Folder, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  if ((await params).workspaceId !== 'sample') notFound();
  return (
    <>
      <PageHeader
        title="Research projects"
        description="Projects bring related sources, documents, and people together. The project below is sample interface content."
      />
      <Link className="research-row" href="/app/projects/sample/overview">
        <span className="row-icon">
          <Folder aria-hidden="true" />
        </span>
        <span>
          <h2>Sample project</h2>
          <p>Explore the Phase 00 foundation.</p>
        </span>
        <ArrowRight aria-hidden="true" />
      </Link>
    </>
  );
}

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ workspaceId: 'sample' }];
}
