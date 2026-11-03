// Disposable harness only: Supabase Realtime installs its tenant schema
// (realtime.messages, realtime.send, realtime.topic) on the first tenant
// connection. Trigger that and wait, so the Atlas migration can attach its
// private-topic policy exactly as it does on hosted Supabase.
import { createRequire } from 'node:module';
const require = createRequire(
  new URL('../../apps/web/package.json', import.meta.url),
);
const { createClient } = require('@supabase/supabase-js');
const pg = require('../../packages/database/node_modules/pg');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const direct = process.env.DIRECT_URL;
if (!url || !key || !direct) throw new Error('Harness environment is missing.');
for (const value of [url, direct])
  if (!['127.0.0.1', 'localhost'].includes(new URL(value).hostname))
    throw new Error('Refusing to prepare a non-loopback target.');
if (!new URL(direct).pathname.endsWith('/atlas_auth_test'))
  throw new Error(
    'Refusing to prepare anything but the disposable auth database.',
  );

const db = new pg.Client({ connectionString: direct });
await db.connect();
const deadline = Date.now() + 120000;
let ready = false;
while (!ready && Date.now() < deadline) {
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  await new Promise((resolve) => {
    const channel = supabase.channel('atlas-harness-warmup');
    channel.subscribe(() => resolve(undefined));
    setTimeout(resolve, 5000);
  });
  await supabase.removeAllChannels();
  const { rows } = await db.query(
    "SELECT to_regclass('realtime.messages') IS NOT NULL AS t, to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NOT NULL AS s",
  );
  ready = rows[0].t && rows[0].s;
  if (!ready) await new Promise((r) => setTimeout(r, 2000));
}
await db.end();
if (!ready)
  throw new Error('Supabase Realtime did not install its tenant schema.');
console.log('Realtime tenant schema ready.');
process.exit(0);
