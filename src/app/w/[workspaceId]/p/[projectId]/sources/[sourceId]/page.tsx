import { redirect } from "next/navigation";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; projectId: string; sourceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await params,
    q = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams))
    if (typeof value === "string") q.set(key, value);
  q.set("source", p.sourceId);
  redirect(`/w/${p.workspaceId}/p/${p.projectId}/sources?${q}`);
}
