import { notFound } from 'next/navigation';
import {
  settingsSections,
  type SettingsSection,
} from '@/features/shell/navigation';
import { SettingsScreen } from '@/features/settings/settings-screen';
export const metadata = { title: 'Settings' };
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section } = await params;
  const slug = section?.[0] ?? 'appearance';
  if (
    (section && section.length !== 1) ||
    !settingsSections.some((s) => s.slug === slug)
  )
    notFound();
  return <SettingsScreen section={slug as SettingsSection} />;
}
export const dynamicParams = false;
export function generateStaticParams() {
  return [
    { section: [] },
    ...settingsSections.map((s) => ({ section: [s.slug] })),
  ];
}
