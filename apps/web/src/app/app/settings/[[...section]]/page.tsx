import { isLive } from '@/lib/env';
import { pageActor, pageState } from '@/features/platform/server/pages';
import { members } from '@/features/platform/server/services';
import { LiveFrame } from '@/features/platform/live-frame';
import { LiveSettings } from '@/features/platform/live-settings';
import { notFound } from 'next/navigation';
import {
  settingsSections,
  type SettingsSection,
} from '@/features/shell/navigation';
import { SettingsScreen } from '@/features/settings/settings-screen';
export const metadata = { title: 'Settings' };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<{ workspaceId?: string; organizationId?: string }>;
}) {
  const { section } = await params;
  const slug = section?.[0] ?? 'appearance';
  if (
    (section && section.length !== 1) ||
    !settingsSections.some((s) => s.slug === slug)
  )
    notFound();
  if (isLive()) {
    const search = await searchParams;
    const state = await pageState(
      search.workspaceId,
      undefined,
      search.organizationId,
    );
    const actor = await pageActor();
    const ws = state.workspaces.find((w) => w.id === state.workspaceId);
    const org =
      state.organizations.find((o) => o.id === state.organizationId) ??
      state.organizations[0];
    const [orgMembers, workspaceMembers] = await Promise.all([
      org ? members(actor, 'organization', org.id) : [],
      ws ? members(actor, 'workspace', ws.id) : [],
    ]);
    return (
      <LiveFrame state={state}>
        <LiveSettings
          state={state}
          section={slug}
          orgMembers={orgMembers}
          workspaceMembers={workspaceMembers}
        />
      </LiveFrame>
    );
  }
  return <SettingsScreen section={slug as SettingsSection} />;
}
