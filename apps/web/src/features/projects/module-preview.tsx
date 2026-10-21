import { Suspense } from 'react';
import { ResearchScreen } from '@/features/research/research-screen';
import { DocumentScreen } from '@/features/documents/document-screen';
import { TasksScreen } from '@/features/tasks/tasks-screen';
import { ChannelsScreen } from '@/features/channels/channels-screen';
import { AssistantExperience } from '@/features/atlas-ai/atlas-provider';
import {
  ManuscriptsScreen,
  ExperimentsScreen,
} from '@/features/preview/future-screens';
import { PageHeader } from '@/components/page-header';
import { LoadingIndicator } from '@/components/states';
import { modules } from '@/features/shell/navigation';
export function ModulePreview({
  module,
}: {
  module: (typeof modules)[number];
}) {
  switch (module.slug) {
    case 'research':
      return <ResearchScreen />;
    case 'library':
      return <ResearchScreen library />;
    case 'documents':
      return (
        <Suspense fallback={<LoadingIndicator />}>
          <DocumentScreen />
        </Suspense>
      );
    case 'tasks':
      return <TasksScreen />;
    case 'channels':
      return <ChannelsScreen />;
    case 'manuscripts':
      return <ManuscriptsScreen />;
    case 'experiments':
      return <ExperimentsScreen />;
    case 'ai':
      return (
        <div className="ai-workspace">
          <PageHeader
            title="Atlas AI"
            description="Think with your sources, in one connected context."
          />
          <AssistantExperience />
        </div>
      );
    default:
      return null;
  }
}
