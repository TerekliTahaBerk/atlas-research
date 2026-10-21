import { describe, expect, it } from 'vitest';
import {
  apiError,
  createProjectInput,
  errorCodes,
  errorStatus,
  pageQuery,
} from '../../packages/core/src/index';
const workspaceId = '00000000-0000-4000-8000-000000000001';
describe('project input boundary', () => {
  it('trims names and defaults to private', () =>
    expect(
      createProjectInput.parse({ workspaceId, name: '  Literature review  ' }),
    ).toEqual({
      workspaceId,
      name: 'Literature review',
      visibility: 'private',
    }));
  it.each([
    { workspaceId: 'sample', name: 'Test' },
    { workspaceId, name: '' },
    { workspaceId, name: 'a'.repeat(121) },
    { workspaceId, name: 'Test', role: 'OWNER' },
  ])('rejects malformed or extra input %j', (input) =>
    expect(createProjectInput.safeParse(input).success).toBe(false),
  );
  it('bounds pagination and rejects unsafe limits', () => {
    expect(pageQuery.parse({}).limit).toBe(30);
    expect(pageQuery.parse({ limit: '100' }).limit).toBe(100);
    expect(pageQuery.safeParse({ limit: 101 }).success).toBe(false);
    expect(pageQuery.safeParse({ limit: -1 }).success).toBe(false);
  });
  it('normalizes every error category to a failure status', () => {
    for (const code of errorCodes) {
      expect(errorStatus[code]).toBeGreaterThanOrEqual(400);
      expect(apiError(code, 'Safe public message', 'trace-1')).toEqual({
        error: { code, message: 'Safe public message' },
        requestId: 'trace-1',
      });
    }
  });
});
