import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { modules, previewProjectId } from '@/features/shell/navigation';
import { ModuleScreen } from '@/features/shell/module-screen';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const slug = (await params).module;
  return { title: modules.find((m) => m.slug === slug)?.label ?? 'Project' };
}
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string; module: string }>;
}) {
  const p = await params;
  if (p.projectId !== previewProjectId) notFound();
  const selected = modules.find((m) => m.slug === p.module);
  if (!selected) notFound();
  return (
    <Suspense>
      <ModuleScreen slug={selected.slug} />
    </Suspense>
  );
}
export const dynamicParams = false;
export function generateStaticParams() {
  return modules.map((m) => ({ projectId: previewProjectId, module: m.slug }));
}
