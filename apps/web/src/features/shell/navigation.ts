import {
  Home,
  Search,
  Library,
  FileText,
  CircleCheck,
  MessagesSquare,
  Sparkles,
  BookOpen,
  FlaskConical,
  Inbox,
  Folder,
} from 'lucide-react';
export const previewProjectId = 'sample';
export const projectBase = '/app/projects/sample';
export const modules = [
  {
    slug: 'overview',
    label: 'Overview',
    icon: Home,
    description: 'Your connected research workspace.',
    phase: '00.5',
  },
  {
    slug: 'research',
    label: 'Research discovery',
    icon: Search,
    description: 'Follow a question. Discover a new perspective.',
    phase: '02',
  },
  {
    slug: 'library',
    label: 'Paper library',
    icon: Library,
    description: 'A considered collection of the ideas that matter.',
    phase: '02',
  },
  {
    slug: 'documents',
    label: 'Documents',
    icon: FileText,
    description: 'A little room to think, connect, and write.',
    phase: '04',
  },
  {
    slug: 'tasks',
    label: 'Tasks',
    icon: CircleCheck,
    description: 'Move your research forward, one thoughtful step at a time.',
    phase: '04',
  },
  {
    slug: 'channels',
    label: 'Channels',
    icon: MessagesSquare,
    description: 'Keep the conversation close to the research.',
    phase: '05',
  },
  {
    slug: 'ai',
    label: 'Atlas AI',
    icon: Sparkles,
    description: 'Think with your sources, in one connected context.',
    phase: '03',
  },
  {
    slug: 'manuscripts',
    label: 'Manuscripts',
    icon: BookOpen,
    description: 'From connected ideas to a considered manuscript.',
    phase: '07',
  },
  {
    slug: 'experiments',
    label: 'Experiments',
    icon: FlaskConical,
    description: 'A future space for reproducible exploration.',
    phase: '07',
  },
] as const;
export type ModuleSlug = (typeof modules)[number]['slug'];
export const workspaceNavigation = [
  { slug: 'home', label: 'Home', icon: Home, href: '/app/home' },
  { slug: 'inbox', label: 'Inbox', icon: Inbox, href: '/app/inbox' },
  {
    slug: 'projects',
    label: 'Projects',
    icon: Folder,
    href: '/app/workspaces/sample/projects',
  },
] as const;
export const navigationItems = [
  ...workspaceNavigation,
  ...modules.map((module) => ({
    ...module,
    href: `${projectBase}/${module.slug}`,
  })),
  {
    slug: 'settings',
    label: 'Settings',
    icon: CircleCheck,
    href: '/app/settings',
  },
];
