import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const base = '/app/projects/sample';
test('sidebar collapses with accessible links and persists only a navigation preference', async ({
  page,
}) => {
  await page.goto('/app/home');
  await page
    .getByRole('button', { name: 'Collapse sidebar', exact: true })
    .click();
  await expect(page.locator('.app-shell')).toHaveClass(/compact-sidebar/);
  await expect(
    page.getByRole('link', { name: 'Settings', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Expand sidebar' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  expect(
    await page.evaluate(() => localStorage.getItem('atlas-sidebar-collapsed')),
  ).toBe('false');
});
test('composer keyboard references, commands, source disclosure and dismissal work', async ({
  page,
}) => {
  await page.goto('/app/home');
  const composer = page.getByRole('combobox', { name: 'Ask Atlas' });
  await composer.fill('@Literature');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Remove Literature review' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Remove Literature review' }).click();
  await composer.fill('/summarize');
  await page.keyboard.press('Enter');
  await expect(composer).toHaveValue('/summarize ');
  await page.keyboard.press('Enter');
  const assistant = page.getByRole('complementary', {
    name: 'Atlas AI assistant',
  });
  await expect(assistant).toBeVisible();
  await expect(
    assistant.getByText('Prewritten answer · not AI output'),
  ).toBeVisible();
  await assistant.getByText('3 source states · none verified').click();
  await expect(assistant.getByText('Suggested · unverified')).toBeVisible();
  await assistant
    .getByRole('button', { name: 'Create task', exact: true })
    .click();
  await expect(
    assistant.getByText('Preview only: this action cannot execute.'),
  ).toBeVisible();
  await assistant.getByRole('button', { name: 'Dismiss proposal' }).click();
  await page.keyboard.press('Escape');
  await expect(assistant).toBeHidden();
  await expect(composer).toBeFocused();
});
test('AI state previews cancel and recover without making API requests', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) requests.push(request.url());
  });
  await page.goto(`${base}/ai`);
  await page.getByRole('combobox', { name: 'Assistant preview state' }).click();
  await page
    .getByRole('option', { name: 'Searching sources', exact: true })
    .click();
  await expect(
    page.getByText('No operation is running.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel preview' }).click();
  await expect(
    page.getByText('Preview cancelled. No action was performed.'),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Assistant preview state' }).click();
  await page.getByRole('option', { name: 'Error', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'No real request failed',
  );
  await page.getByRole('button', { name: 'Retry composer' }).click();
  await expect(
    page.getByText('A thought partner, close at hand.'),
  ).toBeVisible();
  expect(requests).toEqual([]);
});
test('document drafts, formatting, context and focus mode stay local', async ({
  page,
}) => {
  await page.goto(`${base}/documents?note=document-questions`);
  await expect(
    page.getByRole('textbox', { name: 'Document title' }),
  ).toHaveValue('Research questions');
  const body = page.getByRole('combobox', { name: 'Document body' });
  await body.fill('A local paragraph about evidence.');
  await body.press('ControlOrMeta+a');
  await page.getByRole('button', { name: 'Bold selection' }).click();
  await expect(body).toHaveValue('**A local paragraph about evidence.**');
  await page.getByRole('button', { name: 'Enter focus mode' }).click();
  await expect(page.locator('.desktop-sidebar')).toBeHidden();
  await expect(
    page.getByRole('complementary', { name: 'Document tree' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Exit focus mode' }).click();
  await expect(
    page.getByText('Unsaved local changes.', { exact: false }),
  ).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await expect(body).not.toHaveValue('**A local paragraph about evidence.**');
});
test('paper filters, comparison, reading controls and assistant context work', async ({
  page,
}) => {
  await page.goto(`${base}/library`);
  await page
    .getByRole('textbox', { name: 'Search sample papers' })
    .fill('no matching sample');
  await expect(
    page.getByRole('heading', { name: 'No sample papers match' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByRole('checkbox', { name: 'Compare' }).nth(0).check();
  await page.getByRole('checkbox', { name: 'Compare' }).nth(1).check();
  await page.getByRole('button', { name: 'Compare selected (2)' }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Compare sample papers' })
      .getByRole('row'),
  ).toHaveCount(3);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Read preview' }).first().click();
  const reader = page.getByRole('dialog');
  await expect(reader).toContainText('not an uploaded or ingested PDF');
  await reader.getByRole('button', { name: 'Next page' }).click();
  await expect(reader.getByText('Page 2 of 3')).toBeVisible();
  await reader.getByRole('button', { name: 'Highlight sample' }).click();
  await expect(reader.locator('.highlighted')).toBeVisible();
  await reader.getByRole('button', { name: 'Ask Atlas', exact: true }).click();
  await expect(reader).toBeHidden();
  await expect(
    page.getByRole('complementary', { name: 'Atlas AI assistant' }),
  ).toContainText('Designing for thoughtful');
});
test('task changes and channel messages are explicit local demonstrations', async ({
  page,
}) => {
  await page.goto(`${base}/tasks`);
  await page.getByRole('button', { name: /Draft methodology section/ }).click();
  await page
    .getByRole('combobox', { name: 'Status', exact: true })
    .selectOption('Done');
  await page.keyboard.press('Escape');
  await expect(
    page
      .locator('.task-column')
      .filter({ has: page.getByText('Done', { exact: true }) }),
  ).toContainText('Draft methodology section');
  await page.reload();
  await expect(
    page
      .locator('.task-column')
      .filter({ has: page.getByText('In progress', { exact: true }) }),
  ).toContainText('Draft methodology section');
  await page.goto(`${base}/channels`);
  await page
    .getByRole('combobox', { name: 'Local channel message' })
    .fill('A new local discussion point');
  await page.getByRole('button', { name: 'Add local message' }).click();
  const message = page
    .getByRole('article')
    .filter({ hasText: 'A new local discussion point' });
  await expect(message).toContainText('Local draft');
  await message.getByRole('button', { name: 'Thread' }).click();
  await page
    .getByRole('textbox', { name: 'Local reply' })
    .fill('A local reply');
  await page.getByRole('button', { name: 'Add local reply' }).click();
  await expect(
    page.getByRole('complementary', { name: 'Message thread' }),
  ).toContainText('Preview visitor · A local reply');
});
test('creation dialog restores focus and never reports a completed write', async ({
  page,
}) => {
  await page.goto('/app/home');
  const trigger = page.getByRole('button', { name: 'New document' });
  await trigger.click();
  await page
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('A considered research note');
  await page.getByRole('button', { name: 'Review draft' }).click();
  await expect(page.getByRole('status')).toContainText(
    'No document was created',
  );
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
test('onboarding is skippable and auth forms send no requests', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST') requests.push(r.url());
  });
  await page.goto('/login');
  await page
    .getByRole('textbox', { name: 'Email', exact: true })
    .fill('preview@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('local-preview-only');
  await page.getByRole('button', { name: 'Preview sign in' }).click();
  await expect(page.getByRole('status')).toContainText(
    'No authentication request was sent',
  );
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await page.goto('/onboarding');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: 'Independent researcher' }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  for (let i = 0; i < 4; i += 1)
    await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByText(/prepared no real account/)).toBeVisible();
  expect(requests).toEqual([]);
});
for (const theme of ['light', 'dark'] as const) {
  for (const width of [1440, 1280, 1024, 768, 390]) {
    test(`module layouts have no horizontal overflow at ${width}px in ${theme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: 1000 });
      for (const path of [
        '/app/home',
        '/app/inbox',
        `${base}/research`,
        `${base}/library`,
        `${base}/documents`,
        `${base}/tasks`,
        `${base}/channels`,
        `${base}/ai`,
        `${base}/manuscripts`,
        `${base}/experiments`,
        '/login',
        '/onboarding',
      ]) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          path,
        ).toBe(true);
      }
    });
  }
  for (const moduleSlug of [
    'research',
    'documents',
    'tasks',
    'channels',
    'ai',
    'manuscripts',
    'experiments',
  ]) {
    test(`accessible ${theme} ${moduleSlug} module`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.goto(`${base}/${moduleSlug}`);
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(result.violations).toEqual([]);
    });
  }
}

test('mobile assistant and long document titles preserve accessible working space', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/documents`);
  await page
    .getByRole('textbox', { name: 'Document title' })
    .fill(
      'A very long research title about human agency and evidence in a collaborative scientific workflow '.repeat(
        2,
      ),
    );
  await page.getByRole('button', { name: 'Open Atlas AI' }).click();
  const assistant = page.getByRole('complementary', {
    name: 'Atlas AI assistant',
  });
  await expect(assistant).toContainText('document context');
  const composer = assistant.getByRole('combobox', { name: 'Ask Atlas' });
  await composer.fill('@');
  await expect(assistant.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(assistant.getByRole('listbox')).toBeHidden();
  await expect(assistant).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(assistant).toBeHidden();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).every((key) =>
        ['theme', 'atlas-sidebar-collapsed'].includes(key),
      ),
    ),
  ).toBe(true);
});

for (const theme of ['light', 'dark'] as const) {
  for (const route of [
    '/app/inbox',
    `${base}/library`,
    '/login',
    '/onboarding',
  ]) {
    test(`accessible ${theme} ${route} entry`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.goto(route);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
    });
  }
}

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
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowDown');
  const selected = menu.getByRole('option', { selected: true });
  await expect(selected).toContainText('Human–AI collaboration · draft');
  const selectedBounds = await selected.boundingBox();
  const menuBounds = await menu.boundingBox();
  expect(selectedBounds!.y).toBeGreaterThanOrEqual(menuBounds!.y);
  expect(selectedBounds!.y + selectedBounds!.height).toBeLessThanOrEqual(
    menuBounds!.y + menuBounds!.height,
  );
});
