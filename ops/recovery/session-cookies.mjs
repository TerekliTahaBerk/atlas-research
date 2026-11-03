// Destination-only normal Auth sessions in memory; stdout is a private pipe.
import { createRequire } from 'node:module';
const require = createRequire(
  new URL('../../apps/web/package.json', import.meta.url),
);
const { createServerClient } = require('@supabase/ssr');
let input = '';
for await (const chunk of process.stdin) input += chunk;
const { key, session } = JSON.parse(input);
const cookies = new Map();
const client = createServerClient('http://127.0.0.1:54322', key, {
  cookies: {
    getAll: () => [],
    setAll: (values) => {
      for (const x of values) cookies.set(x.name, x.value);
    },
  },
  auth: { autoRefreshToken: false },
});
const { error } = await client.auth.setSession(session);
if (error) throw new Error('Destination session verification failed');
process.stdout.write(
  [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
);
