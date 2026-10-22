'use client';
import type { ModuleSlug } from './navigation';
import { OverviewScreen } from '@/features/projects/overview-screen';
import { ResearchScreen } from '@/features/research/research-screen';
import { LibraryScreen } from '@/features/library/library-screen';
import { ReaderScreen } from '@/features/reader/reader-screen';
import { DocumentScreen } from '@/features/documents/document-screen';
import { TasksScreen } from '@/features/tasks/tasks-screen';
import { ChannelsScreen } from '@/features/channels/channels-screen';
import { AtlasWorkspace } from '@/features/atlas-ai/atlas-workspace';
import { ManuscriptScreen } from '@/features/manuscripts/manuscript-screen';
import { ExperimentsScreen } from '@/features/experiments/experiments-screen';
import { GraphScreen } from '@/features/graph/graph-screen';
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
