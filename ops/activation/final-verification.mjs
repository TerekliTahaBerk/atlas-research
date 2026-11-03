// Read-only hosted verification after this run's fixture cleanup.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = '/Users/berk.terekli/AtlasRecovery/2026-11-02';
const environment = {
  ...process.env,
  PGSERVICEFILE: root + '/pg_service.conf',
  PGPASSFILE: root + '/pgpass',
  PGOPTIONS: '-c default_transaction_read_only=on',
};
const run = (sql) =>
  execFileSync(
    '/opt/homebrew/opt/postgresql@17/bin/psql',
    ['service=atlas_a01_migration', '-XqAt', '-v', 'ON_ERROR_STOP=1'],
    {
      input: sql,
      env: environment,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 45000,
    },
  ).toString();
run(await readFile('ops/sql/a01-migration-history-gate.sql', 'utf8'));
const connectionInfo = run('\\conninfo\n');
if (!connectionInfo.includes('SSL connection'))
  throw new Error('Client TLS connection missing');
const evidence = JSON.parse(
  run(await readFile('ops/sql/a01-hosted-g1-verification.sql', 'utf8')),
);
const directory = 'packages/database/prisma/migrations';
const manifest = new Map();
for (const name of await readdir(directory)) {
  if (!/^\d{14}_/.test(name)) continue;
  manifest.set(
    name,
    createHash('sha256')
      .update(await readFile(`${directory}/${name}/migration.sql`))
      .digest('hex'),
  );
}
if (
  manifest.size !== 12 ||
  evidence.migrations.length !== 12 ||
  evidence.migrations.some(
    (m) => manifest.get(m.name) !== m.checksum || !m.finished || m.rolled_back,
  )
)
  throw new Error('Migration checksum/completion drift');
const state = JSON.parse(
  run(`SELECT json_build_object(
 'users',(SELECT count(*) FROM auth.users),
 'profiles',(SELECT count(*) FROM profiles),
 'projects',(SELECT count(*) FROM projects),
 'objects',(SELECT count(*) FROM storage.objects),
 'missing_rls',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity),
 'browser_table_access',(SELECT count(*) FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE r.rolname IN ('anon','authenticated') AND n.nspname='public' AND c.relkind IN ('r','p') AND (has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))),
 'browser_private_functions',(SELECT count(*) FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE r.rolname IN ('anon','authenticated') AND n.nspname='atlas_private' AND has_function_privilege(r.oid,p.oid,'EXECUTE')),
 'web_has_worker_role',pg_has_role('atlas_web_dev_20261102','atlas_ai_worker','MEMBER'),
 'elevated_runtime_roles',(SELECT count(*) FROM pg_roles WHERE rolname IN ('atlas_web_dev_20261102','atlas_worker_dev_20261102') AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)),
 'private_pdf_buckets',(SELECT count(*) FROM storage.buckets WHERE id IN ('atlas-quarantine','atlas-sources') AND NOT public AND file_size_limit=26214400 AND allowed_mime_types=ARRAY['application/pdf']::text[]),
 'remaining_fixture_users',(SELECT count(*) FROM auth.users WHERE raw_app_meta_data ? 'atlas_fixture_run')
);`),
);
if (
  state.users !== 1 ||
  state.profiles !== 1 ||
  state.projects !== 1 ||
  state.objects !== 0 ||
  state.missing_rls ||
  state.browser_table_access ||
  state.browser_private_functions ||
  state.web_has_worker_role ||
  state.elevated_runtime_roles ||
  state.private_pdf_buckets !== 2 ||
  state.remaining_fixture_users
)
  throw new Error('Hosted final invariants failed');
const env = JSON.parse(
  await readFile(root + '/activation/preview-env.json', 'utf8'),
);
const base = env.NEXT_PUBLIC_SUPABASE_URL;
const settings = await fetch(base + '/auth/v1/settings', {
  headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
  signal: AbortSignal.timeout(30000),
});
const history = await fetch(
  base + '/rest/v1/_prisma_migrations?select=id&limit=1',
  {
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
    signal: AbortSignal.timeout(30000),
  },
);
if (settings.status !== 200 || history.status !== 401)
  throw new Error('Anonymous Data API denial control failed');
const report = {
  at: new Date().toISOString(),
  migration_checksums: '12/12 PASS',
  history_security_gate: 'PASS',
  client_tls: 'verify-full; SSL confirmed by libpq',
  pooler_database_backend_ssl: evidence.identity.ssl,
  ...state,
  anonymous_auth_settings: settings.status,
  anonymous_history_denial: history.status,
};
await writeFile(
  root + '/activation/final-verification.json',
  JSON.stringify(report, null, 2),
  { mode: 0o600 },
);
console.log(JSON.stringify(report));
