import { DocumentsScreen } from "@/components/documents";
export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string; id: string }>;
}) {
  const { workspaceId: w, projectId: p, id } = await params;
  return <DocumentsScreen w={w} p={p} id={id} />;
}
