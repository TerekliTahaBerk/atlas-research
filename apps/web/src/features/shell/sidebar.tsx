'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Compass,
  Layers,
  Folder,
  Settings,
  UserRound,
  ChevronDown,
  CircleHelp,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@atlas/ui/components/avatar';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectValue,
} from '@atlas/ui/components/select';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@atlas/ui/components/dropdown-menu';
import { Separator } from '@atlas/ui/components/separator';
import { modules, projectBase, workspaceNavigation } from './navigation';
import { SearchTrigger } from './search-dialog';
export function Sidebar({
  onNavigate,
  onSearch,
}: {
  onNavigate?: () => void;
  onSearch: () => void;
}) {
  const pathname = usePathname();
  return (
    <div className="sidebar-inner">
      <Link
        href="/"
        aria-label="Atlas home"
        className="wordmark"
        onClick={() => onNavigate?.()}
      >
        <Compass aria-hidden="true" />
        <span>ATLAS</span>
      </Link>
      <div className="selector">
        <Layers aria-hidden="true" />
        <Select defaultValue="sample">
          <SelectTrigger aria-label="Workspace">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="sample">Sample workspace</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <SearchTrigger onOpen={onSearch} />
      <nav aria-label="Workspace navigation">
        {workspaceNavigation.slice(0, 2).map((item) => (
          <Link
            key={item.slug}
            href={item.href}
            className="nav-item"
            title={item.label}
            aria-current={pathname === item.href ? 'page' : undefined}
            onClick={() => onNavigate?.()}
          >
            <item.icon aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        ))}
        <p className="nav-section-label">Workspace</p>
        {workspaceNavigation.slice(2).map((item) => (
          <Link
            key={item.slug}
            href={item.href}
            className="nav-item"
            title={item.label}
            aria-current={pathname === item.href ? 'page' : undefined}
            onClick={() => onNavigate?.()}
          >
            <item.icon aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        ))}
        {modules
          .filter((item) => item.slug === 'research' || item.slug === 'library')
          .map((item) => (
            <Link
              key={item.slug}
              href={`${projectBase}/${item.slug}`}
              className="nav-item"
              title={item.label}
              aria-current={
                pathname === `${projectBase}/${item.slug}` ? 'page' : undefined
              }
              onClick={() => onNavigate?.()}
            >
              <item.icon aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          ))}
      </nav>
      <Separator className="my-2" />
      <p className="nav-section-label">Active project</p>
      <div className="selector project-selector">
        <Folder aria-hidden="true" />
        <Select defaultValue="sample">
          <SelectTrigger aria-label="Project">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="sample">Sample project</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <nav aria-label="Project navigation">
        {modules
          .filter((m) => m.slug !== 'research' && m.slug !== 'library')
          .map((m) => (
            <Link
              key={m.slug}
              title={m.label}
              href={`${projectBase}/${m.slug}`}
              className="nav-item"
              aria-current={
                pathname === `${projectBase}/${m.slug}` ? 'page' : undefined
              }
              onClick={() => onNavigate?.()}
            >
              <m.icon aria-hidden="true" />
              <span>{m.label}</span>
            </Link>
          ))}
      </nav>
      <div className="sidebar-bottom">
        <Separator />
        <Link
          className="nav-item"
          title="Settings"
          href="/app/settings"
          onClick={() => onNavigate?.()}
        >
          <Settings aria-hidden="true" />
          <span>Settings</span>
        </Link>
        <Link
          className="nav-item"
          title="Help"
          href="/app/help"
          onClick={() => onNavigate?.()}
        >
          <CircleHelp aria-hidden="true" />
          <span>Help</span>
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="visitor-menu" aria-label="Preview visitor">
              <Avatar className="size-7">
                <AvatarFallback>
                  <UserRound aria-hidden="true" />
                </AvatarFallback>
              </Avatar>
              <span>Preview visitor</span>
              <ChevronDown aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Local interface preview</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link
                  href="/app/settings/profile"
                  onClick={() => onNavigate?.()}
                >
                  Profile preview
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                Authentication arrives in Phase 01
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
