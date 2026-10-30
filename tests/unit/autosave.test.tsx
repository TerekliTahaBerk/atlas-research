import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { artifactCommand, ApiError } from '@/features/artifacts/client';
import { readDraft } from '@/features/documents/drafts';
import {
  useAutosave,
  type SaveResult,
} from '@/features/documents/use-autosave';
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
    let pending!: Promise<SaveResult>;
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
  let pending!: Promise<SaveResult>;
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

it('returns local no-op and disabled outcomes without sending a save', async () => {
  const { result, rerender, unmount } = renderHook(
    ({ enabled }) => useAutosave({ ...options, enabled }),
    { initialProps: { enabled: true } },
  );
  await act(async () =>
    expect(await result.current.save()).toEqual({
      kind: 'unchanged',
      revision: 1,
    }),
  );
  rerender({ enabled: false });
  await act(async () =>
    expect(await result.current.saveOnTop(2)).toEqual({ kind: 'disabled' }),
  );
  unmount();
  expect(await result.current.save()).toEqual({ kind: 'cancelled' });
  expect(artifactCommand).not.toHaveBeenCalled();
});
it('confirms recovery against the authorized revision and updates revision only after acknowledgement', async () => {
  let resolve!: (value: { id: string; revision: number }) => void;
  vi.mocked(artifactCommand).mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolve = yes;
      }),
  );
  const { result } = renderHook(() => useAutosave(options));
  act(() => result.current.change(content('recovered')));
  let pending!: Promise<SaveResult>;
  act(() => {
    pending = result.current.saveOnTop(4);
  });
  expect(result.current.revision).toBe(1);
  expect(readDraft('actor', 'project', 'document')?.content).toEqual(
    content('recovered'),
  );
  await act(async () => {
    resolve({ id: 'document', revision: 5 });
    expect(await pending).toEqual({
      kind: 'confirmed',
      revision: 5,
      current: true,
      unchanged: false,
    });
  });
  expect(artifactCommand).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedRevision: 4,
      content: content('recovered'),
    }),
  );
  expect(result.current.revision).toBe(5);
  expect(result.current.status).toBe('saved');
  expect(readDraft('actor', 'project', 'document')).toBeNull();
});
it.each(['NETWORK', 'CONFLICT', 'VALIDATION_ERROR', 'FORBIDDEN'] as const)(
  'returns an explicit %s outcome and retains the recovery draft',
  async (code) => {
    vi.mocked(artifactCommand).mockRejectedValue(
      new ApiError('not saved', code, code === 'NETWORK' ? 0 : 400),
    );
    const { result } = renderHook(() => useAutosave(options));
    act(() => result.current.change(content('recover me')));
    await act(async () => {
      const outcome = await result.current.saveOnTop(2);
      expect(outcome).toMatchObject({
        kind:
          code === 'NETWORK'
            ? 'uncertain'
            : code === 'CONFLICT'
              ? 'conflict'
              : 'failed',
      });
      if (code === 'NETWORK')
        expect(outcome).toMatchObject({ code: 'NETWORK' });
    });
    expect(result.current.revision).toBe(1);
    expect(readDraft('actor', 'project', 'document')?.content).toEqual(
      content('recover me'),
    );
  },
);
it('does not rebase or duplicate an in-flight save during explicit recovery', async () => {
  let resolve!: (value: { id: string; revision: number }) => void;
  vi.mocked(artifactCommand).mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolve = yes;
      }),
  );
  const { result } = renderHook(() => useAutosave(options));
  act(() => result.current.change(content('first')));
  let pending!: Promise<SaveResult>;
  act(() => {
    pending = result.current.save();
  });
  await act(async () => {
    expect(await result.current.save()).toEqual({ kind: 'in-flight' });
    expect(await result.current.saveOnTop(20)).toEqual({ kind: 'in-flight' });
    resolve({ id: 'document', revision: 2 });
    expect(await pending).toMatchObject({ kind: 'confirmed', revision: 2 });
  });
  expect(artifactCommand).toHaveBeenCalledTimes(1);
  expect(result.current.revision).toBe(2);
  act(() => result.current.change(content('second')));
  vi.mocked(artifactCommand).mockResolvedValueOnce({
    id: 'document',
    revision: 3,
  });
  await act(() => result.current.save());
  expect(artifactCommand).toHaveBeenLastCalledWith(
    expect.objectContaining({ expectedRevision: 2 }),
  );
});
it('retries an unknown committed recovery with the exact ID/body/base without a duplicate revision', async () => {
  let committedRequest: unknown;
  let revisions = 1;
  vi.mocked(artifactCommand).mockImplementation(async (command) => {
    if (!committedRequest) {
      committedRequest = command;
      revisions++;
      throw new ApiError('response lost', 'NETWORK', 0);
    }
    expect(command).toEqual(committedRequest);
    return { id: 'document', revision: revisions, replayed: true };
  });
  const { result } = renderHook(() => useAutosave(options));
  act(() => result.current.change(content('retained')));
  await act(async () =>
    expect(await result.current.saveOnTop(1)).toMatchObject({
      kind: 'uncertain',
    }),
  );
  expect(readDraft('actor', 'project', 'document')?.content).toEqual(
    content('retained'),
  );
  // The latest authorized read now observes the committed request, revision 2.
  await act(async () =>
    expect(await result.current.saveOnTop(2)).toMatchObject({
      kind: 'confirmed',
      revision: 2,
    }),
  );
  expect(revisions).toBe(2);
  expect(result.current.revision).toBe(2);
  expect(readDraft('actor', 'project', 'document')).toBeNull();
});
it('keeps a superseded replay in conflict instead of declaring the draft current', async () => {
  vi.mocked(artifactCommand)
    .mockRejectedValueOnce(new ApiError('lost', 'NETWORK', 0))
    .mockResolvedValueOnce({ id: 'document', revision: 2, replayed: true })
    .mockResolvedValueOnce({ id: 'document', revision: 4 });
  const { result } = renderHook(() => useAutosave(options));
  act(() => result.current.change(content('mine')));
  await act(() => result.current.saveOnTop(1));
  await act(async () =>
    expect(await result.current.saveOnTop(3)).toMatchObject({
      kind: 'conflict',
    }),
  );
  expect(result.current.status).toBe('conflict');
  expect(readDraft('actor', 'project', 'document')?.content).toEqual(
    content('mine'),
  );
  await act(async () =>
    expect(await result.current.saveOnTop(3)).toMatchObject({
      kind: 'confirmed',
      revision: 4,
    }),
  );
  const calls = vi.mocked(artifactCommand).mock.calls;
  expect(calls[1]?.[0]).toEqual(calls[0]?.[0]);
  expect(calls[2]?.[0]).toMatchObject({ expectedRevision: 3 });
  expect(calls[2]?.[0]).not.toEqual(calls[0]?.[0]);
});
it.each(['success', 'failure'] as const)(
  'returns cancelled after unmount during recovery %s',
  async (outcome) => {
    let resolve!: (value: { id: string; revision: number }) => void;
    let reject!: (reason: Error) => void;
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
    act(() => result.current.change(content('retained')));
    let pending!: Promise<SaveResult>;
    act(() => {
      pending = result.current.saveOnTop(2);
    });
    unmount();
    await act(async () => {
      if (outcome === 'success') resolve({ id: 'document', revision: 3 });
      else reject(new ApiError('lost', 'NETWORK', 0));
      expect(await pending).toEqual({ kind: 'cancelled' });
      await vi.advanceTimersByTimeAsync(100000);
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(artifactCommand).toHaveBeenCalledTimes(1);
    expect(readDraft('actor', 'project', 'document')?.content).toEqual(
      content('retained'),
    );
  },
);
it('does not acknowledge an incomplete server response', async () => {
  vi.mocked(artifactCommand).mockResolvedValue({ id: 'document' });
  const { result } = renderHook(() => useAutosave(options));
  act(() => result.current.change(content('retained')));
  await act(async () =>
    expect(await result.current.saveOnTop(2)).toMatchObject({
      kind: 'uncertain',
      code: 'INTERNAL_ERROR',
    }),
  );
  expect(readDraft('actor', 'project', 'document')?.content).toEqual(
    content('retained'),
  );
});
it('allows a fresh explicit rebase after an uncertain attempt is definitively rejected', async () => {
  vi.mocked(artifactCommand)
    .mockRejectedValueOnce(new ApiError('lost', 'NETWORK', 0))
    .mockRejectedValueOnce(new ApiError('changed', 'CONFLICT', 409))
    .mockResolvedValueOnce({ id: 'document', revision: 4 });
  const { result } = renderHook(() => useAutosave(options));
  act(() => result.current.change(content('retained')));
  await act(() => result.current.saveOnTop(1));
  await act(async () =>
    expect(await result.current.saveOnTop(3)).toMatchObject({
      kind: 'conflict',
    }),
  );
  await act(async () =>
    expect(await result.current.saveOnTop(3)).toMatchObject({
      kind: 'confirmed',
      revision: 4,
    }),
  );
  const calls = vi.mocked(artifactCommand).mock.calls;
  expect(calls[1]?.[0]).toEqual(calls[0]?.[0]);
  expect(calls[2]?.[0]).toMatchObject({ expectedRevision: 3 });
  expect(calls[2]?.[0]).not.toEqual(calls[0]?.[0]);
});
it('does not treat an undo as saved while a different attempt has an unknown outcome', async () => {
  vi.mocked(artifactCommand)
    .mockRejectedValueOnce(new ApiError('response lost', 'NETWORK', 0))
    .mockRejectedValueOnce(new ApiError('server advanced', 'CONFLICT', 409));
  const { result } = renderHook(() => useAutosave(options));
  act(() => result.current.change(content('possibly committed')));
  await act(() => result.current.save());
  act(() => result.current.change(options.initialContent));
  await act(async () =>
    expect(await result.current.save()).toMatchObject({ kind: 'conflict' }),
  );
  expect(artifactCommand).toHaveBeenCalledTimes(2);
  expect(artifactCommand).toHaveBeenLastCalledWith(
    expect.objectContaining({
      content: options.initialContent,
      expectedRevision: 1,
    }),
  );
  expect(readDraft('actor', 'project', 'document')?.content).toEqual(
    options.initialContent,
  );
});
