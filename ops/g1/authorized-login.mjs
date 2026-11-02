// Local operator UI for an explicitly authorized Atlas sign-in and existing
// database credential. No token/credential is returned to the browser or logs.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, rename, unlink } from 'node:fs/promises';
import { z } from 'zod';
import { runProbe, TARGET_URL } from './authenticated-probe.mjs';

const exec = promisify(execFile);
const root = '/Users/berk.terekli/AtlasRecovery/2026-11-02';
const host = 'aws-0-ap-northeast-2.pooler.supabase.com';
const user = 'postgres.hgngonpirctrwbckhbmy';
const connection = `host=${host} port=5432 dbname=postgres user=${user} sslmode=verify-full sslrootcert=${root}/trusted-ca.pem connect_timeout=10`;
const key = z
  .string()
  .regex(/^(sb_publishable_[\w-]+|eyJ[\w.-]+)$/)
  .parse(process.env.ATLAS_G1_PUBLISHABLE_KEY);
const { createClient } = createRequire(
  new URL('../../apps/web/package.json', import.meta.url),
)('@supabase/supabase-js');
// PKCE verifier and session exist only in this process, never browser storage/disk.
const memory = new Map();
const authClient = createClient(TARGET_URL, key, {
  auth: {
    flowType: 'pkce',
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: true,
    storage: {
      getItem: (k) => memory.get(k) ?? null,
      setItem: (k, v) => {
        memory.set(k, v);
      },
      removeItem: (k) => {
        memory.delete(k);
      },
    },
  },
});
const emailValue = z
  .email()
  .parse(process.env.ATLAS_G1_EMAIL)
  .replaceAll('&', '&amp;')
  .replaceAll('\"', '&quot;');
const nonce = randomBytes(32).toString('hex');
const validNonce = (value) =>
  typeof value === 'string' &&
  value.length === nonce.length &&
  timingSafeEqual(Buffer.from(value), Buffer.from(nonce));
let origin;
let busy = false;
const results = {
  g1: existsSync(`${root}/g1-evidence.json`)
    ? JSON.parse(readFileSync(`${root}/g1-evidence.json`, 'utf8'))
    : null,
  database: null,
};
const fields = z
  .object({
    nonce: z.string(),
    email: z.email(),
    password: z.string().min(1).max(1024),
  })
  .strict();
const dbFields = z
  .object({
    nonce: z.string(),
    password: z
      .string()
      .min(1)
      .max(1024)
      .refine((p) => !/[\r\n\0]/.test(p)),
  })
  .strict();
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
};
const page = `<!doctype html><html lang="tr"><meta charset="utf-8"><title>Atlas güvenli yerel doğrulama</title>
<style>body{font:16px system-ui;max-width:700px;margin:48px auto;padding:24px}label,input{display:block}input{padding:10px;margin:8px 0 20px;width:90%}button{padding:12px}section{border:1px solid #aaa;padding:20px;margin:24px 0}pre{white-space:pre-wrap}</style>
<h1>Atlas güvenli yerel doğrulama</h1><p>Hedef: hgngonpirctrwbckhbmy. Bilgileri sohbete yazmayın. Bu sayfa yalnız 127.0.0.1 üzerinde çalışır.</p>
<section><h2>1. Atlas kullanıcı girişi · G1</h2><p>Mevcut Atlas hesabınızla giriş yapın. Parola yalnız bu projenin Supabase Auth servisine HTTPS üzerinden gönderilir. Token tarayıcıya/loglara verilmez; kontrol sonrası bu yeni oturum kapatılır.</p>
<form id="otp"><label for="otpemail">Atlas e-posta (parolasız giriş)</label><input id="otpemail" name="email" value="${emailValue}" type="email" autocomplete="username" required><button>E-posta giriş bağlantısı gönder</button></form><hr>
<form id="login"><label for="email">Atlas e-posta</label><input id="email" name="email" type="email" autocomplete="username" required><label for="password">Atlas parolası</label><input id="password" name="password" type="password" autocomplete="current-password" required><button>Giriş yap ve G1 kontrolünü çalıştır</button></form></section>
<section><h2>2. Mevcut veritabanı erişimi · G2</h2><p>Supabase projesinin mevcut database parolası. Parola sıfırlanmaz. Yalnız onaylı FileVault dizininde 0600 erişimli geçici pgpass dosyasında tutulur; işlem bitince kaldırılır.</p><form id="database"><label for="dbpassword">Atlas database parolası</label><input id="dbpassword" name="password" type="password" autocomplete="off" required><button>TLS ile bağlantıyı doğrula</button></form></section>
<pre id="result" role="status">Giriş bekleniyor.</pre><script nonce="${nonce}">for(const name of ['otp','login','database'])document.getElementById(name).addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const data=Object.fromEntries(new FormData(form));data.nonce=${JSON.stringify(nonce)};const button=form.querySelector('button');button.disabled=true;try{const response=await fetch('/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});document.getElementById('result').textContent=JSON.stringify(await response.json(),null,2)}catch{document.getElementById('result').textContent='Yerel bağlantı kesildi; bilgiler kaydedilmedi.'}finally{form.reset();button.disabled=false}});const incoming=new URLSearchParams(location.hash.slice(1));const accessToken=incoming.get('access_token');if(accessToken){history.replaceState(null,'','/');fetch('/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nonce:${JSON.stringify(nonce)},accessToken})}).then(r=>r.json()).then(r=>document.getElementById('result').textContent=JSON.stringify(r,null,2))}else fetch('/status').then(r=>r.json()).then(r=>{if(r.g1)document.getElementById('result').textContent=JSON.stringify(r.g1,null,2)});</script></html>`;

const server = createServer(async (request, response) => {
  const send = (status, data) => {
    response.writeHead(status, {
      ...headers,
      'Content-Type': 'application/json',
    });
    response.end(JSON.stringify(data));
  };
  if (request.headers.host !== new URL(origin).host)
    return send(403, { error: 'Origin rejected' });
  const callback = new URL(request.url, origin);
  if (
    request.method === 'GET' &&
    callback.pathname === '/auth/callback' &&
    callback.searchParams.has('code')
  ) {
    try {
      const code = z
        .string()
        .min(1)
        .max(2048)
        .parse(callback.searchParams.get('code'));
      const { data, error } =
        await authClient.auth.exchangeCodeForSession(code);
      if (error || !data.session?.access_token)
        throw new Error('Sign-in unavailable');
      try {
        results.g1 = await runProbe({
          publishableKey: key,
          accessToken: data.session.access_token,
        });
      } finally {
        await authClient.auth.signOut({ scope: 'local' });
        memory.clear();
      }
      console.log(JSON.stringify({ event: 'G1', ...results.g1 }));
    } catch {
      results.g1 = { verdict: 'INCONCLUSIVE_SIGN_IN', evidence: null };
    }
    response.writeHead(303, { ...headers, Location: '/' });
    return response.end();
  }
  if (
    request.method === 'GET' &&
    (request.url === '/' ||
      (callback.pathname === '/auth/callback' &&
        !callback.searchParams.has('code')))
  ) {
    response.writeHead(200, {
      ...headers,
      'Content-Type': 'text/html; charset=utf-8',
    });
    return response.end(page);
  }
  if (request.method === 'GET' && request.url === '/status')
    return send(200, results);
  if (
    request.method !== 'POST' ||
    request.headers.origin !== origin ||
    !request.headers['content-type']?.startsWith('application/json')
  )
    return send(403, { error: 'Origin rejected' });
  if (busy) return send(409, { error: 'İşlem sürüyor.' });
  busy = true;
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 8192) throw new Error('bounds');
      chunks.push(chunk);
    }
    const raw = JSON.parse(Buffer.concat(chunks).toString());
    if (!validNonce(raw?.nonce)) return send(403, { error: 'Origin rejected' });
    if (request.url === '/session') {
      const input = z
        .object({
          nonce: z.string(),
          accessToken: z.string().regex(/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/),
        })
        .strict()
        .parse(raw);
      results.g1 = await runProbe({
        publishableKey: key,
        accessToken: input.accessToken,
      });
      await fetch(`${TARGET_URL}/auth/v1/logout?scope=local`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${input.accessToken}` },
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      console.log(JSON.stringify({ event: 'G1', ...results.g1 }));
      return send(200, results.g1);
    }
    if (request.url === '/otp') {
      const input = z
        .object({ nonce: z.string(), email: z.email() })
        .strict()
        .parse(raw);
      const { error } = await authClient.auth.signInWithOtp({
        email: input.email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${origin}/auth/callback`,
        },
      });
      console.log(
        JSON.stringify({
          event: 'OTP_REQUEST',
          status: error?.status ?? 200,
          code: error?.code ?? null,
        }),
      );
      return error
        ? send(400, {
            error: 'Giriş e-postası gönderilemedi; yeni hesap oluşturulmadı.',
          })
        : send(200, {
            status:
              'Giriş bağlantısı istendi. Mevcut Atlas hesabının e-postasındaki bağlantıyı bu Chrome’da açın.',
          });
    }
    if (request.url === '/login') {
      const input = fields.parse(raw);
      const auth = await fetch(
        `${TARGET_URL}/auth/v1/token?grant_type=password`,
        {
          method: 'POST',
          headers: { apikey: key, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: input.email,
            password: input.password,
          }),
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!auth.ok)
        return send(401, {
          error:
            'Atlas girişi başarısız. Mevcut Atlas hesabınızın bilgilerini kullanın; Supabase panel hesabı farklı bir oturumdur.',
        });
      const session = z
        .object({ access_token: z.string().min(20) })
        .parse(await auth.json());
      try {
        results.g1 = await runProbe({
          publishableKey: key,
          accessToken: session.access_token,
        });
      } finally {
        await fetch(`${TARGET_URL}/auth/v1/logout?scope=local`, {
          method: 'POST',
          headers: {
            apikey: key,
            Authorization: `Bearer ${session.access_token}`,
          },
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
        });
      }
      console.log(JSON.stringify({ event: 'G1', ...results.g1 }));
      return send(200, results.g1);
    }
    if (request.url === '/database') {
      const input = dbFields.parse(raw);
      const escape = (v) => v.replaceAll('\\', '\\\\').replaceAll(':', '\\:');
      await writeFile(
        `${root}/pgpass.pending`,
        `${host}:5432:postgres:${user}:${escape(input.password)}\n`,
        { mode: 0o600 },
      );
      const env = {
        ...process.env,
        PGPASSWORD: input.password,
        PGAPPNAME: 'atlas-approved-g2-preflight',
      };
      const checked = await exec(
        '/opt/homebrew/opt/postgresql@17/bin/psql',
        [
          connection,
          '-w',
          '-X',
          '-A',
          '-t',
          '-v',
          'ON_ERROR_STOP=1',
          '-c',
          `BEGIN READ ONLY; SELECT json_build_object('user',current_user,'database',current_database(),'ssl',(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),'server',current_setting('server_version')); COMMIT;`,
        ],
        { env, timeout: 20000, maxBuffer: 16384 },
      );
      const line = checked.stdout
        .split('\n')
        .find((value) => value.startsWith('{'));
      const evidence = z
        .object({
          user: z.literal('postgres'),
          database: z.literal('postgres'),
          ssl: z.boolean(),
          server: z.string(),
        })
        .parse(JSON.parse(line ?? 'null'));
      await rename(`${root}/pgpass.pending`, `${root}/pgpass`);
      await writeFile(
        `${root}/pg_service.conf`,
        `[atlas_a01_source]\n${connection
          .split(' ')
          .map((pair) => pair.replace('=', '='))
          .join('\n')}\n`,
        { mode: 0o600 },
      );
      results.database = {
        ...evidence,
        clientSslMode: 'verify-full',
        peerHost: host,
      };
      console.log(JSON.stringify({ event: 'DATABASE_TLS_VERIFIED', evidence }));
      return send(200, { database: 'VERIFIED', evidence });
    }
    send(404, { error: 'Unavailable' });
  } catch (error) {
    const diagnostic = error?.stderr ?? '';
    const category =
      /password authentication failed|Tenant or user not found/i.test(
        diagnostic,
      )
        ? 'DB_PASSWORD_REJECTED'
        : /certificate|SSL error/i.test(diagnostic)
          ? 'TLS_ERROR'
          : /timeout|timed out/i.test(diagnostic)
            ? 'NETWORK_TIMEOUT'
            : error instanceof z.ZodError
              ? 'VALIDATION_ERROR'
              : 'CONTEXT_OR_LOCAL_ERROR';
    console.log(
      JSON.stringify({
        event: 'OPERATOR_CHECK_FAILURE',
        category,
        type: error?.name,
        exitCode: error?.code ?? null,
      }),
    );
    send(400, {
      category,
      error:
        'Doğrulama tamamlanamadı. Parola, TLS veya bağlantı erişimini kontrol edin; hiçbir gizli değer loglanmadı.',
    });
  } finally {
    busy = false;
  }
});
server.requestTimeout = 30000;
server.listen(3104, '127.0.0.1', () => {
  origin = `http://127.0.0.1:${server.address().port}`;
  console.log(JSON.stringify({ ready: true, origin }));
});
setTimeout(() => server.close(), 60 * 60 * 1000).unref();
process.on('SIGTERM', () => {
  void unlink(`${root}/pgpass.tmp`).catch(() => {});
  server.close();
});
