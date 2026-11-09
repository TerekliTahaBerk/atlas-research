import { DocumentsScreen } from "@/components/documents";
export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId: w, projectId: p } = await params;
  return <DocumentsScreen w={w} p={p} />;
}
