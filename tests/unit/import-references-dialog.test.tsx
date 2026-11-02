import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@atlas/ui/components/tooltip';
import type { ImportPreview, ProjectDto } from '../../packages/core/src/index';
import { ApiError } from '@/features/library/client';
import {
  importBatch,
  previewFile,
} from '@/features/library/interchange-client';
import { ImportReferencesDialog } from '@/features/library/import-references-dialog';

vi.mock('@/features/library/interchange-client', () => ({
  previewFile: vi.fn(),
  previewZotero: vi.fn(),
  importBatch: vi.fn(),
  fetchZoteroStatus: vi
    .fn()
    .mockResolvedValue({ configured: false, connection: null }),
  connectZotero: vi.fn(),
  disconnectZotero: vi.fn(),
  fetchZoteroCollections: vi.fn(),
  fetchZoteroItems: vi.fn(),
}));
const project = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'P',
  capabilities: ['project.read', 'project.write'],
} as ProjectDto;
const record = (title: string) => ({
  type: 'journal-article' as const,
  originalType: null,
  title,
  authors: [],
  editors: [],
  doi: null,
  issued: null,
  containerTitle: null,
  volume: null,
  issue: null,
  pages: null,
  publisher: null,
  issn: [],
  isbn: [],
  abstract: null,
  language: null,
  keywords: [],
  url: null,
});
const provenance = (index: number) => ({
  source: 'BIBTEX' as const,
  key: `k${index}`,
  index,
  library: 'sha256:x',
  version: null,
  atlasId: null,
});
const preview: ImportPreview = {
  source: 'BIBTEX',
  library: 'sha256:x',
  issues: [],
  counts: {
    NEW: 1,
    EXISTING: 1,
    ARCHIVED: 0,
    POSSIBLE_DUPLICATE: 1,
    UPDATE_AVAILABLE: 0,
    INVALID: 1,
  },
  items: [
    {
      index: 0,
      status: 'NEW',
      record: record('Brand new'),
      provenance: provenance(0),
      link: { source: 'BIBTEX', library: 'sha256:x', key: 'k0', version: null },
      issues: [],
      unsupported: [],
      match: null,
    },
    {
      index: 1,
      status: 'EXISTING',
      record: record('Known'),
      provenance: provenance(1),
      link: null,
      issues: [],
      unsupported: [],
      match: {
        projectPaperId: '44444444-4444-4444-8444-444444444444',
        title: 'Known',
        by: 'doi',
      },
    },
    {
      index: 2,
      status: 'POSSIBLE_DUPLICATE',
      record: record('Lookalike'),
      provenance: provenance(2),
      link: null,
      issues: [],
      unsupported: [],
      match: {
        projectPaperId: '55555555-5555-4555-8555-555555555555',
        title: 'Look-alike',
        by: 'title',
      },
    },
    {
      index: 3,
      status: 'INVALID',
      record: null,
      provenance: provenance(3),
      link: null,
      issues: ['Missing title.'],
      unsupported: [],
      match: null,
    },
  ],
};
beforeEach(() => {
  vi.mocked(previewFile).mockReset().mockResolvedValue(preview);
  vi.mocked(importBatch).mockReset();
});

it('previews without writing, imports only confirmed records and retries a lost batch with the same key', async () => {
  const user = userEvent.setup();
  const imported = vi.fn();
  vi.mocked(importBatch)
    .mockRejectedValueOnce(new ApiError('offline', 'NETWORK', 0))
    .mockResolvedValueOnce({
      id: project.id,
      results: [
        {
          index: 0,
          id: '66666666-6666-4666-8666-666666666666',
          outcome: 'CREATED',
        },
      ],
      replayed: true,
    });
  render(
    <StrictMode>
      <TooltipProvider>
        <ImportReferencesDialog
          open
          onOpenChange={() => {}}
          project={project}
          onImported={imported}
        />
      </TooltipProvider>
    </StrictMode>,
  );
  const file = new File(['@article{k0, title={Brand new}}'], 'refs.bib', {
    type: 'text/plain',
  });
  await user.upload(
    screen.getByLabelText(/Choose a .bib, .ris or .json file/),
    file,
  );
  expect(await screen.findByText('Brand new')).toBeTruthy();
  expect(previewFile).toHaveBeenCalledWith(
    project.id,
    'bibtex',
    '@article{k0, title={Brand new}}',
  );
  expect(importBatch).not.toHaveBeenCalled();
  // Only the NEW record is preselected; existing and invalid ones cannot be chosen.
  const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
  expect(boxes.map((b) => [b.checked, b.disabled])).toEqual([
    [true, false],
    [false, true],
    [false, false],
    [false, true],
  ]);
  expect(
    screen.getByText(/similar title; review before importing/),
  ).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Import 1 selected' }));
  expect(
    await screen.findByText(/Retrying is safe; nothing is imported twice/),
  ).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Retry failed' }));
  await screen.findByText(/Added 1, already in library 0/);
  const [first, second] = vi.mocked(importBatch).mock.calls.map((c) => c[0]);
  expect(first?.idempotencyKey).toBe(second?.idempotencyKey);
  expect(first?.items.map((i) => i.record.title)).toEqual(['Brand new']);
  await waitFor(() => expect(imported).toHaveBeenCalledTimes(1));
});
