'use client';
import { Suspense, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  CircleArrowUp,
  FileCode,
  FileText,
  FileUp,
  FlaskConical,
  Folder,
  FolderKanban,
  House,
  Inbox,
  ListTodo,
  LogOut,
  Plus,
  Search,
  Settings,
  Smartphone,
  SwatchBook,
  Telescope,
  User,
} from 'lucide-react';
import { cn } from '@atlas/ui/lib/utils';
import { Avatar, Kbd, UnreadBadge } from '@/components/atlas/chips';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from '@/components/atlas/overlay';
import { useToast } from '@/components/atlas/toast';
import { InboxPopover } from '@/features/inbox/inbox-popover';
import { useNotifications } from '@/features/inbox/inbox-items';
import { currentUser, sampleWorkspace } from '@/lib/preview/people';
import { documents, projects } from '@/lib/preview/workspace';
import {
  moduleHref,
  modules,
  screenFromPath,
  type ModuleSlug,
  type ScreenKey,
} from './navigation';
import { useShell } from './shell-context';
import { ThemeMenu } from './theme-menu';
const rowBase =
  'flex h-[30px] w-full min-w-0 items-center gap-[9px] rounded-md px-2 text-tx2 transition-colors hover:bg-hov hover:text-tx group-data-[drawer=true]/sb:h-9 [&>svg]:size-[15px] [&>svg]:shrink-0';
function NavLink({
  href,
  active,
  icon,
  children,
  trailing,
  onNavigate,
  className,
}: {
  href: string;
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  onNavigate?: (() => void) | undefined;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      {...(onNavigate ? { onClick: onNavigate } : {})}
      className={cn(rowBase, active && 'bg-hov text-tx', className)}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
    </Link>
  );
}
function SectionToggle({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="flex w-full items-center gap-1 px-2 pt-3.5 pb-1 text-[11.5px] font-medium text-tx3 hover:text-tx2"
    >
      {children}
      {open ? (
        <ChevronDown aria-hidden="true" className="size-[11px]" />
      ) : (
        <ChevronRight aria-hidden="true" className="size-[11px]" />
      )}
    </button>
  );
}
/** Compact 216px sidebar (handoff §3 / prototype aside). */
export function Sidebar({
  drawer = false,
  onNavigate,
}: {
  drawer?: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  const pathname = usePathname() ?? '';
  const screen = screenFromPath(pathname);
  const router = useRouter();
  const shell = useShell();
  const flash = useToast();
  const { unreadCount } = useNotifications('all');
  const [workspace, setWorkspace] = useState<'lab' | 'personal'>('lab');
  const [project, setProject] = useState(
    projects[0]?.title ?? 'Sparse Evoformer',
  );
  const [open, setOpen] = useState({ docs: true, ms: true });
  const is = (key: ScreenKey) => screen === key;
  const mod = (slug: ModuleSlug) => modules.find((m) => m.slug === slug);
  const go = (href: string) => {
    onNavigate?.();
    router.push(href);
  };
  const inboxRow = (
    <button
      type="button"
      className={cn(rowBase, is('inbox') && 'bg-hov text-tx')}
    >
      <Inbox aria-hidden="true" />
      <span className="flex-1 text-left">Inbox</span>
      {unreadCount ? (
        <UnreadBadge>
          {unreadCount}
          <span className="sr-only"> unread</span>
        </UnreadBadge>
      ) : null}
    </button>
  );
  return (
    <nav
      aria-label="Workspace navigation"
      data-drawer={drawer}
      className="group/sb flex h-full flex-col bg-sb px-2 pt-2.5 pb-2"
    >
      <div className="flex items-center justify-between gap-1.5 pb-2.5">
        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              aria-label={`Workspace: ${workspace === 'lab' ? sampleWorkspace.name : 'Personal'}`}
              className="flex h-[30px] min-w-0 items-center gap-2 rounded-md pr-1.5 pl-1 hover:bg-hov"
            >
              <span
                aria-hidden="true"
                className="grid size-5 shrink-0 place-items-center rounded-[5px] bg-acb font-serif text-[15px] leading-none font-semibold text-white"
              >
                A
              </span>
              <span className="truncate text-sm font-semibold">
                {workspace === 'lab' ? sampleWorkspace.name : 'Personal'}
              </span>
              <ChevronsUpDown
                aria-hidden="true"
                className="size-3 shrink-0 text-tx3"
              />
            </button>
          </MenuTrigger>
          <MenuContent width={250} align="start">
            <MenuLabel>Workspaces · sample</MenuLabel>
            <MenuItem
              icon={<Building2 />}
              sub="5 members · Lab"
              checked={workspace === 'lab'}
              onSelect={() => setWorkspace('lab')}
            >
              Kaya Lab
            </MenuItem>
            <MenuItem
              icon={<User />}
              sub="Only you"
              checked={workspace === 'personal'}
              onSelect={() => setWorkspace('personal')}
            >
              Personal
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<Plus />}
              sub="Arrives with accounts in Phase 01"
              disabled
            >
              Create workspace
            </MenuItem>
            <MenuItem
              icon={<Settings />}
              onSelect={() => go('/app/settings/workspace')}
            >
              Workspace settings
            </MenuItem>
            <MenuItem
              icon={<LogOut />}
              sub="Opens the sign-in preview"
              onSelect={() => go('/login')}
            >
              Sign out
            </MenuItem>
          </MenuContent>
        </Menu>
        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-[26px] shrink-0 items-center gap-1 rounded-md bg-acb pr-2 pl-2.5 text-ctl font-medium text-white hover:bg-acbh"
            >
              New
              <Plus aria-hidden="true" className="size-[13px]" />
            </button>
          </MenuTrigger>
          <MenuContent width={250} align="start">
            <MenuItem
              icon={<FileText />}
              shortcut="D"
              onSelect={() => go(moduleHref('documents', 'doc=new'))}
            >
              Document
            </MenuItem>
            <MenuItem
              icon={<FileCode />}
              shortcut="M"
              onSelect={() => go(moduleHref('manuscripts'))}
            >
              Manuscript (LaTeX)
            </MenuItem>
            <MenuItem
              icon={<FlaskConical />}
              shortcut="N"
              onSelect={() => go(moduleHref('experiments'))}
            >
              Notebook
            </MenuItem>
            <MenuItem
              icon={<ListTodo />}
              shortcut="T"
              onSelect={() => {
                go(moduleHref('tasks'));
                flash('Task creation is a preview — nothing was created');
              }}
            >
              Task
            </MenuItem>
            <MenuItem
              icon={<FolderKanban />}
              onSelect={() => go('/onboarding?step=5')}
            >
              Project
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<FileUp />}
              onSelect={() => go(moduleHref('library'))}
            >
              Import PDF
            </MenuItem>
            <MenuItem
              icon={<Telescope />}
              onSelect={() => go(moduleHref('research'))}
            >
              Search literature
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <div className="-mx-0.5 flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-0.5">
        <button type="button" onClick={shell.openSearch} className={rowBase}>
          <Search aria-hidden="true" />
          <span className="flex-1 text-left">Search</span>
          <span className="flex gap-[3px]" aria-hidden="true">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
        <NavLink
          href="/app/home"
          active={is('home')}
          icon={<House aria-hidden="true" />}
          onNavigate={onNavigate}
        >
          Home
        </NavLink>
        {shell.narrow ? (
          <NavLink
            href="/app/inbox"
            active={is('inbox')}
            icon={<Inbox aria-hidden="true" />}
            onNavigate={onNavigate}
            trailing={
              unreadCount ? <UnreadBadge>{unreadCount}</UnreadBadge> : null
            }
          >
            Inbox
          </NavLink>
        ) : (
          <InboxPopover trigger={inboxRow} />
        )}
        <div className="px-2 pt-3.5 pb-1 text-[11.5px] font-medium text-tx3">
          Workspace
        </div>
        {(['research', 'library'] as const).map((slug) => {
          const m = mod(slug);
          if (!m) return null;
          const Icon = m.icon;
          return (
            <NavLink
              key={slug}
              href={moduleHref(slug)}
              active={is(m.screen)}
              icon={<Icon aria-hidden="true" />}
              onNavigate={onNavigate}
              trailing={
                slug === 'library' ? (
                  <span className="text-[11px] text-tx3">128</span>
                ) : null
              }
            >
              {m.label}
            </NavLink>
          );
        })}
        <SectionToggle
          open={open.docs}
          onToggle={() => setOpen((o) => ({ ...o, docs: !o.docs }))}
        >
          Documents
        </SectionToggle>
        {open.docs ? (
          <Suspense
            fallback={<DocLinks active={null} onNavigate={onNavigate} />}
          >
            <ActiveDocLinks screen={screen} onNavigate={onNavigate} />
          </Suspense>
        ) : null}
        <SectionToggle
          open={open.ms}
          onToggle={() => setOpen((o) => ({ ...o, ms: !o.ms }))}
        >
          Manuscripts
        </SectionToggle>
        {open.ms ? (
          <>
            <NavLink
              href={moduleHref('manuscripts')}
              active={is('manuscript')}
              icon={
                <Folder aria-hidden="true" className="!size-[14px] text-tx3" />
              }
              onNavigate={onNavigate}
            >
              Sparse Evoformer
            </NavLink>
            {is('manuscript') ? (
              <div className="flex h-7 items-center gap-2 rounded-md pr-2 pl-[30px] font-mono text-xs text-tx2">
                <FileCode aria-hidden="true" className="size-[13px] text-tx3" />
                main.tex
              </div>
            ) : null}
            <NavLink
              href={moduleHref('manuscripts')}
              active={false}
              icon={
                <Folder aria-hidden="true" className="!size-[14px] text-tx3" />
              }
              onNavigate={onNavigate}
            >
              Thesis — Chapter 3
            </NavLink>
          </>
        ) : null}
        <div className="flex items-center pt-3.5 pr-1 pb-1 pl-2">
          <Menu>
            <MenuTrigger asChild>
              <button
                type="button"
                aria-label={`Active project: ${project}`}
                className="flex min-w-0 items-center gap-1 text-[11.5px] font-medium text-tx3 hover:text-tx2"
              >
                <span className="truncate">{project}</span>
                <ChevronDown aria-hidden="true" className="size-[11px]" />
              </button>
            </MenuTrigger>
            <MenuContent width={250} align="start">
              <MenuLabel>Active project · sample</MenuLabel>
              {projects.map((p) => (
                <MenuItem
                  key={p.id}
                  icon={<FolderKanban />}
                  checked={project === p.title}
                  onSelect={() => setProject(p.title)}
                >
                  {p.title}
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem
                icon={<Plus />}
                onSelect={() => go('/onboarding?step=5')}
              >
                New project
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
        {(
          ['overview', 'tasks', 'channels', 'experiments', 'graph'] as const
        ).map((slug) => {
          const m = mod(slug);
          if (!m) return null;
          const Icon = m.icon;
          return (
            <NavLink
              key={slug}
              href={moduleHref(slug)}
              active={is(m.screen)}
              icon={<Icon aria-hidden="true" />}
              onNavigate={onNavigate}
              trailing={
                slug === 'tasks' ? (
                  <span className="text-[11px] text-tx3">3</span>
                ) : slug === 'channels' ? (
                  <span className="size-1.5 rounded-full bg-ac">
                    <span className="sr-only">New messages</span>
                  </span>
                ) : null
              }
            >
              {m.label}
            </NavLink>
          );
        })}
      </div>
      <div className="flex flex-col gap-px pt-2">
        <button
          type="button"
          onClick={() => shell.setPricingOpen(true)}
          className={cn(
            rowBase,
            'bg-acs font-medium text-actx hover:bg-aiin hover:text-actx',
          )}
        >
          <CircleArrowUp aria-hidden="true" />
          Upgrade
        </button>
        <NavLink
          href="/app/design-system"
          active={is('system')}
          icon={<SwatchBook aria-hidden="true" />}
          onNavigate={onNavigate}
        >
          Design system
        </NavLink>
        <NavLink
          href="/app/design-system/mobile"
          active={is('mobile')}
          icon={<Smartphone aria-hidden="true" />}
          onNavigate={onNavigate}
        >
          Mobile screens
        </NavLink>
        <NavLink
          href="/app/settings"
          active={is('settings')}
          icon={<Settings aria-hidden="true" />}
          onNavigate={onNavigate}
        >
          Settings
        </NavLink>
        <div className="mt-1 flex h-10 items-center gap-2 pr-1 pl-1.5">
          <Avatar person={currentUser} size={24} />
          <span className="flex-1 text-[13.5px] font-medium">
            {currentUser.short}
          </span>
          <span className="rounded-xs border border-bd2 bg-el px-1.5 py-px text-[11px] text-tx2">
            Free
          </span>
          <ThemeMenu />
        </div>
      </div>
    </nav>
  );
}
function ActiveDocLinks({
  screen,
  onNavigate,
}: {
  screen: ScreenKey;
  onNavigate: (() => void) | undefined;
}) {
  const params = useSearchParams();
  const active = screen === 'doc' ? (params.get('doc') ?? 'd1') : null;
  return <DocLinks active={active} onNavigate={onNavigate} />;
}
function DocLinks({
  active,
  onNavigate,
}: {
  active: string | null;
  onNavigate: (() => void) | undefined;
}) {
  return (
    <>
      {documents.slice(0, 3).map((d) => (
        <NavLink
          key={d.id}
          href={moduleHref('documents', `doc=${d.id}`)}
          active={active === d.id}
          icon={
            <FileText aria-hidden="true" className="!size-[14px] text-tx3" />
          }
          onNavigate={onNavigate}
        >
          {d.title}
        </NavLink>
      ))}
    </>
  );
}
