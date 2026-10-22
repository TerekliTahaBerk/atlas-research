'use client';
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
