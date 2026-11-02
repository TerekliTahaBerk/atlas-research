import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { createDatabase } from '../../packages/database/src/index';
import type { PlatformCommand } from '../../packages/core/src/platform';
import { executeCommand } from '../../apps/web/src/features/platform/server/services';
import {
  runtimeDatabase,
  withActor,
} from '../../apps/web/src/features/platform/server/database';
import { publicError } from '../../apps/web/src/features/platform/server/errors';
import { executeReferenceImport } from '../../apps/web/src/features/library/server/interchange';
import {
  connectZotero,
  disconnectZotero,
  previewZoteroImport,
  zoteroCollections,
  zoteroGet,
  zoteroItems,
  zoteroStatus,
} from '../../apps/web/src/features/integrations/server/zotero';
import { keys, startZoteroFixture, state } from '../fixtures/zotero.mjs';

/*
 * Journey B — Zotero, read-only, against a deterministic loopback Web API
 * fixture and a disposable non-owner PostgreSQL role. No real library.
 */
const runtime = process.env.ATLAS_TEST_DATABASE_URL;
const adminUrl = process.env.ATLAS_TEST_ADMIN_URL;
if (!runtime || !adminUrl)
  throw new Error('Explicit disposable test databases are required.');
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
const editor = actor();
const failure = (work: Promise<unknown>) =>
  work.then(
    () => 'RESOLVED',
    (e: unknown) =>
      e instanceof ZodError ? 'VALIDATION_ERROR' : publicError(e).code,
  );
const platform = (who: Actor, command: PlatformCommand) =>
  executeCommand(who, command, randomUUID());
let server: Server;
let project: string;

beforeAll(async () => {
  server = await startZoteroFixture();
  const address = server.address();
  vi.stubEnv(
    'ATLAS_ZOTERO_BASE_URL',
    `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`,
  );
  vi.stubEnv(
    'ATLAS_INTEGRATION_KEY',
    Buffer.alloc(32, 7).toString('base64url'),
  );
  vi.stubEnv('ATLAS_MODE', 'live');
  vi.stubEnv('DATABASE_URL', runtime);
  vi.stubEnv('ATLAS_RATE_SECRET', 'local-test-rate-secret-32-characters');
  vi.stubEnv('ATLAS_CURSOR_SECRET', 'local-test-cursor-secret-32-characters');
  vi.stubEnv('ATLAS_ORIGIN', 'http://127.0.0.1:3102');
  vi.stubEnv('ATLAS_DEV_INVITATION_LINKS', 'true');
  vi.stubEnv('NODE_ENV', 'development');
  for (const who of [owner, editor])
    await platform(who, {
      command: 'bootstrap',
      displayName: `Zotero ${who.id.slice(0, 4)}`,
      workspaceName: 'Personal',
      researchInterests: [],
    });
  const org = (
    await platform(owner, {
      command: 'organization.create',
      name: 'Zotero lab',
    })
  ).id!;
  const ws = (
    await platform(owner, {
      command: 'workspace.create',
      organizationId: org,
      name: 'Z',
    })
  ).id!;
  project = (
    await platform(owner, {
      command: 'project.create',
      workspaceId: ws,
      name: 'Z',
      visibility: 'PRIVATE',
      idempotencyKey: randomUUID(),
    })
  ).id!;
  const invite = await platform(owner, {
    command: 'invitation.create',
    scope: 'project',
    scopeId: project,
    role: 'EDITOR',
    email: editor.email,
  });
  await platform(editor, {
    command: 'invitation.accept',
    token: new URLSearchParams(
      new URL(invite.invitationLink!).hash.slice(1),
    ).get('token')!,
  });
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  await admin.$disconnect();
  await runtimeDatabase().$disconnect();
  vi.unstubAllEnvs();
});

describe.sequential('Journey B — Zotero read-only connection', () => {
  it('refuses write-capable, malformed and invalid keys without storing anything', async () => {
    expect(
      await failure(connectZotero(owner, { apiKey: keys.write }, randomUUID())),
    ).toBe('VALIDATION_ERROR');
    expect(
      await failure(connectZotero(owner, { apiKey: 'short' }, randomUUID())),
    ).toBe('VALIDATION_ERROR');
    expect(
      await failure(
        connectZotero(
          owner,
          { apiKey: 'UNKNOWNKEY00000000000000' },
          randomUUID(),
        ),
      ),
    ).toBe('FORBIDDEN');
    expect(
      await admin.externalConnection.count({ where: { profileId: owner.id } }),
    ).toBe(0);
  });

  it('connects with a read-only key, stores only an owner-bound ciphertext and lists permitted libraries', async () => {
    const status = await connectZotero(
      owner,
      { apiKey: keys.read },
      randomUUID(),
    );
    expect(status.connection?.libraries).toEqual([
      { id: 'users/9001', name: 'My Library', kind: 'user' },
      { id: 'groups/77', name: 'Fixture Lab', kind: 'group' },
    ]);
    expect(JSON.stringify(status)).not.toContain(keys.read);
    const row = await admin.externalConnection.findFirstOrThrow({
      where: { profileId: owner.id, revokedAt: null },
    });
    expect(row.credentialCiphertext).toMatch(/^v1\./);
    expect(row.credentialCiphertext).not.toContain(keys.read);
    // Every provider request carried the key in a header and the v3 version.
    expect(
      state.requests.every(
        (r) =>
          r.method === 'GET' &&
          r.hasKey &&
          r.version === '3' &&
          !r.query.includes('key='),
      ),
    ).toBe(true);
    // RLS: another project member cannot see the connection at all.
    const visible = await withActor(
      editor,
      (tx) => tx.$queryRaw<unknown[]>`SELECT id FROM external_connections`,
    );
    expect(visible).toEqual([]);
    expect((await zoteroStatus(editor)).connection).toBeNull();
  });

  it('browses collections and paginated items, with version-based incremental reads', async () => {
    expect((await zoteroCollections(owner, 'users/9001')).items).toEqual([
      { key: 'COLL0001', name: 'Thesis', parent: null, items: 2 },
    ]);
    const all = await zoteroItems(owner, { library: 'users/9001' });
    expect(all.items.map((i) => [i.key, i.importable])).toEqual([
      ['AAAA1111', true],
      ['BBBB2222', true],
      ['CCCC3333', true],
    ]);
    expect(all.libraryVersion).toBe(7);
    expect(
      (await zoteroItems(owner, { library: 'users/9001', since: 5 })).items.map(
        (i) => i.key,
      ),
    ).toEqual(['BBBB2222', 'CCCC3333']);
    expect(
      (await zoteroItems(owner, { library: 'groups/77' })).items.map(
        (i) => i.key,
      ),
    ).toEqual(['GGGG4444']);
    // A group the key does not grant is never reachable.
    expect(await failure(zoteroItems(owner, { library: 'groups/88' }))).toBe(
      'NOT_FOUND',
    );
    // An individual's connection is not usable by other project members.
    expect(await failure(zoteroItems(editor, { library: 'users/9001' }))).toBe(
      'NOT_FOUND',
    );
  });

  it('previews through the shared pipeline and imports selected items idempotently', async () => {
    const before = await admin.projectPaper.count({
      where: { projectId: project },
    });
    const preview = await previewZoteroImport(owner, project, {
      library: 'users/9001',
      itemKeys: ['AAAA1111', 'BBBB2222', 'CCCC3333'],
    });
    expect(preview.items.map((i) => i.status)).toEqual(['NEW', 'NEW', 'NEW']);
    expect(preview.items[0]!.record).toMatchObject({
      type: 'journal-article',
      doi: '10.5555/zotero.fixture.1',
      authors: [{ family: 'Okafor', given: 'Ada' }],
      editors: [{ family: 'Itor', given: 'Ed' }],
      volume: '4',
      pages: '10-20',
      issued: { year: 2022, month: 6, day: 1 },
    });
    expect(preview.items[1]!.record).toMatchObject({
      type: 'book-chapter',
      doi: '10.5555/zotero.fixture.2',
      authors: [{ literal: 'Fixture Consortium' }],
    });
    expect(preview.items[2]!.record).toMatchObject({
      type: 'other',
      originalType: 'artwork',
    });
    expect(
      await admin.projectPaper.count({ where: { projectId: project } }),
    ).toBe(before);
    const items = preview.items.map((p) => ({
      record: p.record!,
      link: p.link,
      atlasId: null,
    }));
    const first = await executeReferenceImport(
      owner,
      {
        command: 'reference.import',
        projectId: project,
        items,
        idempotencyKey: randomUUID(),
      },
      randomUUID(),
    );
    expect(first.results.map((r) => r.outcome)).toEqual([
      'CREATED',
      'CREATED',
      'CREATED',
    ]);
    const again = await previewZoteroImport(owner, project, {
      library: 'users/9001',
      itemKeys: ['AAAA1111'],
    });
    expect(again.items[0]).toMatchObject({
      status: 'EXISTING',
      match: { by: 'import', projectPaperId: first.results[0]!.id },
    });
    // A Zotero edit raises its version: shown as an update to review, never applied silently.
    state.updated = true;
    const updated = await previewZoteroImport(owner, project, {
      library: 'users/9001',
      itemKeys: ['AAAA1111'],
    });
    expect(updated.items[0]!.status).toBe('UPDATE_AVAILABLE');
    expect(
      (
        await admin.projectPaper.findUniqueOrThrow({
          where: { id: first.results[0]!.id },
        })
      ).privateTitle,
    ).toBe('Fixture sparse attention survey');
    // A deleted Zotero item is reported; its Atlas paper stays.
    state.deleted.add('BBBB2222');
    const removed = await previewZoteroImport(owner, project, {
      library: 'users/9001',
      itemKeys: ['BBBB2222'],
    });
    expect(removed.items).toEqual([]);
    expect(removed.issues[0]!.message).toMatch(/no longer available in Zotero/);
    expect(
      await admin.projectPaper.findUnique({
        where: { id: first.results[1]!.id },
      }),
    ).not.toBeNull();
    // A project member cannot preview with someone else's connection.
    expect(
      await failure(
        previewZoteroImport(editor, project, {
          library: 'users/9001',
          itemKeys: ['AAAA1111'],
        }),
      ),
    ).toBe('NOT_FOUND');
  });

  it('maps provider failures safely and honours Retry-After', async () => {
    const naps: number[] = [];
    const sleep = async (ms: number) => {
      naps.push(ms);
    };
    expect(
      await failure(zoteroGet('/keys/current', {}, keys.limited, { sleep })),
    ).toBe('RATE_LIMITED');
    expect(naps).toEqual([]); // 30 s exceeds the in-request budget; reported instead.
    expect(
      await failure(
        zoteroGet('/keys/current', {}, keys.slow, { sleep, timeoutMs: 50 }),
      ),
    ).toBe('EXTERNAL_PROVIDER_ERROR');
    expect(naps.length).toBe(2); // bounded backoff before giving up
    expect(
      await failure(zoteroGet('/users/9001/nowhere', {}, keys.read, { sleep })),
    ).toBe('NOT_FOUND');
    const controller = new AbortController();
    controller.abort();
    expect(
      await failure(
        zoteroGet('/keys/current', {}, keys.read, {
          signal: controller.signal,
          sleep,
        }),
      ),
    ).not.toBe('RESOLVED');
  });

  it('surfaces revocation and disconnects by deleting the stored credential', async () => {
    await connectZotero(owner, { apiKey: keys.revoked }, randomUUID());
    expect(await failure(zoteroItems(owner, { library: 'users/9001' }))).toBe(
      'FORBIDDEN',
    );
    const status = await disconnectZotero(owner, randomUUID());
    expect(status.connection).toBeNull();
    const rows = await admin.externalConnection.findMany({
      where: { profileId: owner.id },
    });
    expect(
      rows.every((r) => r.revokedAt && r.credentialCiphertext === null),
    ).toBe(true);
    expect(await failure(zoteroItems(owner, { library: 'users/9001' }))).toBe(
      'NOT_FOUND',
    );
    expect(await failure(disconnectZotero(owner, randomUUID()))).toBe(
      'NOT_FOUND',
    );
  });
});
