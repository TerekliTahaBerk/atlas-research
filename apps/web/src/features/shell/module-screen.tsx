'use client';
import dynamic from 'next/dynamic';
import type { ModuleSlug } from './navigation';
import { OverviewScreen } from '@/features/projects/overview-screen';
import { ResearchScreen } from '@/features/research/research-screen';
import { LibraryScreen } from '@/features/library/library-screen';
import { ReaderScreen } from '@/features/reader/reader-screen';
import { TasksScreen } from '@/features/tasks/tasks-screen';
import { ChannelsScreen } from '@/features/channels/channels-screen';
import { AtlasWorkspace } from '@/features/atlas-ai/atlas-workspace';
import { ExperimentsScreen } from '@/features/experiments/experiments-screen';
import { GraphScreen } from '@/features/graph/graph-screen';
// Load editor engines only when their module is rendered. SSR remains enabled.
const DocumentScreen = dynamic(() =>
  import('@/features/documents/document-screen').then((m) => m.DocumentScreen),
);
const ManuscriptScreen = dynamic(() =>
  import('@/features/manuscripts/manuscript-screen').then(
    (m) => m.ManuscriptScreen,
  ),
);
/** Single dispatch from the module allowlist to its feature screen. */
export function ModuleScreen({ slug }: { slug: ModuleSlug }) {
  switch (slug) {
    case 'overview':
      return <OverviewScreen />;
    case 'research':
      return <ResearchScreen />;
    case 'library':
      return <LibraryScreen />;
    case 'reader':
      return <ReaderScreen />;
    case 'documents':
      return <DocumentScreen />;
    case 'tasks':
      return <TasksScreen />;
    case 'channels':
      return <ChannelsScreen />;
    case 'ai':
      return <AtlasWorkspace />;
    case 'manuscripts':
      return <ManuscriptScreen />;
    case 'experiments':
      return <ExperimentsScreen />;
    case 'graph':
      return <GraphScreen />;
  }
}
