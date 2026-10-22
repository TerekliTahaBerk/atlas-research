import { test, expect, type Page } from '@playwright/test';
import { base, noHorizontalOverflow, useTheme } from './helpers';
const assistant = (page: Page) =>
  page.getByRole('complementary', { name: 'Atlas AI assistant' });
test.describe('Atlas AI modes share one conversation', () => {
  test('compact → open → focus (⌘J, dim + blur) → Esc back to open → panel → compact', async ({
    page,
  }) => {
    await page.goto(`${base}/overview`);
    const surface = assistant(page).first();
    await expect(surface).toHaveAttribute('data-mode', 'compact');
    const composer = page.getByRole('combobox', { name: 'Ask Atlas' });
    await composer.click();
    await expect(surface).toHaveAttribute('data-mode', 'open');
    await composer.fill('A question carried across modes');
    await page.keyboard.press('ControlOrMeta+j');
    const focus = page.getByRole('dialog', { name: 'Atlas AI — focus mode' });
    await expect(focus).toBeVisible();
    const overlay = page.locator('[data-state="open"].backdrop-blur-\\[7px\\]');
    await expect(overlay).toBeVisible();
    // Draft state is shared: the focus composer holds the same input.
    await expect(
      focus.getByRole('combobox', { name: 'Ask Atlas' }),
    ).toHaveValue('A question carried across modes');
    await expect(
      focus.getByRole('combobox', { name: 'Ask Atlas' }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(focus).toBeHidden();
    await expect(assistant(page).first()).toHaveAttribute('data-mode', 'open');
    await assistant(page)
      .first()
      .getByRole('button', { name: 'Dock to side' })
      .click();
    const panel = page.locator('[data-placement="panel"]');
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(Math.round(box!.width)).toBe(380);
    // The canvas reflows rather than sitting under the panel.
    const main = await page.locator('#main-content').boundingBox();
    expect(main!.x + main!.width).toBeLessThanOrEqual(box!.x + 1);
    await panel.getByRole('button', { name: 'Close Atlas panel' }).click();
    await expect(panel).toBeHidden();
    await expect(assistant(page).first()).toHaveAttribute(
      'data-mode',
      'compact',
    );
  });
  test('inline entry points attach context and open Atlas', async ({
    page,
  }) => {
    await page.goto(`${base}/reader?paper=p1`);
    const trigger = page
      .getByRole('button', { name: /Ask Atlas|Explain|Summarize/ })
      .first();
    await trigger.click();
    await expect(
      page.getByRole('button', { name: /^Remove / }).first(),
    ).toBeVisible();
  });
  test('panel becomes a bottom sheet on narrow screens', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/overview?atlas=panel`);
    const panel = page.locator('[data-placement="panel"]');
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box!.width).toBeGreaterThan(360);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
    expect(await noHorizontalOverflow(page)).toBe(true);
  });
  test('slash commands follow the active surface', async ({ page }) => {
    await page.goto(`${base}/tasks`);
    const composer = page.getByRole('combobox', { name: 'Ask Atlas' });
    await composer.fill('/');
    const tasksList = page.getByRole('listbox', { name: 'Slash commands' });
    await expect(
      tasksList.getByRole('option', { name: /\/create-task/ }),
    ).toBeVisible();
    await expect(
      tasksList.getByRole('option', { name: /\/latex/ }),
    ).toHaveCount(0);
    await page.goto(`${base}/manuscripts`);
    const ms = page.getByRole('combobox', { name: 'Ask Atlas' });
    await ms.fill('/');
    await expect(
      page
        .getByRole('listbox', { name: 'Slash commands' })
        .getByRole('option', { name: /\/latex/ }),
    ).toBeVisible();
  });
  test('reduced motion shows the final sample answer immediately', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${base}/ai`);
    const before = await page.getByText('Sample response').count();
    await page
      .getByRole('combobox', { name: 'Ask Atlas' })
      .fill('What should I read next?');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Sample response')).toHaveCount(before + 1, {
      timeout: 1000,
    });
  });
});
test('home switches between grid and list views', async ({ page }) => {
  await page.goto('/app/home');
  await expect(page.getByRole('region', { name: 'Projects' })).toBeVisible();
  await page
    .getByRole('radiogroup', { name: 'Layout' })
    .getByRole('radio', { name: 'List' })
    .click();
  await expect(
    page.getByRole('table', { name: 'All resources' }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Projects' })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Grid' }).click();
  await expect(page.getByRole('region', { name: 'Projects' })).toBeVisible();
});
test('share popover is honest about invitations and restores focus', async ({
  page,
}) => {
  await page.goto(`${base}/overview`);
  const trigger = page.getByRole('button', { name: 'Share', exact: true });
  await trigger.click();
  const pop = page.getByRole('dialog', { name: 'Share Sparse Evoformer' });
  await expect(pop).toBeVisible();
  expect(Math.round((await pop.boundingBox())!.width)).toBe(380);
  await pop
    .getByRole('textbox', { name: 'Invite people by email' })
    .fill('someone@example.invalid');
  await pop.getByRole('button', { name: 'Invite', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'nobody was invited' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pop).toBeHidden();
  await expect(trigger).toBeFocused();
});
test('version history previews diffs and never restores content', async ({
  page,
}) => {
  await page.goto(`${base}/documents?doc=d1`);
  await page.getByRole('button', { name: 'Version history' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Version history' });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(Math.round(box!.width)).toBe(920);
  expect(Math.round(box!.height)).toBe(600);
  await expect(dialog.getByRole('listbox', { name: 'Versions' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Restore this version' }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Click again to confirm',
  );
  await dialog.getByRole('button', { name: 'Confirm restore' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'the current content was not replaced' }),
  ).toBeVisible();
});
test('manuscript layouts switch and compile never pretends to run', async ({
  page,
}) => {
  await page.goto(`${base}/manuscripts`);
  const source = page.getByRole('textbox', { name: /^LaTeX source:/ });
  const pdf = page.getByRole('document', {
    name: 'Sample PDF preview, page 1',
  });
  await expect(source).toBeVisible();
  await expect(pdf).toBeVisible();
  const layout = page.getByRole('radiogroup', { name: 'Layout' });
  await layout.getByRole('radio', { name: 'Editor only' }).click();
  await expect(pdf).toHaveCount(0);
  await layout.getByRole('radio', { name: 'PDF only' }).click();
  await expect(source).toHaveCount(0);
  await expect(pdf).toBeVisible();
  await layout.getByRole('radio', { name: 'Split' }).click();
  await expect(source).toBeVisible();
  await page.getByRole('button', { name: 'Compile', exact: true }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Compilation isn’t available in this preview' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Download PDF' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'no PDF has been compiled' }),
  ).toBeVisible();
});
test('pricing and checkout are illustrative and request no payment', async ({
  page,
}) => {
  const posts: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET') posts.push(r.url());
  });
  await page.goto('/app/settings/plan');
  await page.getByRole('button', { name: 'Compare plans' }).click();
  const dialog = page.getByRole('dialog', { name: 'Go further with Atlas' });
  await expect(dialog).toBeVisible();
  expect(Math.round((await dialog.boundingBox())!.width)).toBe(960);
  await expect(dialog).toContainText('Illustrative plans and prices');
  await dialog.getByRole('radio', { name: /Lab/ }).click();
  await dialog.getByRole('button', { name: /^Continue with/ }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'no payment was requested' }),
  ).toBeVisible();
  expect(posts).toEqual([]);
});
test('every screen is reachable and labelled as sample content', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const slug of [
    'overview',
    'research',
    'library',
    'reader',
    'documents',
    'tasks',
    'channels',
    'ai',
    'manuscripts',
    'experiments',
    'graph',
  ]) {
    await page.goto(`${base}/${slug}`);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(
      page.getByText(/sample|preview/i).first(),
      slug,
    ).toBeAttached();
  }
  for (const path of [
    '/app/home',
    '/app/inbox',
    '/app/settings/profile',
    '/app/design-system',
    '/app/design-system/mobile',
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole('heading', { level: 1 }).first(),
    ).toBeAttached();
  }
  expect(errors).toEqual([]);
});
test('keyboard focus is visible on shell controls in light mode', async ({
  page,
}) => {
  await useTheme(page, 'light');
  await page.goto('/app/home');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  expect(outline.style).not.toBe('none');
  expect(outline.width).toBeGreaterThanOrEqual(1);
});
