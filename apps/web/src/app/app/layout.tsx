import { AppShell } from '@/features/shell/app-shell';
import { isLive } from '@/lib/env';
import { pageActor } from '@/features/platform/server/pages';
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (isLive()) {
    await pageActor();
    return children;
  }
  return <AppShell>{children}</AppShell>;
}
