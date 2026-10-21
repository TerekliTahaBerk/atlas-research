import { notFound } from 'next/navigation';
import { Settings } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/states';
import { ThemeControl } from '@/components/theme-control';
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section } = await params;
  if (
    section &&
    (section.length !== 1 ||
      !['profile', 'workspace'].includes(section[0] ?? ''))
  )
    notFound();
  return (
    <>
      <PageHeader
        title="Workspace settings"
        description="Make room for the way you work."
      />
      <div className="settings-appearance">
        <div>
          <h2>Appearance</h2>
          <p>
            Choose light, dark, or follow your system. Saved in this browser.
          </p>
        </div>
        <ThemeControl />
      </div>
      <EmptyState
        icon={Settings}
        title="Your preferences, in one place"
        description="Profile, membership, and workspace settings arrive in Phase 01. This preview does not create or update an account."
      />
    </>
  );
}

export const dynamicParams = false;
export function generateStaticParams() {
  return [
    { section: [] },
    { section: ['profile'] },
    { section: ['workspace'] },
  ];
}
