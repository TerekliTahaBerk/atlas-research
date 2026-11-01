import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appendBlocks,
  artifactCommand as commandSchema,
  citationPrecision,
  sourceCitationAttrs,
  sourceNoteBlocks,
  validateDocumentContent,
  type ArtifactCommandInput,
  type DocNode,
  type ProjectDto,
  type SourceEvidence,
} from '../../packages/core/src/index';
import {
  ApiError,
  artifactCommand,
  fetchDocument,
  fetchOptions,
} from '@/features/artifacts/client';
import { SourceNoteDialog as Dialog } from '@/features/documents/source-note-dialog';
import { TooltipProvider } from '@atlas/ui/components/tooltip';

const SourceNoteDialog = (props: Parameters<typeof Dialog>[0]) => (
  <TooltipProvider>
    <Dialog {...props} />
  </TooltipProvider>
);

vi.mock('@/features/artifacts/client', async () => {
  const { ApiError } = await import('@/features/library/client');
  return {
    ApiError,
    artifactCommand: vi.fn(),
    fetchDocument: vi.fn(),
    fetchOptions: vi.fn(),
  };
});

const paperId = '11111111-1111-4111-8111-111111111111';
const versionId = '22222222-2222-4222-8222-222222222222';
const annotationId = '33333333-3333-4333-8333-333333333333';
const sha = 'a'.repeat(64);
const evidence = (
  annotation: SourceEvidence['annotation'] = null,
  version = true,
): SourceEvidence => ({
  projectPaperId: paperId,
  sourceVersionId: version ? versionId : null,
  sourceChecksum: version ? sha : null,
  annotation,
});
const highlight = {
  id: annotationId,
  page: 4,
  quote: 'Sparse attention reduces memory',
  startOffset: 10,
  endOffset: 41,
};

describe('evidence-only citation builder', () => {
  it('quotes an annotation with exactly its anchor fields', () => {
    const e = evidence(highlight);
    expect(citationPrecision(e)).toBe('quote');
    expect(sourceCitationAttrs(e)).toEqual({
      projectPaperId: paperId,
      sourceVersionId: versionId,
      annotationId,
      chunkId: null,
      page: 4,
      quote: highlight.quote,
      startOffset: 10,
      endOffset: 41,
      sourceChecksum: sha,
      label: null,
    });
    const blocks = sourceNoteBlocks(e, 'My  commentary\u0007');
    expect(blocks.map((b) => b.type)).toEqual(['blockquote', 'paragraph']);
    expect(JSON.stringify(blocks[1])).toContain('My  commentary');
    expect(JSON.stringify(blocks)).not.toContain('\u0007');
    const doc: DocNode = { type: 'doc', content: blocks };
    expect(validateDocumentContent(doc).ok).toBe(true);
  });

  it('never invents a page, quote or checksum without evidence', () => {
    const page = evidence({
      ...highlight,
      quote: null,
      startOffset: null,
      endOffset: null,
    });
    expect(citationPrecision(page)).toBe('page');
    expect(sourceCitationAttrs(page)).toMatchObject({ page: 4, quote: null });
    const version = evidence();
    expect(citationPrecision(version)).toBe('version');
    expect(sourceCitationAttrs(version)).toMatchObject({
      page: null,
      quote: null,
      annotationId: null,
      sourceChecksum: sha,
    });
    const paper: SourceEvidence = {
      ...evidence(null, false),
      sourceChecksum: sha,
    };
    expect(citationPrecision(paper)).toBe('paper');
    expect(sourceCitationAttrs(paper)).toMatchObject({
      sourceVersionId: null,
      sourceChecksum: null,
    });
    // An over-long highlight cannot be quoted; the builder drops it.
    const long = evidence({ ...highlight, quote: 'x'.repeat(2001) });
    expect(citationPrecision(long)).toBe('version');
    expect(sourceCitationAttrs(long).annotationId).toBeNull();
    for (const e of [page, version, paper, long])
      expect(
        validateDocumentContent({ type: 'doc', content: sourceNoteBlocks(e) })
          .ok,
      ).toBe(true);
  });

  it('appends after existing content and replaces only a lone empty paragraph', () => {
    const blocks = sourceNoteBlocks(evidence());
    expect(
      appendBlocks({ type: 'doc', content: [{ type: 'paragraph' }] }, blocks)
        .content,
    ).toEqual(blocks);
    const existing: DocNode = {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Kept' }],
    };
    expect(
      appendBlocks({ type: 'doc', content: [existing] }, blocks).content,
    ).toEqual([existing, ...blocks]);
  });

  it('accepts only stable IDs from the client, never quotes or pages', () => {
    const base = {
      command: 'document.cite-source',
      projectId: paperId,
      projectPaperId: paperId,
      target: { kind: 'new', title: 'Note' },
      clientRequestId: annotationId,
    };
    const parsed = commandSchema.parse(base);
    expect(parsed).toMatchObject({
      sourceVersionId: null,
      annotationId: null,
      commentary: '',
      sharePrivateAnnotation: false,
      target: { documentKind: 'RESEARCH_NOTE' },
    });
    for (const forged of [{ quote: 'x' }, { page: 3 }, { label: 'Smith' }])
      expect(commandSchema.safeParse({ ...base, ...forged }).success).toBe(
        false,
      );
  });
});

const project: ProjectDto = {
  id: '44444444-4444-4444-8444-444444444444',
  organizationId: 'org',
  workspaceId: 'ws',
  name: 'Journey',
  version: 1,
  capabilities: ['project.read', 'project.write'],
  visibility: 'PRIVATE',
  archived: false,
  updatedAt: '',
};
const noteId = '55555555-5555-4555-8555-555555555555';
const dialogEvidence = (visibility: 'PROJECT' | 'PRIVATE' = 'PROJECT') => ({
  paper: { id: paperId, title: 'Sparse Evoformer' },
  version: { id: versionId, ordinal: 1 },
  annotation: {
    id: annotationId,
    page: 4,
    quote: 'Sparse attention reduces memory',
    body: null,
    visibility,
  },
  page: 4,
});
type CiteInput = Extract<
  ArtifactCommandInput,
  { command: 'document.cite-source' }
>;
const sent = () =>
  vi.mocked(artifactCommand).mock.calls.map((c) => c[0] as CiteInput);

describe('Add to research note dialog', () => {
  beforeEach(() => {
    vi.mocked(artifactCommand).mockReset();
    vi.mocked(fetchDocument).mockReset();
    vi.mocked(fetchOptions)
      .mockReset()
      .mockResolvedValue({
        items: [
          {
            artifactId: noteId,
            id: noteId,
            kind: 'DOCUMENT',
            title: 'Reading log',
            detail: null,
          },
        ],
        people: [],
      });
  });

  it('writes nothing until confirmed and replays the same request after a lost response', async () => {
    const user = userEvent.setup();
    vi.mocked(artifactCommand)
      .mockRejectedValueOnce(new ApiError('offline', 'NETWORK', 0))
      .mockResolvedValueOnce({ id: noteId, revision: 1, replayed: true });
    render(
      <SourceNoteDialog
        open
        onOpenChange={() => {}}
        project={project}
        evidence={dialogEvidence()}
      />,
    );
    expect(await screen.findByText('Reading log')).toBeTruthy();
    expect(artifactCommand).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Add to note' }));
    expect(
      await screen.findByText(
        /Retrying is safe: the reference is never added twice/,
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText(/nothing was duplicated/);
    const [first, second] = sent();
    expect(first?.clientRequestId).toBe(second?.clientRequestId);
    expect(first).toMatchObject({
      projectPaperId: paperId,
      sourceVersionId: versionId,
      annotationId,
      target: { kind: 'new' },
      sharePrivateAnnotation: false,
    });
  });

  it('requires explicit consent before copying a private annotation', async () => {
    const user = userEvent.setup();
    vi.mocked(artifactCommand).mockResolvedValue({ id: noteId, revision: 1 });
    render(
      <SourceNoteDialog
        open
        onOpenChange={() => {}}
        project={project}
        evidence={dialogEvidence('PRIVATE')}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Add to note' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: /private/i }));
    await user.click(confirm);
    await waitFor(() => expect(sent()).toHaveLength(1));
    expect(sent()[0]?.sharePrivateAnnotation).toBe(true);
  });

  it('re-reads the note after a conflict and starts a new attempt on reconfirmation', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchDocument)
      .mockResolvedValueOnce({
        revision: 3,
        capabilities: ['document.edit'],
      } as never)
      .mockResolvedValueOnce({
        revision: 4,
        capabilities: ['document.edit'],
      } as never);
    vi.mocked(artifactCommand)
      .mockRejectedValueOnce(new ApiError('changed', 'CONFLICT', 409))
      .mockResolvedValueOnce({ id: noteId, revision: 5 });
    render(
      <SourceNoteDialog
        open
        onOpenChange={() => {}}
        project={project}
        evidence={dialogEvidence()}
      />,
    );
    await user.click(await screen.findByText('Reading log'));
    await screen.findByText('revision 3');
    await user.click(screen.getByRole('button', { name: 'Add to note' }));
    await screen.findByText(/The note changed since you chose it/);
    await screen.findByText('revision 4');
    await user.click(screen.getByRole('button', { name: 'Add to note' }));
    await screen.findByText(/Saved as revision 5/);
    const [first, second] = sent();
    expect(first?.target).toMatchObject({ expectedRevision: 3 });
    expect(second?.target).toMatchObject({ expectedRevision: 4 });
    expect(first?.clientRequestId).not.toBe(second?.clientRequestId);
  });
});
