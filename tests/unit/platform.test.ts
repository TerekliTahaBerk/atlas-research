import { describe, it, expect } from 'vitest';
import {
  platformCommand,
  platformState,
} from '../../packages/core/src/platform';
import { safeReturnTo } from '../../apps/web/src/features/identity/redirect';
import { readNavigation } from '../../apps/web/src/features/platform/navigation';
import { validateEnvironment } from '../../apps/web/src/lib/env';
const uuid = '10000000-0000-4000-8000-000000000001';
describe('Phase 01 external boundaries', () => {
  it('rejects malformed or different-actor navigation hints', () => {
    expect(readNavigation('{broken', uuid)).toBeNull();
    expect(
      readNavigation(
        JSON.stringify({ actorId: uuid, workspaceId: 'sample' }),
        uuid,
      ),
    ).toBeNull();
    const preference = { actorId: uuid, workspaceId: uuid, projectId: uuid };
    expect(
      readNavigation(
        JSON.stringify(preference),
        '20000000-0000-4000-8000-000000000001',
      ),
    ).toBeNull();
    expect(readNavigation(JSON.stringify(preference), uuid)).toEqual(
      preference,
    );
  });
  it.each([
    'https://evil.example',
    '//evil.example',
    '/app-evil',
    '/app\\evil',
    '/app/%2f%2fevil',
    '/login',
    '/auth/callback',
    '/app\n/evil',
  ])('rejects unsafe return URL %s', (url) =>
    expect(safeReturnTo(url)).toBe('/app/home'),
  );
  it('preserves authorized app destinations and query context', () =>
    expect(safeReturnTo(`/app/projects/${uuid}/overview?tab=members`)).toBe(
      `/app/projects/${uuid}/overview?tab=members`,
    ));
  it('rejects browser actor/scope injection and sample IDs', () => {
    expect(
      platformCommand.safeParse({
        command: 'project.create',
        workspaceId: 'sample',
        name: 'Research',
        idempotencyKey: uuid,
      }).success,
    ).toBe(false);
    expect(
      platformCommand.safeParse({
        command: 'organization.create',
        name: 'Lab',
        actorId: uuid,
      }).success,
    ).toBe(false);
    expect(
      platformCommand.safeParse({
        command: 'project.update',
        id: uuid,
        name: 'Research',
        visibility: 'PRIVATE',
        expectedVersion: 1,
        organizationId: uuid,
      }).success,
    ).toBe(false);
  });
  it('requires optimistic versions and project idempotency keys', () => {
    expect(
      platformCommand.safeParse({
        command: 'project.create',
        workspaceId: uuid,
        name: 'Research',
      }).success,
    ).toBe(false);
    expect(
      platformCommand.safeParse({ command: 'project.archive', id: uuid })
        .success,
    ).toBe(false);
    expect(
      platformCommand.safeParse({
        command: 'membership.remove',
        scope: 'project',
        scopeId: uuid,
        profileId: uuid,
        expectedVersion: 0,
      }).success,
    ).toBe(false);
  });
  it('bounds onboarding drafts and invitation tokens', () => {
    expect(
      platformCommand.safeParse({
        command: 'onboarding.save',
        draft: {
          displayName: 'Researcher',
          researchInterests: Array(21).fill('Math'),
        },
      }).success,
    ).toBe(false);
    expect(
      platformCommand.safeParse({
        command: 'invitation.accept',
        token: 'arbitrary',
      }).success,
    ).toBe(false);
  });
  it('fails live environment validation without printing values', () => {
    expect(() => validateEnvironment({ ATLAS_MODE: 'live' })).toThrow(
      'Missing live environment variables',
    );
    expect(() =>
      validateEnvironment({ DATABASE_URL: 'sensitive-do-not-print' }),
    ).toThrow('Invalid environment variables: DATABASE_URL');
  });
  it('keeps the preview opt-in boundary free of required credentials', () =>
    expect(validateEnvironment({}).ATLAS_MODE).toBe('preview'));
  it('rejects malformed authorized projections', () =>
    expect(
      platformState.safeParse({ profile: { id: uuid }, organizations: [] })
        .success,
    ).toBe(false));
});
