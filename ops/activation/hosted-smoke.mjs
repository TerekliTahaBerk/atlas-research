// Approved synthetic hosted test harness. Private credentials/sessions stay out
// of source, stdout, browser traces and screenshots. No paid provider settings.
import { createRequire } from 'node:module';
import { readFile, writeFile, chmod, appendFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const require = createRequire(
  new URL('../../apps/web/package.json', import.meta.url),
);
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');
const { z } = require('zod');
const root = '/Users/berk.terekli/AtlasRecovery/2026-11-02/activation';
const config = JSON.parse(
  await readFile(`${root}/runtime-config.json`, 'utf8'),
);
const env = JSON.parse(await readFile(`${root}/preview-env.json`, 'utf8'));
const key = (await readFile(`${root}/storage-key`, 'utf8')).trim();
const fixtureFile = `${root}/g5-fixtures.json`;
let fixtures;
try {
  fixtures = JSON.parse(await readFile(fixtureFile, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  fixtures = {
    runId: `atlas-g5-${Date.now()}-${randomBytes(3).toString('hex')}`,
    actors: {},
    organizations: [],
    projects: [],
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  };
}
const save = async () => {
  await writeFile(fixtureFile, JSON.stringify(fixtures), { mode: 0o600 });
  await chmod(fixtureFile, 0o600);
};
await save();
const authUrl = 'https://hgngonpirctrwbckhbmy.supabase.co';
const admin = createClient(authUrl, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const sessions = new Map();
const userShape = z.object({ id: z.uuid(), email: z.email() });
export async function actor(name) {
  if (fixtures.cleanedAt)
    throw new Error('Completed fixture run cannot be reused');
  if (!fixtures.actors[name]) {
    if (Object.keys(fixtures.actors).length >= 8)
      throw new Error('Approved fixture account cap');
    fixtures.actors[name] = {
      email: `${fixtures.runId}-${name}@atlas.example`,
      password: randomBytes(36).toString('base64url'),
    };
    await save();
  }
  if (!fixtures.actors[name].id) {
    const pending = fixtures.actors[name];
    if (
      !/^[a-z0-9-]+@atlas\.example$/.test(pending.email) ||
      !/^atlas-g5-[a-z0-9-]+$/.test(fixtures.runId)
    )
      throw new Error('Fixture identity scope');
    const lookup = execFileSync(
      '/opt/homebrew/opt/postgresql@17/bin/psql',
      [
        'service=atlas_a01_migration',
        '-X',
        '-q',
        '-A',
        '-t',
        '-v',
        'ON_ERROR_STOP=1',
      ],
      {
        input: `SELECT id FROM auth.users WHERE email='${pending.email}' AND raw_app_meta_data->>'atlas_fixture_run'='${fixtures.runId}'`,
        env: {
          ...process.env,
          PGSERVICEFILE: root + '/../pg_service.conf',
          PGPASSFILE: root + '/../pgpass',
          PGOPTIONS: '-c default_transaction_read_only=on',
        },
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
      .toString()
      .trim();
    if (lookup) {
      pending.id = z.uuid().parse(lookup);
      await save();
    }
  }
  if (!fixtures.actors[name].id) {
    const pending = fixtures.actors[name];
    const { data, error } = await admin.auth.admin.createUser({
      email: pending.email,
      password: pending.password,
      email_confirm: true,
      app_metadata: { atlas_fixture_run: fixtures.runId },
      user_metadata: { full_name: `Atlas G5 ${name}` },
    });
    if (error)
      throw new Error(
        `Fixture Auth creation failed: ${error.status ?? 'unknown'}; pending identity retained for exact reconciliation`,
      );
    const user = userShape.parse(data.user);
    fixtures.actors[name] = { ...pending, ...user };
    await save();
  }
  if (!sessions.has(name)) {
    const info = fixtures.actors[name];
    const client = createClient(
      authUrl,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await client.auth.signInWithPassword({
      email: info.email,
      password: info.password,
    });
    if (error || !data.session)
      throw new Error('Normal fixture Auth sign-in failed');
    const jar = new Map();
    const ssr = createServerClient(
      authUrl,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        cookies: {
          getAll: () => [],
          setAll: (values) => {
            for (const x of values) jar.set(x.name, x.value);
          },
        },
        auth: { autoRefreshToken: false },
      },
    );
    const established = await ssr.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    if (established.error) throw new Error('Normal fixture SSR session failed');
    sessions.set(name, {
      cookie: [...jar].map(([n, v]) => `${n}=${v}`).join('; '),
      session: data.session,
    });
  }
  return fixtures.actors[name];
}
export async function request(
  name,
  path,
  body,
  asText = false,
  origin = config.origin,
) {
  if (![config.origin, 'http://127.0.0.1:3106'].includes(origin))
    throw new Error('Unapproved test origin');
  if (!path.startsWith('/api/v1/'))
    throw new Error('Fixed Atlas API path required');
  if (name) await actor(name);
  const identity = JSON.parse(
    await readFile(`${root}/vercel_access.json`, 'utf8'),
  );
  if (identity.origin !== config.origin)
    throw new Error('Preview origin mismatch');
  const response = await fetch(origin + path, {
    method: body === undefined ? 'GET' : 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(90000),
    headers: {
      ...(origin === config.origin
        ? { 'x-vercel-trusted-oidc-idp-token': identity.token }
        : {}),
      ...(name ? { Cookie: sessions.get(name).cookie } : {}),
      ...(body === undefined
        ? {}
        : { Origin: origin, 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const raw = await response.text();
  if (asText) return { status: response.status, payload: raw };
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error(`Atlas HTTP ${response.status} did not return JSON`);
  }
  await appendFile(
    root + '/g5-http-status.jsonl',
    JSON.stringify({
      at: new Date().toISOString(),
      actor: name ?? 'anonymous',
      path,
      method: body === undefined ? 'GET' : 'POST',
      command: body?.command ?? null,
      status: response.status,
      errorCode:
        typeof payload.error?.code === 'string' ? payload.error.code : null,
      requestId: payload.requestId ?? null,
    }) + '\n',
    { mode: 0o600 },
  );
  return { status: response.status, payload };
}
export async function command(name, body) {
  const response = await request(name, '/api/v1/commands', body);
  if (response.status !== 200) {
    const code = z
      .object({ error: z.object({ code: z.string() }) })
      .safeParse(response.payload);
    throw new Error(
      `Command ${body.command}: HTTP ${response.status} ${code.success ? code.data.error.code : 'UNKNOWN'}`,
    );
  }
  return z.object({ data: z.unknown() }).parse(response.payload).data;
}
export { fixtures, save, root, config, env, sessions, admin };
if (process.argv.includes('--bootstrap')) {
  await actor('owner');
  const initial = await request('owner', '/api/v1/me');
  if (initial.status !== 200)
    throw new Error(`Authenticated /me HTTP ${initial.status}`);
  if (!fixtures.ownerWorkspace) {
    const data = z
      .object({ workspaceId: z.uuid(), organizationId: z.uuid() })
      .parse(
        await command('owner', {
          command: 'bootstrap',
          displayName: 'Atlas G5 Owner',
          workspaceName: 'Atlas G5 synthetic workspace A',
        }),
      );
    fixtures.ownerWorkspace = data.workspaceId;
    fixtures.organizations.push(data.organizationId);
    await save();
  }
  if (!fixtures.ownerProject) {
    const data = z.object({ id: z.uuid() }).parse(
      await command('owner', {
        command: 'project.create',
        workspaceId: fixtures.ownerWorkspace,
        name: 'Atlas G5 synthetic research',
        visibility: 'PRIVATE',
        idempotencyKey: randomUUID(),
      }),
    );
    fixtures.ownerProject = data.id;
    fixtures.projects.push(data.id);
    await save();
  }
  const checked = await request(
    'owner',
    `/api/v1/projects/${fixtures.ownerProject}`,
  );
  if (checked.status !== 200)
    throw new Error(`Owner project read HTTP ${checked.status}`);
  console.log(
    JSON.stringify({
      hosted_normal_sign_in: 'PASS',
      hosted_bootstrap_workspace_project: 'PASS',
      authenticated_me_status: initial.status,
      owner_project_status: checked.status,
      fixture_accounts: Object.keys(fixtures.actors).length,
      fixture_organizations: fixtures.organizations.length,
    }),
  );
}
