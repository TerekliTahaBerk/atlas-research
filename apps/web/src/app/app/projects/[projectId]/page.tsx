import { notFound, redirect } from 'next/navigation';
import { moduleHref, previewProjectId } from '@/features/shell/navigation';
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  if ((await params).projectId !== previewProjectId) notFound();
  redirect(moduleHref('overview'));
}
export const dynamicParams = false;
export function generateStaticParams() {
  return [{ projectId: previewProjectId }];
}
