'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Layers, Folder, Settings, UserRound, ChevronDown } from 'lucide-react';
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
import { modules, projectBase } from './navigation';
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
      <Link href="/" className="wordmark" onClick={() => onNavigate?.()}>
        Atlas
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
      <p className="nav-section-label">Workspace</p>
      <Link
        className="nav-item"
        href="/app/workspaces/sample/projects"
        onClick={() => onNavigate?.()}
      >
        <Folder aria-hidden="true" />
        Projects
      </Link>
      <Separator className="my-4" />
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
        {modules.map((m) => (
          <Link
            key={m.slug}
            href={`${projectBase}/${m.slug}`}
            className="nav-item"
            aria-current={
              pathname === `${projectBase}/${m.slug}` ? 'page' : undefined
            }
            onClick={() => onNavigate?.()}
          >
            <m.icon aria-hidden="true" />
            {m.label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <Separator />
        <Link
          className="nav-item"
          href="/app/settings"
          onClick={() => onNavigate?.()}
        >
          <Settings aria-hidden="true" />
          Settings
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="visitor-menu">
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
