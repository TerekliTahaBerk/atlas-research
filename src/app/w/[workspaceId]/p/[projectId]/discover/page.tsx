import { redirect } from "next/navigation";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await params,
    incoming = await searchParams,
    q = new URLSearchParams();
  for (const [key, value] of Object.entries(incoming))
    if (typeof value === "string") q.set(key, value);
  q.set("view", "discover");
  redirect(`/w/${p.workspaceId}/p/${p.projectId}/sources?${q}`);
}
