import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { artifactCommand, fetchDocument } from '@/features/artifacts/client';
import { EmptyNoteNotice } from '@/features/atlas-ai/proposal-review';

vi.mock('@/features/artifacts/client', async (original) => ({
  ...(await original<typeof import('@/features/artifacts/client')>()),
  artifactCommand: vi.fn(),
  fetchDocument: vi.fn(),
}));
const note = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Atlas findings',
};
const doc = (revision: number, text?: string) =>
  ({
    revision,
    version: 1,
    content: {
      type: 'doc',
      content: [
        text
          ? { type: 'paragraph', content: [{ type: 'text', text }] }
          : { type: 'paragraph' },
      ],
    },
  }) as never;
beforeEach(() => {
  vi.mocked(artifactCommand).mockReset().mockResolvedValue({ id: note.id });
  vi.mocked(fetchDocument).mockReset();
});

it('archives a picker-created note only while it is provably untouched', async () => {
  const user = userEvent.setup();
  const done = vi.fn();
  vi.mocked(fetchDocument).mockResolvedValueOnce(doc(1));
  render(<EmptyNoteNotice note={note} projectId="p" onDone={done} />);
  await user.click(screen.getByRole('button', { name: 'Archive empty note' }));
  expect(artifactCommand).toHaveBeenCalledWith({
    command: 'document.archive',
    id: note.id,
    expectedVersion: 1,
  });
  expect(done).toHaveBeenCalledWith(expect.stringMatching(/can be restored/));
});

it('keeps a note that gained content or revisions meanwhile', async () => {
  const user = userEvent.setup();
  const done = vi.fn();
  for (const current of [doc(2), doc(1, 'User text')]) {
    vi.mocked(fetchDocument).mockResolvedValueOnce(current);
    const view = render(
      <EmptyNoteNotice note={note} projectId="p" onDone={done} />,
    );
    await user.click(
      screen.getByRole('button', { name: 'Archive empty note' }),
    );
    view.unmount();
  }
  expect(artifactCommand).not.toHaveBeenCalled();
  expect(done).toHaveBeenCalledWith(expect.stringMatching(/was kept/));
});
