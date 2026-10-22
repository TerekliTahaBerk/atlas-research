import next from 'eslint-config-next/core-web-vitals';
import ts from 'typescript-eslint';
const config = [
  ...next,
  ...ts.configs.recommended,
  {
    ignores: [
      '**/.next/**',
      '**/node_modules/**',
      '**/generated/**',
      'playwright-report/**',
      'test-results/**',
      '.qa-artifacts/**',
      '**/next-env.d.ts',
    ],
  },
  { rules: { '@typescript-eslint/no-explicit-any': 'error' } },
  { settings: { next: { rootDir: 'apps/web/' } } },
];

export default config;
