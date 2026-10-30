import { act, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ProjectDto, DocumentPage } from '../../packages/core/src/index';
import { fetchDocuments, fetchTasks } from '@/features/artifacts/client';
import { ProjectWork } from '@/features/platform/project-work';

vi.mock('@/features/artifacts/client', () => ({
  fetchDocuments: vi.fn(),
  fetchTasks: vi.fn(),
}));
const project = (id: string): ProjectDto => ({
  id,
  organizationId: 'org',
  workspaceId: 'workspace',
  name: id,
  version: 1,
  capabilities: ['project.read'],
  visibility: 'PRIVATE',
  archived: false,
  updatedAt: '',
});
const documents = (title: string): DocumentPage => ({
  items: [
    {
      id: title,
      artifactId: title,
      projectId: 'project',
      title,
      kind: 'RESEARCH_NOTE',
      revision: 1,
      version: 1,
      archived: false,
      createdAt: '',
      updatedAt: '',
      createdBy: null,
      updatedBy: null,
    },
  ],
  nextCursor: null,
});
beforeEach(() => {
  vi.mocked(fetchDocuments).mockReset();
  vi.mocked(fetchTasks).mockReset().mockResolvedValue({
    items: [],
    nextCursor: null,
    milestones: [],
    participants: [],
    capabilities: [],
  });
});

it('hides previous project titles and links while the next project loads', async () => {
  let finish!: (page: DocumentPage) => void;
  vi.mocked(fetchDocuments)
    .mockResolvedValueOnce(documents('Private A'))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  const { rerender } = render(<ProjectWork project={project('A')} />);
  expect(
    await screen.findByRole('link', { name: 'Private A' }),
  ).toHaveAttribute('href', '/app/projects/A/documents?doc=Private A');
  rerender(<ProjectWork project={project('B')} />);
  expect(
    screen.queryByRole('link', { name: 'Private A' }),
  ).not.toBeInTheDocument();
  await act(async () => finish(documents('Private B')));
  expect(
    await screen.findByRole('link', { name: 'Private B' }),
  ).toHaveAttribute('href', '/app/projects/B/documents?doc=Private B');
});

it('recovers from a previous project error and ignores its late completion', async () => {
  let finish!: (page: DocumentPage) => void;
  vi.mocked(fetchDocuments)
    .mockRejectedValueOnce(new Error('unavailable'))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(documents('Current C'));
  const { rerender } = render(<ProjectWork project={project('A')} />);
  await screen.findByText('Recent work could not be loaded.');
  rerender(<ProjectWork project={project('B')} />);
  expect(
    screen.queryByText('Recent work could not be loaded.'),
  ).not.toBeInTheDocument();
  rerender(<ProjectWork project={project('C')} />);
  await screen.findByRole('link', { name: 'Current C' });
  await act(async () => finish(documents('Late B')));
  expect(
    screen.queryByRole('link', { name: 'Late B' }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Current C' })).toBeVisible();
});
