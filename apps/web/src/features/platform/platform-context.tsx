'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { z } from 'zod';
import { useToast } from '@/components/atlas/toast';
import { requestData } from './client';
import { createContext, useContext, type ReactNode } from 'react';
import type { PlatformState } from '@atlas/core';
const PlatformContext = createContext<PlatformState | null>(null);
export function PlatformProvider({
  state,
  children,
}: {
  state: PlatformState;
  children: ReactNode;
}) {
  const path = usePathname();
  const flash = useToast();
  const projectId = path?.match(
    /^\/app\/projects\/([0-9a-f-]{36})(?:\/|$)/,
  )?.[1];
  const actorId = state.profile?.id;
  const workspaceId = state.workspaceId;
  useEffect(() => {
    if (!actorId || !workspaceId) return;
    let active = true;
    requestData('/api/v1/context', z.object({ selected: z.literal(true) }), {
      workspaceId,
      ...(projectId ? { projectId } : {}),
    }).catch(() => {
      if (active)
        flash(
          'Unable to save the navigation preference. Reopen the workspace to retry.',
        );
    });
    return () => {
      active = false;
    };
  }, [actorId, workspaceId, projectId, flash]);
  return (
    <PlatformContext.Provider value={state}>
      {children}
    </PlatformContext.Provider>
  );
}
export function usePlatform() {
  const value = useContext(PlatformContext);
  if (!value) throw new Error('Live platform data is required.');
  return value;
}
export function usePlatformOptional() {
  return useContext(PlatformContext);
}
