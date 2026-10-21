'use client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import Link from 'next/link';
import {
  Bell,
  Menu,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
} from 'lucide-react';
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
import { usePathname } from 'next/navigation';
import { AtlasProvider, useAtlas } from '@/features/atlas-ai/atlas-provider';
import type { AssistantContext } from '@/features/atlas-ai/contracts';
import { navigationItems } from './navigation';
import { Sidebar } from './sidebar';
import { SearchDialog } from './search-dialog';
function subscribeSidebar(callback: () => void) {
  window.addEventListener('atlas-sidebar', callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener('atlas-sidebar', callback);
    window.removeEventListener('storage', callback);
  };
}
function sidebarSnapshot() {
  try {
    return localStorage.getItem('atlas-sidebar-collapsed') === 'true';
  } catch {
    return false;
  }
}
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AtlasProvider>
      <ShellFrame>{children}</ShellFrame>
    </AtlasProvider>
  );
}
function ShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const currentPage =
    navigationItems.find((item) => item.href === pathname)?.label ??
    'Workspace';
  const assistantContext: AssistantContext = pathname.endsWith('/documents')
    ? 'document'
    : pathname.endsWith('/tasks')
      ? 'tasks'
      : pathname.endsWith('/research')
        ? 'research'
        : pathname.endsWith('/library')
          ? 'paper'
          : pathname.endsWith('/channels')
            ? 'channel'
            : pathname.endsWith('/manuscripts')
              ? 'manuscript'
              : pathname.endsWith('/experiments')
                ? 'experiment'
                : 'global';
  const { openAssistant, isOpen, closeAssistant } = useAtlas();
  const collapsed = useSyncExternalStore(
    subscribeSidebar,
    sidebarSnapshot,
    () => false,
  );
  const [preferenceError, setPreferenceError] = useState('');
  function toggleSidebar() {
    try {
      localStorage.setItem('atlas-sidebar-collapsed', String(!collapsed));
      window.dispatchEvent(new Event('atlas-sidebar'));
    } catch {
      setPreferenceError(
        'Navigation preference could not be saved in this browser.',
      );
    }
  }

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
    <div className={collapsed ? 'app-shell compact-sidebar' : 'app-shell'}>
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
              <li className="sidebar-toggle">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  aria-expanded={!collapsed}
                  onClick={toggleSidebar}
                >
                  {collapsed ? (
                    <PanelLeftOpen aria-hidden="true" />
                  ) : (
                    <PanelLeftClose aria-hidden="true" />
                  )}
                </Button>
              </li>
              <li>
                <Link href="/app/workspaces/sample">Sample workspace</Link>
              </li>
              <li>
                <ChevronRight aria-hidden="true" />
              </li>
              <li>
                <span aria-current="page">{currentPage}</span>
              </li>
            </ol>
          </nav>
          <div className="header-actions">
            <span className="preview-label">
              <i aria-hidden="true" />
              Design preview
            </span>
            <Button
              variant="ghost"
              size="sm"
              aria-label={isOpen ? 'Collapse Atlas AI' : 'Open Atlas AI'}
              aria-expanded={isOpen}
              onClick={() =>
                isOpen
                  ? closeAssistant()
                  : openAssistant({ context: assistantContext })
              }
            >
              <Sparkles data-icon="inline-start" />
              <span className="assistant-button-label">Ask Atlas</span>
            </Button>
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
          {preferenceError ? <p role="status">{preferenceError}</p> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
