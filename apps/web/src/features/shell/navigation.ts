import {
  FileCode,
  FileText,
  FlaskConical,
  Hash,
  House,
  Inbox,
  LayoutDashboard,
  Library,
  ListTodo,
  BookOpen,
  Settings,
  Smartphone,
  Sparkles,
  SwatchBook,
  Telescope,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
/**
 * Central navigation and route allowlist (Phase 00.5A). Every sidebar entry,
 * command-palette destination and static route parameter comes from here.
 * `sample` identifiers are preview-only; Phase 01 replaces them with
 * server-authorized workspace/project resolution.
 */
export const previewProjectId = 'sample';
export const previewWorkspaceId = 'sample';
export const projectBase = `/app/projects/${previewProjectId}`;
export type ScreenKey =
  | 'home'
  | 'inbox'
  | 'overview'
  | 'doc'
  | 'manuscript'
  | 'research'
  | 'library'
  | 'reader'
  | 'tasks'
  | 'channels'
  | 'experiments'
  | 'graph'
  | 'ai'
  | 'settings'
  | 'system'
  | 'mobile'
  | 'help'
  | 'projects';
export interface ProjectModule {
  slug: string;
  screen: ScreenKey;
  label: string;
  icon: LucideIcon;
  description: string;
  /** Phase that delivers the real capability behind this preview. */
  phase: string;
}
export const modules = [
  {
    slug: 'overview',
    screen: 'overview',
    label: 'Overview',
    icon: LayoutDashboard,
    description: 'Project identity, timeline and linked work.',
    phase: '04',
  },
  {
    slug: 'research',
    screen: 'research',
    label: 'Research',
    icon: Telescope,
    description: 'Ask a question across scholarly sources.',
    phase: '02',
  },
  {
    slug: 'library',
    screen: 'library',
    label: 'Library',
    icon: Library,
    description: 'Collections, reading status and citations.',
    phase: '02',
  },
  {
    slug: 'reader',
    screen: 'reader',
    label: 'PDF reader',
    icon: BookOpen,
    description: 'Read, highlight and ask about a paper.',
    phase: '02',
  },
  {
    slug: 'documents',
    screen: 'doc',
    label: 'Documents',
    icon: FileText,
    description: 'Long-form research writing.',
    phase: '04',
  },
  {
    slug: 'tasks',
    screen: 'tasks',
    label: 'Tasks',
    icon: ListTodo,
    description: 'Board, list and research milestones.',
    phase: '04',
  },
  {
    slug: 'channels',
    screen: 'channels',
    label: 'Channels',
    icon: Hash,
    description: 'Lab discussion next to the research.',
    phase: '05',
  },
  {
    slug: 'ai',
    screen: 'ai',
    label: 'Atlas AI',
    icon: Sparkles,
    description: 'Full research mode for the assistant.',
    phase: '03',
  },
  {
    slug: 'manuscripts',
    screen: 'manuscript',
    label: 'Manuscripts',
    icon: FileCode,
    description: 'LaTeX source with PDF preview.',
    phase: '07',
  },
  {
    slug: 'experiments',
    screen: 'experiments',
    label: 'Experiments',
    icon: FlaskConical,
    description: 'Notebook cells, outputs and analysis.',
    phase: '07',
  },
  {
    slug: 'graph',
    screen: 'graph',
    label: 'Knowledge graph',
    icon: Waypoints,
    description: 'How papers, notes and tasks connect.',
    phase: '04',
  },
] as const satisfies readonly ProjectModule[];
export type ModuleSlug = (typeof modules)[number]['slug'];
export function moduleHref(slug: ModuleSlug, query?: string) {
  return `${projectBase}/${slug}${query ? `?${query}` : ''}`;
}
/** Resolve a fixture target ("tasks?task=ATL-31" or "/app/home"). */
export function resolveHref(target: string) {
  return target.startsWith('/') ? target : `${projectBase}/${target}`;
}
export const settingsSections = [
  { slug: 'profile', label: 'Profile' },
  { slug: 'appearance', label: 'Appearance' },
  { slug: 'workspace', label: 'Workspace' },
  { slug: 'plan', label: 'Plan & usage' },
] as const;
export type SettingsSection = (typeof settingsSections)[number]['slug'];
export const appPages: {
  screen: ScreenKey;
  label: string;
  href: string;
  icon: LucideIcon;
}[] = [
  { screen: 'home', label: 'Home', href: '/app/home', icon: House },
  { screen: 'inbox', label: 'Inbox', href: '/app/inbox', icon: Inbox },
  {
    screen: 'settings',
    label: 'Settings',
    href: '/app/settings',
    icon: Settings,
  },
  {
    screen: 'system',
    label: 'Design system',
    href: '/app/design-system',
    icon: SwatchBook,
  },
  {
    screen: 'mobile',
    label: 'Mobile screens',
    href: '/app/design-system/mobile',
    icon: Smartphone,
  },
];
/** Every navigable destination, used by the command palette. */
export const allDestinations = [
  ...appPages,
  ...modules.map((m) => ({
    screen: m.screen as ScreenKey,
    label: m.label,
    href: moduleHref(m.slug),
    icon: m.icon as LucideIcon,
  })),
];
export function screenFromPath(pathname: string): ScreenKey {
  if (pathname.startsWith('/app/home')) return 'home';
  if (pathname.startsWith('/app/inbox')) return 'inbox';
  if (pathname.startsWith('/app/settings')) return 'settings';
  if (pathname.startsWith('/app/design-system/mobile')) return 'mobile';
  if (pathname.startsWith('/app/design-system')) return 'system';
  if (pathname.startsWith('/app/help')) return 'help';
  if (pathname.startsWith('/app/workspaces')) return 'projects';
  const slug = pathname.startsWith(`${projectBase}/`)
    ? pathname.slice(projectBase.length + 1).split('/')[0]
    : undefined;
  return modules.find((m) => m.slug === slug)?.screen ?? 'home';
}
