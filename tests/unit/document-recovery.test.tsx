import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { DocumentDto, ProjectDto } from '../../packages/core/src/index';
import type { LiveEditorConfig } from '@/features/documents/editor/doc-editor';
import {
  artifactCommand,
  ApiError,
  fetchDocument,
  fetchLinks,
} from '@/features/artifacts/client';
import { LiveDocuments } from '@/features/documents/live-documents';
import { ToastProvider } from '@/components/atlas/toast';
import { readDraft } from '@/features/documents/drafts';
import { setSearchParams } from '../mocks/navigation';

const context = vi.hoisted(() => ({ setContext: vi.fn(), ask: vi.fn() }));
vi.mock('@/features/atlas-ai/atlas-provider', () => ({
  useAtlas: () => context,
}));
vi.mock('@/features/atlas-ai/atlas-surface', () => ({
  AtlasAnchor: () => null,
}));
vi.mock('@/features/atlas-ai/proposal-review', () => ({
  ARTIFACTS_CHANGED: 'test-artifacts',
}));
vi.mock('@/features/platform/platform-context', () => ({
  usePlatform: () => ({ profile: { id: 'actor' } }),
}));
vi.mock('@/features/shell/topbar', () => ({
  Topbar: ({
    children,
    actions,
  }: {
    children: ReactNode;
    actions: ReactNode;
  }) => (
    <header>
      {children}
      {actions}
    </header>
  ),
  Crumb: () => null,
}));
// Keep the caller, autosave hook, draft store and real notification provider.
// Replace editor/history rendering only; controls invoke their real callbacks.
vi.mock('@/features/documents/editor/doc-editor', () => ({
  DocEditor: ({ live }: { live: LiveEditorConfig }) => (
    <>
      <button
        disabled={!live.editable}
        onClick={() => live.onChange(body('retained draft'))}
      >
        Edit draft
      </button>
      <button onClick={() => live.onSave()}>Save now</button>
    </>
  ),
}));
vi.mock('@/features/documents/editor/live-nodes', async () => {
  const { createContext } = await import('react');
  return { LiveRefsContext: createContext(null) };
});
vi.mock('@/features/documents/live-version-history', () => ({
  LiveVersionHistoryDialog: ({
    open,
    onRestore,
  }: {
    open: boolean;
    onRestore: (revision: number) => Promise<void>;
  }) =>
    open ? (
      <button onClick={() => void onRestore(1)}>Restore revision 1</button>
    ) : null,
}));
vi.mock('@/features/artifacts/client', async (original) => ({
  ...(await original<typeof import('@/features/artifacts/client')>()),
  artifactCommand: vi.fn(),
  fetchDocument: vi.fn(),
  fetchLinks: vi.fn(),
}));
const id = '10000000-0000-4000-8000-000000000001';
const body = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const project: ProjectDto = {
  id: 'project',
  organizationId: 'org',
  workspaceId: 'workspace',
  name: 'Project',
  version: 1,
  capabilities: ['project.write'],
  visibility: 'PRIVATE',
  archived: false,
  updatedAt: '',
};
const document: DocumentDto = {
  id,
  artifactId: 'artifact',
  projectId: project.id,
  title: 'Recovery',
  kind: 'RESEARCH_NOTE',
  revision: 2,
  version: 2,
  archived: false,
  createdAt: '2026-10-30T00:00:00Z',
  updatedAt: '2026-10-30T00:00:00Z',
  createdBy: null,
  updatedBy: null,
  versionId: 'version',
  contentHash: 'hash',
  content: body('initial'),
  capabilities: ['document.edit'],
  references: [],
  people: [],
};
const success =
  'Your draft was saved as a new revision. The other revision stays in history.';
async function mount() {
  const view = render(
    <ToastProvider>
      <LiveDocuments project={project} />
    </ToastProvider>,
  );
  await act(async () => {});
  expect(screen.getByRole('button', { name: 'Edit draft' })).toBeVisible();
  return view;
}
async function conflict() {
  fireEvent.click(screen.getByRole('button', { name: 'Edit draft' }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
  });
  expect(screen.getByText('Someone saved a newer revision')).toBeVisible();
}
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  setSearchParams(`doc=${id}`);
  vi.mocked(fetchDocument).mockReset().mockResolvedValue(document);
  vi.mocked(fetchLinks)
    .mockReset()
    .mockResolvedValue({
      artifact: {
        artifactId: 'artifact',
        kind: 'DOCUMENT',
        id,
        state: 'AVAILABLE',
        title: 'Recovery',
        detail: null,
        href: null,
      },
      links: [],
    });
  vi.mocked(artifactCommand).mockReset();
});
afterEach(() => vi.useRealTimers());
it.each(['NETWORK', 'CONFLICT'] as const)(
  'does not announce recovery success after %s',
  async (code) => {
    vi.mocked(artifactCommand)
      .mockRejectedValueOnce(new ApiError('changed', 'CONFLICT', 409))
      .mockRejectedValueOnce(
        new ApiError('not confirmed', code, code === 'NETWORK' ? 0 : 409),
      );
    await mount();
    await conflict();
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Save mine as a new revision' }),
      );
    });
    expect(screen.queryByText(success)).not.toBeInTheDocument();
    expect(readDraft('actor', 'project', id)?.content).toEqual(
      body('retained draft'),
    );
  },
);
it('does not restore a revision after an unconfirmed prerequisite save', async () => {
  vi.mocked(artifactCommand)
    .mockRejectedValueOnce(new ApiError('not confirmed', 'NETWORK', 0))
    .mockResolvedValue({ id, revision: 3 });
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Edit draft' }));
  fireEvent.click(screen.getByRole('button', { name: 'Version history' }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Restore revision 1' }));
  });
  expect(artifactCommand).toHaveBeenCalledTimes(1);
  expect(readDraft('actor', 'project', id)?.content).toEqual(
    body('retained draft'),
  );
  expect(
    screen.queryByText(/Restored revision 1 as revision/),
  ).not.toBeInTheDocument();
});

it('announces recovery only after confirmation and displays the acknowledged revision', async () => {
  let complete!: (value: { id: string; revision: number }) => void;
  vi.mocked(artifactCommand)
    .mockRejectedValueOnce(new ApiError('changed', 'CONFLICT', 409))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
  await mount();
  await conflict();
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Save mine as a new revision' }),
    );
  });
  expect(screen.queryByText(success)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Edit draft' })).toBeDisabled();
  await act(async () => complete({ id, revision: 3 }));
  expect(screen.getByText(success)).toBeVisible();
  expect(screen.getByText(/Revision 3/)).toBeVisible();
  expect(readDraft('actor', 'project', id)).toBeNull();
  expect(artifactCommand).toHaveBeenCalledTimes(2);
});
it('describes a server-confirmed no-op without claiming a new revision', async () => {
  vi.mocked(artifactCommand)
    .mockRejectedValueOnce(new ApiError('changed', 'CONFLICT', 409))
    .mockResolvedValueOnce({ id, revision: 2, unchanged: true });
  await mount();
  await conflict();
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Save mine as a new revision' }),
    );
  });
  expect(screen.queryByText(success)).not.toBeInTheDocument();
  expect(
    screen.getByText('Your draft already matches the confirmed revision.'),
  ).toBeVisible();
});
it('does not restore during an in-flight save or count it as confirmation', async () => {
  let complete!: (value: { id: string; revision: number }) => void;
  vi.mocked(artifactCommand).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Edit draft' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
  fireEvent.click(screen.getByRole('button', { name: 'Version history' }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Restore revision 1' }));
  });
  expect(screen.getByText(/A save is still in progress/)).toBeVisible();
  expect(artifactCommand).toHaveBeenCalledTimes(1);
  await act(async () => complete({ id, revision: 3 }));
  expect(artifactCommand).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByText(/Restored revision 1 as revision/),
  ).not.toBeInTheDocument();
});
it('restores against the prerequisite save result instead of the captured React revision', async () => {
  vi.mocked(artifactCommand)
    .mockResolvedValueOnce({ id, revision: 3 })
    .mockResolvedValueOnce({ id, revision: 4 });
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Edit draft' }));
  fireEvent.click(screen.getByRole('button', { name: 'Version history' }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Restore revision 1' }));
  });
  expect(artifactCommand).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      command: 'document.restore-version',
      expectedRevision: 3,
      revision: 1,
    }),
  );
  expect(screen.getByText('Restored revision 1 as revision 4')).toBeVisible();
});
it('reports an unknown restore outcome without claiming failure or success', async () => {
  vi.mocked(artifactCommand).mockRejectedValueOnce(
    new ApiError('lost', 'NETWORK', 0),
  );
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Version history' }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Restore revision 1' }));
  });
  expect(artifactCommand).toHaveBeenCalledTimes(1);
  expect(
    screen.getByText(
      'Restore could not be confirmed. Check version history before retrying.',
    ),
  ).toBeVisible();
  expect(
    screen.queryByText(/Restored revision 1 as revision/),
  ).not.toBeInTheDocument();
});
it.each(['fetch', 'save', 'restore'] as const)(
  'ignores %s completion after document navigation',
  async (stage) => {
    let complete!: () => void;
    vi.mocked(artifactCommand).mockRejectedValueOnce(
      new ApiError('changed', 'CONFLICT', 409),
    );
    const view = await mount();
    if (stage !== 'restore') {
      await conflict();
      if (stage === 'fetch')
        vi.mocked(fetchDocument).mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              complete = () => resolve(document);
            }),
        );
      else
        vi.mocked(artifactCommand).mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              complete = () => resolve({ id, revision: 3 });
            }),
        );
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Save mine as a new revision' }),
        );
      });
    } else {
      vi.mocked(artifactCommand)
        .mockReset()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              complete = () => resolve({ id, revision: 3 });
            }),
        );
      fireEvent.click(screen.getByRole('button', { name: 'Version history' }));
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Restore revision 1' }),
        );
      });
    }
    const requests = vi.mocked(artifactCommand).mock.calls.length;
    // Keep the real toast provider mounted so a stale notification would be visible.
    view.rerender(
      <ToastProvider>
        <p>Another document</p>
      </ToastProvider>,
    );
    await act(async () => {
      complete();
    });
    expect(screen.queryByText(success)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Restored revision 1 as revision/),
    ).not.toBeInTheDocument();
    expect(artifactCommand).toHaveBeenCalledTimes(requests);
    if (stage !== 'restore')
      expect(readDraft('actor', 'project', id)?.content).toEqual(
        body('retained draft'),
      );
  },
);
