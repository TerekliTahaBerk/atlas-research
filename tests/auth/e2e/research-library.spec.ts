import { createHash, createHmac } from 'node:crypto';
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { z } from 'zod';
import { makePdf } from '../../fixtures/pdf';
import { origin, password, register } from './helpers';

/*
 * Phase 02 journeys on the disposable harness: actual GoTrue sessions, real
 * PostgreSQL/RLS, the real Supabase Storage API and the real provider
 * adapters pointed at the loopback provider fixture. Only the malware
 * verdict is supplied by this test through the scanner protocol; no
 * production scanner is involved.
 */
const scannerSecret = process.env.ATLAS_SCANNER_SECRET ?? '';
const pdf = makePdf([
  [
    'Sparse attention reduces memory use.',
    'Pair representations dominate activation memory.',
  ],
  ['Results on long targets are reported on this page.'],
]);

async function newProject(page: Page, name: string) {
  const dialog = page.getByRole('dialog');
  // A click before the cold development page hydrates opens nothing; retry
  // until the dialog is actually open rather than racing hydration.
  await expect(async () => {
    await page
      .getByRole('button', { name: 'New project', exact: true })
      .click();
    await expect(dialog).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30000 });
  await dialog.getByLabel('Project name').fill(name);
  await dialog
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/projects\/[0-9a-f-]+\/overview$/);
  return page.url().match(/projects\/([0-9a-f-]{36})/)![1]!;
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
/** Scanner protocol fixture: verifies bytes, then reports the test verdict. */
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
    const verdict = measured === job.sha256 ? 'CLEAN' : 'INVALID';
    const done = await request.post(
      `${origin}/api/v1/internal/scanner/complete`,
      signed(
        JSON.stringify({
          jobId: job.jobId,
          attempt: job.attempt,
          verdict,
          sha256: measured,
          scanner: 'e2e-protocol-fixture',
        }),
      ),
    );
    expect(done.status()).toBe(200);
  }
  return claimed.length;
}

test('researcher discovers, saves, organizes, reads, annotates and exports', async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const email = await register(page);
  const projectId = await newProject(page, 'Protein attention review');

  // --- Discovery: real adapters, controlled provider fixture
  await page.goto(`/app/projects/${projectId}/research`);
  await page.getByLabel('Research query').fill('protein folding');
  await page.getByLabel('Research query').press('Enter');
  const results = page.getByRole('list', { name: 'Search results' });
  await expect(
    results.getByRole('button', {
      name: 'Fixture: Sparse attention for protein structure prediction',
    }),
  ).toBeVisible();
  await expect(page.getByText('OpenAlex: 3 results')).toBeVisible();
  // The shared DOI is merged once with both provenances, never by title.
  await expect(results.getByText('OpenAlex · Semantic Scholar')).toHaveCount(1);
  await expect(
    page.getByText('Semantic Scholar: Results are ordered by relevance only.'),
  ).toHaveCount(0);
  await results
    .getByRole('button', {
      name: 'Fixture: Sparse attention for protein structure prediction',
    })
    .click();
  const details = page.getByRole('complementary', { name: /Paper details/ });
  await expect(
    details.getByText('Sparse attention reduces memory use.'),
  ).toBeVisible();
  await expect(details.getByText('10.5555/atlas.fixture.0001')).toBeVisible();
  await details.getByRole('button', { name: 'Save to library' }).click();
  await expect(
    details.getByRole('link', { name: 'Open in library' }),
  ).toBeVisible();
  const second = results.getByRole('listitem').filter({
    hasText: 'Fixture: Graph priors for protein folding without a DOI',
  });
  await second.getByRole('button', { name: 'Save' }).click();
  await expect(second.getByRole('link', { name: 'Saved' })).toBeVisible();

  // Partial provider failure is reported, never hidden as an empty success.
  await page.getByLabel('Research query').fill('protein outage');
  await page.getByLabel('Research query').press('Enter');
  await expect(page.getByText('Some sources did not respond')).toBeVisible();
  await expect(page.getByText(/Semantic Scholar is unavailable/)).toBeVisible();

  // --- Library: persisted state survives reload
  await page.goto(`/app/projects/${projectId}/library`);
  const saved = page.getByRole('list', { name: 'Saved papers' });
  await expect(saved.getByRole('listitem')).toHaveCount(2);
  await page.getByLabel('New collection name').fill('Attention');
  await page.getByLabel('New collection name').press('Enter');
  await expect(
    page
      .getByRole('navigation', { name: 'Collections' })
      .getByText('Attention'),
  ).toBeVisible();
  await saved
    .getByRole('button', { name: /Fixture: Sparse attention/ })
    .click();
  const panel = page.getByRole('complementary', { name: /Paper details/ });
  await panel.getByLabel('Reading status').selectOption('READING');
  await expect(page.getByText('Reading status saved')).toBeVisible();
  await panel.getByRole('tab', { name: 'Organize' }).click();
  // Membership is shown only after the server confirms it.
  await panel.getByRole('checkbox', { name: 'Attention' }).click();
  await expect(
    panel.getByRole('checkbox', { name: 'Attention' }),
  ).toBeChecked();
  await panel.getByLabel('Tag name').fill('Protein  Folding');
  await panel.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(panel.getByText('#Protein Folding')).toBeVisible();
  const paperUrl = page.url();
  const paperId = new URL(paperUrl).searchParams.get('paper')!;
  await page.reload();
  await expect(panel.getByLabel('Reading status')).toHaveValue('READING');
  await panel.getByRole('tab', { name: 'Organize' }).click();
  await expect(
    panel.getByRole('checkbox', { name: 'Attention' }),
  ).toBeChecked();
  await expect(panel.getByText('#Protein Folding')).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze())
      .violations,
  ).toEqual([]);

  // --- Private upload: quarantined until validation, then readable
  await panel.getByRole('tab', { name: 'Overview' }).click();
  await panel.locator('input[type=file]').setInputFiles({
    name: 'sparse-attention.pdf',
    mimeType: 'application/pdf',
    buffer: pdf,
  });
  await expect(
    panel.getByText('Uploaded. Quarantined until validation finishes.'),
  ).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(
    panel.getByText('Quarantined · awaiting validation'),
  ).toBeVisible();
  const sources = z
    .object({
      data: z.object({
        sources: z.array(z.object({ id: z.string(), state: z.string() })),
      }),
    })
    .parse(await (await page.request.get(`/api/v1/papers/${paperId}`)).json())
    .data.sources;
  const sourceId = sources[0]!.id;
  // Unscanned files never receive a download grant.
  expect(
    (await page.request.get(`/api/v1/sources/${sourceId}/access`)).status(),
  ).toBe(409);
  await page.goto(`/app/projects/${projectId}/reader?paper=${paperId}`);
  await expect(
    page.getByText('Quarantined · awaiting validation'),
  ).toBeVisible();
  expect(await scanQueued(page.request)).toBe(1);

  // Direct Storage access with the user's own Supabase session sees no Atlas
  // objects: there are no browser policies, only server-signed grants.
  const session = z
    .object({ access_token: z.string() })
    .parse(
      await (
        await page.request.post(
          'http://127.0.0.1:54321/auth/v1/token?grant_type=password',
          { data: { email, password } },
        )
      ).json(),
    );
  for (const bucket of ['atlas-quarantine', 'atlas-sources']) {
    const listed = await page.request.post(
      `http://127.0.0.1:54321/storage/v1/object/list/${bucket}`,
      {
        headers: { authorization: `Bearer ${session.access_token}` },
        data: { prefix: '', limit: 100 },
      },
    );
    const body: unknown = listed.ok() ? await listed.json() : [];
    expect(body, bucket).toEqual([]);
  }

  // --- Reader: authorized PDF, navigation, zoom, search, annotations
  await page.reload();
  await expect(page.getByText('Page 1 of 2')).toBeVisible({ timeout: 30000 });
  const layer = page.locator('.textLayer');
  await expect(layer).toContainText('Sparse attention reduces memory use.');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Previous page' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByLabel('Search in PDF').fill('long targets');
  await page.getByLabel('Search in PDF').press('Enter');
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  await page.getByRole('region', { name: 'PDF page' }).press('ArrowLeft');
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await expect(layer).toContainText('Sparse attention');

  const select = (text: string, length: number) =>
    page.evaluate(
      ([needle, size]) => {
        const span = [...document.querySelectorAll('.textLayer span')].find(
          (s) => s.textContent?.includes(needle as string),
        )!;
        const node = span.firstChild!;
        const start = node.textContent!.indexOf(needle as string);
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + (size as number));
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        document
          .querySelector('.atlas-pdf-page')!
          .dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      },
      [text, length] as const,
    );
  await select('Sparse attention', 16);
  const toolbar = page.getByRole('toolbar', { name: 'Selection actions' });
  await toolbar.getByRole('button', { name: 'Highlight' }).click();
  await expect(page.getByText('Highlight saved')).toBeVisible();
  await select('Pair representations', 20);
  await toolbar.getByRole('button', { name: 'Add note' }).click();
  await page.getByLabel('Note', { exact: true }).fill('Check memory claim');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByText('Note saved')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Page 1 of 2')).toBeVisible({ timeout: 30000 });
  const notes = page.getByRole('complementary', { name: 'Reading panel' });
  await expect(notes.getByText('“Sparse attention”')).toBeVisible();
  await expect(notes.getByText('Check memory claim')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Highlight: Sparse attention' }),
  ).toBeVisible();
  const annotations = z
    .object({
      data: z.array(
        z.object({
          sourceVersionId: z.string(),
          anchor: z.object({
            pageNumber: z.number(),
            startOffset: z.number().nullable(),
            rects: z.array(z.unknown()),
          }),
        }),
      ),
    })
    .parse(
      await (
        await page.request.get(`/api/v1/sources/${sourceId}/annotations`)
      ).json(),
    ).data;
  expect(annotations).toHaveLength(2);
  for (const a of annotations) {
    expect(a.sourceVersionId).toBe(sourceId);
    expect(a.anchor.pageNumber).toBe(1);
    expect(a.anchor.startOffset).not.toBeNull();
    expect(a.anchor.rects.length).toBeGreaterThan(0);
  }
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze())
      .violations,
  ).toEqual([]);

  // --- Citation export
  const bib = await page.request.get(
    `/api/v1/papers/${paperId}/export?format=bibtex`,
  );
  expect(bib.headers()['content-type']).toContain('application/x-bibtex');
  expect(bib.headers()['cache-control']).toContain('no-store');
  const bibtex = await bib.text();
  expect(bibtex).toContain('@article{fixture2023fixture,');
  expect(bibtex).toContain('doi = {10.5555/atlas.fixture.0001}');
  const ris = await (
    await page.request.get(`/api/v1/projects/${projectId}/export?format=ris`)
  ).text();
  expect(ris.match(/^TY {2}- /gm)).toHaveLength(2);

  // --- Two-tenant isolation with a second real account
  const outsider = await browser.newContext();
  const other = await outsider.newPage();
  await register(other);
  for (const path of [
    `/api/v1/projects/${projectId}/papers`,
    `/api/v1/papers/${paperId}`,
    `/api/v1/sources/${sourceId}/access`,
    `/api/v1/sources/${sourceId}/annotations`,
    `/api/v1/papers/${paperId}/export?format=bibtex`,
    `/api/v1/projects/${projectId}/research?query=protein`,
  ])
    expect((await other.request.get(path)).status(), path).toBe(404);
  const attack = await other.request.post('/api/v1/commands', {
    headers: { Origin: origin },
    data: {
      command: 'paper.save',
      projectId,
      provider: 'openalex',
      externalId: 'W9900000001',
      idempotencyKey: crypto.randomUUID(),
    },
  });
  expect(attack.status()).toBe(404);
  await other.goto(`/app/projects/${projectId}/library`);
  await expect(other.getByText('Sparse attention')).toHaveCount(0);
  await outsider.close();
});
