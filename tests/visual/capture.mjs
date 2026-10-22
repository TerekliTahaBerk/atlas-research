import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const out = process.cwd() + '/.qa-artifacts/phase-00-5b';
const screens = {
  home: '/app/home',
  overview: '/app/projects/sample/overview',
  doc: '/app/projects/sample/documents?doc=d1',
  manuscript: '/app/projects/sample/manuscripts',
  research: '/app/projects/sample/research',
  library: '/app/projects/sample/library',
  reader: '/app/projects/sample/reader',
  tasks: '/app/projects/sample/tasks',
  channels: '/app/projects/sample/channels',
  experiments: '/app/projects/sample/experiments',
  graph: '/app/projects/sample/graph',
  inbox: '/app/inbox',
  settings: '/app/settings/appearance',
  system: '/app/design-system',
  mobile: '/app/design-system/mobile',
};
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const manifest = [];
  for (const theme of ['dark', 'light']) {
    const ctx = await b.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    });
    const p = await ctx.newPage();
    await p.goto('http://127.0.0.1:3200/qa.html');
    await p.waitForFunction(() => window.__atlasReference);
    for (const screen of Object.keys(screens)) {
      await p.evaluate(
        ({ screen, theme }) => {
          const r = window.__atlasReference;
          r.go(screen);
          r.setState({ theme });
        },
        { screen, theme },
      );
      await p.evaluate(() => document.fonts.ready);
      await p.evaluate(() =>
        Promise.all(
          [...document.images].map((i) => i.decode().catch(() => {})),
        ),
      );
      await p.waitForTimeout(120);
      const file = `reference-${theme}-1440-${screen}.png`;
      await p.screenshot({
        path: path.join(out, file),
        animations: 'disabled',
      });
      manifest.push({
        kind: 'reference',
        screen,
        theme,
        width: 1440,
        height: 900,
        file,
      });
    }
    for (const [state, patch] of Object.entries({
      'ai-open': { ai: 'open' },
      'ai-focus': { ai: 'focus' },
      'ai-panel': { ai: 'panel' },
      history: { ai: 'compact', modal: 'history' },
      share: {
        ai: 'compact',
        modal: null,
        pop: 'share',
        popR: { l: 1020, t: 12, r: 1400, b: 48 },
        popAlign: 'right',
        popW: 380,
      },
    })) {
      await p.evaluate(
        ({ patch, theme }) => {
          window.__atlasReference.go('doc');
          window.__atlasReference.setState({ ...patch, theme });
        },
        { patch, theme },
      );
      await p.waitForTimeout(150);
      const file = `reference-${theme}-1440-${state}.png`;
      await p.screenshot({
        path: path.join(out, file),
        animations: 'disabled',
      });
      manifest.push({
        kind: 'reference',
        screen: state,
        theme,
        width: 1440,
        height: 900,
        file,
      });
    }
    await ctx.close();
  }
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1280, 800],
    [1024, 768],
    [768, 1024],
    [390, 844],
  ])
    for (const theme of ['dark', 'light']) {
      const ctx = await b.newContext({
        viewport: { width, height },
        reducedMotion: 'reduce',
      });
      await ctx.addInitScript((t) => localStorage.setItem('theme', t), theme);
      const p = await ctx.newPage();
      const errors = [];
      p.on('pageerror', (e) => errors.push(e.message));
      p.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      for (const [screen, url] of Object.entries(screens)) {
        await p.goto('http://127.0.0.1:3100' + url);
        await p
          .getByRole('heading', { level: 1 })
          .first()
          .waitFor({ state: 'attached' });
        await p.evaluate(() => document.fonts.ready);
        // The mobile QA gallery contains lazy live routes, including split
        // editor chunks. Await each frame instead of capturing a blank mount.
        if (screen === 'mobile') {
          for (const iframe of await p.locator('iframe').all()) {
            await iframe.evaluate((el) => {
              el.loading = 'eager';
            });
            const frame = await (await iframe.elementHandle()).contentFrame();
            await frame
              .getByRole('heading', { level: 1 })
              .first()
              .waitFor({ state: 'attached' });
            await frame.evaluate(() => document.fonts.ready);
          }
        }
        await p.evaluate(() =>
          Promise.all(
            [...document.images].map((i) => i.decode().catch(() => {})),
          ),
        );
        await p.waitForTimeout(80);
        const file = `implementation-${theme}-${width}-${screen}.png`;
        await p.screenshot({
          path: path.join(out, file),
          animations: 'disabled',
        });
        manifest.push({
          kind: 'implementation',
          screen,
          theme,
          width,
          height,
          file,
          title: await p.title(),
          errors: [...errors],
          overflow: await p.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          fonts: await p.evaluate(() =>
            [...document.fonts]
              .filter((f) => f.status === 'loaded')
              .map((f) => f.family),
          ),
        });
      }
      console.log({ width, height, theme, errors });
      await ctx.close();
    }

  for (const theme of ['dark', 'light']) {
    const ctx = await b.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    });
    await ctx.addInitScript((t) => localStorage.setItem('theme', t), theme);
    const p = await ctx.newPage();
    for (const state of [
      'ai-open',
      'ai-focus',
      'ai-panel',
      'history',
      'share',
      'inbox-popover',
      'command-search',
      'paper-detail',
      'task-detail',
      'pricing',
      'document-mention',
      'document-slash',
      'mobile-drawer',
    ]) {
      await p.setViewportSize({ width: 1440, height: 900 });
      let url = '/app/projects/sample/documents';
      if (state.startsWith('ai-')) url += '?atlas=' + state.slice(3);
      if (state === 'paper-detail')
        url = '/app/projects/sample/library?paper=p1';
      if (state === 'task-detail')
        url = '/app/projects/sample/tasks?task=ATL-27';
      if (state === 'pricing') url = '/app/settings/plan';
      if (state === 'inbox-popover') url = '/app/home';
      if (state.startsWith('document-')) url += '?doc=d2';
      if (state === 'mobile-drawer')
        await p.setViewportSize({ width: 390, height: 844 });
      await p.goto('http://127.0.0.1:3100' + url);
      await p.evaluate(() => document.fonts.ready);
      if (state === 'history')
        await p
          .getByRole('button', { name: 'Version history', exact: true })
          .first()
          .click();
      if (state === 'share')
        await p.getByRole('button', { name: 'Share', exact: true }).click();
      if (state === 'inbox-popover')
        await p
          .getByRole('button', { name: 'Notifications', exact: true })
          .click();
      if (state === 'command-search') await p.keyboard.press('ControlOrMeta+k');
      if (state === 'pricing')
        await p.getByRole('button', { name: 'Compare plans' }).click();
      if (state === 'mobile-drawer')
        await p.getByRole('button', { name: 'Open navigation' }).click();
      if (state.startsWith('document-')) {
        await p.getByRole('textbox', { name: 'Document body' }).click();
        await p.keyboard.type(state === 'document-mention' ? '@' : '/');
        await p.getByRole('listbox').waitFor();
      }
      await p.waitForTimeout(120);
      const width = state === 'mobile-drawer' ? 390 : 1440;
      const file = `implementation-${theme}-${width}-${state}.png`;
      await p.screenshot({
        path: path.join(out, file),
        animations: 'disabled',
      });
      manifest.push({
        kind: 'implementation',
        screen: state,
        theme,
        width,
        height: state === 'mobile-drawer' ? 844 : 900,
        file,
      });
    }
    await ctx.close();
  }
  const comparisons = [];
  const comparePage = await b.newPage();
  for (const theme of ['dark', 'light'])
    for (const screen of Object.keys(screens)) {
      const a = fs
        .readFileSync(path.join(out, `reference-${theme}-1440-${screen}.png`))
        .toString('base64');
      const c = fs
        .readFileSync(
          path.join(out, `implementation-${theme}-1440-${screen}.png`),
        )
        .toString('base64');
      const metrics = await comparePage.evaluate(
        async ({ a, c }) => {
          async function pixels(s) {
            const i = new Image();
            i.src = 'data:image/png;base64,' + s;
            await i.decode();
            const canvas = document.createElement('canvas');
            canvas.width = 1440;
            canvas.height = 900;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(i, 0, 0);
            return ctx.getImageData(0, 0, 1440, 900).data;
          }
          const A = await pixels(a),
            B = await pixels(c);
          const regions = {
            sidebar: [0, 0, 216, 900],
            header: [216, 6, 1224, 48],
            canvas: [216, 54, 1224, 846],
          };
          return Object.fromEntries(
            Object.entries(regions).map(([key, [x, y, w, h]]) => {
              let total = 0,
                changed = 0;
              for (let yy = y; yy < y + h; yy++)
                for (let xx = x; xx < x + w; xx++) {
                  const i = (yy * 1440 + xx) * 4;
                  const diff =
                    (Math.abs(A[i] - B[i]) +
                      Math.abs(A[i + 1] - B[i + 1]) +
                      Math.abs(A[i + 2] - B[i + 2])) /
                    3;
                  total += diff;
                  if (diff > 16) changed++;
                }
              return [
                key,
                {
                  meanAbsoluteChannelDifference: total / (w * h),
                  pixelsAbove16: changed,
                  totalPixels: w * h,
                },
              ];
            }),
          );
        },
        { a, c },
      );
      comparisons.push({ screen, theme, metrics });
    }
  fs.writeFileSync(
    path.join(out, 'comparison.json'),
    JSON.stringify(
      {
        method:
          'Raw RGB absolute difference, 0–255. Above-16 pixel count. Diagnostic only; not a fidelity percentage or release threshold. Different text, accessible tokens, icons and PDF rendering contribute.',
        comparisons,
      },
      null,
      2,
    ),
  );
  const metadata = {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    trackedDiffSha256: createHash('sha256')
      .update(execFileSync('git', ['diff', 'HEAD']))
      .digest('hex'),
    source: JSON.parse(
      fs.readFileSync('.qa-artifacts/reference-runtime/source.json', 'utf8'),
    ),
    browser: await b.version(),
    viewports: [
      [1920, 1080],
      [1440, 900],
      [1280, 800],
      [1024, 768],
      [768, 1024],
      [390, 844],
    ],
    captures: manifest.map((m) => ({
      ...m,
      sha256: createHash('sha256')
        .update(fs.readFileSync(path.join(out, m.file)))
        .digest('hex'),
    })),
  };
  fs.writeFileSync(
    path.join(out, 'manifest.json'),
    JSON.stringify(metadata, null, 2),
  );
  await b.close();
  if (manifest.some((m) => m.overflow || m.errors?.length))
    throw new Error(
      'Capture matrix contains overflow or browser errors; inspect manifest',
    );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
