import { ProjectSettings } from "@/components/project-settings";
export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const p = await params;
  return <ProjectSettings w={p.workspaceId} p={p.projectId} />;
}
