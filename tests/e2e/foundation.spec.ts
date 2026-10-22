import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { base, noHorizontalOverflow, useTheme } from './helpers';
test('public entry leads to the honest sample workspace without runtime errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(
    page.getByText(/every workspace item is labeled sample data/),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Explore the workspace' }).click();
  await expect(page).toHaveURL('/app/home');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Workspace navigation' });
  await nav.getByRole('link', { name: /^Library/ }).click();
  await expect(page).toHaveURL(`${base}/library`);
  await expect(nav.getByRole('link', { name: /^Library/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(errors).toEqual([]);
});
test('theme light/dark/system choices persist and follow OS', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(`${base}/overview`);
  // Phase 00.5A: the handoff defaults to dark; both class and data-theme are set.
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Change theme' }).click();
  await page.getByRole('menuitemradio', { name: 'Light', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/light/);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Change theme' }).click();
  await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Change theme' }).click();
  await page
    .getByRole('menuitemradio', { name: 'System', exact: true })
    .click();
  await expect(page.locator('html')).toHaveClass(/light/);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe(
    'system',
  );
});
test('keyboard search filters, restores focus on Escape and navigates', async ({
  page,
}) => {
  await page.goto(`${base}/overview`);
  const search = page
    .getByRole('navigation', { name: 'Workspace navigation' })
    .getByRole('button', { name: 'Search', exact: true });
  await search.focus();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Search Atlas' });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('combobox', { name: 'Search Atlas' })
    .fill('no such page');
  await expect(dialog.getByRole('status')).toContainText(
    'No pages or sample items match',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(search).toBeFocused();
  await page.keyboard.press('Control+k');
  await dialog.getByRole('combobox').fill('documents');
  await dialog.getByRole('option', { name: 'Documents', exact: true }).click();
  await expect(page).toHaveURL(`${base}/documents`);
  await expect(dialog).toBeHidden();
});
test('mobile navigation opens, traps focus, follows link and closes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/overview`);
  await expect(
    page.getByRole('complementary', { name: 'Sidebar' }),
  ).toBeHidden();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const drawer = page.getByRole('dialog', { name: 'Workspace navigation' });
  await expect(drawer).toBeVisible();
  const bounds = await drawer.boundingBox();
  expect(bounds?.x).toBe(0);
  expect(bounds?.y).toBe(0);
  // Handoff drawer width (was 300 before Phase 00.5A).
  expect(bounds?.width).toBe(280);
  await drawer.getByRole('link', { name: /^Tasks/ }).click();
  await expect(drawer).toBeHidden();
  await expect(page).toHaveURL(`${base}/tasks`);
  expect(await noHorizontalOverflow(page)).toBe(true);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.keyboard.press('Tab');
  expect(
    await drawer.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Open navigation' }),
  ).toBeFocused();
});
test('workspace and project menus, inbox and plan are transparent previews', async ({
  page,
}) => {
  await page.goto(`${base}/overview`);
  const nav = page.getByRole('navigation', { name: 'Workspace navigation' });
  await nav.getByRole('button', { name: /^Workspace:/ }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await nav.getByRole('button', { name: /^Inbox/ }).click();
  const inbox = page.getByRole('dialog', { name: /Inbox/ });
  await expect(inbox).toBeVisible();
  await expect(inbox).toContainText(/sample/i);
  await page.keyboard.press('Escape');
  await expect(inbox).toBeHidden();
});
for (const path of [
  '/unknown',
  '/app/projects/not-a-project/overview',
  '/app/projects/sample/unknown',
  '/app/workspaces/unknown',
  '/app/settings/unknown',
  '/app/settings/unknown/deeper',
  '/app/projects/unknown',
  '/app/workspaces/unknown/projects',
])
  test(`not-found recovery for ${path}`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(page.getByText('This path is still unexplored')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Back to workspace' }),
    ).toHaveAttribute('href', '/app');
  });
for (const theme of ['light', 'dark'] as const)
  test(`accessible ${theme} overview with a working skip link`, async ({
    page,
  }) => {
    await useTheme(page, theme);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${base}/overview`);
    await expect(page.locator('html')).toHaveClass(new RegExp(theme));
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('link', { name: 'Skip to content' }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });
test('mobile drawer search closes both dialogs after following a result', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/overview`);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('dialog', { name: 'Workspace navigation' })
    .getByRole('button', { name: 'Search', exact: true })
    .click();
  const search = page.getByRole('dialog', { name: 'Search Atlas' });
  await search.getByRole('combobox').fill('library');
  await search.getByRole('option', { name: 'Library', exact: true }).click();
  await expect(page).toHaveURL(`${base}/library`);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
