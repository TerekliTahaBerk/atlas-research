import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { artifactCommand, ApiError } from '@/features/artifacts/client';
import { readDraft } from '@/features/documents/drafts';
import { useAutosave } from '@/features/documents/use-autosave';
vi.mock('@/features/artifacts/client', async (original) => ({
  ...(await original<typeof import('@/features/artifacts/client')>()),
  artifactCommand: vi.fn(),
}));
const content = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const options = {
  actorId: 'actor',
  projectId: 'project',
  documentId: 'document',
  revision: 1,
  initialContent: content('initial'),
  enabled: true,
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(artifactCommand).mockReset();
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});
it.each(['success', 'failure'])(
  'does not schedule or save again after unmount during an in-flight %s',
  async (outcome) => {
    let resolve!: (value: { id: string; revision: number }) => void;
    let reject!: (error: Error) => void;
    vi.mocked(artifactCommand).mockImplementation(
      () =>
        new Promise((yes, no) => {
          resolve = yes;
          reject = no;
        }),
    );
    const onSaved = vi.fn();
    const { result, unmount } = renderHook(() =>
      useAutosave({ ...options, onSaved }),
    );
    act(() => result.current.change(content('first')));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.save();
    });
    act(() => result.current.change(content('newer draft')));
    unmount();
    await act(async () => {
      if (outcome === 'success') resolve({ id: 'document', revision: 2 });
      else reject(new ApiError('offline', 'NETWORK', 0));
      await pending;
      await vi.advanceTimersByTimeAsync(100000);
    });
    expect(artifactCommand).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(readDraft('actor', 'project', 'document')?.content).toEqual(
      content('newer draft'),
    );
  },
);
it('retains edits made in flight and marks Saved only after their commit', async () => {
  let resolve!: (value: { id: string; revision: number }) => void;
  vi.mocked(artifactCommand)
    .mockImplementationOnce(
      () =>
        new Promise((yes) => {
          resolve = yes;
        }),
    )
    .mockResolvedValue({ id: 'document', revision: 3 });
  const { result } = renderHook(() => useAutosave(options));
  act(() => result.current.change(content('first')));
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.save();
  });
  expect(result.current.status).toBe('saving');
  act(() => result.current.change(content('second')));
  await act(async () => {
    resolve({ id: 'document', revision: 2 });
    await pending;
  });
  expect(result.current.status).toBe('unsaved');
  expect(readDraft('actor', 'project', 'document')?.content).toEqual(
    content('second'),
  );
  await act(() => vi.advanceTimersByTimeAsync(1500));
  expect(artifactCommand).toHaveBeenLastCalledWith(
    expect.objectContaining({
      expectedRevision: 2,
      content: content('second'),
    }),
  );
  expect(result.current.status).toBe('saved');
  expect(readDraft('actor', 'project', 'document')).toBeNull();
});
it('reuses the save request ID after network failure and stops automatic saves on conflict', async () => {
  vi.mocked(artifactCommand)
    .mockRejectedValueOnce(new ApiError('offline', 'NETWORK', 0))
    .mockResolvedValueOnce({ id: 'document', revision: 2 })
    .mockRejectedValue(new ApiError('changed', 'CONFLICT', 409));
  const { result } = renderHook(() => useAutosave(options));
  act(() => result.current.change(content('first')));
  await act(() => result.current.save());
  expect(result.current.status).toBe('offline');
  await act(() => result.current.save());
  const calls = vi.mocked(artifactCommand).mock.calls;
  expect(calls[0]?.[0]).toEqual(calls[1]?.[0]);
  act(() => result.current.change(content('second')));
  await act(() => result.current.save());
  expect(result.current.status).toBe('conflict');
  await act(() => vi.advanceTimersByTimeAsync(100000));
  expect(artifactCommand).toHaveBeenCalledTimes(3);
  expect(readDraft('actor', 'project', 'document')?.content).toEqual(
    content('second'),
  );
});
