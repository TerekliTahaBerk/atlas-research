'use client';
import type { ReactNode } from 'react';
import { PanelLeft } from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import { useShell } from './shell-context';
/** Toggles the desktop sidebar, or opens the drawer under 900px. */
export function SidebarToggle() {
  const { narrow, sidebarCollapsed, drawerOpen, toggleSidebar, toggleRef } =
    useShell();
  const label = narrow
    ? 'Open navigation'
    : sidebarCollapsed
      ? 'Expand sidebar'
      : 'Collapse sidebar';
  return (
    <button
      ref={toggleRef}
      type="button"
      aria-label={label}
      title={`${label} (⌘\\)`}
      aria-expanded={narrow ? drawerOpen : !sidebarCollapsed}
      onClick={toggleSidebar}
      className="grid size-7 shrink-0 place-items-center rounded-md text-tx2 hover:bg-hov hover:text-tx"
    >
      <PanelLeft aria-hidden="true" className="size-4" />
    </button>
  );
}
/** 48px contextual header (handoff §3). Centre stays free for the composer. */
export function Topbar({
  children,
  actions,
  bordered = false,
  toggle = true,
  className,
}: {
  children?: ReactNode;
  actions?: ReactNode;
  bordered?: boolean;
  toggle?: boolean;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex h-12 shrink-0 items-center gap-2 px-3',
        bordered && 'border-b border-bd2',
        className,
      )}
    >
      {toggle ? <SidebarToggle /> : null}
      {children}
      <div className="min-w-0 flex-1" />
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
/** "Parent /" + current title crumb. The h1 keeps a compact visual size. */
export function Crumb({
  parent,
  title,
  mono = false,
  as: Tag = 'h1',
}: {
  parent?: string;
  title: string;
  mono?: boolean;
  as?: 'h1' | 'span';
}) {
  return (
    <div className="flex min-w-0 items-center gap-1 text-ui">
      {parent ? (
        <span className="hidden shrink-0 whitespace-nowrap text-tx3 sm:inline">
          {parent} /
        </span>
      ) : null}
      <Tag className={cn('min-w-0 truncate font-medium', mono && 'font-mono')}>
        {title}
      </Tag>
    </div>
  );
}
