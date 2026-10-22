import { describe, it, expect, vi, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  checkOrigin,
  readJson,
  respond,
} from '../../apps/web/src/features/platform/server/http';
import {
  recoveryMarker,
  validRecoveryMarker,
} from '../../apps/web/src/features/identity/server/recovery';
import { verifyActor } from '../../apps/web/src/features/identity/server/session';
import { authenticate } from '../../apps/web/src/features/identity/server/auth-service';
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  rate: vi.fn(),
}));
vi.mock('../../apps/web/src/features/platform/server/limiter', () => ({
  rateLimit: mocks.rate,
}));
vi.mock('../../apps/web/src/features/identity/server/supabase', () => ({
  serverSupabase: async () => ({
    auth: {
      getUser: mocks.getUser,
      signInWithPassword: mocks.signInWithPassword,
    },
  }),
}));
afterEach(() => vi.unstubAllEnvs());
describe('HTTP and session security, SDK boundary mocked', () => {
  it.each([
    {
      email: 'incomplete@address',
      password: 'Synthetic-test-password-42',
      message: 'Enter a valid email address.',
    },
    {
      email: 'person@atlas.example',
      password: 'short',
      message: 'Use a password between 12 and 128 characters.',
    },
  ])(
    'explains invalid signup fields without contacting the provider or echoing values',
    async ({ email, password, message }) => {
      mocks.rate.mockClear();
      await expect(
        authenticate({
          action: 'signup',
          email,
          password,
          confirmation: password,
          displayName: 'Test researcher',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', message });
      expect(mocks.rate).not.toHaveBeenCalled();
    },
  );
  it('requires an exact configured origin for mutations', () => {
    vi.stubEnv('ATLAS_ORIGIN', 'http://127.0.0.1:3102');
    expect(() =>
      checkOrigin(
        new Request('http://127.0.0.1:3102/api/v1/commands', {
          method: 'POST',
          headers: {
            origin: 'https://evil.example',
            'content-type': 'application/json',
          },
        }),
      ),
    ).toThrow();
    expect(() =>
      checkOrigin(
        new Request('http://127.0.0.1:3102/api/v1/commands', {
          method: 'POST',
          headers: {
            origin: 'http://127.0.0.1:3102',
            'content-type': 'application/json',
          },
        }),
      ),
    ).not.toThrow();
  });
  it('bounds the actual streamed body even without Content-Length', async () => {
    const request = new Request('http://atlas.invalid', {
      method: 'POST',
      body: 'x'.repeat(32769),
    });
    await expect(readJson(request)).rejects.toThrow('too large');
  });
  it('normalizes errors without leaking SQL or provider information', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await respond(async () => {
      throw new Error('password=sensitive internal SQL projects secret');
    });
    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.text()).not.toContain('sensitive');
  });
  it('binds short-lived recovery markers to the verified identity and rejects tampering', () => {
    vi.stubEnv('ATLAS_RATE_SECRET', 'local-test-signing-secret-32-characters');
    const id = randomUUID();
    const marker = recoveryMarker(id);
    expect(validRecoveryMarker(marker, id)).toBe(true);
    expect(validRecoveryMarker(marker, randomUUID())).toBe(false);
    expect(validRecoveryMarker(marker.slice(0, -1) + 'z', id)).toBe(false);
    expect(validRecoveryMarker(recoveryMarker(id, Date.now() - 1), id)).toBe(
      false,
    );
  });
  it.each([
    { data: { user: null }, error: { message: 'expired' } },
    {
      data: {
        user: {
          id: randomUUID(),
          email: 'person@atlas.example',
          email_confirmed_at: null,
        },
      },
      error: null,
    },
  ])('rejects expired or unverified sessions', async (result) => {
    vi.stubEnv('ATLAS_MODE', 'live');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:1');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-public-key');
    mocks.getUser.mockResolvedValueOnce(result);
    await expect(verifyActor()).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });
  it('uses verified provider identity, never request actor IDs', async () => {
    vi.stubEnv('ATLAS_MODE', 'live');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:1');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-public-key');
    const id = randomUUID();
    mocks.getUser.mockResolvedValueOnce({
      data: {
        user: {
          id,
          email: 'person@atlas.example',
          email_confirmed_at: '2026-10-22T00:00:00Z',
        },
      },
      error: null,
    });
    expect(await verifyActor()).toEqual({ id, email: 'person@atlas.example' });
  });
  it('rejects invalid login without claiming success', async () => {
    vi.stubEnv('ATLAS_MODE', 'live');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:1');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-public-key');
    mocks.signInWithPassword.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'invalid' },
    });
    await expect(
      authenticate({
        action: 'signin',
        email: 'person@atlas.example',
        password: 'wrong',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
