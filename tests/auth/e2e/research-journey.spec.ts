import { createHash, createHmac, randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { z } from 'zod';
import { makePdf } from '../../fixtures/pdf';
import { origin, register } from './helpers';

/*
 * A02 connected research journey on the disposable harness: real GoTrue
 * sessions, PostgreSQL/RLS through the non-owner runtime, real Storage,
 * the real provider adapters against the loopback fixture, the real PDF
 * reader and Tiptap editor. No hosted service, user data or paid model.
 */
const scannerSecret = process.env.ATLAS_SCANNER_SECRET ?? '';
const pdf = makePdf([
  [
    'Sparse attention reduces memory use.',
    'Pair representations dominate activation memory.',
  ],
  ['Results on long targets are reported on this page.'],
]);
const fixtureTitle =
  'Fixture: Sparse attention for protein structure prediction';

async function command(request: APIRequestContext, body: unknown) {
  return request.post(`${origin}/api/v1/commands`, {
    headers: { Origin: origin },
    data: body,
  });
}
const me = async (request: APIRequestContext) =>
  z
    .object({ data: z.object({ workspaceId: z.uuid() }) })
    .parse(await (await request.get(`${origin}/api/v1/me`)).json()).data;
async function newProject(page: Page, name: string) {
  const { workspaceId } = await me(page.request);
  const response = await command(page.request, {
    command: 'project.create',
    workspaceId,
    name,
    visibility: 'PRIVATE',
    idempotencyKey: randomUUID(),
  });
  expect(response.ok()).toBe(true);
  return z
    .object({ data: z.object({ id: z.uuid() }) })
    .parse(await response.json()).data.id;
}
function signed(body: string) {
  const ts = String(Math.floor(Date.now() / 1000));
  return {
    headers: {
      'content-type': 'application/json',
      'x-atlas-scanner-timestamp': ts,
      'x-atlas-scanner-signature': createHmac('sha256', scannerSecret)
        .update(`${ts}.${body}`)
        .digest('hex'),
    },
    data: body,
  };
}
/** Scanner protocol fixture: verifies bytes, then reports the verdict. */
async function scanQueued(request: APIRequestContext) {
  const claimed = z
    .object({
      data: z.array(
        z.object({
          jobId: z.string(),
          attempt: z.number(),
          sha256: z.string(),
          downloadUrl: z.string(),
        }),
      ),
    })
    .parse(
      await (
        await request.post(
          `${origin}/api/v1/internal/scanner/claim`,
          signed(JSON.stringify({ max: 10, leaseSeconds: 60 })),
        )
      ).json(),
    ).data;
  for (const job of claimed) {
    const bytes = Buffer.from(
      await (await request.get(job.downloadUrl)).body(),
    );
    const measured = createHash('sha256').update(bytes).digest('hex');
    const done = await request.post(
      `${origin}/api/v1/internal/scanner/complete`,
      signed(
        JSON.stringify({
          jobId: job.jobId,
          attempt: job.attempt,
          verdict: measured === job.sha256 ? 'CLEAN' : 'INVALID',
          sha256: measured,
          scanner: 'e2e-protocol-fixture',
        }),
      ),
    );
    expect(done.status()).toBe(200);
  }
  return claimed.length;
}
const selectText = (page: Page, text: string) =>
  page.evaluate((needle) => {
    const span = [...document.querySelectorAll('.textLayer span')].find((s) =>
      s.textContent?.includes(needle),
    )!;
    const node = span.firstChild!;
    const start = node.textContent!.indexOf(needle);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + needle.length);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document
      .querySelector('.atlas-pdf-page')!
      .dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }, text);
const editorOf = (page: Page) =>
  page.getByRole('textbox', { name: 'Document body' });

test('paper → reader evidence → research note → task → back to the cited page', async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  await register(page);
  const projectId = await newProject(page, 'A02 connected journey');

  // --- Research → Library: save once, recognise it, keep the search on return
  await page.goto(`/app/projects/${projectId}/research`);
  await page.getByLabel('Research query').fill('protein folding');
  await page.getByLabel('Research query').press('Enter');
  const results = page.getByRole('list', { name: 'Search results' });
  const row = results.getByRole('listitem').filter({ hasText: fixtureTitle });
  await expect(row).toBeVisible();
  // A double click issues one confirmed save and one association.
  await row.getByRole('button', { name: 'Save' }).dblclick();
  await expect(row.getByRole('link', { name: 'Saved' })).toBeVisible();
  await row.getByRole('link', { name: 'Saved' }).click();
  await expect(page).toHaveURL(/\/library\?paper=[0-9a-f-]{36}$/);
  const paperId = new URL(page.url()).searchParams.get('paper')!;
  const panel = page.getByRole('complementary', { name: /Paper details/ });
  await expect(panel.getByText(fixtureTitle)).toBeVisible();
  await expect(
    panel.getByText('No notes or tasks link to this paper yet.', {
      exact: false,
    }),
  ).toBeVisible();
  await page.goBack();
  // Restored from this tab's memory without a new provider request.
  await expect(row.getByRole('link', { name: 'Saved' })).toBeVisible();
  await expect(page.getByLabel('Research query')).toHaveValue(
    'protein folding',
  );
  const library = z
    .object({ data: z.object({ items: z.array(z.unknown()) }) })
    .parse(
      await (
        await page.request.get(`/api/v1/projects/${projectId}/papers`)
      ).json(),
    ).data.items;
  expect(library).toHaveLength(1);

  // --- Authorized disposable PDF, validated by the scanner protocol fixture
  await page.goto(`/app/projects/${projectId}/library?paper=${paperId}`);
  await panel.locator('input[type=file]').setInputFiles({
    name: 'sparse-attention.pdf',
    mimeType: 'application/pdf',
    buffer: pdf,
  });
  await expect(
    panel.getByText('Uploaded. Quarantined until validation finishes.'),
  ).toBeVisible({ timeout: 30000 });
  expect(await scanQueued(page.request)).toBe(1);

  // --- Reader → research note: selection becomes a highlight, then a citation
  await page.goto(`/app/projects/${projectId}/reader?paper=${paperId}`);
  await expect(page.getByText('Page 1 of 2')).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await selectText(page, 'Results on long targets');
  await page
    .getByRole('toolbar', { name: 'Selection actions' })
    .getByRole('button', { name: 'Add to research note' })
    .click();
  await expect(page.getByText('Highlight saved')).toBeVisible();
  const dialog = page.getByRole('dialog', { name: 'Add to research note' });
  await expect(dialog.getByText('“Results on long targets”')).toBeVisible();
  await expect(
    dialog.getByText(
      /Exact quotation with its page and source version · p\. 2/,
    ),
  ).toBeVisible();
  // Nothing exists until confirmation.
  const documents = async () =>
    z
      .object({ data: z.object({ items: z.array(z.unknown()) }) })
      .parse(
        await (
          await page.request.get(`/api/v1/projects/${projectId}/documents`)
        ).json(),
      ).data.items.length;
  expect(await documents()).toBe(0);
  expect(
    (await new AxeBuilder({ page }).include('[role=dialog]').analyze())
      .violations,
  ).toEqual([]);
  await dialog.getByLabel('New note title').fill('Long-target reading note');
  await dialog
    .getByLabel(/Your commentary/)
    .fill('Check whether the result holds for 4k residues.');
  // Lost response: the server commits, the browser never sees the answer.
  let dropped = false;
  await page.route('**/api/v1/commands', async (route) => {
    if (dropped || !route.request().postData()?.includes('cite-source'))
      return route.continue();
    dropped = true;
    await route.fetch();
    await route.abort('connectionreset');
  });
  await dialog.getByRole('button', { name: 'Add to note' }).click();
  await expect(
    dialog.getByText(/Retrying is safe: the reference is never added twice/),
  ).toBeVisible({ timeout: 30000 });
  await dialog.getByRole('button', { name: 'Retry' }).click();
  // On success the dialog is retitled with its confirmed destination.
  const added = page.getByRole('dialog', {
    name: 'Added to “Long-target reading note”',
  });
  await expect(added.getByText(/nothing was duplicated/)).toBeVisible({
    timeout: 30000,
  });
  await page.unroute('**/api/v1/commands');
  expect(await documents()).toBe(1);
  await added.getByRole('button', { name: 'Open note' }).click();

  // --- The note persists the exact citation and separate commentary
  await expect(page).toHaveURL(/\/documents\?doc=[0-9a-f-]{36}$/);
  const noteUrl = page.url();
  const citation = editorOf(page).getByRole('button', {
    name: /^Citation: .*p\. 2 — open source$/,
  });
  await expect(citation).toBeVisible({ timeout: 30000 });
  await expect(editorOf(page)).toContainText('“Results on long targets”');
  await expect(editorOf(page)).toContainText('4k residues');
  await page.reload();
  await expect(citation).toBeVisible({ timeout: 30000 });

  // --- Note → task: one confirmed command, linked to the note and the paper
  await page.getByRole('button', { name: 'Create research task' }).click();
  const taskDialog = page.getByRole('dialog', { name: 'Create research task' });
  await taskDialog.getByLabel('Title').fill('Reproduce the long-target result');
  await taskDialog
    .getByRole('checkbox', { name: new RegExp(fixtureTitle.slice(10, 40)) })
    .check();
  await taskDialog.getByRole('button', { name: 'Create task' }).click();
  const created = page.getByRole('dialog', { name: 'Created task #1' });
  await expect(
    created.getByText(/is linked to this note and 1 cited paper/),
  ).toBeVisible({ timeout: 30000 });
  await created.getByRole('button', { name: 'Back to note' }).click();
  // The optional task reference is an ordinary edit saved by autosave.
  const taskChip = editorOf(page).getByRole('button', {
    name: /#1 Reproduce the long-target result/,
  });
  await expect(taskChip).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: /words$/ }),
  ).toContainText('Saved', { timeout: 30000 });
  await page.reload();
  await expect(taskChip).toBeVisible({ timeout: 30000 });

  // --- Note → task → note → paper → original PDF page
  await taskChip.click();
  await expect(page).toHaveURL(/\/tasks\?task=[0-9a-f-]{36}$/);
  const detail = page.getByRole('complementary', { name: 'Task #1' });
  // Both directions: TASK RELATES_TO DOCUMENT and DOCUMENT TRACKS TASK.
  const toNote = detail.getByRole('listitem').filter({
    has: page.getByRole('link', { name: /Long-target reading note/ }),
  });
  await expect(toNote).toHaveCount(2);
  await expect(toNote.filter({ hasText: 'Relates to' })).toHaveCount(1);
  await expect(toNote.filter({ hasText: 'Tracked in' })).toHaveCount(1);
  await expect(
    detail.getByRole('link', { name: new RegExp(fixtureTitle.slice(10, 40)) }),
  ).toBeVisible();
  await toNote
    .filter({ hasText: 'Relates to' })
    .getByRole('link', { name: /Long-target reading note/ })
    .click();
  await expect(page).toHaveURL(noteUrl);
  await citation.click();
  await expect(page).toHaveURL(
    /\/reader\?paper=.+&source=.+&page=2&annotation=[0-9a-f-]{36}$/,
  );
  await expect(page.getByText('Page 2 of 2')).toBeVisible({ timeout: 30000 });
  const notes = page.getByRole('complementary', { name: 'Reading panel' });
  await expect(notes.getByText('“Results on long targets”')).toBeVisible();

  // --- Paper shows the connected note and task; the graph has the edges
  await page.goto(`/app/projects/${projectId}/library?paper=${paperId}`);
  const linked = panel.getByRole('region', { name: 'Linked research' });
  await expect(
    linked.getByRole('link', { name: /Long-target reading note/ }),
  ).toBeVisible();
  await expect(
    linked.getByRole('link', { name: /#1 Reproduce/ }),
  ).toBeVisible();
  const graph = z
    .object({
      data: z.object({
        edges: z.array(z.object({ relationship: z.string() })),
      }),
    })
    .parse(
      await (
        await page.request.get(`/api/v1/projects/${projectId}/graph`)
      ).json(),
    )
    .data.edges.map((e) => e.relationship);
  expect(graph).toEqual(
    expect.arrayContaining(['CITES', 'TRACKS', 'RELATES_TO', 'REFERENCES']),
  );

  // --- A viewer can read and follow links but gets no write actions
  const viewerContext = await browser.newContext({ baseURL: origin });
  const viewer = await viewerContext.newPage();
  const viewerEmail = await register(viewer);
  const invite = await command(page.request, {
    command: 'invitation.create',
    scope: 'project',
    scopeId: projectId,
    email: viewerEmail,
    role: 'VIEWER',
  });
  const link = z
    .object({ data: z.object({ invitationLink: z.string() }) })
    .parse(await invite.json()).data.invitationLink;
  await viewer.goto(link);
  await viewer.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(viewer).toHaveURL(
    new RegExp(`/projects/${projectId}/overview$`),
  );
  await viewer.goto(`/app/projects/${projectId}/reader?paper=${paperId}`);
  await expect(viewer.getByText('Page 1 of 2')).toBeVisible({ timeout: 30000 });
  await expect(
    viewer.getByRole('button', { name: /Add source to research note/ }),
  ).toHaveCount(0);
  await viewer.goto(noteUrl);
  await expect(editorOf(viewer)).toContainText('Results on long targets');
  await expect(
    viewer.getByRole('button', { name: 'Create research task' }),
  ).toHaveCount(0);
  const denied = await command(viewer.request, {
    command: 'document.cite-source',
    projectId,
    projectPaperId: paperId,
    target: { kind: 'new', title: 'Viewer note' },
    clientRequestId: randomUUID(),
  });
  expect(denied.status()).toBe(404);
  await viewerContext.close();
});
