import { createServer, type IncomingMessage, type Server } from 'node:http';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  classify,
  runProbe,
  TARGET_URL,
} from '../../ops/g1/authenticated-probe.mjs';

type Route = (req: IncomingMessage) => { status: number; body?: unknown };
let server: Server | undefined;
const seen: { path: string; auth: string | undefined }[] = [];
async function serve(user: Route, history: Route) {
  seen.length = 0;
  server = createServer((req, res) => {
    seen.push({ path: req.url ?? '', auth: req.headers.authorization });
    const out = req.url?.startsWith('/auth/v1/user') ? user(req) : history(req);
    res.writeHead(out.status, { 'content-type': 'application/json' });
    res.end(out.body === undefined ? '' : JSON.stringify(out.body));
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  const address = server.address();
  return `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
}
afterEach(
  () => new Promise<void>((r) => (server ? server.close(() => r()) : r())),
);
const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.c2lnbmF0dXJlLXNlY3JldA';
const okUser: Route = () => ({
  status: 200,
  body: { id: 'u1', aud: 'authenticated' },
});
const probe = (baseUrl: string) =>
  runProbe({
    baseUrl,
    publishableKey: 'sb_publishable_test_only',
    accessToken: token,
  });

describe('A01 G1 authenticated history probe', () => {
  it('pins the exact Atlas target', () => {
    expect(TARGET_URL).toBe('https://hgngonpirctrwbckhbmy.supabase.co');
  });

  it('reports DENIED only for a permission error between two valid user checks', async () => {
    const base = await serve(okUser, () => ({
      status: 403,
      body: {
        code: '42501',
        message: 'permission denied for table _prisma_migrations',
      },
    }));
    const result = await probe(base);
    expect(result.verdict).toBe('DENIED');
    expect(result.evidence).toEqual({
      target: new URL(base).host,
      userBeforeStatus: 200,
      historyStatus: 403,
      historyCode: '42501',
      userAfterStatus: 200,
    });
    // The same session is used for all three requests.
    expect(seen.map((s) => s.path)).toEqual([
      '/auth/v1/user',
      '/rest/v1/_prisma_migrations?select=id&limit=0',
      '/auth/v1/user',
    ]);
    expect(new Set(seen.map((s) => s.auth)).size).toBe(1);
    // Output carries no token, message or identity.
    const printed = JSON.stringify(result);
    expect(printed).not.toContain(token);
    expect(printed).not.toContain('permission denied');
    expect(printed).not.toContain('u1');
  });

  it('never probes history with a token Auth rejects', async () => {
    const base = await serve(
      () => ({ status: 401, body: { code: 'bad_jwt' } }),
      () => ({ status: 200, body: [] }),
    );
    const result = await probe(base);
    expect(result.verdict).toBe('INCONCLUSIVE_TOKEN_INVALID');
    expect(seen).toHaveLength(1);
  });

  it('treats an empty 200 as exposure, never as denial', async () => {
    const base = await serve(okUser, () => ({ status: 200, body: [] }));
    expect((await probe(base)).verdict).toBe('EXPOSED');
  });

  it('does not count expired-token, gateway or anonymous-user failures as denial', async () => {
    expect(
      classify({
        userBefore: true,
        history: 401,
        historyCode: 'PGRST301',
        userAfter: true,
      }),
    ).toBe('INCONCLUSIVE_NOT_PERMISSION_DENIAL');
    expect(
      classify({
        userBefore: true,
        history: 401,
        historyCode: null,
        userAfter: true,
      }),
    ).toBe('INCONCLUSIVE_NOT_PERMISSION_DENIAL');
    expect(
      classify({
        userBefore: true,
        history: 403,
        historyCode: '42501',
        userAfter: false,
      }),
    ).toBe('INCONCLUSIVE_TOKEN_CHANGED');
    expect(classify({ userBefore: true, history: null })).toBe(
      'INCONCLUSIVE_NETWORK',
    );
    const base = await serve(
      () => ({ status: 200, body: { id: 'anon', is_anonymous: true } }),
      () => ({ status: 403, body: { code: '42501' } }),
    );
    expect((await probe(base)).verdict).toBe('INCONCLUSIVE_TOKEN_INVALID');
  });

  it('refuses tokens in argv or the environment and requires a public key', () => {
    const run = (args: string[], env: Record<string, string>) =>
      spawnSync(process.execPath, ['ops/g1/authenticated-probe.mjs', ...args], {
        env: { PATH: process.env.PATH ?? '', ...env },
        input: token,
        encoding: 'utf8',
      });
    expect(run([token], {}).status).toBe(1);
    expect(
      run([], {
        ATLAS_G1_PUBLISHABLE_KEY: 'sb_publishable_test_only',
        ATLAS_G1_ACCESS_TOKEN: token,
      }).status,
    ).toBe(1);
    const noKey = run([], {});
    expect(noKey.status).toBe(1);
    expect(noKey.stderr + noKey.stdout).not.toContain(token);
  });
});
