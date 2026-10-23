// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DRAFT_TTL_MS,
  clearDraft,
  purgeDrafts,
  readDraft,
  writeDraft,
} from '../../apps/web/src/features/documents/drafts';

const content = { type: 'doc', content: [{ type: 'paragraph' }] };
describe('interrupted-draft recovery storage', () => {
  beforeEach(() => localStorage.clear());
  it('keys drafts by actor, project and document', () => {
    writeDraft('actor-a', 'project-1', 'doc-1', { content, baseRevision: 3 });
    expect(readDraft('actor-a', 'project-1', 'doc-1')).toMatchObject({
      baseRevision: 3,
      content,
    });
    expect(readDraft('actor-b', 'project-1', 'doc-1')).toBeNull();
    expect(readDraft('actor-a', 'project-2', 'doc-1')).toBeNull();
    clearDraft('actor-a', 'project-1', 'doc-1');
    expect(readDraft('actor-a', 'project-1', 'doc-1')).toBeNull();
  });
  it('expires drafts and removes corrupt entries', () => {
    const now = Date.now();
    writeDraft(
      'a',
      'p',
      'd',
      { content, baseRevision: 1 },
      now - DRAFT_TTL_MS - 1,
    );
    expect(readDraft('a', 'p', 'd', now)).toBeNull();
    expect(localStorage.length).toBe(0);
    localStorage.setItem('atlas:draft:v1:a:p:d', '{not json');
    expect(readDraft('a', 'p', 'd')).toBeNull();
    expect(localStorage.length).toBe(0);
  });
  it('purges other accounts on load and everything on sign-out', () => {
    writeDraft('a', 'p', 'd1', { content, baseRevision: 1 });
    writeDraft('b', 'p', 'd2', { content, baseRevision: 1 });
    localStorage.setItem('theme', 'dark');
    purgeDrafts('a');
    expect(readDraft('a', 'p', 'd1')).not.toBeNull();
    expect(readDraft('b', 'p', 'd2')).toBeNull();
    purgeDrafts();
    expect(readDraft('a', 'p', 'd1')).toBeNull();
    // Unrelated preferences are untouched.
    expect(localStorage.getItem('theme')).toBe('dark');
  });
  it('refuses oversized drafts instead of truncating them', () => {
    const big = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'x'.repeat(500000) }],
        },
      ],
    };
    expect(writeDraft('a', 'p', 'd', { content: big, baseRevision: 1 })).toBe(
      false,
    );
    expect(readDraft('a', 'p', 'd')).toBeNull();
  });
});
