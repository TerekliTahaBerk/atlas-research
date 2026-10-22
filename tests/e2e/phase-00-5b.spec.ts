import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { base, noHorizontalOverflow, useTheme } from './helpers';

test('mobile reader notes and graph inspector remain reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${base}/reader`);
  const toolbar = page.getByRole('toolbar', { name: 'Selection actions' });
  const bounds = (await toolbar.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(8);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(382);
  const trigger = page.getByRole('button', { name: 'Notes panel' });
  await trigger.click();
  const notes = page.getByRole('dialog', { name: 'Reader notes' });
  await expect(notes).toBeVisible();
  await notes.getByRole('radio', { name: 'Outline', exact: true }).click();
  await expect(
    notes.getByRole('button', { name: /3.*Low.rank/ }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.goto(`${base}/graph`);
  const action = page.getByRole('button', { name: /Add citation/ }).first();
  await action.scrollIntoViewIfNeeded();
  await expect(action).toBeInViewport();
  await action.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText(/preview|sample|not/i);
});

test('core handoff dimensions are measured from rendered controls', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/app/home');
  expect(
    Math.round(
      (await page
        .getByRole('complementary', { name: 'Sidebar', exact: true })
        .boundingBox())!.width,
    ),
  ).toBe(216);
  const main = page.getByRole('main');
  expect(await main.evaluate((el) => getComputedStyle(el).borderRadius)).toBe(
    '10px',
  );
  expect(
    Math.round(
      (await page.locator('main > div > header').boundingBox())!.height,
    ),
  ).toBe(48);
  expect(
    Math.round(
      (await page
        .getByRole('button', { name: 'Collapse sidebar', exact: true })
        .boundingBox())!.height,
    ),
  ).toBe(28);
  const composer = page.getByRole('combobox', { name: 'Ask Atlas' });
  expect(Math.round((await composer.locator('..').boundingBox())!.height)).toBe(
    42,
  );
  expect(
    Math.round(
      (await page.locator('[data-placement="canvas"]').boundingBox())!.y,
    ),
  ).toBe(14);
  await page
    .getByRole('button', { name: 'Notifications', exact: true })
    .click();
  await expect(async () => {
    expect(
      Math.round(
        (await page
          .getByRole('dialog', { name: 'Inbox', exact: true })
          .boundingBox())!.width,
      ),
    ).toBe(420);
  }).toPass();
  await page.keyboard.press('Escape');
  await page.goto(`${base}/manuscripts`);
  expect(
    Math.round(
      (await page
        .getByRole('navigation', { name: 'Manuscript files' })
        .boundingBox())!.width,
    ),
  ).toBe(200);
});

test('foreground dialogs own keyboard focus over global Atlas shortcuts', async ({
  page,
}) => {
  await page.goto(`${base}/documents`);
  const trigger = page
    .getByRole('button', { name: 'Version history', exact: true })
    .first();
  await trigger.click();
  const history = page.getByRole('dialog', {
    name: 'Version history',
    exact: true,
  });
  await page.keyboard.press('ControlOrMeta+j');
  await page.keyboard.press('ControlOrMeta+k');
  await expect(history).toBeVisible();
  await expect(page.locator('[data-atlas-focus]')).toHaveCount(0);
  await expect(history).toContainText('sample history');
  expect(
    await history.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.keyboard.press('ControlOrMeta+j');
  await expect(
    page.getByRole('dialog', { name: 'Atlas AI — focus mode' }),
  ).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k');
  await expect(
    page.getByRole('dialog', { name: 'Search Atlas' }),
  ).toBeVisible();
  await expect(page.locator('[data-atlas-focus]')).toHaveCount(0);
});

test('Atlas focus returns to a usable composer and Escape dismisses only the picker first', async ({
  page,
}) => {
  await page.goto(`${base}/documents`);
  const input = page.getByRole('combobox', { name: 'Ask Atlas' });
  await input.fill('A local question');
  await page.keyboard.press('ControlOrMeta+j');
  const focus = page.getByRole('dialog', { name: 'Atlas AI — focus mode' });
  await focus.getByRole('combobox').fill('@Chen');
  await page.keyboard.press('Escape');
  await expect(focus).toBeVisible();
  await expect(focus.getByRole('listbox')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(focus).toBeHidden();
  await expect(input).toBeFocused();
});

test('document pickers stay inside the phone viewport and expose keyboard selection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/documents?doc=d2`);
  const editor = page.getByRole('textbox', { name: 'Document body' });
  await editor.click();
  await page.keyboard.type(`${'a'.repeat(34)} @`);
  const list = page.getByRole('listbox', { name: 'Insert reference' });
  await expect(list).toBeVisible();
  const box = (await list.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(8);
  expect(box.x + box.width).toBeLessThanOrEqual(382);
  expect(box.y + box.height).toBeLessThanOrEqual(836);
  await page.keyboard.press('ArrowDown');
  const activeId = await editor.getAttribute('aria-activedescendant');
  await expect(page.locator(`[id="${activeId}"]`)).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('Enter');
  await expect(list).toHaveCount(0);
  await expect(editor).toContainText('Chen');
  await page.keyboard.type(' /');
  const blocks = page.getByRole('listbox', { name: 'Block commands' });
  await expect(blocks).toBeVisible();
  await page.keyboard.type('Heading');
  await page.keyboard.press('Enter');
  await page.keyboard.type('A local heading');
  await expect(editor.getByRole('heading', { level: 2 })).toContainText(
    'A local heading',
  );
  expect(await noHorizontalOverflow(page)).toBe(true);
});

test('active artifact changes replace stale Atlas context', async ({
  page,
}) => {
  await page.goto(`${base}/documents?doc=d1&atlas=panel`);
  await expect(
    page.getByRole('button', { name: /^Remove Related work/ }),
  ).toBeVisible();
  expect(
    await page
      .locator('.aic-wide')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--aic').trim()),
  ).toBe('0px');
  await page
    .getByRole('link', { name: 'Lab meeting · Oct 20', exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/doc=d2/);
  await expect(
    page.getByRole('button', { name: 'Remove Lab meeting · Oct 20' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^Remove Related work/ }),
  ).toHaveCount(0);
  await page.goto(`${base}/reader?paper=p1&atlas=panel`);
  await expect(
    page.getByRole('button', { name: 'Remove Okafor et al., 2024' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Remove.*Chen/ })).toHaveCount(
    0,
  );
  await page.goto(`${base}/manuscripts?atlas=panel`);
  await page.getByRole('tab', { name: 'intro.tex' }).click();
  await expect(
    page.getByRole('button', { name: 'Remove intro.tex' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Remove main.tex' }),
  ).toHaveCount(0);
  await page.goto(`${base}/channels?atlas=panel`);
  await page
    .getByRole('navigation', { name: 'Channels', exact: true })
    .getByRole('button', { name: 'general', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Remove #general' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Remove #reading-group' }),
  ).toHaveCount(0);
});

test('all requested context transitions clear explicit stale references through real navigation', async ({
  page,
}) => {
  await page.goto('/app/home?atlas=panel');
  await expect(page.locator('[data-placement="panel"]')).toBeVisible();
  const contexts: Record<string, string> = {
    research: 'Research',
    library: 'All papers',
    documents: 'Related work — sparse attention in structure prediction',
    tasks: 'Sparse Evoformer',
    channels: '#reading-group',
    manuscripts: 'main.tex',
    experiments: 'run_14_block_sparsity',
  };
  const routes = [
    'research',
    'library',
    'documents',
    'tasks',
    'channels',
    'manuscripts',
    'experiments',
  ];
  for (const route of routes) {
    const composer = page.getByRole('combobox', { name: 'Ask Atlas' });
    await composer.fill('@Okafor');
    await expect(page.getByRole('option', { name: /Okafor/ })).toBeVisible();
    // Target the composer after the previous dialog's focus restoration.
    await composer.press('Enter');
    await expect(
      page.getByRole('button', { name: 'Remove Okafor et al., 2024' }),
    ).toBeVisible();
    await page.keyboard.press('ControlOrMeta+k');
    const search = page.getByRole('dialog', { name: 'Search Atlas' });
    await search
      .getByRole('combobox')
      .fill(
        route === 'documents'
          ? 'Documents'
          : route === 'manuscripts'
            ? 'Manuscripts'
            : route,
      );
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/${route}$`));
    await expect(
      page.getByRole('button', { name: `Remove ${contexts[route]}` }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Remove Okafor et al., 2024' }),
    ).toHaveCount(0);
  }
});

for (const width of [1024, 1280, 1440, 1920]) {
  test(`docked manuscript preserves usable source width at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${base}/manuscripts?atlas=panel`);
    await expect(page.locator('[data-placement="panel"]')).toBeVisible();
    const editor = page.locator('.atlas-cm');
    await expect(async () =>
      expect((await editor.boundingBox())!.width).toBeGreaterThanOrEqual(320),
    ).toPass();
    const separator = page.getByRole('separator', {
      name: 'Resize editor and PDF',
    });
    if (await separator.count()) {
      await separator.focus();
      const before = (await editor.boundingBox())!.width;
      await page.keyboard.press('ArrowRight');
      await expect(async () =>
        expect((await editor.boundingBox())!.width).toBeGreaterThan(before),
      ).toPass();
    }
    const input = page.getByRole('textbox', { name: /^LaTeX source:/ });
    await input.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('\n% QA local edit');
    await expect(input).toContainText('QA local edit');
    expect(await noHorizontalOverflow(page)).toBe(true);
  });
}

test('inline suggestions accept and discard only in the local document', async ({
  page,
}) => {
  await page.goto(`${base}/documents`);
  const editor = page.getByRole('textbox', { name: 'Document body' });
  await editor.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(
    editor.getByRole('button', { name: 'Accept', exact: true }),
  ).toHaveCount(0);
  await expect(editor).toContainText(
    'the model chooses which long-range pairs to keep',
  );
  await page.reload();
  await editor.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(
    editor.getByText('Atlas suggestion', { exact: true }),
  ).toHaveCount(0);
  await expect(editor).not.toContainText(
    'the model chooses which long-range pairs to keep',
  );
});

for (const theme of ['light', 'dark'] as const) {
  test(`foreground overlays meet automated WCAG checks in ${theme}`, async ({
    page,
  }) => {
    test.slow();
    await useTheme(page, theme);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${base}/overview`);
    for (const overlay of ['Share', 'Search Atlas', 'Atlas AI — focus mode']) {
      if (overlay === 'Share')
        await page.getByRole('button', { name: 'Share', exact: true }).click();
      else
        await page.keyboard.press(
          overlay === 'Search Atlas' ? 'ControlOrMeta+k' : 'ControlOrMeta+j',
        );
      await expect(page.getByRole('dialog').last()).toBeVisible();
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(result.violations, overlay).toEqual([]);
      await page.keyboard.press('Escape');
    }
  });
  for (const screen of ['home', 'documents', 'manuscripts']) {
    test(`reviewed signature screenshot ${screen} ${theme}`, async ({
      page,
    }) => {
      await useTheme(page, theme);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width: 1440, height: 900 });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.goto(screen === 'home' ? '/app/home' : `${base}/${screen}`);
      await page.evaluate(() => document.fonts.ready);
      await expect(
        page.getByRole('heading', { level: 1 }).first(),
      ).toBeAttached();
      await expect(page).toHaveScreenshot(`${screen}-${theme}.png`, {
        animations: 'disabled',
        caret: 'hide',
        // Allow minor font rasterization differences; layout changes still fail.
        maxDiffPixelRatio: 0.002,
      });
      expect(errors).toEqual([]);
    });
  }
}
