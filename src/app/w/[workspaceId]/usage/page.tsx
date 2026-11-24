import type { Metadata } from "next";
import { WorkspaceUsageScreen } from "@/components/billing-usage";
export const metadata: Metadata = {
  title: "Workspace resources · Atlas Research",
};

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  return <WorkspaceUsageScreen workspaceId={(await params).workspaceId} />;
}
