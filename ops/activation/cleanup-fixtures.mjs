// Explicitly approved disposable G5 fixture cleanup. Never a product endpoint.
import {
  actor,
  fixtures,
  save,
  root,
  admin,
  sessions,
} from './hosted-smoke.mjs';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
if (fixtures.cleanedAt) throw new Error('This fixture run was already cleaned');
const rehearsal = JSON.parse(
  await readFile(root + '/g5-cleanup-rehearsal.json', 'utf8'),
);
if (
  rehearsal.mode !== 'REHEARSED_AND_ROLLED_BACK' ||
  rehearsal.public_fixture_cleanup !== 'PASS'
)
  throw new Error('Cleanup rehearsal required');
const names = Object.keys(fixtures.actors);
if (
  names.length !== 6 ||
  fixtures.organizations.length !== 2 ||
  fixtures.projects.length !== 3
)
  throw new Error('Unexpected fixture scope');
async function verifyFixture(name) {
  const id = fixtures.actors[name].id;
  for (let attempt = 0; attempt < 2; attempt++) {
    const user = await admin.auth.admin.getUserById(id);
    if (user.error) {
      if (attempt === 0 && [502, 503, 504, 522].includes(user.error.status)) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      throw new Error(
        `Fixture Auth read failed: ${user.error.status ?? 'unknown'}; cleanup stopped`,
      );
    }
    if (user.data.user.app_metadata.atlas_fixture_run !== fixtures.runId)
      throw new Error('Fixture Auth marker mismatch');
    return;
  }
}
for (const name of names) {
  await verifyFixture(name);
}
for (const name of names) {
  await actor(name);
  const out = await admin.auth.admin.signOut(
    sessions.get(name).session.access_token,
    'global',
  );
  if (out.error) throw new Error('Fixture session revocation failed');
}
const ids = fixtures.projects
  .map((id) => {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid fixture project');
    return "'" + id + "'::uuid";
  })
  .join(',');
const query = `SELECT coalesce(json_agg(json_build_object('quarantine',quarantine_key,'source',object_key)),'[]') FROM source_versions WHERE project_id IN (${ids});`;
const sources = JSON.parse(
  execFileSync(
    '/opt/homebrew/opt/postgresql@17/bin/psql',
    ['service=atlas_a01_migration', '-XqAt', '-v', 'ON_ERROR_STOP=1'],
    {
      input: query,
      env: {
        ...process.env,
        PGSERVICEFILE: root + '/../pg_service.conf',
        PGPASSFILE: root + '/../pgpass',
        PGOPTIONS: '-c default_transaction_read_only=on',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    },
  ).toString(),
);
let removedObjects = 0;
for (const [bucket, field] of [
  ['atlas-quarantine', 'quarantine'],
  ['atlas-sources', 'source'],
]) {
  const paths = [...new Set(sources.map((s) => s[field]).filter(Boolean))];
  if (paths.length > 8) throw new Error('Unexpected fixture object count');
  if (paths.length) {
    const result = await admin.storage.from(bucket).remove(paths);
    if (result.error) throw new Error('Fixture Storage cleanup failed');
    removedObjects += result.data.length;
  }
}
const result = execFileSync(
  'python3',
  ['ops/activation/cleanup-fixtures.py', '--execute'],
  {
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 100000,
  },
);
const publicResult = JSON.parse(result.toString());
if (publicResult.mode !== 'COMMITTED')
  throw new Error('Fixture public cleanup did not commit');
for (const name of names) {
  const id = fixtures.actors[name].id;
  await verifyFixture(name);
  const deleted = await admin.auth.admin.deleteUser(id);
  if (deleted.error) throw new Error('Fixture Auth cleanup failed');
}
fixtures.cleanedAt = new Date().toISOString();
for (const value of Object.values(fixtures.actors)) delete value.password;
await save();
const report = {
  ...publicResult,
  fixture_sessions_revoked: 6,
  fixture_auth_users_deleted: 6,
  storage_objects_removed: removedObjects,
  cleaned_at: fixtures.cleanedAt,
};
await writeFile(
  root + '/g5-cleanup-results.json',
  JSON.stringify(report, null, 2),
  { mode: 0o600 },
);
console.log(JSON.stringify(report));
