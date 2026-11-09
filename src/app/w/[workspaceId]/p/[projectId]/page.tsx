import { ProjectScreen } from "@/components/project-screen";
export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const p = await params;
  return <ProjectScreen w={p.workspaceId} p={p.projectId} />;
}
