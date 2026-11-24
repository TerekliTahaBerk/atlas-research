import type { Metadata } from "next";
import { ComputeScreen } from "@/components/compute-screen";

export const metadata: Metadata = { title: "Compute · Atlas Research" };

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  return <ComputeScreen workspaceId={workspaceId} projectId={projectId} />;
}
