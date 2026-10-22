import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  allowedStorageKeys,
  base,
  noHorizontalOverflow,
  storageKeys,
  useTheme,
} from './helpers';
test('sidebar collapses with the shortcut and persists only a navigation preference', async ({
  page,
}) => {
  await page.goto('/app/home');
  const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
  await expect(sidebar).toBeVisible();
  await page
    .getByRole('button', { name: 'Collapse sidebar', exact: true })
    .click();
  await expect(sidebar).toBeHidden();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Expand sidebar' }),
  ).toBeVisible();
  await page.keyboard.press('ControlOrMeta+\\');
  await expect(sidebar).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('atlas-sidebar-collapsed')),
  ).toBe('false');
});
test('composer references, commands and sample responses are keyboard driven', async ({
  page,
}) => {
  await page.goto('/app/home');
  const composer = page.getByRole('combobox', { name: 'Ask Atlas' });
  await composer.fill('@Okafor');
  await expect(
    page.getByRole('listbox', { name: 'Mention suggestions' }),
  ).toBeVisible();
  await page.keyboard.press('Enter');
  const chip = page.getByRole('button', { name: 'Remove Okafor et al., 2024' });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(chip).toBeHidden();
  await composer.fill('/sum');
  await page.keyboard.press('Enter');
  await expect(composer).toHaveValue('/summarize ');
  await page.keyboard.press('Enter');
  const assistant = page.getByRole('complementary', {
    name: 'Atlas AI assistant',
  });
  // The labeled preview sequence finishes on its own; Send returns when done.
  await expect(page.getByRole('button', { name: 'Send (Enter)' })).toBeVisible({
    timeout: 15000,
  });
  await expect(assistant.getByText(/Preview sequence/).last()).toBeVisible();
  await composer.focus();
  await page.keyboard.press('Escape');
  await expect(assistant).toHaveAttribute('data-mode', 'compact');
});
test('AI previews stop, fail visibly on demand and retry without network requests', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/') || r.method() !== 'GET')
      requests.push(`${r.method()} ${r.url()}`);
  });
  await page.goto(`${base}/ai`);
  const composer = page.getByRole('combobox', { name: 'Ask Atlas' });
  await composer.fill('Compare the two approaches');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Stop (Esc)' }).click();
  await expect(page.getByText(/Stopped/).last()).toBeVisible();
  await page.goto(`${base}/ai?demo=errors`);
  await composer.fill('Find counter-evidence');
  await page.keyboard.press('Enter');
  const alert = page.getByRole('main').getByRole('alert').last();
  await expect(alert).toBeVisible({ timeout: 15000 });
  await expect(alert).toContainText(/sample|preview/i);
  await page.getByRole('button', { name: 'Retry' }).last().click();
  await expect(page.getByText('Sample response').last()).toBeVisible({
    timeout: 15000,
  });
  expect(requests).toEqual([]);
});
test('document edits stay in the tab and reset on reload', async ({ page }) => {
  await page.goto(`${base}/documents?doc=d1`);
  const body = page.getByRole('textbox', { name: 'Document body' });
  await expect(body).toBeVisible();
  await body.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' A local paragraph about evidence.');
  await expect(body).toContainText('A local paragraph about evidence.');
  await page.reload();
  await expect(body).toBeVisible();
  await expect(body).not.toContainText('A local paragraph about evidence.');
  expect(
    (await storageKeys(page)).every((k) => allowedStorageKeys.includes(k)),
  ).toBe(true);
});
test('library filter, empty state and paper detail work on sample data', async ({
  page,
}) => {
  await page.goto(`${base}/library`);
  const filter = page.getByRole('textbox', {
    name: 'Filter by title, author or tag',
  });
  await filter.fill('no matching sample');
  await expect(
    page.getByRole('heading', { name: 'No sample papers match' }),
  ).toBeVisible();
  await filter.fill('');
  await page.getByText('Okafor', { exact: false }).first().click();
  await expect(
    page.getByRole('tablist', { name: 'Paper detail' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Citation' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Citation' })).toContainText(
    /sample/i,
  );
});
test('task moves and channel messages are explicit local demonstrations', async ({
  page,
}) => {
  await page.goto(`${base}/tasks?task=ATL-27`);
  const detail = page
    .getByRole('complementary', { name: 'Task ATL-27' })
    .or(page.getByRole('dialog', { name: 'Task ATL-27' }));
  await detail.getByRole('button', { name: 'Status: In progress' }).click();
  await page.getByRole('menuitemradio', { name: 'Done' }).click();
  await expect(
    detail.getByRole('button', { name: 'Status: Done' }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: /^Done/ })).toContainText(
    'Write §3 Method',
  );
  await page.reload();
  await expect(
    page.getByRole('region', { name: /^In progress/ }),
  ).toContainText('Write §3 Method');
  await page.goto(`${base}/channels`);
  await page
    .getByRole('textbox', { name: /^Message #/ })
    .fill('A new local discussion point');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('A new local discussion point')).toBeVisible();
  await expect(
    page.getByText('Stays in this tab · not delivered'),
  ).toBeVisible();
});
test('onboarding is skippable and auth forms send no requests', async ({
  page,
}) => {
  const posts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST') posts.push(r.url());
  });
  await page.goto('/login');
  await page
    .getByRole('textbox', { name: 'Email' })
    .fill('preview@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('local-preview-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'no authentication request was sent' }),
  ).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await page.goto('/register');
  await page
    .getByRole('textbox', { name: 'Email' })
    .fill('preview@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('local-preview-only');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'no account was created' }),
  ).toBeVisible();
  await page.goto('/onboarding');
  await page.getByRole('button', { name: 'Get started' }).click();
  await page
    .getByRole('radiogroup', { name: 'Research role' })
    .getByRole('radio')
    .first()
    .click();
  for (let i = 0; i < 5; i += 1)
    await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('(not sent)')).toBeVisible();
  await expect(
    page.getByText(/no account, workspace or project is created/),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Skip' }).click();
  await expect(page).toHaveURL('/app/home');
  expect(posts).toEqual([]);
});
const matrixRoutes = [
  '/app/home',
  '/app/inbox',
  `${base}/overview`,
  `${base}/research`,
  `${base}/library`,
  `${base}/reader`,
  `${base}/documents`,
  `${base}/tasks`,
  `${base}/channels`,
  `${base}/ai`,
  `${base}/manuscripts`,
  `${base}/experiments`,
  `${base}/graph`,
  '/app/settings/appearance',
  '/app/design-system',
  '/login',
  '/onboarding',
];
for (const theme of ['light', 'dark'] as const) {
  for (const width of [1440, 1280, 1024, 768, 390]) {
    test(`layouts have no horizontal overflow at ${width}px in ${theme}`, async ({
      page,
    }) => {
      test.slow();
      await useTheme(page, theme);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      for (const path of matrixRoutes) {
        await page.goto(path);
        await expect(
          page.getByRole('heading', { level: 1 }).first(),
        ).toBeAttached();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        expect(await noHorizontalOverflow(page), path).toBe(true);
      }
      expect(errors).toEqual([]);
    });
  }
  for (const route of matrixRoutes) {
    test(`accessible ${theme} ${route}`, async ({ page }) => {
      await useTheme(page, theme);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(route);
      await expect(
        page.getByRole('heading', { level: 1 }).first(),
      ).toBeAttached();
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(result.violations).toEqual([]);
    });
  }
}
test('mobile assistant keeps working space and storage stays limited to preferences', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/documents`);
  const composer = page.getByRole('combobox', { name: 'Ask Atlas' });
  await composer.fill('@');
  const menu = page.getByRole('listbox', { name: 'Mention suggestions' });
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(composer).toHaveValue('@');
  expect(await noHorizontalOverflow(page)).toBe(true);
  await composer.fill('A private draft question');
  expect(
    (await storageKeys(page)).every((k) => allowedStorageKeys.includes(k)),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      Object.values(localStorage).some((v) => v.includes('private draft')),
    ),
  ).toBe(false);
});
test('mention picker fits the mobile viewport and keeps keyboard selection visible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/ai`);
  await page.getByRole('combobox', { name: 'Ask Atlas' }).fill('@');
  const menu = page.getByRole('listbox', { name: 'Mention suggestions' });
  await expect(menu).toBeVisible();
  const bounds = await menu.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  for (let i = 0; i < 9; i += 1) await page.keyboard.press('ArrowDown');
  const selected = menu.getByRole('option', { selected: true });
  await expect(selected).toContainText('Ayşe Demir');
  const s = await selected.boundingBox();
  const m = await menu.boundingBox();
  expect(s!.y).toBeGreaterThanOrEqual(m!.y);
  expect(s!.y + s!.height).toBeLessThanOrEqual(m!.y + m!.height);
});
