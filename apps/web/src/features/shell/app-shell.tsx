'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, Menu, ChevronRight } from 'lucide-react';
import { Button } from '@atlas/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@atlas/ui/components/dialog';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@atlas/ui/components/tooltip';
import { ThemeControl } from '@/components/theme-control';
import { Sidebar } from './sidebar';
import { SearchDialog } from './search-dialog';
export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const openSearch = useCallback(() => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setSearchOpen(true);
  }, []);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (searchOpen) setSearchOpen(false);
        else openSearch();
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [searchOpen, openSearch]);
  function restoreSearchFocus() {
    const target = returnFocusRef.current;
    if (target?.isConnected && target.getClientRects().length) target.focus();
    else mobileTriggerRef.current?.focus();
  }
  return (
    <div className="app-shell">
      <SearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onNavigate={() => setMobileOpen(false)}
        returnFocus={restoreSearchFocus}
      />
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="desktop-sidebar" aria-label="Workspace sidebar">
        <Sidebar onSearch={openSearch} />
      </aside>
      <div className="workspace-content">
        <header className="topbar">
          <div className="mobile-menu">
            <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open navigation"
                  ref={mobileTriggerRef}
                >
                  <Menu aria-hidden="true" />
                </Button>
              </DialogTrigger>
              <DialogContent className="mobile-sidebar translate-x-0 translate-y-0">
                <DialogHeader className="sr-only">
                  <DialogTitle>Workspace navigation</DialogTitle>
                  <DialogDescription>
                    Navigate the sample workspace and project.
                  </DialogDescription>
                </DialogHeader>
                <Sidebar
                  onNavigate={() => setMobileOpen(false)}
                  onSearch={openSearch}
                />
              </DialogContent>
            </Dialog>
          </div>
          <nav aria-label="Breadcrumb">
            <ol className="breadcrumbs">
              <li>
                <Link href="/app/workspaces/sample">Sample workspace</Link>
              </li>
              <li>
                <ChevronRight aria-hidden="true" />
              </li>
              <li>
                <Link href="/app/projects/sample/overview">Sample project</Link>
              </li>
            </ol>
          </nav>
          <div className="header-actions">
            <Dialog>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Notifications"
                    >
                      <Bell aria-hidden="true" />
                    </Button>
                  </DialogTrigger>
                </TooltipTrigger>
                <TooltipContent>Notifications</TooltipContent>
              </Tooltip>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Notifications</DialogTitle>
                  <DialogDescription>
                    Notifications will arrive with the communication hub in
                    Phase 05. This preview has no notification service.
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
            <ThemeControl />
          </div>
        </header>
        <main id="main-content" className="page-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
