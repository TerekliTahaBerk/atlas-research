import { notFound } from 'next/navigation';
import { modules } from '@/features/shell/navigation';
import { ProjectOverview } from '@/features/projects/project-overview';
import { ModulePreview } from '@/features/projects/module-preview';
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string; module: string }>;
}) {
  const p = await params;
  if (p.projectId !== 'sample') notFound();
  const selectedModule = modules.find((m) => m.slug === p.module);
  if (!selectedModule) notFound();
  return selectedModule.slug === 'overview' ? (
    <ProjectOverview />
  ) : (
    <ModulePreview module={selectedModule} />
  );
}

export const dynamicParams = false;
export function generateStaticParams() {
  return modules.map((item) => ({ projectId: 'sample', module: item.slug }));
}
