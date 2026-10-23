import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/auth/e2e',
  outputDir: 'test-results/auth',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60000,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:3102',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    // Same opt-in as the design suite for containers with a preinstalled
    // Chromium; CI leaves it unset and uses the pinned Playwright browser.
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? {
          launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
          },
        }
      : {}),
  },
  webServer: [
    {
      command: 'node tests/auth/ai-fixture.mjs',
      url: 'http://127.0.0.1:3198/health',
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      // Loopback scholarly API fixture used by the real provider adapters.
      command: 'node tests/auth/provider-fixture.mjs',
      url: 'http://127.0.0.1:3199/health',
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: 'pnpm --filter @atlas/web dev --port 3102',
      url: 'http://127.0.0.1:3102/login',
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
