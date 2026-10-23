import { randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { z } from 'zod';
import { login, origin, register } from './helpers';

/*
 * Phase 04 journeys on the disposable harness: real GoTrue sessions, real
 * PostgreSQL/RLS through the non-owner runtime, the real Tiptap editor and
 * the deterministic loopback AI fixture (no paid model calls).
 */
const data = z.object({
  data: z.object({
    id: z.uuid(),
    revision: z.number().optional(),
    invitationLink: z.string().optional(),
  }),
});
async function command(request: APIRequestContext, body: unknown) {
  return request.post(`${origin}/api/v1/commands`, {
    headers: { Origin: origin },
    data: body,
  });
}
async function ok(request: APIRequestContext, body: unknown) {
  const response = await command(request, body);
  expect(response.ok(), JSON.stringify(body).slice(0, 120)).toBe(true);
  return data.parse(await response.json()).data;
}
const me = async (request: APIRequestContext) =>
  z
    .object({
      data: z.object({
        profile: z.object({ id: z.uuid() }),
        workspaceId: z.uuid(),
      }),
    })
    .parse(await (await request.get(`${origin}/api/v1/me`)).json()).data;
async function project(page: Page, name: string) {
  const { workspaceId } = await me(page.request);
  return (
    await ok(page.request, {
      command: 'project.create',
      workspaceId,
      name,
      visibility: 'PRIVATE',
      idempotencyKey: randomUUID(),
    })
  ).id;
}
async function collaborator(
  browser: import('@playwright/test').Browser,
  owner: Page,
  projectId: string,
  role: 'EDITOR' | 'VIEWER',
  name: string,
) {
  const context = await browser.newContext({ baseURL: origin });
  const page = await context.newPage();
  const email = await register(page);
  await ok(page.request, {
    command: 'profile.update',
    displayName: name,
    researchInterests: [],
  });
  const invite = await ok(owner.request, {
    command: 'invitation.create',
    scope: 'project',
    scopeId: projectId,
    email,
    role,
  });
  await page.goto(invite.invitationLink!);
  await page.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/overview$`));
  const profileId = (await me(page.request)).profile.id;
  return { context, page, email, profileId };
}
const editor = (page: Page) =>
  page.getByRole('textbox', { name: 'Document body' });
const saved = (page: Page) =>
  expect(page.getByRole('status').filter({ hasText: /words$/ })).toContainText(
    'Saved',
    { timeout: 20000 },
  );
async function openDocument(page: Page, projectId: string, id: string) {
  await page.goto(`/app/projects/${projectId}/documents?doc=${id}`);
  await expect(editor(page)).toBeVisible({ timeout: 30000 });
}

test('documents: write, autosave, reload, cite, restore, conflict recovery and revocation', async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const appErrors: string[] = [];
  page.on('pageerror', (error) => appErrors.push(error.message));
  const email = await register(page);
  const projectId = await project(page, 'Brain segmentation review');
  const paper = await ok(page.request, {
    command: 'paper.create',
    projectId,
    title: 'U-Net convolutional segmentation',
    idempotencyKey: randomUUID(),
  });

  // Journey A — create, type, autosave, reload, restore.
  await page.goto(`/app/projects/${projectId}/documents`);
  await expect(
    page.getByRole('heading', { name: 'No documents yet' }),
  ).toBeVisible({ timeout: 30000 });
  await expect(async () => {
    await page.getByRole('button', { name: 'New document' }).first().click();
    await expect(editor(page)).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30000 });
  const documentId = new URL(page.url()).searchParams.get('doc')!;
  await page.getByLabel('Document title').fill('Literature review notes');
  await page.getByLabel('Document title').press('Enter');
  await editor(page).click();
  await page.keyboard.type('First persisted paragraph.');
  await saved(page);
  await page.reload();
  await expect(editor(page)).toContainText('First persisted paragraph.', {
    timeout: 30000,
  });
  await expect(page.getByLabel('Document title')).toHaveValue(
    'Literature review notes',
  );
  await editor(page).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Second edit.');
  await saved(page);

  // Journey C — a structured @ reference to an authorized saved paper.
  await page.keyboard.press('Enter');
  await page.keyboard.type('See @U-Net');
  const picker = page.getByRole('listbox', { name: 'Insert reference' });
  await expect(
    picker.getByRole('option', { name: /U-Net convolutional segmentation/ }),
  ).toBeVisible();
  await page.keyboard.press('Enter');
  const chip = editor(page).getByRole('button', {
    name: /Citation: Private source/,
  });
  await expect(chip).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(
    editor(page).getByRole('button', { name: /Citation: Private source/ }),
  ).toBeVisible({ timeout: 30000 });
  const stored = z
    .object({
      data: z.object({
        content: z.unknown(),
        revision: z.number(),
        references: z.array(
          z.object({ id: z.string().nullable(), state: z.string() }),
        ),
      }),
    })
    .parse(
      await (
        await page.request.get(`${origin}/api/v1/documents/${documentId}`)
      ).json(),
    ).data;
  expect(JSON.stringify(stored.content)).toContain(paper.id);
  expect(stored.references).toEqual([
    expect.objectContaining({ id: paper.id, state: 'AVAILABLE' }),
  ]);
  await page
    .getByRole('region', { name: 'References' })
    .getByRole('link', { name: /U-Net/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`/library\\?paper=${paper.id}`));
  await openDocument(page, projectId, documentId);

  // Version history: restore revision 2 creates a new revision.
  const before = stored.revision;
  await page.getByRole('button', { name: 'Version history' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Version history' });
  await dialog.getByRole('option', { name: /^Revision 2/ }).click();
  await expect(dialog.getByLabel('Revision 2 preview')).toContainText(
    'First persisted paragraph.',
  );
  await dialog.getByRole('button', { name: 'Restore this version' }).click();
  await dialog.getByRole('button', { name: 'Confirm restore' }).click();
  await expect(
    page.getByText(`Restored revision 2 as revision ${before + 1}`),
  ).toBeVisible();
  await expect(editor(page)).not.toContainText('Second edit.', {
    timeout: 30000,
  });
  const history = z
    .object({
      data: z.object({
        items: z.array(z.object({ revision: z.number(), source: z.string() })),
      }),
    })
    .parse(
      await (
        await page.request.get(
          `${origin}/api/v1/documents/${documentId}/versions`,
        )
      ).json(),
    ).data.items;
  expect(history[0]).toMatchObject({ revision: before + 1, source: 'RESTORE' });
  expect(history.map((h) => h.revision)).toContain(before);

  // Journey B — two independent sessions edit the same revision.
  const second: BrowserContext = await browser.newContext({ baseURL: origin });
  const other = await second.newPage();
  await other.setViewportSize({ width: 1440, height: 1000 });
  await login(other, email);
  await openDocument(other, projectId, documentId);
  await openDocument(page, projectId, documentId);
  await editor(page).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Session A wins.');
  await saved(page);
  await editor(other).click();
  await other.keyboard.press('End');
  await other.keyboard.type(' Session B draft.');
  await expect(
    other
      .getByRole('alert')
      .filter({ hasText: 'Someone saved a newer revision' }),
  ).toBeVisible({ timeout: 20000 });
  // B keeps its draft locally and A's revision is intact on the server.
  await expect(editor(other)).toContainText('Session B draft.');
  const server = z
    .object({ data: z.object({ content: z.unknown(), revision: z.number() }) })
    .parse(
      await (
        await page.request.get(`${origin}/api/v1/documents/${documentId}`)
      ).json(),
    ).data;
  expect(JSON.stringify(server.content)).toContain('Session A wins.');
  expect(JSON.stringify(server.content)).not.toContain('Session B draft.');
  // The draft survives a reload as an explicit recovery choice.
  await other.reload();
  await expect(
    other.getByRole('alert').filter({ hasText: 'were kept on this device' }),
  ).toBeVisible({ timeout: 30000 });
  await other.getByRole('button', { name: 'Recover draft' }).click();
  await expect(editor(other)).toContainText('Session B draft.');
  await saved(other);
  const merged = z
    .object({ data: z.object({ content: z.unknown(), revision: z.number() }) })
    .parse(
      await (
        await other.request.get(`${origin}/api/v1/documents/${documentId}`)
      ).json(),
    ).data;
  expect(merged.revision).toBe(server.revision + 1);
  await second.close();

  // Revocation: a viewer sees the citation, then loses access entirely.
  const viewer = await collaborator(
    browser,
    page,
    projectId,
    'VIEWER',
    'Viewer Vera',
  );
  await openDocument(viewer.page, projectId, documentId);
  await expect(viewer.page.getByLabel('Document title')).toHaveCount(0);
  await expect(
    viewer.page.getByRole('status').filter({ hasText: /words$/ }),
  ).toContainText('View only');
  const membership = z
    .object({
      data: z.object({
        items: z.array(z.object({ profileId: z.uuid(), version: z.number() })),
      }),
    })
    .parse(
      await (
        await page.request.get(`${origin}/api/v1/projects/${projectId}/members`)
      ).json(),
    )
    .data.items.find((m) => m.profileId === viewer.profileId)!;
  await ok(page.request, {
    command: 'membership.remove',
    scope: 'project',
    scopeId: projectId,
    profileId: viewer.profileId,
    expectedVersion: membership.version,
  });
  expect(
    (
      await viewer.page.request.get(`${origin}/api/v1/documents/${documentId}`)
    ).status(),
  ).toBe(404);
  expect(
    (
      await viewer.page.request.get(
        `${origin}/api/v1/documents/${documentId}/export?format=html`,
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await viewer.page.request.get(
        `${origin}/api/v1/documents/${documentId}/versions`,
      )
    ).status(),
  ).toBe(404);
  await viewer.context.close();

  // Archived source: the citation keeps its identity and renders safely.
  const cited = await ok(page.request, {
    command: 'document.create',
    projectId,
    title: 'Cited note',
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Per ' },
            { type: 'citation', attrs: { projectPaperId: paper.id } },
          ],
        },
      ],
    },
    idempotencyKey: randomUUID(),
  });
  const pp = z
    .object({ data: z.object({ version: z.number() }) })
    .parse(
      await (
        await page.request.get(`${origin}/api/v1/papers/${paper.id}`)
      ).json(),
    ).data;
  await ok(page.request, {
    command: 'paper.archive',
    id: paper.id,
    expectedVersion: pp.version,
  });
  await openDocument(page, projectId, cited.id);
  await expect(
    editor(page).getByRole('button', {
      name: /Citation: Private source \(archived\)/,
    }),
  ).toBeVisible();
  await openDocument(page, projectId, documentId);

  // Export: sanitized HTML and Markdown attachments.
  const html = await page.request.get(
    `${origin}/api/v1/documents/${documentId}/export?format=html`,
  );
  expect(html.headers()['content-disposition']).toContain('attachment');
  expect(html.headers()['x-content-type-options']).toBe('nosniff');
  // The global CSP never allows inline or unnonced script in an opened export.
  expect(html.headers()['content-security-policy']).not.toMatch(
    /script-src[^;]*'unsafe-inline'/,
  );
  expect(await html.text()).not.toMatch(/<script/i);
  // Session B explicitly saved its draft on top; A's text stays in history.
  expect(await html.text()).toContain('Session B draft.');
  const md = await page.request.get(
    `${origin}/api/v1/documents/${documentId}/export?format=markdown`,
  );
  expect(await md.text()).toContain('# Literature review notes');

  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axe.violations).toEqual([]);
  expect(appErrors).toEqual([]);
});

test('tasks and links: create, assign, keyboard and drag moves, revocation, search and cross-project denial', async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await register(page);
  const projectId = await project(page, 'Segmentation benchmark');
  const otherProject = await project(page, 'Unrelated project');
  const paper = await ok(page.request, {
    command: 'paper.create',
    projectId,
    title: 'Attention U-Net baseline',
    idempotencyKey: randomUUID(),
  });
  const doc = await ok(page.request, {
    command: 'document.create',
    projectId,
    title: 'Benchmark protocol',
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Dice and Hausdorff metrics.' }],
        },
      ],
    },
    idempotencyKey: randomUUID(),
  });
  const ada = await collaborator(
    browser,
    page,
    projectId,
    'EDITOR',
    'Ada Editor',
  );

  // Journey D — create through the UI.
  await page.goto(`/app/projects/${projectId}/tasks`);
  await expect(
    page.getByRole('heading', { name: 'No tasks in this project yet' }),
  ).toBeVisible({ timeout: 30000 });
  await expect(async () => {
    await page.getByRole('button', { name: 'New task', exact: true }).click();
    await expect(page.getByLabel('New task title')).toBeVisible({
      timeout: 3000,
    });
  }).toPass({ timeout: 30000 });
  await page.getByLabel('New task title').fill('Benchmark Attention U-Net');
  await page.getByLabel('New task title').press('Enter');
  const detail = page.getByRole('complementary', { name: 'Task #1' });
  await expect(detail).toBeVisible();
  await detail.getByRole('button', { name: /^Priority:/ }).click();
  await page.getByRole('menuitemradio', { name: 'High' }).click();
  await expect(
    detail.getByRole('button', { name: 'Priority: High' }),
  ).toBeVisible();
  await detail.getByLabel('Due').fill('2026-12-01');
  await expect(
    page.getByRole('complementary', { name: 'Task #1' }).getByLabel('Due'),
  ).toHaveValue('2026-12-01');
  await detail.getByRole('button', { name: /^Assignee:/ }).click();
  await page.getByRole('menuitemradio', { name: 'Ada Editor' }).click();
  await expect(
    page
      .getByRole('complementary', { name: 'Task #1' })
      .getByRole('button', { name: 'Assignee: Ada Editor' }),
  ).toBeVisible();

  // Typed links from the task.
  await page.getByLabel('Link a paper, document or task').fill('Attention');
  await page
    .getByRole('button', { name: /Paper\s*Attention U-Net baseline/ })
    .click();
  await expect(
    page
      .getByRole('complementary', { name: 'Task #1' })
      .getByRole('link', { name: /Attention U-Net baseline/ }),
  ).toBeVisible();
  await page
    .getByLabel('Link a paper, document or task')
    .fill('Benchmark protocol');
  await page
    .getByRole('button', { name: /Document\s*Benchmark protocol/ })
    .click();
  const task = page.getByRole('complementary', { name: 'Task #1' });
  await expect(
    task.getByRole('link', { name: /Attention U-Net baseline/ }),
  ).toBeVisible();
  await expect(
    task.getByRole('link', { name: /Benchmark protocol/ }),
  ).toBeVisible();

  // Keyboard move (menu), then a drag move with persisted status.
  const move = page.getByRole('button', {
    name: 'Move #1 Benchmark Attention U-Net',
  });
  await move.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'In progress' }).press('Enter');
  await expect(
    page.getByRole('region', { name: 'In progress · 1' }),
  ).toBeVisible();
  await page
    .getByRole('region', { name: 'In progress · 1' })
    .getByRole('button', { name: 'Benchmark Attention U-Net', exact: true })
    .dragTo(page.getByRole('region', { name: 'In review · 0' }));
  await expect(
    page.getByRole('region', { name: 'In review · 1' }),
  ).toBeVisible();
  // A disallowed move is refused locally and announced, then also server-side.
  await page
    .getByRole('button', { name: 'Move #1 Benchmark Attention U-Net' })
    .click();
  await expect(page.getByRole('menuitem', { name: 'To do' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: 'List' }).click();
  await page.reload();
  await page.getByRole('radio', { name: 'List' }).click();
  const list = page.getByRole('region', { name: 'In review' });
  await expect(
    list.getByRole('button', { name: /#1\s*Benchmark Attention U-Net/ }),
  ).toContainText('Ada Editor');
  const tasks = z
    .object({
      data: z.object({
        items: z.array(
          z.object({
            id: z.uuid(),
            artifactId: z.uuid(),
            status: z.string(),
            version: z.number(),
            priority: z.string(),
            dueDate: z.string().nullable(),
          }),
        ),
      }),
    })
    .parse(
      await (
        await page.request.get(`${origin}/api/v1/projects/${projectId}/tasks`)
      ).json(),
    ).data.items;
  expect(tasks[0]).toMatchObject({
    status: 'IN_REVIEW',
    priority: 'HIGH',
    dueDate: '2026-12-01',
  });
  const stale = await command(page.request, {
    command: 'task.transition',
    id: tasks[0]!.id,
    expectedVersion: 1,
    status: 'DONE',
  });
  expect(stale.status()).toBe(409);

  // Revocation: the collaborator stays recorded but loses identity and eligibility.
  const membership = z
    .object({
      data: z.object({
        items: z.array(z.object({ profileId: z.uuid(), version: z.number() })),
      }),
    })
    .parse(
      await (
        await page.request.get(`${origin}/api/v1/projects/${projectId}/members`)
      ).json(),
    )
    .data.items.find((m) => m.profileId === ada.profileId)!;
  await ok(page.request, {
    command: 'membership.remove',
    scope: 'project',
    scopeId: projectId,
    profileId: ada.profileId,
    expectedVersion: membership.version,
  });
  await page.reload();
  await page.getByRole('radio', { name: 'List' }).click();
  await expect(
    page
      .getByRole('region', { name: 'In review' })
      .getByRole('button', { name: /#1/ }),
  ).toContainText('Former participant');
  expect(
    (
      await ada.page.request.get(`${origin}/api/v1/tasks/${tasks[0]!.id}`)
    ).status(),
  ).toBe(404);
  // Keeping the recorded assignee is allowed; a new assignment is refused.
  const fresh = await ok(page.request, {
    command: 'task.create',
    projectId,
    title: 'Second task',
    idempotencyKey: randomUUID(),
  });
  const reassign = await command(page.request, {
    command: 'task.assign',
    id: fresh.id,
    expectedVersion: 1,
    assigneeId: ada.profileId,
  });
  expect(reassign.status()).toBe(400);
  await ada.context.close();

  // Journey E — search and open; cross-project link denial; archived target.
  await page.goto(`/app/projects/${projectId}/documents`);
  const search = page.getByRole('combobox', {
    name: 'Search papers, documents and tasks',
  });
  await search.fill('benchmark');
  const results = page.getByRole('listbox', { name: 'Search results' });
  await expect(results.getByRole('option')).toHaveCount(2);
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(page).toHaveURL(/documents\?doc=|tasks\?task=/);
  const foreignDoc = await ok(page.request, {
    command: 'document.create',
    projectId: otherProject,
    title: 'Elsewhere',
    idempotencyKey: randomUUID(),
  });
  const foreign = z
    .object({ data: z.object({ artifactId: z.uuid() }) })
    .parse(
      await (
        await page.request.get(`${origin}/api/v1/documents/${foreignDoc.id}`)
      ).json(),
    ).data;
  const cross = await command(page.request, {
    command: 'artifact.link.create',
    projectId,
    sourceArtifactId: foreign.artifactId,
    targetArtifactId: tasks[0]!.artifactId,
    relationship: 'TRACKS',
    idempotencyKey: randomUUID(),
  });
  expect(cross.status()).toBe(404);
  const docDto = z
    .object({ data: z.object({ version: z.number() }) })
    .parse(
      await (
        await page.request.get(`${origin}/api/v1/documents/${doc.id}`)
      ).json(),
    ).data;
  await ok(page.request, {
    command: 'document.archive',
    id: doc.id,
    expectedVersion: docDto.version,
  });
  await page.goto(`/app/projects/${projectId}/tasks?task=${tasks[0]!.id}`);
  await expect(
    page
      .getByRole('complementary', { name: 'Task #1' })
      .getByRole('link', { name: /Benchmark protocol/ }),
  ).toContainText('archived');
  expect(paper.id).toBeTruthy();
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axe.violations).toEqual([]);
});

test('Atlas AI proposals: preview, discard, approve and conflict without unauthorized writes', async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await register(page);
  const projectId = await project(page, 'AI planning project');
  await ok(page.request, {
    command: 'paper.create',
    projectId,
    title: 'Planning source',
    idempotencyKey: randomUUID(),
  });
  const doc = await ok(page.request, {
    command: 'document.create',
    projectId,
    title: 'Plan notes',
    idempotencyKey: randomUUID(),
  });
  await page.goto(
    `/app/projects/${projectId}/documents?doc=${doc.id}&atlas=open`,
  );
  await expect(editor(page)).toBeVisible({ timeout: 30000 });
  const surface = page
    .getByRole('complementary', { name: 'Atlas AI assistant' })
    .first();
  await expect(
    surface.getByText('Isolated AI test fixture · no real model inference'),
  ).toBeVisible();
  await surface.getByRole('checkbox').check();
  await surface
    .getByRole('combobox', { name: 'Ask Atlas' })
    .fill('fixture-plan the benchmark work');
  await surface.getByRole('button', { name: 'Send (Enter)' }).click();
  const answer = surface
    .getByRole('article', { name: 'Atlas research response' })
    .last();
  await expect(
    answer.getByRole('button', { name: 'Propose tasks' }),
  ).toBeVisible({ timeout: 30000 });
  const countTasks = async () =>
    z
      .object({ data: z.object({ items: z.array(z.unknown()) }) })
      .parse(
        await (
          await page.request.get(`${origin}/api/v1/projects/${projectId}/tasks`)
        ).json(),
      ).data.items.length;
  const revision = async () =>
    z
      .object({ data: z.object({ revision: z.number() }) })
      .parse(
        await (
          await page.request.get(`${origin}/api/v1/documents/${doc.id}`)
        ).json(),
      ).data.revision;

  // Preview then discard: nothing is written.
  await answer.getByRole('button', { name: 'Propose tasks' }).click();
  const proposal = answer.getByRole('region', { name: 'Proposed tasks' });
  await expect(proposal.getByText('Prepare evaluation splits')).toBeVisible();
  await proposal.getByRole('button', { name: 'Discard' }).click();
  expect(await countTasks()).toBe(0);
  // Approve two selected tasks.
  await answer.getByRole('button', { name: 'Propose tasks' }).click();
  await proposal.getByLabel(/Train baseline model/).uncheck();
  await proposal.getByRole('button', { name: 'Create 2 tasks' }).click();
  await expect(answer.getByText('Created 2 tasks.')).toBeVisible();
  expect(await countTasks()).toBe(2);

  // Document insert: preview, then a newer revision makes the proposal stale.
  await answer.getByRole('button', { name: 'Propose document insert' }).click();
  const insert = answer.getByRole('region', {
    name: 'Proposed document insert',
  });
  await expect(insert).toContainText('Prepare evaluation splits');
  const start = await revision();
  await ok(page.request, {
    command: 'document.save',
    id: doc.id,
    expectedRevision: start,
    clientRequestId: randomUUID(),
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Concurrent edit.' }],
        },
      ],
    },
  });
  await insert.getByRole('button', { name: 'Accept' }).click();
  await expect(
    answer.getByText(/target changed since this proposal/),
  ).toBeVisible();
  expect(await revision()).toBe(start + 1);
  // Refreshing re-derives against the current revision; approval then applies once.
  await insert.getByRole('button', { name: 'Refresh proposal' }).click();
  await insert.getByRole('button', { name: 'Accept' }).click();
  await expect(
    page
      .getByText(`Accepted into the document as revision ${start + 2}`)
      .first(),
  ).toBeVisible();
  // The open editor adopts the new revision without writing one of its own.
  await expect(editor(page)).toContainText('Prepare evaluation splits', {
    timeout: 30000,
  });
  await expect(editor(page)).toContainText('Concurrent edit.');
  await page.waitForTimeout(3000);
  expect(await revision()).toBe(start + 2);
  const versions = z
    .object({
      data: z.object({ items: z.array(z.object({ source: z.string() })) }),
    })
    .parse(
      await (
        await page.request.get(`${origin}/api/v1/documents/${doc.id}/versions`)
      ).json(),
    ).data.items;
  expect(versions[0]!.source).toBe('AI_PROPOSAL');
  // Unapproved application is rejected by the schema.
  const unapproved = await command(page.request, {
    command: 'ai.task-proposal.apply',
    projectId,
    runId: randomUUID(),
    proposalHash: 'a'.repeat(64),
    selected: [0],
    idempotencyKey: randomUUID(),
  });
  expect(unapproved.status()).toBe(400);
});
