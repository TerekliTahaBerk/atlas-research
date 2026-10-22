import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  snapshotPathTemplate:
    '{testDir}/{testFilePath}-snapshots/{platform}/{arg}-{projectName}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 3,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '3100'}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
        // Containers that ship a different Chromium build can point at it
        // explicitly; CI uses the browser Playwright installs.
        ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? {
              launchOptions: {
                executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
              },
            }
          : {}),
      },
    },
  ],
  webServer: {
    command: `pnpm --filter @atlas/web start --port ${process.env.PLAYWRIGHT_PORT ?? '3100'}`,
    url: `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '3100'}`,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
