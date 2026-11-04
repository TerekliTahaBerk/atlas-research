import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { createDatabase } from '../../packages/database/src/index';
import type { PlatformCommand } from '../../packages/core/src/platform';
import type { CommunicationCommandInput } from '../../packages/core/src/index';
import { executeCommand } from '../../apps/web/src/features/platform/server/services';
import { runtimeDatabase } from '../../apps/web/src/features/platform/server/database';
import { publicError } from '../../apps/web/src/features/platform/server/errors';
import {
  executeCommunicationCommand,
  resetSweepThrottle,
  sweepOutbox,
  SWEEP_INTERVAL_MS,
} from '../../apps/web/src/features/communication/server/commands';
import {
  getChannel,
  listChannels,
  messageChanges,
} from '../../apps/web/src/features/communication/server/reads';

/*
 * A04.1 hardening on real, non-owner PostgreSQL: revocation paths that the
 * A04 triggers did not cover, the restricted-channel manager invariant, the
 * explicit recovery policy, and outbox retry/expiry/superseded-epoch rules.
 */
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
type Actor = { id: string; email: string };
const actor = (): Actor => ({
  id: randomUUID(),
  email: `${randomUUID()}@atlas.example`,
});
const owner = actor();
const manager = actor(); // editor who manages a restricted channel
const colleague = actor(); // editor, restricted member
const wsAdmin = actor(); // workspace admin without a project grant
const failure = (work: Promise<unknown>) =>
  work.then(
    () => 'RESOLVED',
    (error: unknown) =>
      error instanceof ZodError ? 'VALIDATION_ERROR' : publicError(error).code,
  );
const platform = (who: Actor, command: PlatformCommand) =>
  executeCommand(who, command, randomUUID());
const comm = (who: Actor, command: CommunicationCommandInput) =>
  executeCommunicationCommand(who, command, randomUUID());
const asBrowser = async (sub: string, topic: string) =>
  admin.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL ROLE authenticated');
    await tx.$queryRaw`SELECT set_config('request.jwt.claims',${JSON.stringify({ sub, role: 'authenticated' })},true)`;
    const [row] = await tx.$queryRaw<
      { allowed: boolean }[]
    >`SELECT atlas_realtime.topic_allowed(${topic}) AS allowed`;
    return row?.allowed === true;
  });
const epochOf = async (channelId: string) =>
  (await admin.channel.findUniqueOrThrow({ where: { id: channelId } })).epoch;
const projectRole = async (
  who: Actor,
  projectId: string,
  role: 'EDITOR' | 'VIEWER',
) => {
  const { version } = await admin.projectMembership.findUniqueOrThrow({
    where: { projectId_profileId: { projectId, profileId: who.id } },
  });
  await platform(owner, {
    command: 'membership.set',
    scope: 'project',
    scopeId: projectId,
    profileId: who.id,
    role,
    expectedVersion: version,
  });
};

let workspaceId: string;
let project: string;
const grant = async (
  who: Actor,
  scope: 'project' | 'workspace',
  scopeId: string,
  role: 'EDITOR' | 'VIEWER' | 'ADMIN',
) => {
  const result = await platform(owner, {
    command: 'invitation.create',
    scope,
    scopeId,
    role,
    email: who.email,
  });
  const token = new URLSearchParams(
    new URL(result.invitationLink!).hash.slice(1),
  ).get('token')!;
  await platform(who, { command: 'invitation.accept', token });
};
const restrictedChannel = async (name: string, by: Actor = owner) =>
  (
    await comm(by, {
      command: 'channel.create',
      projectId: project,
      name,
      visibility: 'RESTRICTED',
      idempotencyKey: randomUUID(),
    })
  ).id;

beforeAll(async () => {
  vi.stubEnv('ATLAS_MODE', 'live');
  vi.stubEnv('DATABASE_URL', runtime);
  vi.stubEnv('ATLAS_RATE_SECRET', 'local-test-rate-secret-32-characters');
  vi.stubEnv('ATLAS_CURSOR_SECRET', 'local-test-cursor-secret-32-characters');
  vi.stubEnv('ATLAS_ORIGIN', 'http://127.0.0.1:3102');
  vi.stubEnv('ATLAS_DEV_INVITATION_LINKS', 'true');
  vi.stubEnv('NODE_ENV', 'development');
  for (const who of [owner, manager, colleague, wsAdmin])
    await platform(who, {
      command: 'bootstrap',
      displayName: `Hardening ${who.id.slice(0, 4)}`,
      workspaceName: 'Personal',
      researchInterests: [],
    });
  const org = (
    await platform(owner, {
      command: 'organization.create',
      name: 'Hardening lab',
    })
  ).id!;
  workspaceId = (
    await platform(owner, {
      command: 'workspace.create',
      organizationId: org,
      name: 'Hardening',
    })
  ).id!;
  project = (
    await platform(owner, {
      command: 'project.create',
      workspaceId,
      name: 'Hardening project',
      visibility: 'PRIVATE',
      idempotencyKey: randomUUID(),
    })
  ).id!;
  await grant(manager, 'project', project, 'EDITOR');
  await grant(colleague, 'project', project, 'EDITOR');
  await grant(wsAdmin, 'workspace', workspaceId, 'ADMIN');
}, 60000);
afterAll(async () => {
  await admin.$disconnect();
  await runtimeDatabase().$disconnect();
  vi.unstubAllEnvs();
});

describe.sequential('A04.1 role changes and the manager invariant', () => {
  let ops: string;
  it('the last manager of a restricted channel cannot be demoted by any command path', async () => {
    ops = await restrictedChannel('ops', manager);
    await comm(manager, {
      command: 'channel.member.add',
      id: ops,
      profileId: colleague.id,
    });
    // The A04 member.add upsert could rewrite the sole manager's role.
    expect(
      await failure(
        comm(manager, {
          command: 'channel.member.add',
          id: ops,
          profileId: manager.id,
          role: 'MEMBER',
        }),
      ),
    ).toBe('CONFLICT');
    // And not by direct SQL either (deferred constraint trigger).
    expect(
      await failure(
        admin.$executeRaw`UPDATE channel_members SET role='MEMBER' WHERE channel_id=${ops}::uuid AND role='MANAGER'`,
      ),
    ).not.toBe('RESOLVED');
    expect(
      (
        await admin.channelMember.findUniqueOrThrow({
          where: {
            channelId_profileId: { channelId: ops, profileId: manager.id },
          },
        })
      ).role,
    ).toBe('MANAGER');
  });

  it('a project role downgrade keeps reading, removes posting and management immediately', async () => {
    const epoch = await epochOf(ops);
    await projectRole(manager, project, 'VIEWER');
    const detail = await getChannel(manager, ops);
    expect(detail.channel.capabilities).toEqual(['channel.read']);
    expect(
      await failure(
        comm(manager, {
          command: 'message.send',
          channelId: ops,
          body: 'viewers cannot post',
          idempotencyKey: randomUUID(),
        }),
      ),
    ).toBe('FORBIDDEN');
    expect(
      await failure(
        comm(manager, {
          command: 'channel.member.remove',
          id: ops,
          profileId: colleague.id,
        }),
      ),
    ).toBe('FORBIDDEN');
    // The read audience did not shrink, so the topic stays valid.
    expect(await epochOf(ops)).toBe(epoch);
    expect(await asBrowser(manager.id, detail.topic)).toBe(true);
  });
});

describe.sequential('A04.1 explicit restricted-channel recovery', () => {
  let ops: string;
  let vault: string;
  it('owners see orphaned restricted channels and their eligible members, nobody else does', async () => {
    ops = (await listChannels(colleague, project)).items.find(
      (c) => c.name === 'ops',
    )!.id;
    // The owner is not a member of #ops and cannot read it.
    expect(await failure(getChannel(owner, ops))).toBe('NOT_FOUND');
    const list = await listChannels(owner, project);
    expect(list.items.some((c) => c.id === ops)).toBe(false);
    expect(list.recoverable).toEqual([
      {
        id: ops,
        name: 'ops',
        eligible: [{ id: colleague.id, name: expect.any(String) }],
      },
    ]);
    expect((await listChannels(colleague, project)).recoverable).toEqual([]);
    expect(await failure(listChannels(wsAdmin, project))).toBe('NOT_FOUND');
  });

  it('recovery is refused to non-owners, for managed channels and for ineligible appointees', async () => {
    const recover = (who: Actor, id: string, profileId: string) =>
      failure(comm(who, { command: 'channel.recover', id, profileId }));
    expect(await recover(colleague, ops, colleague.id)).toBe('NOT_FOUND');
    expect(await recover(wsAdmin, ops, wsAdmin.id)).toBe('NOT_FOUND');
    // The demoted manager is a member but can no longer write.
    expect(await recover(owner, ops, manager.id)).toBe('VALIDATION_ERROR');
    // Not a member of the channel: only the owner may name themself.
    expect(await recover(owner, ops, wsAdmin.id)).toBe('VALIDATION_ERROR');
    const managed = await restrictedChannel('managed');
    expect(await recover(owner, managed, owner.id)).toBe('CONFLICT');
    const open = (
      await comm(owner, {
        command: 'channel.create',
        projectId: project,
        name: 'open',
        idempotencyKey: randomUUID(),
      })
    ).id;
    expect(await recover(owner, open, owner.id)).toBe('VALIDATION_ERROR');
  });

  it('appointing an eligible member restores management without granting the owner access', async () => {
    const audits = await admin.auditEvent.count({
      where: { action: 'channel.recover', resourceId: ops },
    });
    await comm(owner, {
      command: 'channel.recover',
      id: ops,
      profileId: colleague.id,
    });
    expect(
      await admin.auditEvent.count({
        where: { action: 'channel.recover', resourceId: ops },
      }),
    ).toBe(audits + 1);
    expect((await getChannel(colleague, ops)).channel.capabilities).toContain(
      'channel.manage',
    );
    expect(await failure(getChannel(owner, ops))).toBe('NOT_FOUND');
    expect((await listChannels(owner, project)).recoverable).toEqual([]);
    // Once managed again, a second recovery is a conflict, not a bypass.
    expect(
      await failure(
        comm(owner, {
          command: 'channel.recover',
          id: ops,
          profileId: owner.id,
        }),
      ),
    ).toBe('CONFLICT');
    await projectRole(manager, project, 'EDITOR');
  });

  it('with no eligible member left the owner may appoint themself, visibly', async () => {
    vault = await restrictedChannel('vault', colleague);
    await projectRole(colleague, project, 'VIEWER');
    const entry = (await listChannels(owner, project)).recoverable.find(
      (c) => c.id === vault,
    );
    expect(entry).toEqual({ id: vault, name: 'vault', eligible: [] });
    await comm(owner, {
      command: 'channel.recover',
      id: vault,
      profileId: owner.id,
    });
    const detail = await getChannel(owner, vault);
    expect(detail.channel.capabilities).toContain('channel.manage');
    expect(detail.members.find((m) => m.id === owner.id)?.role).toBe('MANAGER');
    await projectRole(colleague, project, 'EDITOR');
  });
});

describe.sequential('A04.1 revocation coverage beyond memberships', () => {
  it('workspace archival rotates every channel topic and denies retained readers', async () => {
    const org = (
      await platform(owner, {
        command: 'organization.create',
        name: 'Archive lab',
      })
    ).id!;
    const ws = (
      await platform(owner, {
        command: 'workspace.create',
        organizationId: org,
        name: 'Archive ws',
      })
    ).id!;
    const pr = (
      await platform(owner, {
        command: 'project.create',
        workspaceId: ws,
        name: 'Archive project',
        visibility: 'PRIVATE',
        idempotencyKey: randomUUID(),
      })
    ).id!;
    const channel = (
      await comm(owner, {
        command: 'channel.create',
        projectId: pr,
        name: 'general',
        idempotencyKey: randomUUID(),
      })
    ).id;
    const before = (await getChannel(owner, channel)).topic;
    expect(await asBrowser(owner.id, before)).toBe(true);
    const { version } = await admin.workspace.findUniqueOrThrow({
      where: { id: ws },
    });
    await platform(owner, {
      command: 'workspace.archive',
      id: ws,
      expectedVersion: version,
    });
    const epoch = await epochOf(channel);
    expect(before.endsWith(epoch)).toBe(false);
    expect(await asBrowser(owner.id, `atlas:channel:${channel}:${epoch}`)).toBe(
      false,
    );
    expect(await failure(messageChanges(owner, channel, 0))).toBe('NOT_FOUND');
  });

  it('organization archival and profile deletion rotate topics too', async () => {
    const org = (
      await platform(owner, {
        command: 'organization.create',
        name: 'Archive org',
      })
    ).id!;
    const ws = (
      await platform(owner, {
        command: 'workspace.create',
        organizationId: org,
        name: 'Org ws',
      })
    ).id!;
    const pr = (
      await platform(owner, {
        command: 'project.create',
        workspaceId: ws,
        name: 'Org project',
        visibility: 'PRIVATE',
        idempotencyKey: randomUUID(),
      })
    ).id!;
    const channel = (
      await comm(owner, {
        command: 'channel.create',
        projectId: pr,
        name: 'general',
        idempotencyKey: randomUUID(),
      })
    ).id;
    const first = await epochOf(channel);
    // Profile deletion is an operator action; it still rotates.
    const ghost = actor();
    await platform(ghost, {
      command: 'bootstrap',
      displayName: 'Ghost',
      workspaceName: 'Personal',
      researchInterests: [],
    });
    await grant(ghost, 'project', pr, 'EDITOR');
    const second = await epochOf(channel);
    await admin.$executeRaw`UPDATE profiles SET deleted_at=now() WHERE id=${ghost.id}::uuid`;
    const third = await epochOf(channel);
    expect(third).not.toBe(second);
    expect(await asBrowser(ghost.id, `atlas:channel:${channel}:${third}`)).toBe(
      false,
    );
    const { version } = await admin.organization.findUniqueOrThrow({
      where: { id: org },
    });
    await platform(owner, {
      command: 'organization.archive',
      id: org,
      expectedVersion: version,
    });
    const fourth = await epochOf(channel);
    expect(new Set([first, third, fourth]).size).toBe(3);
    expect(
      await asBrowser(owner.id, `atlas:channel:${channel}:${fourth}`),
    ).toBe(false);
  });

  it('every change page names the current topic so a missed rotation is detectable', async () => {
    const general = (
      await comm(owner, {
        command: 'channel.create',
        projectId: project,
        name: 'topic-check',
        idempotencyKey: randomUUID(),
      })
    ).id;
    await comm(manager, { command: 'channel.join', id: general });
    const page = await messageChanges(manager, general, 0);
    expect(page.topic).toBe((await getChannel(manager, general)).topic);
    const ops = (await listChannels(colleague, project)).items.find(
      (c) => c.name === 'ops',
    )!.id;
    const opsTopic = (await messageChanges(colleague, ops, 0)).topic;
    await comm(colleague, {
      command: 'channel.member.add',
      id: ops,
      profileId: manager.id,
    });
    await comm(colleague, {
      command: 'channel.member.remove',
      id: ops,
      profileId: manager.id,
    });
    const rotated = (await messageChanges(colleague, ops, 0)).topic;
    expect(rotated).not.toBe(opsTopic);
    expect(await asBrowser(colleague.id, rotated)).toBe(true);
    expect(await asBrowser(colleague.id, opsTopic)).toBe(false);
  });
});

describe.sequential('A04.1 outbox retry, expiry and superseded epochs', () => {
  it('backs off failures, abandons terminal ones, expires stale hints and never sends to a superseded epoch', async () => {
    const channel = (await listChannels(colleague, project)).items.find(
      (c) => c.name === 'ops',
    )!;
    const current = (await getChannel(colleague, channel.id)).topic;
    const superseded = `atlas:channel:${channel.id}:${randomUUID()}`;
    const failing = `atlas:user:${randomUUID()}`;
    class Rollback extends Error {}
    let observed: {
      sent: { topic: string; event: string }[];
      rows: {
        topic: string;
        event: string;
        delivered: boolean;
        abandoned: boolean;
        attempts: number;
        lastError: string | null;
        backoffSeconds: number;
      }[];
      health: Record<string, unknown>;
      dispatched: number;
    } | null = null;
    // Everything below happens in one rolled-back transaction with a
    // stand-in realtime.send, so the shared test database is unchanged.
    await admin
      .$transaction(async (tx) => {
        const present = await tx.$queryRaw<{ ok: boolean }[]>`
          SELECT to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NOT NULL AS ok`;
        if (!present[0]!.ok) {
          await tx.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS realtime');
          await tx.$executeRawUnsafe(
            'CREATE TABLE realtime.atlas_probe(topic text, event text)',
          );
          await tx.$executeRawUnsafe(`CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean) RETURNS void
            LANGUAGE plpgsql AS $f$ BEGIN
             IF topic LIKE 'atlas:user:%' THEN RAISE EXCEPTION 'broadcast unavailable' USING ERRCODE='08006'; END IF;
             INSERT INTO realtime.atlas_probe VALUES(topic,event);
            END $f$`);
        } else {
          // A real Realtime schema is installed: observe only outbox state.
          await tx.$executeRawUnsafe(
            'CREATE TEMP TABLE atlas_probe(topic text, event text) ON COMMIT DROP',
          );
        }
        await tx.$executeRaw`UPDATE communication_outbox SET abandoned_at=now() WHERE delivered_at IS NULL AND abandoned_at IS NULL`;
        await tx.$executeRaw`INSERT INTO communication_outbox(topic,event,payload) VALUES
          (${current},'message.created','{"channelId":"x"}'::jsonb),
          (${superseded},'message.created','{"channelId":"x"}'::jsonb),
          (${superseded},'topic.rotated','{"channelId":"x"}'::jsonb),
          (${failing},'notification.created','{"id":"x"}'::jsonb)`;
        await tx.$executeRaw`INSERT INTO communication_outbox(topic,event,payload,created_at,next_attempt_at)
          VALUES (${current},'message.changed','{"channelId":"x"}'::jsonb,now()-interval '20 minutes',now()-interval '20 minutes')`;
        const [dispatch] = await tx.$queryRaw<
          { n: number }[]
        >`SELECT atlas_private.comm_dispatch(50) AS n`;
        const rows = await tx.$queryRaw<NonNullable<typeof observed>['rows']>`
          SELECT topic, event, delivered_at IS NOT NULL AS delivered, abandoned_at IS NOT NULL AS abandoned,
           attempts, last_error AS "lastError",
           greatest(0,round(extract(epoch FROM next_attempt_at-now())))::int AS "backoffSeconds"
          FROM communication_outbox WHERE abandoned_at IS NULL OR last_error IS NOT NULL ORDER BY id`;
        const sent = present[0]!.ok
          ? []
          : await tx.$queryRaw<
              { topic: string; event: string }[]
            >`SELECT topic, event FROM realtime.atlas_probe`;
        // Repeated failures: exponential backoff, then terminal abandonment.
        // (A past instant: timestamptz(3) would round now() up half the time.)
        for (let i = 0; i < 8; i += 1) {
          await tx.$executeRaw`UPDATE communication_outbox SET next_attempt_at=now()-interval '1 second' WHERE topic=${failing}`;
          await tx.$queryRaw`SELECT atlas_private.comm_dispatch(50)`;
        }
        const [health] = await tx.$queryRaw<
          { h: Record<string, unknown> }[]
        >`SELECT atlas_private.comm_outbox_health() AS h`;
        const terminal = await tx.$queryRaw<
          NonNullable<typeof observed>['rows']
        >`
          SELECT topic, event, delivered_at IS NOT NULL AS delivered, abandoned_at IS NOT NULL AS abandoned,
           attempts, last_error AS "lastError", 0 AS "backoffSeconds"
          FROM communication_outbox WHERE topic=${failing}`;
        observed = {
          sent,
          rows: [...rows, ...terminal],
          health: health!.h,
          dispatched: dispatch!.n,
        };
        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
    expect(observed).not.toBeNull();
    const result = observed!;
    const row = (topic: string, event: string) =>
      result.rows.find((r) => r.topic === topic && r.event === event);
    // Current-epoch hint and the content-free rotation notice are sent.
    expect(row(current, 'message.created')).toMatchObject({
      delivered: true,
    });
    expect(row(superseded, 'topic.rotated')).toMatchObject({
      delivered: true,
    });
    // A hint queued before a rotation never reaches the old topic.
    expect(row(superseded, 'message.created')).toMatchObject({
      delivered: false,
      abandoned: true,
      lastError: 'SUPERSEDED',
    });
    expect(row(current, 'message.changed')).toMatchObject({
      delivered: false,
      abandoned: true,
      lastError: 'EXPIRED',
    });
    if (result.sent.length) {
      expect(result.sent).toEqual([
        { topic: current, event: 'message.created' },
        { topic: superseded, event: 'topic.rotated' },
      ]);
      expect(result.dispatched).toBe(2);
      const first = result.rows.find(
        (r) => r.topic === failing && r.attempts === 1,
      );
      expect(first).toMatchObject({ abandoned: false, lastError: '08006' });
      expect(first!.backoffSeconds).toBeGreaterThanOrEqual(1);
      expect(first!.backoffSeconds).toBeLessThanOrEqual(2);
      expect(row(failing, 'notification.created')).toBeDefined();
      const terminal = result.rows.filter((r) => r.topic === failing).at(-1)!;
      expect(terminal).toMatchObject({ abandoned: true, attempts: 8 });
      expect(result.health).toMatchObject({ pending: 0 });
    }
    // Nothing was committed by the probe.
    expect(
      await admin.communicationOutbox.count({ where: { topic: superseded } }),
    ).toBe(0);
  });

  it('the read-path sweep is throttled per server instance', async () => {
    resetSweepThrottle();
    const t = 1_000_000;
    expect(await sweepOutbox(t)).not.toBeNull();
    expect(await sweepOutbox(t + SWEEP_INTERVAL_MS - 1)).toBeNull();
    expect(await sweepOutbox(t + SWEEP_INTERVAL_MS)).not.toBeNull();
  });

  it('runtime may run the dispatcher and read recovery candidates but not operator health', async () => {
    const [g] = await admin.$queryRaw<
      {
        dispatch: boolean;
        recovery: boolean;
        health: boolean;
        inner: boolean;
      }[]
    >`SELECT has_function_privilege('atlas_runtime','atlas_private.comm_dispatch(integer)','EXECUTE') AS dispatch,
       has_function_privilege('atlas_runtime','atlas_private.channel_recovery(uuid)','EXECUTE') AS recovery,
       has_function_privilege('atlas_runtime','atlas_private.comm_outbox_health()','EXECUTE') AS health,
       has_function_privilege('atlas_runtime','atlas_private.mutate_a04(text,jsonb,uuid)','EXECUTE') AS inner`;
    expect(g).toEqual({
      dispatch: true,
      recovery: true,
      health: false,
      inner: false,
    });
  });
});
