import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import type {
  ArtifactCommandInput,
  ProjectDto,
  TaskDto,
  TaskPage,
} from '../../packages/core/src/index';
import { TooltipProvider } from '@atlas/ui/components/tooltip';
import {
  artifactCommand,
  fetchTask,
  fetchTasks,
} from '@/features/artifacts/client';
import { AtlasProvider } from '@/features/atlas-ai/atlas-provider';
import { LiveTasks } from '@/features/tasks/live-tasks';
import { setSearchParams } from '../mocks/navigation';

vi.mock('@/features/artifacts/client', async (original) => ({
  ...(await original<typeof import('@/features/artifacts/client')>()),
  artifactCommand: vi.fn(),
  fetchTask: vi.fn(),
  fetchTasks: vi.fn(),
  fetchOptions: vi.fn().mockResolvedValue({ items: [], people: [] }),
}));

const taskId = '11111111-1111-4111-8111-111111111111';
const ada = '44444444-4444-4444-8444-444444444444';
const project: ProjectDto = {
  id: '33333333-3333-4333-8333-333333333333',
  organizationId: 'org',
  workspaceId: 'ws',
  name: 'Concurrency',
  version: 1,
  capabilities: ['project.read', 'project.write'],
  visibility: 'PRIVATE',
  archived: false,
  updatedAt: '',
};
let server: TaskDto;
const pageOf = (task: TaskDto): TaskPage => ({
  items: [task],
  nextCursor: null,
  milestones: [],
  participants: [{ id: ada, name: 'Ada Editor', assignable: true }],
  capabilities: ['task.edit'],
});
const pending: { body: ArtifactCommandInput; release: () => void }[] = [];

beforeEach(() => {
  pending.length = 0;
  setSearchParams(`task=${taskId}`);
  server = {
    id: taskId,
    artifactId: '22222222-2222-4222-8222-222222222222',
    projectId: project.id,
    number: 1,
    title: 'Benchmark Attention U-Net',
    description: '',
    status: 'TODO',
    priority: 'NONE',
    assignee: null,
    milestoneId: null,
    dueDate: null,
    version: 1,
    archived: false,
    createdBy: null,
    createdAt: '',
    updatedAt: '',
    completedAt: null,
    linkedPapers: 0,
    linkedDocuments: 0,
  };
  vi.mocked(fetchTasks).mockImplementation(async () => pageOf({ ...server }));
  vi.mocked(fetchTask).mockImplementation(async () => ({
    task: { ...server },
    links: [],
  }));
  // A faithful optimistic-concurrency server: stale tokens conflict.
  vi.mocked(artifactCommand).mockImplementation(
    (body) =>
      new Promise((resolve, reject) => {
        pending.push({
          body,
          release: () => {
            const b = body as { expectedVersion?: number };
            if (b.expectedVersion !== server.version) {
              reject(
                Object.assign(new Error('changed'), {
                  code: 'CONFLICT',
                  status: 409,
                }),
              );
              return;
            }
            const next = { ...server, version: server.version + 1 };
            if (body.command === 'task.update' && 'dueDate' in body)
              next.dueDate = body.dueDate ?? null;
            if (body.command === 'task.assign')
              next.assignee = body.assigneeId
                ? { id: body.assigneeId, name: 'Ada Editor', state: 'ACTIVE' }
                : null;
            server = next;
            resolve({ id: taskId });
          },
        });
      }),
  );
});

it('a due-date edit followed immediately by an assignment saves both with consecutive tokens', async () => {
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <AtlasProvider screen="tasks">
        <LiveTasks project={project} />
      </AtlasProvider>
    </TooltipProvider>,
  );
  const detail = await screen.findByRole('complementary', { name: 'Task #1' });
  fireEvent.change(detail.querySelector('#task-due')!, {
    target: { value: '2026-12-01' },
  });
  // Assign while the due-date response is still outstanding.
  await user.click(
    await screen.findByRole('button', { name: 'Assignee: unassigned' }),
  );
  await user.click(
    await screen.findByRole('menuitemradio', { name: 'Ada Editor' }),
  );
  // Intent is shown at once; only one command is in flight.
  expect(
    await screen.findByRole('button', { name: 'Assignee: Ada Editor' }),
  ).toBeInTheDocument();
  expect(pending).toHaveLength(1);
  await act(async () => pending[0]!.release());
  await waitFor(() => expect(pending).toHaveLength(2));
  await act(async () => pending[1]!.release());
  expect(
    pending.map((p) => (p.body as { expectedVersion: number }).expectedVersion),
  ).toEqual([1, 2]);
  await waitFor(() => expect(server.version).toBe(3));
  expect(server).toMatchObject({
    dueDate: '2026-12-01',
    assignee: { name: 'Ada Editor' },
  });
  expect(
    await screen.findByRole('button', { name: 'Assignee: Ada Editor' }),
  ).toBeInTheDocument();
});
