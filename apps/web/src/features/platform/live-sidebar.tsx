'use client';
import { useRouter } from 'next/navigation';
import { purgeDrafts } from '@/features/documents/drafts';
import { usePathname } from 'next/navigation';
import {
  House,
  FolderKanban,
  Settings,
  ChevronsUpDown,
  LogOut,
  Plus,
} from 'lucide-react';
import {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
} from '@/components/atlas/overlay';
import { usePlatform } from './platform-context';
import { requestData } from './client';
import { z } from 'zod';
import { ThemeMenu } from '@/features/shell/theme-menu';
import { useShell } from '@/features/shell/shell-context';
import { cn } from '@atlas/ui/lib/utils';
const row =
  'flex h-[30px] min-w-0 items-center gap-[9px] rounded-md px-2 text-tx2 hover:bg-hov hover:text-tx';
export function LiveSidebar({
  onNavigate,
  drawer = false,
}: {
  onNavigate?: (() => void) | undefined;
  drawer?: boolean;
}) {
  const router = useRouter();
  const state = usePlatform();
  const pathname = usePathname();
  const shell = useShell();
  const selected = state.workspaces.find((w) => w.id === state.workspaceId);
  const nav = (href: string, title: string, Icon: typeof House) => (
    <a
      onClick={() => onNavigate?.()}
      href={href}
      className={cn(
        row,
        pathname === href && 'bg-hov text-tx',
        drawer && 'h-9',
      )}
      aria-current={pathname === href ? 'page' : undefined}
    >
      <Icon aria-hidden="true" className="size-[15px] shrink-0" />
      <span className="truncate">{title}</span>
    </a>
  );
  return (
    <nav
      aria-label="Workspace navigation"
      className="flex h-full flex-col bg-sb px-2 pt-2.5 pb-2"
    >
      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            aria-label={`Workspace: ${selected?.name ?? 'Choose workspace'}`}
            className="mb-3 flex h-[30px] items-center gap-2 rounded-md px-1 hover:bg-hov"
          >
            <span
              aria-hidden="true"
              className="grid size-5 shrink-0 place-items-center rounded-[5px] bg-acb font-serif font-semibold text-white"
            >
              A
            </span>
            <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold">
              {selected?.name ?? 'Choose workspace'}
            </span>
            <ChevronsUpDown aria-hidden="true" className="size-3" />
          </button>
        </MenuTrigger>
        <MenuContent width={250}>
          {state.organizations.map((org) => (
            <div key={org.id}>
              <MenuLabel>{org.name}</MenuLabel>
              <MenuItem
                onSelect={() =>
                  router.push(
                    `/app/settings/workspace?organizationId=${org.id}`,
                  )
                }
              >
                Organization settings
              </MenuItem>
              {!state.workspaces.some((w) => w.organizationId === org.id) ? (
                <MenuItem disabled>No accessible workspaces</MenuItem>
              ) : null}
              {state.workspaces
                .filter((w) => w.organizationId === org.id)
                .map((w) => (
                  <MenuItem
                    key={w.id}
                    checked={w.id === selected?.id}
                    onSelect={() => {
                      onNavigate?.();
                      router.push(`/app/workspaces/${w.id}`);
                    }}
                  >
                    {w.name}
                  </MenuItem>
                ))}
            </div>
          ))}
          <MenuSeparator />
          <MenuItem
            icon={<Plus />}
            onSelect={() => router.push('/app/settings/workspace')}
          >
            Create workspace
          </MenuItem>
        </MenuContent>
      </Menu>
      <button
        type="button"
        className={cn(row, 'mb-1 text-left')}
        onClick={() => shell.openSearch()}
      >
        Search Atlas <span className="ml-auto text-xs text-tx3">⌘K</span>
      </button>
      {nav('/app/home', 'Home', House)}
      {nav('/app/workspaces', 'Workspaces', FolderKanban)}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="px-2 pt-3.5 pb-1 text-[11.5px] text-tx3">Projects</div>
        {state.projects
          .filter((p) => !p.archived)
          .map((p) => (
            <div key={p.id}>
              {nav(`/app/projects/${p.id}/overview`, p.name, FolderKanban)}
            </div>
          ))}
        {state.projects.length === 0 ? (
          <p className="px-2 py-2 text-xs text-tx3">
            No accessible projects yet.
          </p>
        ) : null}
      </div>
      {nav('/app/settings/profile', 'Settings', Settings)}
      <button
        type="button"
        className={row}
        onClick={async () => {
          try {
            // Unsaved document drafts never outlive the signed-in session.
            purgeDrafts();
            const result = await requestData(
              '/api/v1/auth',
              z.object({ redirect: z.string() }),
              { action: 'logout' },
            );
            router.push(result.redirect);
          } catch {
            router.push('/login?logout=failed');
          }
        }}
      >
        <LogOut aria-hidden="true" className="size-[15px]" />
        Sign out
      </button>
      <div className="mt-1 flex h-10 items-center gap-2 px-1.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-acs text-xs text-actx">
          {state.profile?.displayName.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
          {state.profile?.displayName}
        </span>
        <ThemeMenu />
      </div>
    </nav>
  );
}
