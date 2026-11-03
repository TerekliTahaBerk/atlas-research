// Loopback fixture adapter with the approved hosted development DB/Auth.
// This is explicitly not evidence of a real Zotero account connection.
import { request, fixtures, root } from './hosted-smoke.mjs';
import { keys } from '../../tests/fixtures/zotero.mjs';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const origin = 'http://127.0.0.1:3106';
const call = (name, path, body) => request(name, path, body, false, origin);
function check(value, message) {
  if (!value) throw new Error(message);
}
const report = {
  environment: 'loopback app/fixture with hosted development DB/Auth',
  live_zotero: 'BLOCKED: no authorized real read-only key',
};
try {
  const write = await call('owner', '/api/v1/integrations/zotero/connect', {
    apiKey: keys.write,
  });
  check(
    write.status >= 400 && write.status < 500,
    'Write-capable key accepted',
  );
  report.write_key_rejected = write.status;
  const connected = await call('owner', '/api/v1/integrations/zotero/connect', {
    apiKey: keys.read,
  });
  check(connected.status === 200, 'Read-only fixture connection failed');
  const collections = await call(
    'owner',
    '/api/v1/integrations/zotero/collections?library=users%2F9001',
  );
  check(
    collections.status === 200 && collections.payload.data.items.length === 1,
    'Collection browsing failed',
  );
  const items = await call(
    'owner',
    '/api/v1/integrations/zotero/items?library=users%2F9001',
  );
  check(
    items.status === 200 &&
      items.payload.data.libraryVersion === 7 &&
      items.payload.data.items.length === 3,
    'Versioned item browsing failed',
  );
  const other = await call('viewer', '/api/v1/integrations/zotero');
  check(
    other.status === 200 && other.payload.data.connection === null,
    'Connection exposed to another member',
  );
  const preview = await call(
    'owner',
    `/api/v1/projects/${fixtures.ownerProject}/imports/zotero`,
    { library: 'users/9001', itemKeys: ['AAAA1111', 'BBBB2222'] },
  );
  check(
    preview.status === 200 && preview.payload.data.items.length === 2,
    'Zotero preview failed',
  );
  const selected = preview.payload.data.items.map((p) => ({
    record: p.record,
    link: p.link,
    atlasId: p.provenance.atlasId,
    update: false,
  }));
  const forged = await call('owner', '/api/v1/commands', {
    command: 'reference.import',
    projectId: fixtures.ownerProject,
    items: [
      {
        ...selected[0],
        record: { ...selected[0].record, title: 'Forged fixture title' },
      },
    ],
    idempotencyKey: randomUUID(),
  });
  check(
    forged.status === 409 && forged.payload.error.code === 'CONFLICT',
    'Forged preview proof accepted',
  );
  const input = {
    command: 'reference.import',
    projectId: fixtures.ownerProject,
    items: selected,
    idempotencyKey: randomUUID(),
  };
  const imported = await call('owner', '/api/v1/commands', input);
  check(
    imported.status === 200 && imported.payload.data.results.length === 2,
    'Confirmed fixture import failed',
  );
  const replayed = await call('owner', '/api/v1/commands', input);
  check(
    replayed.status === 200 && replayed.payload.data.replayed === true,
    'Import replay failed',
  );
  Object.assign(report, {
    read_only_connection: 'PASS',
    versioned_browsing: 'PASS',
    actor_credential_isolation: 'PASS',
    proof_tamper_denial: 'PASS',
    confirmed_import_and_replay: 'PASS',
  });
} finally {
  const disconnected = await call(
    'owner',
    '/api/v1/integrations/zotero/disconnect',
    {},
  );
  check(
    disconnected.status === 200 &&
      disconnected.payload.data.connection === null,
    'Fixture disconnect failed',
  );
  report.fixture_disconnected = 'PASS';
}
await writeFile(
  root + '/g5-zotero-results.json',
  JSON.stringify(report, null, 2),
  { mode: 0o600 },
);
console.log(JSON.stringify(report));
