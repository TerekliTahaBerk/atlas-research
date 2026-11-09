import { CollaborationScreen } from "@/components/collaboration";
export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string; id: string }>;
}) {
  const { workspaceId: w, projectId: p, id } = await params;
  return <CollaborationScreen w={w} p={p} mode="tasks" id={id} />;
}
