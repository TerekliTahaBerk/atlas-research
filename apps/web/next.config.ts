import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';
import { validateEnvironment } from './src/lib/env';
validateEnvironment(process.env);
const config: NextConfig = {
  transpilePackages: ['@atlas/ui', '@atlas/core'],
  turbopack: { root: fileURLToPath(new URL('../..', import.meta.url)) },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};
export default config;
