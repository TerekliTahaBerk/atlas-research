import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TaskDto } from '../../packages/core/src/index';
import { ApiError } from '@/features/library/client';
import { useTaskMutations } from '@/features/tasks/use-task-mutations';

const base: TaskDto = {
  id: '11111111-1111-4111-8111-111111111111',
  artifactId: '22222222-2222-4222-8222-222222222222',
  projectId: '33333333-3333-4333-8333-333333333333',
  number: 7,
  title: 'Benchmark',
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
/** A send whose response the test releases explicitly. */
function controlled() {
  const calls: {
    version: number;
    resolve: () => void;
    reject: (e: unknown) => void;
  }[] = [];
  const send = (version: number) =>
    new Promise<unknown>((resolve, reject) => {
      calls.push({ version, resolve: () => resolve({}), reject });
    });
  return { calls, send };
}
function setup(task: TaskDto = base) {
  const onChanged = vi.fn();
  const onFailure = vi.fn();
  const hook = renderHook(
    ({ t }: { t: TaskDto }) =>
      useTaskMutations({ task: t, onChanged, onFailure }),
    { initialProps: { t: task } },
  );
  return { ...hook, onChanged, onFailure };
}
const flush = () => act(async () => {});

describe('per-task ordered mutation lane', () => {
  it('serializes rapid priority → due date → assignee edits with consecutive tokens', async () => {
    const { result } = setup();
    const api = controlled();
    act(() => {
      void result.current.run({
        label: 'priority',
        fields: { priority: 'HIGH' },
        send: api.send,
      });
      void result.current.run({
        label: 'due date',
        fields: { dueDate: '2026-12-01' },
        send: api.send,
      });
      void result.current.run({
        label: 'assignee',
        fields: { assignee: { id: base.id, name: 'Ada', state: 'ACTIVE' } },
        send: api.send,
      });
    });
    await flush();
    // Intent is visible immediately, before any confirmation.
    expect(result.current.view).toMatchObject({
      priority: 'HIGH',
      dueDate: '2026-12-01',
      assignee: { name: 'Ada' },
    });
    // Only the first edit is on the wire; the others wait for its version.
    expect(api.calls.map((c) => c.version)).toEqual([1]);
    await act(async () => api.calls[0]!.resolve());
    expect(api.calls.map((c) => c.version)).toEqual([1, 2]);
    await act(async () => api.calls[1]!.resolve());
    await act(async () => api.calls[2]!.resolve());
    expect(api.calls.map((c) => c.version)).toEqual([1, 2, 3]);
  });

  it('ignores a stale list reload and does not overshoot on an early one', async () => {
    const { result, rerender } = setup();
    const api = controlled();
    act(() => {
      void result.current.run({
        label: 'priority',
        fields: { priority: 'HIGH' },
        send: api.send,
      });
    });
    await flush();
    // A reload that already contains the in-flight edit lands first.
    rerender({ t: { ...base, version: 2, priority: 'HIGH' } });
    await act(async () => api.calls[0]!.resolve());
    // Then an older reload response arrives out of order.
    rerender({ t: { ...base, version: 1 } });
    expect(result.current.view.priority).toBe('HIGH');
    act(() => {
      void result.current.run({
        label: 'due date',
        fields: { dueDate: '2026-12-01' },
        send: api.send,
      });
    });
    await flush();
    expect(api.calls.map((c) => c.version)).toEqual([1, 2]);
  });

  it('adopts an external change seen in the list, and treats an unseen one as a conflict', async () => {
    const { result, rerender, onFailure } = setup();
    const api = controlled();
    rerender({ t: { ...base, version: 5, priority: 'LOW' } });
    act(() => {
      void result.current.run({
        label: 'priority',
        fields: { priority: 'HIGH' },
        send: api.send,
      });
      void result.current.run({
        label: 'assignee',
        fields: { assignee: null },
        send: api.send,
      });
    });
    await flush();
    expect(api.calls[0]!.version).toBe(5);
    // Someone else saved meanwhile: the edit fails and nothing queued behind
    // it is sent with a token based on the outdated view.
    await act(async () =>
      api.calls[0]!.reject(new ApiError('changed', 'CONFLICT', 409)),
    );
    await flush();
    expect(api.calls).toHaveLength(1);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0]![0]).toMatch(/#7 changed elsewhere/);
    expect(result.current.view.priority).toBe('LOW');
    expect(result.current.pending).toBe(false);
    // After the reload shows the other person's version, editing resumes.
    rerender({ t: { ...base, version: 6, priority: 'URGENT' } });
    act(() => {
      void result.current.run({
        label: 'priority',
        fields: { priority: 'HIGH' },
        send: api.send,
      });
    });
    await flush();
    expect(api.calls[1]!.version).toBe(6);
  });

  it('reports a failed edit truthfully and retries with the unchanged token', async () => {
    const { result, onFailure, onChanged } = setup();
    const api = controlled();
    act(() => {
      void result.current.run({
        label: 'assignee',
        fields: { assignee: { id: base.id, name: 'Ada', state: 'ACTIVE' } },
        send: api.send,
      });
    });
    await flush();
    await act(async () =>
      api.calls[0]!.reject(new ApiError('offline', 'NETWORK', 0)),
    );
    await waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1));
    expect(onFailure.mock.calls[0]![0]).toMatch(
      /Unable to update the assignee/,
    );
    expect(result.current.view.assignee).toBeNull();
    expect(onChanged).toHaveBeenCalled();
    act(() => {
      void result.current.run({
        label: 'assignee',
        fields: { assignee: { id: base.id, name: 'Ada', state: 'ACTIVE' } },
        send: api.send,
      });
    });
    await flush();
    expect(api.calls.map((c) => c.version)).toEqual([1, 1]);
    await act(async () => api.calls[1]!.resolve());
    expect(result.current.view.assignee).toMatchObject({ name: 'Ada' });
  });

  it('keeps confirmed values until a reload at least as new arrives', async () => {
    const { result, rerender } = setup();
    const api = controlled();
    act(() => {
      void result.current.run({
        label: 'priority',
        fields: { priority: 'HIGH' },
        send: api.send,
      });
    });
    await flush();
    await act(async () => api.calls[0]!.resolve());
    rerender({ t: { ...base, version: 1 } });
    expect(result.current.view.priority).toBe('HIGH');
    rerender({ t: { ...base, version: 2, priority: 'HIGH' } });
    expect(result.current.view.priority).toBe('HIGH');
    // A later external change is shown, not masked by the old overlay.
    rerender({ t: { ...base, version: 3, priority: 'LOW' } });
    expect(result.current.view.priority).toBe('LOW');
  });
});

describe('navigation during an in-flight task edit', () => {
  it('stops reporting and reloading once the panel is gone', async () => {
    const { result, unmount, onChanged, onFailure } = setup();
    const api = controlled();
    act(() => {
      void result.current.run({
        label: 'priority',
        fields: { priority: 'HIGH' },
        send: api.send,
      });
    });
    await flush();
    unmount();
    await act(async () =>
      api.calls[0]!.reject(new ApiError('changed', 'CONFLICT', 409)),
    );
    expect(onFailure).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
