'use client';
import { useCallback, useSyncExternalStore } from 'react';
/** SSR-safe media query subscription (server snapshot: no match). */
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (callback: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener?.('change', callback);
      return () => media.removeEventListener?.('change', callback);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
const noopSubscribe = () => () => {};
/**
 * False during SSR and hydration, true afterwards. Gate markup that depends
 * on client-only state (e.g. the stored theme) to avoid hydration mismatches.
 */
export function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
