import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';
import { validateEnvironment } from './src/lib/env';
validateEnvironment(process.env);
const config: NextConfig = {
  transpilePackages: ['@atlas/ui', '@atlas/core'],
  turbopack: { root: fileURLToPath(new URL('../..', import.meta.url)) },
  poweredByHeader: false,
  logging: { incomingRequests: false, fetches: { fullUrl: false } },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          ...(process.env.ATLAS_MODE === 'live' &&
          process.env.ATLAS_ORIGIN?.startsWith('https://')
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }]
            : []),
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
