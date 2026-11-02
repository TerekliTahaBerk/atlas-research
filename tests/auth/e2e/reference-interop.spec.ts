import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { z } from 'zod';
import { origin, register } from './helpers';

/*
 * A03 journeys on the disposable harness: real GoTrue sessions, PostgreSQL
 * RLS, the real library UI and a synthetic loopback Zotero fixture. No real
 * Zotero library, provider credential or hosted service is used.
 */
const bib = String.raw`@article{okafor2024,
  author = {Okafor, Ada and M{\"u}ller, J{\"o}rg},
  title = {Interop sparse attention study},
  journal = {Journal of Synthetic Biology}, year = 2024,
  volume = {12}, pages = {101--120}, doi = {10.5555/A03.E2E}
}
@inproceedings{chen2023,
  author = {Chen, Li}, title = {Interop graph priors}, booktitle = {Synthetic Conference}, year = {2023}
}
@misc{broken, title = {Unterminated
`;
async function command(request: APIRequestContext, body: unknown) {
  const response = await request.post(`${origin}/api/v1/commands`, {
    headers: { Origin: origin },
    data: body,
  });
  expect(response.ok(), JSON.stringify(body).slice(0, 100)).toBe(true);
  return z
    .object({ data: z.object({ id: z.uuid() }) })
    .parse(await response.json()).data;
}
async function newProject(page: Page) {
  const { workspaceId } = z
    .object({ data: z.object({ workspaceId: z.uuid() }) })
    .parse(await (await page.request.get(`${origin}/api/v1/me`)).json()).data;
  return (
    await command(page.request, {
      command: 'project.create',
      workspaceId,
      name: 'A03 interop',
      visibility: 'PRIVATE',
      idempotencyKey: randomUUID(),
    })
  ).id;
}
const papers = async (page: Page, projectId: string) =>
  z
    .object({
      data: z.object({
        items: z.array(z.object({ id: z.uuid(), title: z.string() })),
      }),
    })
    .parse(
      await (
        await page.request.get(`/api/v1/projects/${projectId}/papers`)
      ).json(),
    ).data.items;
async function upload(page: Page, name: string, content: string) {
  const dialog = page.getByRole('dialog', { name: 'Import references' });
  await dialog.getByLabel(/Choose a .bib, .ris or .json file/).setInputFiles({
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from(content),
  });
  return dialog;
}

test('bibliography import → dedupe → cite → note bibliography → reimport, and read-only Zotero', async ({
  page,
}) => {
  test.setTimeout(180000);
  await register(page);
  const projectId = await newProject(page);
  await page.goto(`/app/projects/${projectId}/library`);
  await expect(async () => {
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'Import references' }),
    ).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30000 });

  // --- Journey A: preview first, nothing written until confirmation.
  let dialog = await upload(page, 'refs.bib', bib);
  const records = dialog.getByRole('list', { name: 'Records to import' });
  await expect(records.getByText('Interop sparse attention study')).toBeVisible(
    { timeout: 30000 },
  );
  await expect(records.getByText('Cannot import')).toBeVisible();
  await expect(
    dialog.getByText(/Journal article · Ada Okafor, Jörg Müller · 2024/),
  ).toBeVisible();
  expect(await papers(page, projectId)).toHaveLength(0);
  expect(
    (await new AxeBuilder({ page }).include('[role=dialog]').analyze())
      .violations,
  ).toEqual([]);
  await dialog.getByRole('button', { name: 'Import 2 selected' }).click();
  await expect(dialog.getByText(/Added 2, already in library 0/)).toBeVisible({
    timeout: 30000,
  });
  await dialog.getByRole('button', { name: 'Done' }).click();
  const saved = page.getByRole('list', { name: 'Saved papers' });
  await expect(saved.getByText('Interop sparse attention study')).toBeVisible();
  const library = await papers(page, projectId);
  expect(library).toHaveLength(2);

  // Reimporting the same file proposes nothing new.
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  dialog = await upload(page, 'refs.bib', bib);
  await expect(dialog.getByText('Already in library').first()).toBeVisible({
    timeout: 30000,
  });
  await expect(
    dialog.getByRole('button', { name: 'Import 0 selected' }),
  ).toBeDisabled();
  await dialog.getByRole('button', { name: 'Close' }).click();

  // --- Cite an imported paper in a note, export the note's bibliography.
  const paper = library.find(
    (p) => p.title === 'Interop sparse attention study',
  )!;
  const note = await command(page.request, {
    command: 'document.create',
    projectId,
    title: 'Interop note',
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'See ' },
            { type: 'citation', attrs: { projectPaperId: paper.id } },
          ],
        },
      ],
    },
    idempotencyKey: randomUUID(),
  });
  await page.goto(`/app/projects/${projectId}/documents?doc=${note.id}`);
  await expect(
    page.getByRole('textbox', { name: 'Document body' }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'More document actions' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Bibliography · CSL JSON' }).click();
  const file = await (await download).path();
  const csl = JSON.parse(await readFile(file, 'utf8')) as {
    id: string;
    title: string;
    DOI?: string;
    volume?: string;
  }[];
  // Only the cited paper; bibliographic fields only.
  expect(csl).toEqual([
    expect.objectContaining({
      id: `atlas:${paper.id}`,
      title: 'Interop sparse attention study',
      DOI: '10.5555/a03.e2e',
      volume: '12',
    }),
  ]);

  // Reimporting the exported bibliography maps back to the same paper.
  await page.goto(`/app/projects/${projectId}/library`);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  dialog = await upload(page, 'note.json', JSON.stringify(csl));
  await expect(
    dialog.getByText(/Already in library — “Interop sparse attention study”/),
  ).toBeVisible({ timeout: 30000 });
  await dialog.getByRole('button', { name: 'Close' }).click();
  expect(await papers(page, projectId)).toHaveLength(2);

  // --- Journey B: read-only Zotero through the loopback fixture.
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Import references' });
  await dialog.getByRole('radio', { name: 'Zotero library' }).click();
  await dialog.getByLabel('Zotero API key').fill('WRITEKEY0000000000000000');
  await dialog.getByRole('button', { name: 'Connect read-only' }).click();
  await expect(dialog.getByRole('alert')).toContainText('read-only access');
  await dialog.getByLabel('Zotero API key').fill('READONLYKEY0000000000000');
  await dialog.getByRole('button', { name: 'Connect read-only' }).click();
  const items = dialog.getByRole('list', { name: 'Zotero items' });
  await expect(items.getByText('Fixture sparse attention survey')).toBeVisible({
    timeout: 30000,
  });
  await expect(dialog.getByLabel('Library')).toContainText('Fixture Lab');
  await items
    .getByRole('checkbox', { name: /Fixture sparse attention survey/ })
    .check();
  await dialog.getByRole('button', { name: 'Preview selected' }).click();
  await expect(dialog.getByText(/DOI 10.5555\/zotero.fixture.1/)).toBeVisible({
    timeout: 30000,
  });
  await dialog.getByRole('button', { name: 'Import 1 selected' }).click();
  await expect(dialog.getByText(/Added 1/)).toBeVisible({ timeout: 30000 });
  await dialog.getByRole('button', { name: 'Done' }).click();
  expect(await papers(page, projectId)).toHaveLength(3);
  // The key never reaches the browser or the page.
  const status = await (
    await page.request.get('/api/v1/integrations/zotero')
  ).text();
  expect(status).not.toContain('READONLYKEY');
  expect(await page.content()).not.toContain('READONLYKEY');

  // Disconnect removes Atlas's copy of the key.
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Import references' });
  await dialog.getByRole('radio', { name: 'Zotero library' }).click();
  page.once('dialog', (d) => void d.accept());
  await dialog.getByRole('button', { name: 'Disconnect' }).click();
  await expect(dialog.getByLabel('Zotero API key')).toBeVisible();
  const after = z
    .object({ data: z.object({ connection: z.null() }) })
    .safeParse(
      await (await page.request.get('/api/v1/integrations/zotero')).json(),
    );
  expect(after.success).toBe(true);
});
