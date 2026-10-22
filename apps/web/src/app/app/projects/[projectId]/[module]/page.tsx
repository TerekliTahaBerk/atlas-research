import WorkspaceLoading from '@/features/shell/workspace-loading';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { modules } from '@/features/shell/navigation';
import { ModuleScreen } from '@/features/shell/module-screen';
import { isLive } from '@/lib/env';
import {
  pageActor,
  pageProject,
  pageState,
} from '@/features/platform/server/pages';
import { members } from '@/features/platform/server/services';
import { LiveFrame } from '@/features/platform/live-frame';
import { LiveProject } from '@/features/platform/live-project';
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
  const selected = modules.find((m) => m.slug === p.module);
  if (!selected) notFound();
  if (!isLive()) {
    if (p.projectId !== 'sample') notFound();
    return (
      <Suspense fallback={<WorkspaceLoading />}>
        <ModuleScreen slug={selected.slug} />
      </Suspense>
    );
  }
  const project = await pageProject(p.projectId);
  const state = await pageState(project.workspaceId);
  if (!state.projects.some((p) => p.id === project.id))
    state.projects.push(project);
  const initialMembers = project.capabilities.includes('project.read')
    ? await members(await pageActor(), 'project', project.id)
    : [];
  return (
    <LiveFrame state={state}>
      <LiveProject
        project={project}
        initialMembers={initialMembers}
        module={selected.slug}
      />
    </LiveFrame>
  );
}
