'use client';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useMediaQuery } from './use-media';
/**
 * Shell-wide UI state. Only the sidebar visibility persists (a navigation
 * preference under the existing `atlas-sidebar-collapsed` key).
 */
const SIDEBAR_KEY = 'atlas-sidebar-collapsed';
function subscribe(callback: () => void) {
  window.addEventListener('atlas-sidebar', callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener('atlas-sidebar', callback);
    window.removeEventListener('storage', callback);
  };
}
function snapshot() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'true';
  } catch {
    return false;
  }
}
interface ShellApi {
  narrow: boolean;
  sidebarCollapsed: boolean;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  toggleRef: React.RefObject<HTMLButtonElement | null>;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  /** Opens ⌘K and remembers the element to restore focus to. */
  openSearch: () => void;
  searchReturn: React.RefObject<HTMLElement | null>;
  pricingOpen: boolean;
  setPricingOpen: (open: boolean) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  preferenceError: string;
}
const ShellContext = createContext<ShellApi | null>(null);
export function ShellProvider({ children }: { children: ReactNode }) {
  const narrow = useMediaQuery('(max-width: 899px)');
  const sidebarCollapsed = useSyncExternalStore(
    subscribe,
    snapshot,
    () => false,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [preferenceError, setPreferenceError] = useState('');
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const searchReturn = useRef<HTMLElement | null>(null);
  const openSearch = useCallback(() => {
    searchReturn.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    // The palette replaces the mobile drawer rather than stacking on it.
    setDrawerOpen(false);
    setSearchOpen(true);
  }, []);
  const toggleSidebar = useCallback(() => {
    if (narrow) {
      setDrawerOpen((o) => !o);
      return;
    }
    try {
      localStorage.setItem(SIDEBAR_KEY, String(!snapshot()));
      window.dispatchEvent(new Event('atlas-sidebar'));
    } catch {
      setPreferenceError(
        'Navigation preference could not be saved in this browser.',
      );
    }
  }, [narrow]);
  const value = useMemo<ShellApi>(
    () => ({
      narrow,
      sidebarCollapsed,
      drawerOpen: narrow && drawerOpen,
      setDrawerOpen,
      toggleSidebar,
      toggleRef,
      searchOpen,
      setSearchOpen,
      openSearch,
      searchReturn,
      pricingOpen,
      setPricingOpen,
      shortcutsOpen,
      setShortcutsOpen,
      preferenceError,
    }),
    [
      drawerOpen,
      narrow,
      openSearch,
      preferenceError,
      pricingOpen,
      searchOpen,
      shortcutsOpen,
      sidebarCollapsed,
      toggleSidebar,
    ],
  );
  return (
    <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
  );
}
const fallback: ShellApi = {
  narrow: false,
  sidebarCollapsed: false,
  drawerOpen: false,
  setDrawerOpen: () => {},
  toggleSidebar: () => {},
  toggleRef: { current: null },
  searchOpen: false,
  setSearchOpen: () => {},
  openSearch: () => {},
  searchReturn: { current: null },
  pricingOpen: false,
  setPricingOpen: () => {},
  shortcutsOpen: false,
  setShortcutsOpen: () => {},
  preferenceError: '',
};
export function useShell() {
  return useContext(ShellContext) ?? fallback;
}
