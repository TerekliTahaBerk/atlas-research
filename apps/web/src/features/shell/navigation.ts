import {
  Home,
  Search,
  Library,
  FileText,
  CircleCheck,
  MessagesSquare,
  Sparkles,
} from 'lucide-react';
export const previewProjectId = 'sample';
export const projectBase = '/app/projects/sample';
export const modules = [
  {
    slug: 'overview',
    label: 'Overview',
    icon: Home,
    description: 'Your connected research workspace.',
    phase: '00',
  },
  {
    slug: 'research',
    label: 'Research discovery',
    icon: Search,
    description:
      'Discover academic sources through connected research providers.',
    phase: '02',
  },
  {
    slug: 'library',
    label: 'Paper library',
    icon: Library,
    description: 'Collect and organise relevant papers.',
    phase: '02',
  },
  {
    slug: 'documents',
    label: 'Documents',
    icon: FileText,
    description: 'Capture your ideas and write.',
    phase: '04',
  },
  {
    slug: 'tasks',
    label: 'Tasks',
    icon: CircleCheck,
    description: 'Keep track of your research progress.',
    phase: '04',
  },
  {
    slug: 'channels',
    label: 'Channels',
    icon: MessagesSquare,
    description: 'Discuss findings in the context of your research.',
    phase: '05',
  },
  {
    slug: 'ai',
    label: 'Atlas AI',
    icon: Sparkles,
    description: 'Ask questions grounded in sources you can verify.',
    phase: '03',
  },
] as const;
