import { CollaborationScreen } from "@/components/collaboration";
export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId: w, projectId: p } = await params;
  return <CollaborationScreen w={w} p={p} mode="discussions" />;
}
