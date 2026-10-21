import { redirect, notFound } from 'next/navigation';
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  if ((await params).projectId !== 'sample') notFound();
  redirect('/app/projects/sample/overview');
}

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ projectId: 'sample' }];
}
