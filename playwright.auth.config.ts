import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/auth/e2e',
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
  },
  webServer: {
    command: 'pnpm --filter @atlas/web dev --port 3102',
    url: 'http://127.0.0.1:3102/login',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
