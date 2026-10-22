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
          // SAMEORIGIN (was DENY) so the design-system mobile view can frame
          // live routes; cross-origin framing stays blocked.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
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
