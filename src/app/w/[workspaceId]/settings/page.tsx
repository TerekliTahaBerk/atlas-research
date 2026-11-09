import { SettingsScreen } from "@/components/settings-screen";
export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  return <SettingsScreen workspaceId={(await params).workspaceId} />;
}
