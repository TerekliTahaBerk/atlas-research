import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { TaskDto, TaskPage } from '../../packages/core/src/index';
import { ApiError, fetchTasks } from '@/features/artifacts/client';
import { useTaskPages } from '@/features/tasks/use-task-pages';
vi.mock('@/features/artifacts/client', async (original) => ({
  ...(await original<typeof import('@/features/artifacts/client')>()),
  fetchTasks: vi.fn(),
}));
const task = (id: string, version = 1): TaskDto => ({
  id,
  artifactId: id,
  projectId: 'project',
  number: 1,
  title: id,
  description: '',
  status: 'TODO',
  priority: 'NONE',
  assignee: null,
  milestoneId: null,
  dueDate: null,
  version,
  archived: false,
  createdBy: null,
  createdAt: '',
  updatedAt: '',
  completedAt: null,
  linkedPapers: 0,
  linkedDocuments: 0,
});
const page = (ids: string[], nextCursor: string | null = null): TaskPage => ({
  items: ids.map((id) => task(id)),
  nextCursor,
  milestones: [],
  participants: [],
  capabilities: ['task.edit'],
});
function deferred() {
  let resolve!: (page: TaskPage) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<TaskPage>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => vi.mocked(fetchTasks).mockReset());
it.each(['filter', 'project'])(
  'ignores a stale page after a %s change',
  async (change) => {
    const pending = deferred();
    vi.mocked(fetchTasks)
      .mockResolvedValueOnce(page(['old'], 'cursor'))
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(page(['new']));
    const { result, rerender } = renderHook(
      ({ project, query }) => useTaskPages(project, query),
      { initialProps: { project: 'A', query: { assignee: 'me' } } },
    );
    await waitFor(() => expect(result.current.data?.items[0]?.id).toBe('old'));
    let load!: Promise<void>;
    act(() => {
      load = result.current.loadMore();
    });
    rerender(
      change === 'filter'
        ? { project: 'A', query: { assignee: 'none' } }
        : { project: 'B', query: { assignee: 'me' } },
    );
    await waitFor(() => expect(result.current.data?.items[0]?.id).toBe('new'));
    await act(async () => {
      pending.resolve(page(['foreign']));
      await load;
    });
    expect(result.current.data?.items.map((t) => t.id)).toEqual(['new']);
  },
);
it('serializes pages, deduplicates IDs and preserves an optimistic move during paging', async () => {
  const pending = deferred();
  vi.mocked(fetchTasks)
    .mockResolvedValueOnce(page(['one'], 'cursor'))
    .mockReturnValueOnce(pending.promise);
  const { result } = renderHook(() => useTaskPages('A', {}));
  await waitFor(() => expect(result.current.data).not.toBeNull());
  let load!: Promise<void>;
  act(() => {
    load = result.current.loadMore();
    void result.current.loadMore();
  });
  act(() =>
    result.current.setTasks((tasks) =>
      tasks.map((t) => ({ ...t, status: 'IN_PROGRESS', version: 2 })),
    ),
  );
  await act(async () => {
    pending.resolve(page(['one', 'two']));
    await load;
  });
  expect(fetchTasks).toHaveBeenCalledTimes(2);
  expect(result.current.data?.items.map((t) => t.id)).toEqual(['one', 'two']);
  expect(result.current.data?.items[0]).toMatchObject({
    status: 'IN_PROGRESS',
    version: 2,
  });
  // Rollback only the failed task, preserving tasks appended in the meantime.
  act(() =>
    result.current.setTasks((tasks) =>
      tasks.map((t) => (t.id === 'one' ? task('one') : t)),
    ),
  );
  expect(result.current.data?.items.map((t) => t.id)).toEqual(['one', 'two']);
});
it('retries a failed page without losing rows or advancing its cursor', async () => {
  vi.mocked(fetchTasks)
    .mockResolvedValueOnce(page(['one'], 'cursor'))
    .mockRejectedValueOnce(new ApiError('offline', 'NETWORK', 0))
    .mockResolvedValueOnce(page(['two']));
  const { result } = renderHook(() => useTaskPages('A', {}));
  await waitFor(() => expect(result.current.data).not.toBeNull());
  await act(() => result.current.loadMore());
  expect(result.current.moreError).toBe('offline');
  expect(result.current.data?.nextCursor).toBe('cursor');
  await act(() => result.current.loadMore());
  expect(result.current.data?.items.map((t) => t.id)).toEqual(['one', 'two']);
  expect(result.current.moreError).toBe('');
});
it('clears private rows and participant metadata when a subsequent page denies access', async () => {
  vi.mocked(fetchTasks)
    .mockResolvedValueOnce(page(['private'], 'cursor'))
    .mockRejectedValueOnce(new ApiError('unavailable', 'NOT_FOUND', 404));
  const { result } = renderHook(() => useTaskPages('A', {}));
  await waitFor(() => expect(result.current.data).not.toBeNull());
  await act(() => result.current.loadMore());
  expect(result.current.data).toBeNull();
  expect(result.current.error).toBe('unavailable');
});
it('invalidates a pending page on mutation refresh and refetches all previously loaded pages', async () => {
  const pending = deferred();
  vi.mocked(fetchTasks)
    .mockResolvedValueOnce(page(['one'], 'cursor'))
    .mockResolvedValueOnce(page(['two'], 'cursor2'))
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(page(['updated'], 'new-cursor'))
    .mockResolvedValueOnce(page(['two']));
  const { result } = renderHook(() => useTaskPages('A', {}));
  await waitFor(() => expect(result.current.data).not.toBeNull());
  await act(() => result.current.loadMore());
  let load!: Promise<void>;
  act(() => {
    load = result.current.loadMore();
    result.current.reload();
  });
  await waitFor(() =>
    expect(result.current.data?.items.map((t) => t.id)).toEqual([
      'updated',
      'two',
    ]),
  );
  await act(async () => {
    pending.resolve(page(['stale']));
    await load;
  });
  expect(result.current.data?.items.map((t) => t.id)).toEqual([
    'updated',
    'two',
  ]);
});
