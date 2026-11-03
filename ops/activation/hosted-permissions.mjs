import {
  actor,
  request,
  command,
  fixtures,
  save,
  root,
} from './hosted-smoke.mjs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const require = createRequire(
  new URL('../../apps/web/package.json', import.meta.url),
);
const { z } = require('zod');
const names = ['owner', 'editor', 'viewer', 'outsider', 'revoked', 'admin'];
for (const name of names) {
  let ok = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await actor(name);
      ok = true;
      break;
    } catch (error) {
      if (attempt) throw error;
    }
  }
  if (!ok) throw new Error('Fixture identity unavailable');
}
if (!fixtures.outsideWorkspace) {
  const data = z
    .object({ workspaceId: z.uuid(), organizationId: z.uuid() })
    .parse(
      await command('outsider', {
        command: 'bootstrap',
        displayName: 'Atlas G5 Outside Owner',
        workspaceName: 'Atlas G5 synthetic workspace B',
      }),
    );
  fixtures.outsideWorkspace = data.workspaceId;
  if (!fixtures.organizations.includes(data.organizationId))
    fixtures.organizations.push(data.organizationId);
  await save();
}
if (fixtures.organizations.length !== 2)
  throw new Error('Approved two-organization scope exceeded');
if (!fixtures.outsideProject) {
  const p = z.object({ id: z.uuid() }).parse(
    await command('outsider', {
      command: 'project.create',
      workspaceId: fixtures.outsideWorkspace,
      name: 'Atlas G5 separate-tenant fixture',
      visibility: 'PRIVATE',
      idempotencyKey: randomUUID(),
    }),
  );
  fixtures.outsideProject = p.id;
  fixtures.projects.push(p.id);
  await save();
}
if (!fixtures.secondPrivateProject) {
  const p = z.object({ id: z.uuid() }).parse(
    await command('owner', {
      command: 'project.create',
      workspaceId: fixtures.ownerWorkspace,
      name: 'Atlas G5 separate private project',
      visibility: 'PRIVATE',
      idempotencyKey: randomUUID(),
    }),
  );
  fixtures.secondPrivateProject = p.id;
  fixtures.projects.push(p.id);
  await save();
}
for (const name of ['editor', 'viewer', 'revoked', 'admin']) {
  const state = await request(name, '/api/v1/me');
  const current = z
    .object({ data: z.object({ profile: z.unknown().nullable() }) })
    .parse(state.payload).data.profile;
  if (!current)
    await command(name, {
      command: 'onboarding.save',
      draft: {
        displayName: `Atlas G5 ${name}`,
        researchInterests: [],
        workspaceName: 'Fixture role only',
        projectName: '',
        step: 0,
      },
    });
}
const id = (value) => z.uuid().parse(value);
const ids = names.map((n) => id(fixtures.actors[n].id));
const owner = id(fixtures.actors.owner.id),
  org = id(fixtures.organizations[0]),
  ws = id(fixtures.ownerWorkspace),
  project = id(fixtures.ownerProject);
// Explicit, tagged role fixtures avoid creating six unwanted personal tenants.
// Invitations remain disabled on hosted, and are not represented as tested mail.
let sql = `BEGIN; DO $guard$ BEGIN IF (SELECT count(*) FROM auth.users WHERE id IN (${ids.map((x) => `'${x}'::uuid`).join(',')}) AND raw_app_meta_data->>'atlas_fixture_run'='${fixtures.runId}')<>6 THEN RAISE EXCEPTION 'FIXTURE_SCOPE'; END IF; IF NOT EXISTS(SELECT 1 FROM organizations WHERE id='${org}'::uuid AND personal_owner_id='${owner}'::uuid) THEN RAISE EXCEPTION 'FIXTURE_PARENT'; END IF; END $guard$;`;
for (const name of ['editor', 'viewer', 'revoked', 'admin']) {
  const profile = id(fixtures.actors[name].id);
  const admin = name === 'admin';
  sql += `UPDATE profiles SET onboarding_completed_at=coalesce(onboarding_completed_at,now()) WHERE id='${profile}'::uuid; INSERT INTO organization_memberships(organization_id,profile_id,role,updated_at) VALUES('${org}','${profile}','${admin ? 'ADMIN' : 'MEMBER'}',now()) ON CONFLICT(organization_id,profile_id) DO UPDATE SET role=excluded.role; INSERT INTO workspace_memberships(organization_id,workspace_id,profile_id,role,updated_at) VALUES('${org}','${ws}','${profile}','${admin ? 'ADMIN' : 'MEMBER'}',now()) ON CONFLICT(workspace_id,profile_id) DO UPDATE SET role=excluded.role;`;
  if (!admin)
    sql += `INSERT INTO project_memberships(organization_id,workspace_id,project_id,profile_id,role,updated_at) VALUES('${org}','${ws}','${project}','${profile}','${name === 'viewer' ? 'VIEWER' : 'EDITOR'}',now()) ON CONFLICT(project_id,profile_id) DO UPDATE SET role=excluded.role;`;
}
sql += 'COMMIT;';
execFileSync(
  '/opt/homebrew/opt/postgresql@17/bin/psql',
  ['service=atlas_a01_migration', '-X', '-q', '-v', 'ON_ERROR_STOP=1'],
  {
    input: sql,
    env: {
      ...process.env,
      PGSERVICEFILE: root + '/../pg_service.conf',
      PGPASSFILE: root + '/../pgpass',
    },
    timeout: 30000,
    stdio: ['pipe', 'pipe', 'pipe'],
  },
);
const report = {};
for (const name of ['owner', 'editor', 'viewer', 'revoked']) {
  const r = await request(name, `/api/v1/projects/${project}`);
  if (r.status !== 200) throw new Error('Authorized role read failed: ' + name);
  report[name + '_read'] = r.status;
}
for (const name of ['outsider', 'admin']) {
  const r = await request(name, `/api/v1/projects/${project}`);
  if (![403, 404].includes(r.status))
    throw new Error('Private-project isolation failed: ' + name);
  report[name + '_private_denial'] = r.status;
}
if (!fixtures.viewerDeniedKey) {
  fixtures.viewerDeniedKey = randomUUID();
  await save();
}
const viewerWrite = await request('viewer', '/api/v1/commands', {
  command: 'task.create',
  projectId: project,
  title: 'Must not be created by viewer',
  idempotencyKey: fixtures.viewerDeniedKey,
});
if (
  ![403, 404].includes(viewerWrite.status) ||
  !['FORBIDDEN', 'NOT_FOUND'].includes(viewerWrite.payload.error?.code)
)
  throw new Error('Viewer write was not denied');
report.viewer_write_denial = viewerWrite.status;
const foreign = await request(
  'owner',
  `/api/v1/projects/${fixtures.outsideProject}`,
);
const crossProject = await request(
  'viewer',
  `/api/v1/projects/${fixtures.secondPrivateProject}`,
);
if (
  ![403, 404].includes(foreign.status) ||
  ![403, 404].includes(crossProject.status)
)
  throw new Error('Foreign tenant/project exposure');
report.cross_tenant_denial = foreign.status;
report.cross_project_denial = crossProject.status;
if (!fixtures.editorTask) {
  const task = z.object({ id: z.uuid() }).parse(
    await command('editor', {
      command: 'task.create',
      projectId: project,
      title: 'Atlas G5 editor-authorized task',
      idempotencyKey: randomUUID(),
    }),
  );
  fixtures.editorTask = task.id;
  await save();
}
report.editor_write = 'PASS';
const members = await request('owner', `/api/v1/projects/${project}/members`);
const list = z
  .object({
    data: z.object({
      items: z.array(z.object({ profileId: z.uuid(), version: z.number() })),
    }),
  })
  .safeParse(members.payload);
const rows = list.success
  ? list.data.data.items
  : z
      .object({
        data: z.array(z.object({ profileId: z.uuid(), version: z.number() })),
      })
      .parse(members.payload).data;
const revoked = rows.find((x) => x.profileId === fixtures.actors.revoked.id);
if (!revoked) throw new Error('Revocation fixture absent');
await command('owner', {
  command: 'membership.remove',
  scope: 'project',
  scopeId: project,
  profileId: revoked.profileId,
  expectedVersion: revoked.version,
});
const after = await request(
  'revoked',
  `/api/v1/sources/${fixtures.sourceVersion}/access`,
);
if (![403, 404].includes(after.status))
  throw new Error('Revoked actor retained source access');
report.revoked_source_denial = after.status;
for (let i = 0; i < 10; i++) {
  const name = i % 2 ? 'outsider' : 'owner';
  const r = await request(name, `/api/v1/projects/${project}`);
  if (
    (name === 'owner' && r.status !== 200) ||
    (name === 'outsider' && ![403, 404].includes(r.status))
  )
    throw new Error('Actor context leaked through pooled runtime');
}
report.pooled_actor_isolation = 'PASS';
await writeFile(
  root + '/g5-permission-results.json',
  JSON.stringify(report, null, 2),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    ...report,
    fixture_accounts: Object.keys(fixtures.actors).length,
    fixture_organizations: fixtures.organizations.length,
  }),
);
