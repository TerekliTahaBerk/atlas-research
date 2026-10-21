import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const overview = '/app/projects/sample/overview';
test('public entry leads to the honest project preview without runtime errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('link', { name: 'Explore the workspace' }).click();
  await expect(page).toHaveURL(overview);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'A place for your next discovery.',
  );
  await expect(
    page.getByText('No research data is stored in this preview.'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Paper library', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Paper library',
  );
  await expect(page.getByText(/Planned for Phase 02/)).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Paper library', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  expect(errors).toEqual([]);
});
test('theme light/dark/system choices persist and follow OS', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(overview);
  await page.getByRole('button', { name: 'Change theme' }).click();
  await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Change theme' }).click();
  await page.getByRole('menuitemradio', { name: 'Light', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/light/);
  await page.getByRole('button', { name: 'Change theme' }).click();
  await page
    .getByRole('menuitemradio', { name: 'System', exact: true })
    .click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe(
    'system',
  );
});
test('keyboard search filters navigation and restores focus on Escape', async ({
  page,
}) => {
  await page.goto(overview);
  const search = page.getByRole('button', { name: /Search…/ });
  await search.focus();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('textbox', { name: 'Search navigation' })
    .fill('no such page');
  await expect(dialog.getByRole('status')).toContainText('No pages match');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(search).toBeFocused();
  await page.keyboard.press('Control+k');
  await dialog.getByRole('textbox').fill('documents');
  await dialog.getByRole('link', { name: 'Documents', exact: true }).click();
  await expect(page).toHaveURL('/app/projects/sample/documents');
  await expect(dialog).toBeHidden();
});
test('mobile navigation opens, traps focus, follows link and closes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(overview);
  await expect(
    page.getByRole('navigation', { name: 'Project navigation' }),
  ).toBeHidden();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const drawer = page.getByRole('dialog', { name: 'Workspace navigation' });
  await expect(drawer).toBeVisible();
  const bounds = await drawer.boundingBox();
  expect(bounds?.x).toBe(0);
  expect(bounds?.y).toBe(0);
  expect(bounds?.width).toBe(300);
  await drawer.getByRole('link', { name: 'Tasks', exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tasks');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
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
test('workspace/project selectors, visitor menu and notifications are transparent', async ({
  page,
}) => {
  await page.goto(overview);
  await page.getByRole('combobox', { name: 'Workspace', exact: true }).click();
  await expect(
    page.getByRole('option', { name: 'Sample workspace', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: 'Project', exact: true }).click();
  await expect(
    page.getByRole('option', { name: 'Sample project', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'Notifications', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText(
    'no notification service',
  );
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Preview visitor' }).click();
  await expect(
    page.getByRole('menuitem', { name: 'Authentication arrives in Phase 01' }),
  ).toBeDisabled();
  await page.getByRole('menuitem', { name: 'Profile preview' }).click();
  await expect(page).toHaveURL('/app/settings/profile');
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
  test(`accessible ${theme} overview`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.goto(overview);
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

test('mobile navigation search closes both dialogs after following a result', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(overview);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('dialog', { name: 'Workspace navigation' })
    .getByRole('button', { name: /Search…/ })
    .click();
  const search = page.getByRole('dialog', {
    name: 'Find your way around Atlas',
  });
  await search.getByRole('textbox').fill('library');
  await search
    .getByRole('link', { name: 'Paper library', exact: true })
    .click();
  await expect(page).toHaveURL('/app/projects/sample/library');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Paper library',
  );
});
