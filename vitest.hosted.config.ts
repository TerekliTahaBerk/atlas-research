import { defineConfig } from 'vitest/config';
import base from './vitest.integration.config';
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['tests/hosted/**/*.test.ts'],
    testTimeout: 30000,
  },
});
