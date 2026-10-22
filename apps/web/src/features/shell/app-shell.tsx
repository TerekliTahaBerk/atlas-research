'use client';
import { useEffect, type ReactNode } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { cn } from '@atlas/ui/lib/utils';
import { AtlasProvider, useAtlas } from '@/features/atlas-ai/atlas-provider';
import { AtlasLayer } from '@/features/atlas-ai/atlas-surface';
import { PricingDialog } from '@/features/overlays/pricing-dialog';
import { CommandPalette } from './command-palette';
import { PreviewStoreProvider } from './preview-store';
import { ShellProvider, useShell } from './shell-context';
import { ShortcutsDialog } from './shortcuts-dialog';
import { Sidebar } from './sidebar';
/**
 * Application shell (handoff `AppShell`): 216px sidebar on --sb, inset main
 * canvas (6px margin, 10px radius), shell-level Atlas layer and overlays.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ShellProvider>
      <PreviewStoreProvider>
        <AtlasProvider>
          <ShellFrame>{children}</ShellFrame>
        </AtlasProvider>
      </PreviewStoreProvider>
    </ShellProvider>
  );
}
function ShellFrame({ children }: { children: ReactNode }) {
  const shell = useShell();
  const atlas = useAtlas();
  const { mode: atlasMode, setMode: setAtlasMode } = atlas;
  const {
    setSearchOpen,
    setShortcutsOpen,
    toggleSidebar,
    searchOpen,
    openSearch,
  } = shell;
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      const mod = event.metaKey || event.ctrlKey;
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');
      if (mod && key === 'k') {
        if (
          document.querySelector(
            '[role="dialog"][data-state="open"]:not([data-atlas-focus])',
          ) &&
          !shell.drawerOpen &&
          !searchOpen
        )
          return;
        event.preventDefault();
        if (searchOpen) setSearchOpen(false);
        else {
          if (atlasMode === 'focus') setAtlasMode('compact');
          openSearch();
        }
      } else if (mod && key === '\\') {
        event.preventDefault();
        toggleSidebar();
      } else if (key === '?' && !typing && !mod) {
        setShortcutsOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    atlasMode,
    setAtlasMode,
    shell.drawerOpen,
    openSearch,
    searchOpen,
    setSearchOpen,
    setShortcutsOpen,
    toggleSidebar,
  ]);
  const sidebarVisible = !shell.narrow && !shell.sidebarCollapsed;
  const panel = atlas.mode === 'panel' && !shell.narrow;
  return (
    <div className="fixed inset-0 flex overflow-hidden bg-sb text-tx">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {sidebarVisible ? (
        <aside
          aria-label="Sidebar"
          className="relative z-[45] w-[216px] shrink-0"
        >
          <Sidebar />
        </aside>
      ) : null}
      <DialogPrimitive.Root
        open={shell.drawerOpen}
        onOpenChange={shell.setDrawerOpen}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[44] animate-atlas-fade bg-dim" />
          <DialogPrimitive.Content
            className="fixed inset-y-0 left-0 z-[45] w-[280px] max-w-[85vw] shadow-pop outline-none data-[state=open]:animate-atlas-fade"
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              shell.toggleRef.current?.focus();
            }}
          >
            <DialogPrimitive.Title className="sr-only">
              Workspace navigation
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Navigate the sample workspace and project.
            </DialogPrimitive.Description>
            <Sidebar drawer onNavigate={() => shell.setDrawerOpen(false)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          'atlas-canvas aic-pad relative my-1.5 flex min-w-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-bd2 bg-canvas outline-none transition-[margin] duration-200',
          sidebarVisible ? 'ml-0' : 'ml-1.5',
          panel ? 'mr-[392px]' : 'mr-1.5',
        )}
      >
        {shell.preferenceError ? (
          <p role="status" className="px-4 py-1 text-xs text-warn">
            {shell.preferenceError}
          </p>
        ) : null}
        {children}
      </main>
      <AtlasLayer />
      <CommandPalette
        open={shell.searchOpen}
        onOpenChange={setSearchOpen}
        returnFocus={() => {
          const el = shell.searchReturn.current;
          if (el?.isConnected && el.getClientRects().length) el.focus();
          else shell.toggleRef.current?.focus();
        }}
      />
      <PricingDialog
        open={shell.pricingOpen}
        onOpenChange={shell.setPricingOpen}
      />
      <ShortcutsDialog
        open={shell.shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />
    </div>
  );
}
