import { createHash, createHmac, randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { z } from 'zod';
import { createDatabase } from '../../../packages/database/src';
import { uploadIntentDto } from '../../../packages/core/src/research';
import { makePdf } from '../../fixtures/pdf';
import { origin, register } from './helpers';
const envelope = z.object({ data: z.object({ id: z.uuid() }) });
const post = async (
  request: APIRequestContext,
  path: string,
  data: unknown,
) => {
  const response = await request.post(path, {
    headers: { Origin: origin },
    data,
  });
  expect(response.ok(), path).toBe(true);
  return response;
};
function signed(kind: 'scanner' | 'extraction', action: string, body: unknown) {
  const data = JSON.stringify(body),
    ts = String(Math.floor(Date.now() / 1000)),
    key =
      process.env[
        kind === 'scanner' ? 'ATLAS_SCANNER_SECRET' : 'ATLAS_EXTRACTION_SECRET'
      ] ?? '';
  return {
    headers: {
      'content-type': 'application/json',
      [`x-atlas-${kind}-timestamp`]: ts,
      [`x-atlas-${kind}-signature`]: createHmac('sha256', key)
        .update(
          kind === 'scanner'
            ? `${ts}.${data}`
            : `internal/extraction/${action}.${ts}.${data}`,
        )
        .digest('hex'),
    },
    data,
  };
}
test('project AI: attach, index, stream, inspect citation, reopen, cancel and change projects', async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const appErrors: string[] = [];
  page.on('pageerror', (error) => appErrors.push(error.message));
  await register(page);
  const workspaceId = page.url().match(/workspaces\/([0-9a-f-]{36})/)![1]!;
  const createProject = async (name: string) =>
    envelope.parse(
      await (
        await post(page.request, '/api/v1/commands', {
          command: 'project.create',
          workspaceId,
          name,
          visibility: 'PRIVATE',
          idempotencyKey: randomUUID(),
        })
      ).json(),
    ).data.id;
  const projectId = await createProject('AI isolated browser fixture'),
    secondProject = await createProject('Second AI project');
  const paperId = envelope.parse(
    await (
      await post(page.request, '/api/v1/commands', {
        command: 'paper.create',
        projectId,
        title: 'AI browser synthetic source',
        idempotencyKey: randomUUID(),
      })
    ).json(),
  ).data.id;
  const pages = [
    ['Sparse attention reduces memory use.'],
    ['The synthetic limitation is limited data.'],
  ];
  const bytes = Buffer.from(makePdf(pages)),
    sha256 = createHash('sha256').update(bytes).digest('hex');
  const upload = uploadIntentDto.parse(
    (
      (await (
        await post(page.request, `/api/v1/projects/${projectId}/uploads`, {
          fileName: 'synthetic-ai.pdf',
          mediaType: 'application/pdf',
          byteSize: bytes.length,
          sha256,
          projectPaperId: paperId,
          idempotencyKey: randomUUID(),
        })
      ).json()) as { data: unknown }
    ).data,
  );
  const uploaded = await page.request.put(upload.upload!.url, {
    headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false' },
    data: bytes,
  });
  expect(uploaded.ok()).toBe(true);
  await post(page.request, `/api/v1/uploads/${upload.id}/finalize`, {});
  const scan = z
    .object({
      data: z.array(
        z.object({ jobId: z.uuid(), attempt: z.number(), sha256: z.string() }),
      ),
    })
    .parse(
      await (
        await page.request.post(
          '/api/v1/internal/scanner/claim',
          signed('scanner', 'claim', { max: 10, leaseSeconds: 60 }),
        )
      ).json(),
    ).data;
  for (const job of scan) {
    const response = await page.request.post(
      '/api/v1/internal/scanner/complete',
      signed('scanner', 'complete', {
        ...job,
        verdict: 'CLEAN',
        scanner: 'browser-protocol-fixture',
      }),
    );
    expect(response.ok()).toBe(true);
  }
  await page.goto(
    `/app/projects/${projectId}/reader?paper=${paperId}&atlas=open`,
  );
  await expect(page.getByText('Page 1 of 2')).toBeVisible({ timeout: 30000 });
  const surface = page
    .getByRole('complementary', { name: 'Atlas AI assistant' })
    .first();
  await expect(
    surface.getByText('Isolated AI test fixture · no real model inference'),
  ).toBeVisible();
  await surface.getByRole('checkbox').check();
  await surface
    .getByRole('button', { name: 'Index attached source for AI' })
    .click();
  await expect(surface.getByText(/Source indexing queued/)).toBeVisible();
  const claim = z
    .object({
      data: z.object({
        jobId: z.uuid(),
        attempt: z.number(),
        sha256: z.string(),
      }),
    })
    .parse(
      await (
        await page.request.post(
          '/api/v1/internal/extraction/claim',
          signed('extraction', 'claim', {}),
        )
      ).json(),
    ).data;
  const indexed = await page.request.post(
    '/api/v1/internal/extraction/complete',
    signed('extraction', 'complete', {
      ...claim,
      pages: pages.map((lines, index) => ({
        page: index + 1,
        text: lines.join('\n') + '\n',
      })),
    }),
  );
  expect(await indexed.json()).toMatchObject({ data: { accepted: true } });
  // Real authenticated mention resolver, keyboard selection and typed context chip.
  await surface.getByRole('combobox', { name: 'Ask Atlas' }).fill('@AI');
  await expect(
    surface
      .getByRole('listbox', { name: 'Mention suggestions' })
      .getByRole('option')
      .first(),
  ).toBeVisible();
  await surface.getByRole('combobox', { name: 'Ask Atlas' }).press('Enter');
  await surface
    .getByRole('combobox', { name: 'Ask Atlas' })
    .fill('/summarize memory');
  await surface.getByRole('button', { name: 'Send (Enter)' }).click();
  const answer = surface
    .getByRole('article', { name: 'Atlas research response' })
    .last();
  await expect(
    answer.getByRole('button', { name: /location verified/ }).first(),
  ).toBeVisible({ timeout: 30000 });
  await answer
    .getByRole('button', { name: /location verified/ })
    .first()
    .click();
  await expect(answer.getByRole('blockquote')).toContainText(
    'Sparse attention',
  );
  await expect(
    answer.getByText(/Scientific claim support has not been evaluated/),
  ).toBeVisible();
  await answer.getByRole('link', { name: 'Open authorized source' }).click();
  await expect(page).toHaveURL(/source=.*page=1/);
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  if (process.env.ATLAS_AI_QA_SCREENSHOTS === 'true')
    await page.screenshot({ path: '/tmp/atlas-phase03-ai-desktop.png' });
  // Modes share one history; the provider is never dispatched again by a mode switch.
  await page.getByRole('button', { name: 'Dock to side' }).first().click();
  const panel = page
    .getByRole('complementary', { name: 'Atlas AI assistant' })
    .first();
  await expect(panel).toHaveAttribute('data-placement', 'panel');
  await panel
    .getByRole('combobox', { name: 'Ask Atlas' })
    .fill('/compare memory');
  await panel.getByRole('button', { name: 'Send (Enter)' }).click();
  await expect(
    panel.getByRole('article', { name: 'Atlas research response' }),
  ).toHaveCount(2);
  await expect(
    panel
      .getByRole('article', { name: 'Atlas research response' })
      .last()
      .getByRole('button', { name: 'Copy draft' }),
  ).toBeVisible({ timeout: 30000 });
  await panel.getByRole('button', { name: 'Float', exact: true }).click();
  await page
    .getByRole('button', { name: 'Focus (⌘J)', exact: true })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  const firstConversation = await page
    .getByRole('combobox', { name: 'Research conversations' })
    .first()
    .inputValue();
  expect(firstConversation).toMatch(/^[0-9a-f-]{36}$/);
  await page.reload();
  await page.getByRole('combobox', { name: 'Ask Atlas' }).first().fill(' '); // expand using preserved deep-link mode if needed
  await page
    .getByRole('combobox', { name: 'Research conversations' })
    .first()
    .selectOption(firstConversation);
  await expect(
    page.getByRole('article', { name: 'Atlas research response' }),
  ).toHaveCount(2);
  const active = page
    .getByRole('complementary', { name: 'Atlas AI assistant' })
    .first();
  await active.getByRole('checkbox').check();
  await active
    .getByRole('combobox', { name: 'Ask Atlas' })
    .fill('fixture-slow memory');
  await active.getByRole('button', { name: 'Send (Enter)' }).click();
  await expect(
    active.getByText('Provisional response · citations pending verification'),
  ).toBeVisible();
  await active.getByRole('button', { name: 'Stop (Esc)' }).click();
  await expect(active.getByRole('alert').last()).toContainText(
    /stopped|CANCELLED/,
  );
  // Exhaust only a disposable test ledger row; no hosted connection is permitted.
  const direct = process.env.DIRECT_URL;
  if (
    !direct ||
    new URL(direct).hostname !== '127.0.0.1' ||
    new URL(direct).pathname !== '/atlas_auth_test'
  )
    throw new Error('Disposable Auth database required for budget fixture.');
  const db = createDatabase(direct);
  const [usage] = await db.$queryRaw<
    { id: string; charged: number }[]
  >`SELECT u.id,u.charged_micros AS charged FROM ai_usage u JOIN ai_runs r ON r.id=u.run_id WHERE r.conversation_id=${firstConversation}::uuid ORDER BY r.created_at LIMIT 1`;
  expect(usage).toBeDefined();
  try {
    await db.$executeRaw`UPDATE ai_usage SET charged_micros=10000000 WHERE id=${usage!.id}::uuid`;
    await active
      .getByRole('combobox', { name: 'Ask Atlas' })
      .fill('Check the configured usage limit');
    await active.getByRole('button', { name: 'Send (Enter)' }).click();
    await expect(active.getByRole('alert').last()).toContainText(
      /limit|quota/i,
    );
  } finally {
    await db.$executeRaw`UPDATE ai_usage SET charged_micros=${usage!.charged} WHERE id=${usage!.id}::uuid`;
    await db.$disconnect();
  }
  await page.goto(`/app/projects/${secondProject}/ai`);
  await expect(
    page.getByRole('article', { name: 'Atlas research response' }),
  ).toHaveCount(0);
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(
    page.getByText('AI browser synthetic source', { exact: true }),
  ).toHaveCount(0);
  const outsider = await browser.newContext(),
    other = await outsider.newPage();
  await register(other);
  for (const path of [
    `/api/v1/ai/conversations?projectId=${projectId}`,
    `/api/v1/ai/mentions?projectId=${projectId}`,
    `/api/v1/ai/conversations/${firstConversation}?projectId=${projectId}`,
  ])
    expect((await other.request.get(path)).status()).toBe(404);
  await outsider.close();
  await page.setViewportSize({ width: 390, height: 844 });
  if (process.env.ATLAS_AI_QA_SCREENSHOTS === 'true')
    await page.screenshot({ path: '/tmp/atlas-phase03-ai-mobile.png' });
  expect(appErrors).toEqual([]);
  const violations = (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  ).violations;
  expect(violations).toEqual([]);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter(
        (k) => !['theme', 'atlas-sidebar-collapsed'].includes(k),
      ),
    ),
  ).toEqual([]);
});
