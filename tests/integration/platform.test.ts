import { randomUUID, createHash } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { createDatabase } from '../../packages/database/src/index';
import {
  executeCommand,
  directory,
  invitations,
  getProject,
  loadState,
  members,
} from '../../apps/web/src/features/platform/server/services';
import {
  withActor,
  runtimeDatabase,
  checkRuntime,
} from '../../apps/web/src/features/platform/server/database';
import { rateLimit } from '../../apps/web/src/features/platform/server/limiter';
import { publicError } from '../../apps/web/src/features/platform/server/errors';
import type { PlatformCommand } from '../../packages/core/src/platform';
const runtime = process.env.ATLAS_TEST_DATABASE_URL;
const adminUrl = process.env.ATLAS_TEST_ADMIN_URL;
if (!runtime || !adminUrl)
  throw new Error(
    'Explicit disposable ATLAS_TEST_DATABASE_URL and ATLAS_TEST_ADMIN_URL are required.',
  );
for (const value of [runtime, adminUrl]) {
  const url = new URL(value);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.startsWith('/atlas_p01_test')
  )
    throw new Error(
      'Tests require the isolated local atlas_p01_test database.',
    );
}
const admin = createDatabase(adminUrl);
const actor = () => ({
  id: randomUUID(),
  email: `${randomUUID()}@atlas.example`,
});
const a = actor(),
  b = actor(),
  c = actor();
const cmd = (who: typeof a, command: PlatformCommand) =>
  executeCommand(who, command, randomUUID());
let personal: string;
let org: string;
let ws: string;
let project: string;
beforeAll(async () => {
  vi.stubEnv('ATLAS_MODE', 'live');
  vi.stubEnv('DATABASE_URL', runtime);
  vi.stubEnv('ATLAS_RATE_SECRET', 'local-test-rate-secret-32-characters');
  vi.stubEnv('ATLAS_CURSOR_SECRET', 'local-test-cursor-secret-32-characters');
  vi.stubEnv('ATLAS_ORIGIN', 'http://127.0.0.1:3102');
  vi.stubEnv('ATLAS_DEV_INVITATION_LINKS', 'true');
  vi.stubEnv('NODE_ENV', 'development');
});
afterAll(async () => {
  await admin.$disconnect();
  await runtimeDatabase().$disconnect();
  vi.unstubAllEnvs();
});
async function invite(
  who: typeof a,
  invitee: typeof a,
  scope: 'organization' | 'workspace' | 'project',
  scopeId: string,
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'EDITOR' | 'VIEWER',
) {
  const result = await cmd(who, {
    command: 'invitation.create',
    scope,
    scopeId,
    role,
    email: invitee.email,
  });
  const token = new URLSearchParams(
    new URL(result.invitationLink!).hash.slice(1),
  ).get('token')!;
  return { token, id: result.id! };
}
describe.sequential('real non-owner PostgreSQL platform boundary', () => {
  it('waits for a briefly saturated pool instead of failing the two-second default acquisition budget', async () => {
    const db = createDatabase(runtime!);
    let started = 0;
    let ready!: () => void;
    const allStarted = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const held = Array.from({ length: 10 }, () =>
      db.$transaction(async (tx) => {
        started++;
        if (started === 10) ready();
        await tx.$executeRaw`SELECT pg_sleep(3)`;
      }),
    );
    try {
      await allStarted;
      const waiting = db.$transaction(
        (tx) => tx.$queryRaw`SELECT 1 AS connected`,
      );
      await expect(waiting).resolves.toEqual([{ connected: 1 }]);
      await Promise.all(held);
    } finally {
      await Promise.allSettled(held);
      await db.$disconnect();
    }
  });
  it('provisions exactly one personal hierarchy under simultaneous retries', async () => {
    const input = {
      command: 'bootstrap' as const,
      displayName: 'Researcher A',
      workspaceName: 'My Research',
      researchInterests: [],
      projectName: 'Initial study',
    };
    const results = await Promise.all([
      cmd(a, input),
      cmd(a, input),
      cmd(a, input),
    ]);
    personal = results[0]!.workspaceId!;
    expect(new Set(results.map((r) => r.workspaceId)).size).toBe(1);
    expect(
      await admin.organization.count({ where: { personalOwnerId: a.id } }),
    ).toBe(1);
    expect(
      await admin.workspace.count({ where: { personalOwnerId: a.id } }),
    ).toBe(1);
    expect(await admin.project.count({ where: { createdById: a.id } })).toBe(1);
    expect((await loadState(a, personal)).profile?.onboardingCompleted).toBe(
      true,
    );
    for (const who of [b, c])
      await cmd(who, {
        command: 'bootstrap',
        displayName: 'Other researcher',
        workspaceName: 'Personal',
        researchInterests: [],
      });
  });
  it('rejects cross-tenant access and creates an explicit owner transactionally', async () => {
    org = (await cmd(a, { command: 'organization.create', name: 'Lab A' })).id!;
    ws = (
      await cmd(a, {
        command: 'workspace.create',
        organizationId: org,
        name: 'Team A',
      })
    ).id!;
    const key = randomUUID();
    const input = {
      command: 'project.create' as const,
      workspaceId: ws,
      name: 'Private study',
      visibility: 'PRIVATE' as const,
      idempotencyKey: key,
    };
    const results = await Promise.all([cmd(a, input), cmd(a, input)]);
    project = results[0]!.id!;
    expect(results[1]!.id).toBe(project);
    expect((await getProject(a, project)).capabilities).toContain(
      'project.members.manage',
    );
    await expect(getProject(b, project)).rejects.toThrow('Project unavailable');
    await expect(
      cmd(b, {
        command: 'workspace.create',
        organizationId: org,
        name: 'Attack',
      }),
    ).rejects.toThrow();
    await expect(
      cmd(b, {
        command: 'project.create',
        workspaceId: ws,
        name: 'Attack',
        visibility: 'PRIVATE',
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow();
    await expect(
      cmd(a, { ...input, name: 'Changed payload' }),
    ).rejects.toThrow();
  });
  it('has no raw write permission and denies reads without actor context', async () => {
    const db = runtimeDatabase();
    expect(await db.$queryRaw`SELECT id FROM projects`).toEqual([]);
    await expect(
      db.$executeRaw`UPDATE projects SET name='Compromised' WHERE id=${project}::uuid`,
    ).rejects.toThrow();
    await expect(
      db.$executeRaw`INSERT INTO profiles(id,display_name,updated_at) VALUES(${randomUUID()}::uuid,'Forged',now())`,
    ).rejects.toThrow();
  });
  it('rejects a runtime that owns another public table even when profiles has a different owner', async () => {
    const role = decodeURIComponent(new URL(runtime!).username);
    if (!/^[a-z_][a-z0-9_]*$/.test(role))
      throw new Error('Unexpected local test role.');
    await expect(
      admin.$transaction(async (tx) => {
        // Test-only DDL against the loopback target validated above. Quote the
        // allowlisted role identifier; roll every grant/ownership change back.
        await tx.$executeRawUnsafe(
          `GRANT CREATE ON SCHEMA public TO "${role}"`,
        );
        await tx.$executeRawUnsafe(`ALTER TABLE projects OWNER TO "${role}"`);
        await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
        await expect(checkRuntime(tx)).rejects.toMatchObject({
          code: 'INTERNAL_ERROR',
        });
        throw new Error('ROLLBACK_OWNER_PROBE');
      }),
    ).rejects.toThrow('ROLLBACK_OWNER_PROBE');
    expect((await getProject(a, project)).id).toBe(project);
  });
  it('resets transaction-local identity on reused connections', async () => {
    for (let n = 0; n < 4; n++) {
      expect((await loadState(a, ws)).projects.map((p) => p.id)).toContain(
        project,
      );
      expect((await loadState(b)).projects.map((p) => p.id)).not.toContain(
        project,
      );
      expect(
        await runtimeDatabase().$queryRaw`SELECT id FROM projects`,
      ).toEqual([]);
    }
  });
  it('atomically accepts one invitation and rejects replay/wrong identity', async () => {
    const invitation = await invite(a, b, 'workspace', ws, 'MEMBER');
    await expect(
      cmd(c, { command: 'invitation.accept', token: invitation.token }),
    ).rejects.toThrow();
    const results = await Promise.allSettled([
      cmd(b, { command: 'invitation.accept', token: invitation.token }),
      cmd(b, { command: 'invitation.accept', token: invitation.token }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await admin.workspaceMembership.count({
        where: { workspaceId: ws, profileId: b.id },
      }),
    ).toBe(1);
    await expect(getProject(b, project)).rejects.toThrow();
    await expect(
      cmd(b, { command: 'invitation.accept', token: invitation.token }),
    ).rejects.toThrow();
  });
  it('honors workspace visibility as read only and private membership isolation', async () => {
    const visible = (
      await cmd(a, {
        command: 'project.create',
        workspaceId: ws,
        name: 'Workspace study',
        visibility: 'WORKSPACE',
        idempotencyKey: randomUUID(),
      })
    ).id!;
    expect((await getProject(b, visible)).capabilities).toEqual([
      'project.read',
    ]);
    await expect(
      cmd(b, {
        command: 'project.update',
        id: visible,
        name: 'Attack',
        visibility: 'PRIVATE',
        expectedVersion: 1,
      }),
    ).rejects.toThrow();
    await expect(members(b, 'project', project)).rejects.toThrow();
    await expect(
      cmd(b, {
        command: 'invitation.create',
        scope: 'project',
        scopeId: project,
        role: 'OWNER',
        email: c.email,
      }),
    ).rejects.toThrow();
  });
  it('keeps organization administrators outside private research', async () => {
    const invitation = await invite(a, c, 'organization', org, 'ADMIN');
    await cmd(c, { command: 'invitation.accept', token: invitation.token });
    const workspaceInvite = await invite(a, c, 'workspace', ws, 'ADMIN');
    await cmd(c, {
      command: 'invitation.accept',
      token: workspaceInvite.token,
    });
    await expect(getProject(c, project)).rejects.toThrow();
    await expect(
      cmd(c, {
        command: 'invitation.create',
        scope: 'organization',
        scopeId: org,
        role: 'ADMIN',
        email: b.email,
      }),
    ).rejects.toThrow();
    expect(
      (await loadState(c, ws)).projects.some((p) => p.id === project),
    ).toBe(false);
  });
  it('rejects revoked, expired and inviter-demoted invitations', async () => {
    const revoked = await invite(a, b, 'project', project, 'VIEWER');
    await cmd(a, { command: 'invitation.revoke', id: revoked.id });
    await expect(
      cmd(b, { command: 'invitation.accept', token: revoked.token }),
    ).rejects.toThrow();
    const expired = await invite(a, b, 'project', project, 'VIEWER');
    await admin.invitation.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(0) },
    });
    await expect(
      cmd(b, { command: 'invitation.accept', token: expired.token }),
    ).rejects.toThrow();
    const inviterInvite = await invite(c, b, 'workspace', ws, 'VIEWER');
    await cmd(a, {
      command: 'membership.set',
      scope: 'workspace',
      scopeId: ws,
      profileId: c.id,
      expectedVersion: 1,
      role: 'MEMBER',
    });
    // c remains an organization ADMIN and can still manage workspace metadata;
    // demote its organization role as well to remove effective authority.
    await cmd(a, {
      command: 'membership.set',
      scope: 'organization',
      scopeId: org,
      profileId: c.id,
      expectedVersion: 1,
      role: 'MEMBER',
    });
    await expect(
      cmd(b, { command: 'invitation.accept', token: inviterInvite.token }),
    ).rejects.toThrow();
  });
  it('protects last owners and rejects stale versions', async () => {
    await expect(
      cmd(a, {
        command: 'membership.remove',
        scope: 'organization',
        scopeId: org,
        profileId: a.id,
        expectedVersion: 1,
      }),
    ).rejects.toThrow();
    await expect(
      cmd(a, {
        command: 'membership.set',
        scope: 'project',
        scopeId: project,
        profileId: a.id,
        expectedVersion: 1,
        role: 'VIEWER',
      }),
    ).rejects.toThrow();
    const invitation = await invite(a, b, 'project', project, 'OWNER');
    await cmd(b, { command: 'invitation.accept', token: invitation.token });
    const race = await Promise.allSettled([
      cmd(a, {
        command: 'membership.set',
        scope: 'project',
        scopeId: project,
        profileId: a.id,
        expectedVersion: 1,
        role: 'VIEWER',
      }),
      cmd(b, {
        command: 'membership.set',
        scope: 'project',
        scopeId: project,
        profileId: b.id,
        expectedVersion: 1,
        role: 'VIEWER',
      }),
    ]);
    expect(race.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await admin.projectMembership.count({
        where: { projectId: project, role: 'OWNER' },
      }),
    ).toBe(1);
    const owners = await admin.projectMembership.findMany({
      where: { projectId: project, role: 'OWNER' },
    });
    const owner = owners[0]!.profileId === a.id ? a : b;
    await cmd(owner, {
      command: 'project.update',
      id: project,
      name: 'Renamed',
      visibility: 'PRIVATE',
      expectedVersion: 1,
    });
    await expect(
      cmd(owner, {
        command: 'project.update',
        id: project,
        name: 'Stale',
        visibility: 'PRIVATE',
        expectedVersion: 1,
      }),
    ).rejects.toThrow();
  });
  it('rejects archived resources, permits owner recovery, and applies revoke immediately', async () => {
    const p = (
      await cmd(a, {
        command: 'project.create',
        workspaceId: ws,
        name: 'Lifecycle',
        visibility: 'WORKSPACE',
        idempotencyKey: randomUUID(),
      })
    ).id!;
    await cmd(a, { command: 'project.archive', id: p, expectedVersion: 1 });
    await expect(getProject(b, p)).rejects.toThrow();
    expect((await getProject(a, p)).capabilities).toEqual(['project.restore']);
    await cmd(a, { command: 'project.restore', id: p, expectedVersion: 2 });
    expect((await getProject(b, p)).name).toBe('Lifecycle');
    // c owns no project, so parent revoke can remove its descendant grants.
    await cmd(a, {
      command: 'membership.remove',
      scope: 'workspace',
      scopeId: ws,
      profileId: c.id,
      expectedVersion: 2,
    });
    await expect(getProject(c, p)).rejects.toThrow();
  });
  it('rejects composite parent reassignment and duplicate grants in SQL', async () => {
    const other = await loadState(b);
    const otherWs = other.workspaces.find((w) => w.id !== ws)!;
    await expect(
      admin.workspaceMembership.create({
        data: {
          organizationId: org,
          workspaceId: otherWs.id,
          profileId: a.id,
          role: 'MEMBER',
        },
      }),
    ).rejects.toThrow();
    await expect(
      admin.projectMembership.create({
        data: {
          organizationId: org,
          workspaceId: otherWs.id,
          projectId: project,
          profileId: a.id,
          role: 'VIEWER',
        },
      }),
    ).rejects.toThrow();
    await expect(
      admin.workspaceMembership.create({
        data: {
          organizationId: org,
          workspaceId: ws,
          profileId: a.id,
          role: 'ADMIN',
        },
      }),
    ).rejects.toThrow();
  });
  it('uses distributed atomic limits and stores hashes, never invitation plaintext', async () => {
    const identity = randomUUID();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        rateLimit('integration', identity, 2, 60),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    const token = randomUUID();
    const digest = createHash('sha256').update(token).digest('hex');
    expect(
      await admin.invitation.findUnique({ where: { tokenHash: digest } }),
    ).toBeNull();
    const stored = await admin.invitation.findMany({
      where: { organizationId: org },
    });
    expect(stored.every((i) => /^[a-f0-9]{64}$/.test(i.tokenHash))).toBe(true);
    expect(
      await withActor(
        a,
        (tx) =>
          tx.$queryRaw`SELECT atlas_private.can('project',${project}::uuid,'project.read') AS allowed`,
      ),
    ).toBeDefined();
  });
});

describe('onboarding recovery', () => {
  it('saves an interrupted draft without provisioning and resumes idempotently', async () => {
    const person = actor();
    await cmd(person, {
      command: 'onboarding.save',
      draft: {
        displayName: 'Draft researcher',
        researchRole: 'Student',
        researchInterests: ['Geometry'],
        workspaceName: 'Thesis research',
        projectName: 'Thesis',
        step: 4,
      },
    });
    const draft = await loadState(person);
    expect(draft.profile?.onboardingCompleted).toBe(false);
    expect(draft.profile?.onboardingDraft.step).toBe(4);
    expect(draft.profile?.onboardingDraft.workspaceName).toBe(
      'Thesis research',
    );
    expect(draft.organizations).toHaveLength(0);
    const input = {
      command: 'bootstrap' as const,
      displayName: 'Draft researcher',
      workspaceName: 'Thesis research',
      projectName: 'Thesis',
      researchInterests: ['Geometry'],
    };
    const results = await Promise.all([cmd(person, input), cmd(person, input)]);
    expect(results[0]?.workspaceId).toBe(results[1]?.workspaceId);
    expect(
      await admin.project.count({ where: { createdById: person.id } }),
    ).toBe(1);
  });
});

describe('pagination, rollback and organization owner invariants', () => {
  it('rolls back a late provisioning failure and permits a clean retry', async () => {
    const person = actor();
    const invalid = {
      displayName: 'Rollback researcher',
      workspaceName: 'Rollback workspace',
      projectName: 'Rollback project',
      researchInterests: Array(21).fill('Invalid bound'),
    };
    await expect(
      withActor(
        person,
        (tx) =>
          tx.$queryRaw`SELECT atlas_private.mutate('bootstrap',${JSON.stringify(invalid)}::jsonb,${randomUUID()}::uuid)`,
      ),
    ).rejects.toThrow();
    expect(await admin.profile.count({ where: { id: person.id } })).toBe(0);
    expect(
      await admin.organization.count({ where: { personalOwnerId: person.id } }),
    ).toBe(0);
    await cmd(person, {
      command: 'bootstrap',
      displayName: 'Recovered researcher',
      workspaceName: 'Recovered',
      researchInterests: [],
    });
    expect(
      await admin.organization.count({ where: { personalOwnerId: person.id } }),
    ).toBe(1);
  });
  it('preserves an organization owner during simultaneous demotions', async () => {
    const first = actor(),
      second = actor();
    for (const person of [first, second])
      await cmd(person, {
        command: 'bootstrap',
        displayName: 'Owner test',
        workspaceName: 'Personal',
        researchInterests: [],
      });
    const id = (
      await cmd(first, {
        command: 'organization.create',
        name: 'Owner concurrency',
      })
    ).id!;
    const invitation = await invite(
      first,
      second,
      'organization',
      id,
      'MEMBER',
    );
    await cmd(second, {
      command: 'invitation.accept',
      token: invitation.token,
    });
    await cmd(first, {
      command: 'membership.set',
      scope: 'organization',
      scopeId: id,
      profileId: second.id,
      role: 'OWNER',
      expectedVersion: 1,
    });
    const race = await Promise.allSettled([
      cmd(first, {
        command: 'membership.set',
        scope: 'organization',
        scopeId: id,
        profileId: first.id,
        role: 'MEMBER',
        expectedVersion: 1,
      }),
      cmd(second, {
        command: 'membership.set',
        scope: 'organization',
        scopeId: id,
        profileId: second.id,
        role: 'MEMBER',
        expectedVersion: 2,
      }),
    ]);
    expect(race.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await admin.organizationMembership.count({
        where: { organizationId: id, role: 'OWNER' },
      }),
    ).toBe(1);
  });
  it('normalizes actual PostgreSQL domain denials without private details', async () => {
    const person = actor();
    await cmd(person, {
      command: 'bootstrap',
      displayName: 'Denial test',
      workspaceName: 'Personal',
      researchInterests: [],
    });
    try {
      await cmd(person, {
        command: 'organization.update',
        id: randomUUID(),
        name: 'Unknown',
        expectedVersion: 1,
      });
      throw new Error('Expected denial');
    } catch (error) {
      expect(publicError(error).code).toBe('NOT_FOUND');
    }
  });
  it('pages large directories, memberships and invitations with actor-bound signed cursors', async () => {
    const person = actor();
    await cmd(person, {
      command: 'bootstrap',
      displayName: 'Pagination test',
      workspaceName: 'Personal',
      researchInterests: [],
    });
    const orgs = Array.from({ length: 105 }, (_, i) => ({
      id: randomUUID(),
      name: `Pagination organization ${i}`,
    }));
    await admin.organization.createMany({ data: orgs });
    await admin.organizationMembership.createMany({
      data: orgs.map((o) => ({
        organizationId: o.id,
        profileId: person.id,
        role: 'OWNER',
      })),
    });
    const spaces = orgs.map((o, i) => ({
      id: randomUUID(),
      organizationId: o.id,
      name: `Workspace ${i}`,
    }));
    await admin.workspace.createMany({ data: spaces });
    await admin.workspaceMembership.createMany({
      data: spaces.map((w) => ({
        organizationId: w.organizationId,
        workspaceId: w.id,
        profileId: person.id,
        role: 'ADMIN',
      })),
    });
    const initial = await loadState(person);
    expect(initial.organizationsCursor).not.toBeNull();
    expect(initial.workspacesCursor).not.toBeNull();
    const orgPage = await directory(
      person,
      'organizations',
      initial.organizationsCursor!,
    );
    expect(orgPage.items.length).toBeGreaterThan(0);
    expect(
      orgPage.items.some((o) =>
        initial.organizations.some((old) => old.id === o.id),
      ),
    ).toBe(false);
    await expect(
      directory(b, 'organizations', initial.organizationsCursor!),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const rest = await directory(
      person,
      'workspaces',
      initial.workspacesCursor!,
    );
    const extra = rest.items[0]!;
    expect((await loadState(person, extra.id)).workspaceId).toBe(extra.id);
    const people = Array.from({ length: 101 }, () => ({
      id: randomUUID(),
      displayName: 'Synthetic member',
    }));
    await admin.profile.createMany({ data: people });
    const scope = orgs[0]!.id;
    await admin.organizationMembership.createMany({
      data: people.map((p) => ({
        organizationId: scope,
        profileId: p.id,
        role: 'MEMBER',
      })),
    });
    const page = await members(person, 'organization', scope);
    expect(page.items).toHaveLength(100);
    expect(page.nextCursor).not.toBeNull();
    expect(
      (await members(person, 'organization', scope, page.nextCursor!)).items,
    ).toHaveLength(2);
    await admin.invitation.createMany({
      data: Array.from({ length: 101 }, (_, i) => ({
        id: randomUUID(),
        organizationId: scope,
        scope: 'organization',
        role: 'MEMBER',
        email: `page${i}@atlas.example`,
        inviterId: person.id,
        tokenHash: createHash('sha256').update(randomUUID()).digest('hex'),
        expiresAt: new Date(Date.now() + 86400000),
      })),
    });
    const invitationPage = await invitations(person);
    expect(invitationPage.items).toHaveLength(100);
    expect(
      (await invitations(person, invitationPage.nextCursor!)).items,
    ).toHaveLength(1);
  });
});
