import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type Route,
} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { z } from 'zod';
import {
  documentDto,
  taskPageDto,
  versionPageDto,
} from '../../../packages/core/src/index';
import { createDatabase } from '../../../packages/database/src/index';
import { origin, register } from './helpers';

const target = process.env.DIRECT_URL;
if (
  !target ||
  !['127.0.0.1', 'localhost'].includes(new URL(target).hostname) ||
  new URL(target).pathname !== '/atlas_auth_test'
)
  throw new Error(
    'Only the disposable atlas_auth_test database may be seeded.',
  );
const admin = createDatabase(target);
test.afterAll(() => admin.$disconnect());
async function command(request: APIRequestContext, body: unknown) {
  return request.post(`${origin}/api/v1/commands`, {
    headers: { Origin: origin },
    data: body,
  });
}
async function ok(request: APIRequestContext, body: unknown) {
  const response = await command(request, body);
  expect(response.ok()).toBe(true);
  return z
    .object({ data: z.object({ id: z.uuid() }) })
    .parse(await response.json()).data;
}
async function read<T>(
  request: APIRequestContext,
  path: string,
  schema: z.ZodType<T>,
) {
  const response = await request.get(`${origin}/api/v1/${path}`);
  expect(response.ok()).toBe(true);
  return z.object({ data: schema }).parse(await response.json()).data;
}
async function project(page: Page, name: string) {
  const me = await read(
    page.request,
    'me',
    z.object({ workspaceId: z.uuid(), profile: z.object({ id: z.uuid() }) }),
  );
  const created = await ok(page.request, {
    command: 'project.create',
    workspaceId: me.workspaceId,
    name,
    visibility: 'PRIVATE',
    idempotencyKey: randomUUID(),
  });
  return { id: created.id, actorId: me.profile.id };
}
const body = (text: string, paper: string) => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text },
        { type: 'citation', attrs: { projectPaperId: paper } },
      ],
    },
  ],
});
const documentTabs = (page: Page, name: string) =>
  page
    .getByRole('radiogroup', { name: 'Document list' })
    .getByRole('radio', { name, exact: true });

test('archived listing restores content and history; conflict, empty and interrupted response remain truthful', async ({
  page,
}) => {
  test.setTimeout(120000);
  await register(page);
  const p = await project(page, 'Archived recovery');
  const docs = `/app/projects/${p.id}/documents`;
  await page.goto(docs);
  await documentTabs(page, 'Archived').click();
  await expect(
    page.getByRole('heading', { name: 'No archived documents' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Restore / })).toHaveCount(0);
  const paper = await ok(page.request, {
    command: 'paper.create',
    projectId: p.id,
    title: 'Recovery reference',
    idempotencyKey: randomUUID(),
  });
  const created = await ok(page.request, {
    command: 'document.create',
    projectId: p.id,
    title: 'Recover my research',
    idempotencyKey: randomUUID(),
  });
  await ok(page.request, {
    command: 'document.save',
    id: created.id,
    expectedRevision: 1,
    clientRequestId: randomUUID(),
    content: body('Preserved research.', paper.id),
  });
  const before = await read(
    page.request,
    `documents/${created.id}`,
    documentDto,
  );
  const history = await read(
    page.request,
    `documents/${created.id}/versions`,
    versionPageDto,
  );
  await ok(page.request, {
    command: 'document.archive',
    id: created.id,
    expectedVersion: before.version,
  });
  expect(
    (
      await page.request.get(`${origin}/api/v1/documents/${created.id}`)
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.get(
        `${origin}/api/v1/documents/${created.id}/versions`,
      )
    ).status(),
  ).toBe(404);
  // The ordinary route is deliberately unavailable; recovery must work at the list.
  await page.goto(`${docs}?doc=${created.id}`);
  await expect(
    page.getByRole('heading', { name: 'Document unavailable' }),
  ).toBeVisible();
  await page.goto(docs);
  await documentTabs(page, 'Archived').click();
  const restore = page.getByRole('button', {
    name: 'Restore Recover my research',
    exact: true,
  });
  await expect(restore).toBeVisible();
  if (!process.env.CI)
    await page.screenshot({
      path: join(tmpdir(), 'atlas-phase-04-1-archived.png'),
    });
  await expect(
    page.getByRole('link', { name: /Recover my research/ }),
  ).toHaveCount(0);
  // Make the displayed metadata stale with an independent restore/archive.
  await ok(page.request, {
    command: 'document.restore',
    id: created.id,
    expectedVersion: before.version + 1,
  });
  await ok(page.request, {
    command: 'document.archive',
    id: created.id,
    expectedVersion: before.version + 2,
  });
  await restore.click();
  await expect(
    page.getByRole('status').filter({ hasText: 'The document changed' }),
  ).toBeVisible();
  await expect(restore).toBeEnabled();
  // Real transaction commits, but the browser loses its response.
  await page.route(
    '**/api/v1/commands',
    async (route) => {
      if (
        (route.request().postDataJSON() as { command?: string }).command !==
        'document.restore'
      )
        return route.continue();
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort('failed');
    },
    { times: 1 },
  );
  await restore.click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Restore could not be confirmed' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'No archived documents' }),
  ).toBeVisible();
  await documentTabs(page, 'Active').click();
  await expect(
    page.getByRole('link', { name: /Recover my research/ }),
  ).toBeVisible();
  // Archive once more to complete the user-visible successful restore path.
  const restoredOnce = await read(
    page.request,
    `documents/${created.id}`,
    documentDto,
  );
  await ok(page.request, {
    command: 'document.archive',
    id: created.id,
    expectedVersion: restoredOnce.version,
  });
  await documentTabs(page, 'Archived').click();
  await restore.click();
  await expect(
    page.getByRole('link', { name: 'Open restored document' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Open restored document' }).click();
  await expect(
    page.getByRole('textbox', { name: 'Document body' }),
  ).toContainText('Preserved research.');
  const after = await read(
    page.request,
    `documents/${created.id}`,
    documentDto,
  );
  expect(after.content).toEqual(before.content);
  expect(after.references).toEqual(before.references);
  expect(after.versionId).toBe(before.versionId);
  expect(after.revision).toBe(before.revision);
  expect(
    await read(
      page.request,
      `documents/${created.id}/versions`,
      versionPageDto,
    ),
  ).toEqual(history);
});

async function seedTasks(
  projectId: string,
  actorId: string,
  milestone: string,
) {
  await admin.$executeRaw`WITH p AS (SELECT * FROM projects WHERE id=${projectId}::uuid),
    a AS (INSERT INTO artifacts(id,organization_id,workspace_id,project_id,kind)
      SELECT gen_random_uuid(),p.organization_id,p.workspace_id,p.id,'TASK' FROM p,generate_series(1,500) RETURNING id)
    INSERT INTO tasks(id,organization_id,workspace_id,project_id,artifact_id,task_number,title,priority,milestone_id,created_by_id,updated_by_id)
    SELECT gen_random_uuid(),p.organization_id,p.workspace_id,p.id,a.id,row_number() OVER (),
      'Pagination task '||row_number() OVER (),'HIGH',${milestone}::uuid,${actorId}::uuid,${actorId}::uuid FROM p,a`;
}
async function filter(page: Page, name: string) {
  await page.getByRole('button', { name: /^Filter/ }).click();
  await page.getByRole('menuitemradio', { name, exact: true }).click();
}
function pausePage(page: Page, projectId: string, beforeFetch = false) {
  let release!: () => void;
  let arrived!: () => void;
  let finished!: () => void;
  const done = new Promise<void>((yes) => {
    finished = yes;
  });
  let held = false;
  const gate = new Promise<void>((yes) => {
    release = yes;
  });
  const started = new Promise<void>((yes) => {
    arrived = yes;
  });
  const pattern = `**/api/v1/projects/${projectId}/tasks?*`;
  const handler = async (route: Route) => {
    if (held || !new URL(route.request().url()).searchParams.has('cursor'))
      return route.continue();
    held = true;
    if (beforeFetch) {
      arrived();
      await gate;
    }
    const response = await route.fetch();
    if (!beforeFetch) {
      arrived();
      await gate;
    }
    await route.fulfill({ response });
    finished();
  };
  return {
    install: () => page.route(pattern, handler),
    started,
    release: async () => {
      release();
      await done;
    },
    remove: () => page.unroute(pattern, handler),
  };
}

test('500 real tasks paginate in Board/List with retry, filters, later-page edits and stale-filter isolation', async ({
  page,
}) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await register(page);
  const p = await project(page, 'Paginated board');
  const milestone = await ok(page.request, {
    command: 'milestone.create',
    projectId: p.id,
    title: 'Pagination milestone',
    idempotencyKey: randomUUID(),
  });
  await seedTasks(p.id, p.actorId, milestone.id);
  const path = `/app/projects/${p.id}/tasks`;
  const first = await read(page.request, `projects/${p.id}/tasks`, taskPageDto);
  expect(first.items).toHaveLength(300);
  const second = await read(
    page.request,
    `projects/${p.id}/tasks?cursor=${encodeURIComponent(first.nextCursor!)}`,
    taskPageDto,
  );
  expect(second.items).toHaveLength(200);
  expect(new Set([...first.items, ...second.items].map((t) => t.id)).size).toBe(
    500,
  );
  await page.goto(path);
  await expect(
    page.getByRole('status').filter({ hasText: '300 tasks loaded' }),
  ).toContainText('More tasks remain');
  await expect(
    page.getByRole('region', { name: /To do · 300 loaded/ }),
  ).toBeVisible();
  // Race B: an old second-page response cannot overwrite a committed move.
  const mutationPage = pausePage(page, p.id);
  await mutationPage.install();
  await page.getByRole('button', { name: 'Load more tasks' }).click();
  await mutationPage.started;
  await page
    .getByRole('button', { name: 'Move #1 Pagination task 1', exact: true })
    .click();
  await page
    .getByRole('menuitem', { name: 'In progress', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: '#1 moved to In progress.' }),
  ).toBeAttached();
  await mutationPage.release();
  await mutationPage.remove();
  await expect(
    page.getByRole('status').filter({ hasText: '300 tasks loaded' }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: /In progress/ })
      .getByRole('button', { name: /Pagination task 1$/ })
      .first(),
  ).toBeVisible();
  // A real failed page request leaves the current board intact and can be retried.
  await page.route(
    `**/api/v1/projects/${p.id}/tasks?*`,
    (route) =>
      new URL(route.request().url()).searchParams.has('cursor')
        ? route.abort('failed')
        : route.continue(),
    { times: 1 },
  );
  await page.getByRole('button', { name: 'Load more tasks' }).click();
  await expect(
    page.getByRole('button', { name: 'Retry loading tasks' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retry loading tasks' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '500 tasks loaded' }),
  ).toContainText('All matching tasks loaded');
  await expect(page.getByRole('button', { name: /^Move #/ })).toHaveCount(500);
  // Screenshots contain synthetic fixture UI only; never cookies, tokens,
  // storage state or Auth screens, and remain outside repository artifacts.
  if (!process.env.CI)
    await page.screenshot({
      path: join(tmpdir(), 'atlas-phase-04-1-tasks-desktop.png'),
    });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (await new AxeBuilder({ page }).include('main').analyze()).violations,
  ).toEqual([]);
  if (!process.env.CI)
    await page.screenshot({
      path: join(tmpdir(), 'atlas-phase-04-1-tasks-mobile.png'),
    });
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Keyboard move on the last page; authoritative refresh retains both pages.
  const move = page.getByRole('button', {
    name: 'Move #500 Pagination task 500',
    exact: true,
  });
  await move.focus();
  await page.keyboard.press('Enter');
  await page
    .getByRole('menuitem', { name: 'In progress', exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: /In progress/ })
      .getByRole('button', { name: /Pagination task 500/ })
      .first(),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Move #/ })).toHaveCount(500);
  await page
    .getByRole('radiogroup', { name: 'Task view' })
    .getByRole('radio', { name: 'List', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: /Pagination task/ }),
  ).toHaveCount(500);
  await page.getByRole('button', { name: /#500 Pagination task 500/ }).click();
  const detail = page.getByRole('complementary', { name: 'Task #500' });
  await detail.getByRole('button', { name: 'Assignee: unassigned' }).click();
  await page
    .getByRole('menuitemradio', { name: 'Test researcher', exact: true })
    .click();
  await expect(
    page
      .getByRole('complementary', { name: 'Task #500' })
      .getByRole('button', { name: 'Assignee: Test researcher' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close task', exact: true }).click();
  await filter(page, 'High');
  await page.getByRole('button', { name: 'Load more tasks' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '500 tasks loaded' }),
  ).toBeVisible();
  await filter(page, 'Pagination milestone');
  await page.getByRole('button', { name: 'Load more tasks' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '500 tasks loaded' }),
  ).toBeVisible();
  await filter(page, 'Unassigned');
  await page.getByRole('button', { name: 'Load more tasks' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '499 tasks loaded' }),
  ).toBeVisible();
  await filter(page, 'Assigned to me');
  await expect(
    page.getByRole('status').filter({ hasText: '1 tasks loaded' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /#500 Pagination task 500/ }),
  ).toBeVisible();
  // Race A: hold a real second page while the filter generation changes.
  await page.getByRole('button', { name: /^Filter/ }).click();
  await page.getByRole('menuitem', { name: 'Clear filters' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '300 tasks loaded' }),
  ).toBeVisible();
  const pending = pausePage(page, p.id);
  await pending.install();
  await page.getByRole('button', { name: 'Load more tasks' }).click();
  await pending.started;
  await filter(page, 'Low');
  await expect(
    page.getByRole('status').filter({ hasText: '0 tasks loaded' }),
  ).toBeVisible();
  await pending.release();
  await pending.remove();
  await expect(
    page.getByRole('button', { name: /Pagination task/ }),
  ).toHaveCount(0);
  // Race C: a project navigation discards the entire old generation.
  // Unit tests additionally deliver the stale response into a mounted hook.
  const other = await project(page, 'Isolated next project');
  await page.goto(path);
  await expect(
    page.getByRole('status').filter({ hasText: '300 tasks loaded' }),
  ).toBeVisible();
  const projectPage = pausePage(page, p.id);
  await projectPage.install();
  await page.getByRole('button', { name: 'Load more tasks' }).click();
  await projectPage.started;
  // Release only once navigation has removed the old workspace. The request
  // is fulfilled through Playwright before disposing its route handler.
  const navigation = page.goto(`/app/projects/${other.id}/tasks`);
  await expect(
    page.getByRole('status').filter({ hasText: '0 tasks loaded' }),
  ).toBeVisible();
  await projectPage.release();
  await projectPage.remove();
  await navigation;
  await expect(
    page.getByRole('button', { name: /Pagination task/ }),
  ).toHaveCount(0);
  // Race D: pause before the real server read, revoke the grant, and require
  // its actual 404 to clear already loaded private rows and metadata.
  await page.goto(path);
  await expect(
    page.getByRole('status').filter({ hasText: '300 tasks loaded' }),
  ).toBeVisible();
  const revokedPage = pausePage(page, p.id, true);
  await revokedPage.install();
  await page.getByRole('button', { name: 'Load more tasks' }).click();
  await revokedPage.started;
  await admin.projectMembership.delete({
    where: { projectId_profileId: { projectId: p.id, profileId: p.actorId } },
  });
  await revokedPage.release();
  await revokedPage.remove();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Tasks are unavailable' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Pagination task/ }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (await new AxeBuilder({ page }).include('main').analyze()).violations,
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test('explicit recovery retains an uncertain draft and retries one committed revision', async ({
  page,
}) => {
  test.setTimeout(120000);
  await register(page);
  const p = await project(page, 'Confirmed document recovery');
  const created = await ok(page.request, {
    command: 'document.create',
    projectId: p.id,
    title: 'Recovery confirmation',
    idempotencyKey: randomUUID(),
  });
  await page.goto(`/app/projects/${p.id}/documents?doc=${created.id}`);
  const editor = page.getByRole('textbox', { name: 'Document body' });
  await expect(editor).toBeVisible();
  const otherContent = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Other participant revision.' }],
      },
    ],
  };
  await ok(page.request, {
    command: 'document.save',
    id: created.id,
    expectedRevision: 1,
    clientRequestId: randomUUID(),
    content: otherContent,
  });
  await editor.fill('My retained research draft.');
  await expect(page.getByText('Someone saved a newer revision')).toBeVisible();
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const arrived = new Promise<void>((resolve) => {
    started = resolve;
  });
  let requestBody: unknown;
  await page.route(
    '**/api/v1/commands',
    async (route) => {
      const command: unknown = route.request().postDataJSON();
      const parsed = z.object({ command: z.string() }).parse(command);
      if (parsed.command !== 'document.save') return route.continue();
      requestBody = command;
      started();
      await gate;
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      // Real transaction commits, but its response never reaches the caller.
      await route.abort('failed');
    },
    { times: 1 },
  );
  await page
    .getByRole('button', { name: 'Save mine as a new revision' })
    .click();
  await arrived;
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  await expect(
    page.getByText(
      'Your draft was saved as a new revision. The other revision stays in history.',
    ),
  ).toHaveCount(0);
  release();
  await expect(
    page.getByText(
      'Save could not be confirmed. Your draft is kept on this device; retry or check version history.',
    ),
  ).toBeVisible();
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  const draftKey = `atlas:draft:v1:${p.actorId}:${p.id}:${created.id}`;
  expect(
    await page.evaluate((key) => localStorage.getItem(key) !== null, draftKey),
  ).toBe(true);
  const committed = await read(
    page.request,
    `documents/${created.id}`,
    documentDto,
  );
  expect(committed.revision).toBe(3);
  expect(JSON.stringify(committed.content)).toContain(
    'My retained research draft.',
  );
  // Retry now, before the bounded background timer. The real SQL replay must
  // acknowledge exactly this request and must not create revision 4.
  const retried = page.waitForRequest((request) => {
    if (
      !request.url().endsWith('/api/v1/commands') ||
      request.method() !== 'POST'
    )
      return false;
    const command: unknown = request.postDataJSON();
    return (
      z.object({ command: z.string() }).parse(command).command ===
      'document.save'
    );
  });
  await editor.press('ControlOrMeta+s');
  expect((await retried).postDataJSON()).toEqual(requestBody);
  await expect(
    page.getByRole('status').filter({ hasText: 'Saved' }),
  ).toBeVisible();
  expect(
    (await read(page.request, `documents/${created.id}`, documentDto)).revision,
  ).toBe(3);
  const versions = await read(
    page.request,
    `documents/${created.id}/versions`,
    versionPageDto,
  );
  expect(versions.items.map((item) => item.revision)).toEqual([3, 2, 1]);
  expect(
    await page.evaluate((key) => localStorage.getItem(key) === null, draftKey),
  ).toBe(true);
  const previous = await page.request.get(
    `${origin}/api/v1/documents/${created.id}/versions/2`,
  );
  expect(previous.ok()).toBe(true);
  expect(
    z
      .object({ data: z.object({ content: z.unknown() }) })
      .parse(await previous.json()).data.content,
  ).toEqual(otherContent);
});
