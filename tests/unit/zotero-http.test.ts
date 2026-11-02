import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const control = vi.hoisted(() => ({ until: 0, lease: '', calls: 0 }));
vi.mock('@/features/integrations/server/throttle', () => ({
  zoteroThrottle: async (token: string, cooldown: number | null) => {
    if (cooldown !== null) {
      control.until = Math.max(control.until, Date.now() + cooldown * 1000);
      if (control.lease === token) control.lease = '';
      return 0;
    }
    if (control.until > Date.now())
      return Math.ceil((control.until - Date.now()) / 1000);
    if (control.lease) return 15;
    control.lease = token;
    return 0;
  },
}));
import { zoteroGet } from '@/features/integrations/server/zotero';
import { respond } from '@/features/platform/server/http';

beforeEach(() => {
  control.until = 0;
  control.lease = '';
  control.calls = 0;
  vi.stubEnv('ATLAS_ZOTERO_BASE_URL', 'https://api.zotero.org');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const get = () => zoteroGet('/keys/current', {}, 'synthetic-fixture-key');
describe('Zotero HTTP controls (in-memory control double)', () => {
  it.each([1, 30, 3600])(
    'retains successful Backoff %s without holding the response',
    async (seconds) => {
      const fetcher = vi.fn(
        async () =>
          new Response('{}', { headers: { Backoff: String(seconds) } }),
      );
      vi.stubGlobal('fetch', fetcher);
      expect((await get()).data).toEqual({});
      await expect(get()).rejects.toMatchObject({ code: 'RATE_LIMITED' });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it.each([429, 503])(
    'persists the longer of both throttle headers for %s',
    async (status) => {
      const fetcher = vi.fn(
        async () =>
          new Response('{}', {
            status,
            headers: { 'Retry-After': '1', Backoff: '30' },
          }),
      );
      vi.stubGlobal('fetch', fetcher);
      await expect(get()).rejects.toMatchObject({
        code: 'RATE_LIMITED',
        message: expect.stringContaining('30 seconds'),
      });
      await expect(get()).rejects.toMatchObject({ code: 'RATE_LIMITED' });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it('returns the provider cooldown in the actual HTTP Retry-After header', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('{}', {
            status: 503,
            headers: { 'Retry-After': '3600' },
          }),
      ),
    );
    const response = await respond(get);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('3600');
    expect(await response.text()).not.toContain('synthetic-fixture-key');
  });
  it('fails closed on concurrent calls and permits a request after cooldown expiry', async () => {
    let finish!: (value: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetcher);
    const first = get();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await expect(get()).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    finish(new Response('{}'));
    await first;
    fetcher.mockImplementation(async () => new Response('{}'));
    await get();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('bounds network retries and does not retry cancellation', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('private provider detail');
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(
      zoteroGet('/keys/current', {}, 'synthetic', { sleep: async () => {} }),
    ).rejects.toMatchObject({ code: 'EXTERNAL_PROVIDER_ERROR' });
    expect(fetcher).toHaveBeenCalledTimes(3);
    await expect(
      zoteroGet('/keys/current', {}, 'synthetic', {
        signal: AbortSignal.abort(),
      }),
    ).rejects.toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('rejects foreign hosts, URL overrides, redirects and oversized bodies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        expect(init.redirect).toBe('error');
        return new Response('{}', { headers: { 'content-length': '5000001' } });
      }),
    );
    await expect(get()).rejects.toMatchObject({
      code: 'EXTERNAL_PROVIDER_ERROR',
    });
    await expect(
      zoteroGet('https://example.com/steal', {}, 'synthetic'),
    ).rejects.toMatchObject({ code: 'EXTERNAL_PROVIDER_ERROR' });
    vi.stubEnv('ATLAS_ZOTERO_BASE_URL', 'https://127.0.0.1');
    await expect(get()).rejects.toMatchObject({
      code: 'EXTERNAL_PROVIDER_ERROR',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
