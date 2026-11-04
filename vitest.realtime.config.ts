import { defineConfig } from 'vitest/config';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const web = createRequire(new URL('./apps/web/package.json', import.meta.url));
// A04 private Realtime against the disposable Supabase harness only.
export default defineConfig({
  resolve: {
    alias: {
      '@supabase/supabase-js': web.resolve('@supabase/supabase-js'),
      '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
      'server-only': fileURLToPath(
        new URL('./tests/mocks/server-only.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/realtime/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 60000,
  },
});
