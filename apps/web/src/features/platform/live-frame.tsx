import type { ReactNode } from 'react';
import type { PlatformState } from '@atlas/core';
import { AppShell } from '@/features/shell/app-shell';
import { PlatformProvider } from './platform-context';
export function LiveFrame({
  state,
  children,
}: {
  state: PlatformState;
  children: ReactNode;
}) {
  return (
    <PlatformProvider state={state}>
      <AppShell>{children}</AppShell>
    </PlatformProvider>
  );
}
