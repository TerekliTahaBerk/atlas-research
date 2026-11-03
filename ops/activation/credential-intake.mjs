// Approved Atlas server-key intake. No key value is returned or logged.
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(
  new URL('../../apps/web/package.json', import.meta.url),
);
const { z } = require('zod');
const root = '/Users/berk.terekli/AtlasRecovery/2026-11-02/activation';
await mkdir(root, { recursive: true, mode: 0o700 });
const nonce = randomBytes(32).toString('hex');
let accepted = false;
const server = createServer(async (req, res) => {
  const send = (status, body, type = 'text/html; charset=utf-8') => {
    res.writeHead(status, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        "default-src 'none'; form-action 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    });
    res.end(body);
  };
  try {
    if (req.headers.host !== '127.0.0.1:3107') return send(403, 'Denied');
    if (req.method === 'GET' && req.url === '/')
      return send(
        200,
        `<!doctype html><html lang="tr"><meta charset="utf-8"><title>Atlas sunucu erişimi</title><style>body{font:18px system-ui;max-width:650px;margin:70px auto;padding:25px}input{display:block;width:100%;margin:18px 0;padding:12px}button{padding:12px}</style><h1>Atlas geliştirme sunucu erişimi</h1><p>Yalnız hgngonpirctrwbckhbmy. Anahtar korumalı yerel dosyaya kaydedilir; sohbete veya günlüğe yazılmaz.</p><form method="post" action="/key"><input type="hidden" name="nonce" value="${nonce}"><label for="key">Yeni Atlas sunucu API anahtarı</label><input id="key" name="key" type="password" autocomplete="off" required><button>Anahtarı doğrula ve korumalı kaydet</button></form><p role="status">${accepted ? 'VERIFIED' : 'Bekleniyor'}</p></html>`,
      );
    if (
      req.method !== 'POST' ||
      req.url !== '/key' ||
      req.headers.origin !== 'http://127.0.0.1:3107'
    ) {
      console.warn(
        JSON.stringify({
          event: 'INTAKE_DENIED',
          method: req.method,
          origin: req.headers.origin ?? null,
        }),
      );
      return send(403, 'Denied');
    }
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 8192) {
        req.destroy();
        return;
      }
    }
    const fields = Object.fromEntries(new URLSearchParams(body));
    const input = z
      .object({
        nonce: z.string().length(64),
        key: z
          .string()
          .regex(/^sb_secret_[A-Za-z0-9_-]{20,}$/)
          .max(1000),
      })
      .parse(fields);
    if (!timingSafeEqual(Buffer.from(input.nonce), Buffer.from(nonce)))
      return send(403, 'Denied');
    const response = await fetch(
      'https://hgngonpirctrwbckhbmy.supabase.co/storage/v1/bucket',
      {
        headers: { apikey: input.key, Authorization: `Bearer ${input.key}` },
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok)
      return send(400, 'Anahtar doğrulanamadı. Değer günlüğe yazılmadı.');
    const buckets = z
      .array(z.object({ id: z.string(), public: z.boolean() }))
      .parse(await response.json());
    if (
      !['atlas-quarantine', 'atlas-sources'].every((id) =>
        buckets.some((b) => b.id === id && !b.public),
      )
    )
      return send(400, 'Özel bucket doğrulaması başarısız.');
    await writeFile(`${root}/storage-key`, input.key, { mode: 0o600 });
    accepted = true;
    console.log(
      JSON.stringify({ storage_key: 'VERIFIED', private_buckets: 2 }),
    );
    return send(
      200,
      '<!doctype html><html lang="tr"><meta charset="utf-8"><title>Atlas erişimi doğrulandı</title><h1>Atlas sunucu erişimi doğrulandı</h1><p role="status">VERIFIED — anahtar korumalı dosyaya kaydedildi.</p></html>',
    );
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'INTAKE_FAILURE',
        category: error instanceof Error ? error.name : 'UNKNOWN',
      }),
    );
    return send(
      400,
      'İşlem tamamlanamadı; gizli değer kaydedilmedi veya günlüğe yazılmadı.',
    );
  }
});
server.listen(3107, '127.0.0.1', () =>
  console.log('Atlas key intake ready on loopback 3107'),
);
setTimeout(() => server.close(), 3600000).unref();
